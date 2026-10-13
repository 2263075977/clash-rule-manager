// 弹出窗口逻辑

document.addEventListener('DOMContentLoaded', async () => {
  const domainDisplay = document.getElementById('domain');
  const quickActions = document.getElementById('quickActions');
  const settingsLink = document.getElementById('settingsLink');
  const toast = document.getElementById('toast');
  const statusElement = document.getElementById('domainStatus');

  let currentDomain = '';
  let api = null;
  let toastTimeoutId = null;
  const domainStatusMap = new Map();

  // 提取根域名（去掉子域名前缀）
  function extractRootDomain(hostname) {
    // 特殊处理：如果是 IP 地址，直接返回
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return hostname;
    }

    const parts = hostname.split('.');

    // 如果只有一个部分（如 localhost），直接返回
    if (parts.length <= 1) {
      return hostname;
    }

    // 处理特殊的多级 TLD（如 .co.uk, .com.cn 等）
    const specialTLDs = ['co.uk', 'com.cn', 'com.au', 'co.jp', 'co.kr', 'com.br', 'com.tw'];
    const lastTwo = parts.slice(-2).join('.');
    const lastThree = parts.slice(-3).join('.');

    // 检查是否是特殊 TLD
    if (specialTLDs.includes(lastTwo) && parts.length > 2) {
      // 返回主域名 + 特殊 TLD（如 example.co.uk）
      return lastThree;
    }

    // 对于普通域名，返回最后两个部分（如 github.com）
    return lastTwo;
  }

  // 设置按钮加载状态
  function setButtonLoading(btn, isLoading) {
    if (isLoading) {
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = '<span class="loading"></span>处理中...';
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText;
    }
  }

  // 获取按钮样式类
  function getButtonClass(group) {
    if (group.name.includes('直连') || group.type === 'direct') {
      return 'btn btn-direct';
    }
    if (group.name.includes('代理') || group.type === 'proxy') {
      return 'btn btn-proxy';
    }
    return 'btn btn-proxy';
  }

  // 更新按钮状态（添加/删除后即时切换）
  function updateButtonState(btn, group, domain, isAdded) {
    // 移除旧的事件监听器（通过替换节点）
    const newBtn = btn.cloneNode(false);
    newBtn.style.marginTop = '0';

    if (isAdded) {
      newBtn.className = 'btn btn-remove';
      newBtn.textContent = `🗑️ 从 ${group.name} 删除`;
      newBtn.disabled = false;
      newBtn.addEventListener('click', async () => {
        await removeDomainFromGroup(group.path, newBtn, group.name, group.provider, group);
      });
    } else {
      newBtn.className = getButtonClass(group);
      newBtn.textContent = `➕ 添加到 ${group.name}`;
      newBtn.disabled = !domain;
      newBtn.addEventListener('click', async () => {
        await addDomainToGroup(group.path, newBtn, group.name, group.provider, group);
      });
    }

    btn.parentNode.replaceChild(newBtn, btn);
    return newBtn;
  }

  // 更新域名状态文本
  function updateDomainStatusText() {
    const existsIn = [];
    domainStatusMap.forEach(({ name, exists }) => {
      if (exists) existsIn.push(name);
    });

    if (existsIn.length > 0) {
      statusElement.textContent = `✅ 已在 ${existsIn.join('、')} 中`;
      statusElement.className = 'domain-status status-exists';
    } else {
      statusElement.textContent = '📌 未添加到任何规则';
      statusElement.className = 'domain-status status-none';
    }
  }

  // 获取当前标签页的域名
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url) {
      const url = new URL(tab.url);
      const fullHostname = url.hostname;
      currentDomain = extractRootDomain(fullHostname);
      domainDisplay.textContent = currentDomain;
    } else {
      domainDisplay.textContent = '无法获取域名';
    }
  } catch (error) {
    console.error('获取域名失败:', error);
    domainDisplay.textContent = '获取失败';
  }

  // 检查已配置并渲染按钮
  const settings = await chrome.storage.sync.get(['token', 'owner', 'repo', 'branch', 'ruleGroups', 'directFile', 'proxyFile', 'clashApiUrl', 'clashApiSecret']);

  if (!settings.token || !settings.owner || !settings.repo) {
    showToast('请先配置 GitHub 设置', 'error');
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '请先去设置页面配置';
    btn.disabled = true;
    quickActions.appendChild(btn);
    statusElement.textContent = '请先配置';
    statusElement.className = 'domain-status';
  } else {
    // 处理规则分组逻辑（与 options.js 保持一致）
    let groups = settings.ruleGroups;
    if (!groups || groups.length === 0) {
      if (settings.directFile || settings.proxyFile) {
        groups = [];
        if (settings.directFile) groups.push({ name: '直连规则', path: settings.directFile, type: 'direct' });
        else groups.push({ name: '直连规则', path: 'direct.txt', type: 'direct' });

        if (settings.proxyFile) groups.push({ name: '代理规则', path: settings.proxyFile, type: 'proxy' });
        else groups.push({ name: '代理规则', path: 'proxy.txt', type: 'proxy' });
      } else {
        groups = JSON.parse(JSON.stringify(defaultRuleGroups));
      }
    }

    // 创建 API 实例（复用）
    api = new GitHubAPI(
      settings.token,
      settings.owner,
      settings.repo,
      settings.branch || 'main'
    );

    const statusResults = await checkDomainStatus(groups, currentDomain, api);

    // 渲染按钮（带状态）
    renderActionButtons(groups, statusResults);
  }

  // 检测域名在所有规则文件中的状态（带并发限制）
  async function checkDomainStatus(groups, domain, apiInstance) {
    if (!domain) {
      statusElement.textContent = '无效域名';
      statusElement.className = 'domain-status';
      return [];
    }

    statusElement.textContent = '🔍 检测中...';
    statusElement.className = 'domain-status';

    try {
      // 分批并发检测，每批最多 MAX_CONCURRENT_CHECKS 个
      const results = [];
      for (let i = 0; i < groups.length; i += MAX_CONCURRENT_CHECKS) {
        const batch = groups.slice(i, i + MAX_CONCURRENT_CHECKS);
        const batchPromises = batch.map(async (group) => {
          const exists = await apiInstance.checkDomainExists(group.path, domain);
          return { groupName: group.name, path: group.path, exists };
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('检测超时')), STATUS_CHECK_TIMEOUT)
        );

        const batchResults = await Promise.race([
          Promise.all(batchPromises),
          timeoutPromise
        ]);

        results.push(...batchResults);
        batchResults.forEach(r => domainStatusMap.set(r.path, { name: r.groupName, exists: r.exists }));
      }

      // 更新状态显示
      const existsIn = results.filter(r => r.exists).map(r => r.groupName);
      if (existsIn.length > 0) {
        statusElement.textContent = `✅ 已在 ${existsIn.join('、')} 中`;
        statusElement.className = 'domain-status status-exists';
      } else {
        statusElement.textContent = '📌 未添加到任何规则';
        statusElement.className = 'domain-status status-none';
      }

      return results;
    } catch (error) {
      console.error('检测状态失败:', error);

      let statusText = '⚠️ 检测失败';
      if (error.message.includes('401')) {
        statusText = '⚠️ Token 无效';
      } else if (error.message.includes('403')) {
        statusText = '⚠️ 权限不足';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        statusText = '⚠️ 网络错误';
      }

      statusElement.textContent = statusText;
      statusElement.className = 'domain-status';
      return [];
    }
  }

  function renderActionButtons(groups, statusResults = []) {
    quickActions.innerHTML = '';
    groups.forEach(group => {
      const btn = document.createElement('button');

      // 检查该规则是否已添加
      const statusResult = statusResults.find(r => r.path === group.path);
      const isAdded = statusResult ? statusResult.exists : false;

      btn.style.marginTop = '0';

      // 已添加的按钮显示删除操作
      if (isAdded) {
        btn.className = 'btn btn-remove';
        btn.textContent = `🗑️ 从 ${group.name} 删除`;
        btn.disabled = false;
        btn.addEventListener('click', async () => {
          await removeDomainFromGroup(group.path, btn, group.name, group.provider, group);
        });
      } else {
        btn.className = getButtonClass(group);
        btn.textContent = `➕ 添加到 ${group.name}`;
        btn.disabled = !currentDomain;
        btn.addEventListener('click', async () => {
          await addDomainToGroup(group.path, btn, group.name, group.provider, group);
        });
      }

      quickActions.appendChild(btn);
    });
  }

  // 从规则文件删除域名
  async function removeDomainFromGroup(filePath, button, groupName, providerName, group) {
    if (!currentDomain) {
      showToast('无效的域名', 'error');
      return;
    }

    // 二次确认
    if (!confirm(`确定要从 ${groupName} 中删除 ${currentDomain} 吗？`)) {
      return;
    }

    if (!api) {
      showToast('请先配置 GitHub 设置', 'error');
      return;
    }

    setButtonLoading(button, true);

    try {
      await api.removeDomainFromFile(filePath, currentDomain);

      // 尝试调用 Clash API 更新规则提供者
      const clashResult = await tryReloadClash(providerName);

      // 显示成功消息
      let message = `已从 ${groupName} 删除`;
      if (clashResult.success) {
        message += `，${clashResult.message}`;
      }
      showToast(message, 'success');

      // 即时切换按钮状态
      domainStatusMap.set(filePath, { name: groupName, exists: false });
      updateButtonState(button, group, currentDomain, false);
      updateDomainStatusText();

    } catch (error) {
      console.error('删除失败:', error);

      let errorMessage = '删除失败';
      if (error.message.includes('不存在')) {
        errorMessage = '该域名不存在';
      } else if (error.message.includes('404')) {
        errorMessage = '文件不存在';
      } else if (error.message.includes('401')) {
        errorMessage = 'Token 无效';
      } else if (error.message.includes('403')) {
        errorMessage = '权限不足';
      } else {
        errorMessage = error.message;
      }

      showToast(errorMessage, 'error');
      setButtonLoading(button, false);
    }
  }

  // 添加域名到规则文件
  async function addDomainToGroup(filePath, button, groupName, providerName, group) {
    if (!currentDomain) {
      showToast('无效的域名', 'error');
      return;
    }

    if (!api) {
      showToast('请先配置 GitHub 设置', 'error');
      return;
    }

    setButtonLoading(button, true);

    try {
      // 添加域名
      await api.addDomainToFile(filePath, currentDomain);

      // 尝试调用 Clash API 更新规则提供者
      const clashResult = await tryReloadClash(providerName);

      // 显示成功消息
      let message = `已添加到 ${groupName}`;
      if (clashResult.success) {
        message += `，${clashResult.message}`;
      }
      showToast(message, 'success');

      // 即时切换按钮状态
      domainStatusMap.set(filePath, { name: groupName, exists: true });
      updateButtonState(button, group, currentDomain, true);
      updateDomainStatusText();

    } catch (error) {
      console.error('添加失败:', error);

      // 显示错误消息
      let errorMessage = '添加失败';
      if (error.message.includes('已存在')) {
        errorMessage = '该域名已存在';
      } else if (error.message.includes('404')) {
        errorMessage = '文件不存在';
      } else if (error.message.includes('401')) {
        errorMessage = 'Token 无效';
      } else if (error.message.includes('403')) {
        errorMessage = '权限不足';
      } else {
        errorMessage = error.message;
      }

      showToast(errorMessage, 'error');
      setButtonLoading(button, false);
    }
  }

  // 尝试调用 Clash API 更新规则提供者
  async function tryReloadClash(providerName) {
    try {
      // 如果没有指定 provider 名称，直接返回
      if (!providerName) {
        return { success: false, message: '' };
      }

      const clashSettings = await chrome.storage.sync.get(['clashApiUrl', 'clashApiSecret']);

      // 如果未配置 Clash API，直接返回
      if (!clashSettings.clashApiUrl) {
        return { success: false, message: '' };
      }

      const clashApi = new ClashAPI(clashSettings.clashApiUrl, clashSettings.clashApiSecret || '');
      await clashApi.updateRuleProvider(providerName);
      console.log(`规则提供者 ${providerName} 已更新`);
      return { success: true, message: 'Clash 规则已更新' };
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn('Clash API 调用失败（不影响域名添加）:', error);
      return { success: false, message: 'Clash 更新失败' };
    }
  }

  // 打开设置页面
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 显示 Toast 提示
  function showToast(message, type) {
    clearTimeout(toastTimeoutId);
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    toastTimeoutId = setTimeout(() => {
      toast.classList.remove('show');
    }, TOAST_DURATION);
  }
});
