// 弹出窗口逻辑

document.addEventListener('DOMContentLoaded', async () => {
  const domainDisplay = document.getElementById('domain');
  const quickActions = document.getElementById('quickActions');
  const settingsLink = document.getElementById('settingsLink');
  const toast = document.getElementById('toast');

  let currentDomain = '';

  // 默认规则分组
  const defaultRuleGroups = [
    { name: '直连规则', path: 'direct.txt', type: 'direct' },
    { name: '代理规则', path: 'proxy.txt', type: 'proxy' }
  ];

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
  const settings = await chrome.storage.sync.get(['token', 'owner', 'repo', 'ruleGroups', 'directFile', 'proxyFile']);

  if (!settings.token || !settings.owner || !settings.repo) {
    showToast('请先配置 GitHub 设置', 'error');
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '请先去设置页面配置';
    btn.disabled = true;
    quickActions.appendChild(btn);
    document.getElementById('domainStatus').textContent = '请先配置';
    document.getElementById('domainStatus').className = 'domain-status';
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

    // 创建 API 实例并检测状态
    const api = new GitHubAPI(
      settings.token,
      settings.owner,
      settings.repo,
      settings.branch || 'main'
    );

    const statusResults = await checkDomainStatus(groups, currentDomain, api);

    // 渲染按钮（带状态）
    renderActionButtons(groups, statusResults);
  }

  // 检测域名在所有规则文件中的状态
  async function checkDomainStatus(groups, domain, api) {
    const statusElement = document.getElementById('domainStatus');

    if (!domain) {
      statusElement.textContent = '无效域名';
      statusElement.className = 'domain-status';
      return [];
    }

    statusElement.textContent = '🔍 检测中...';
    statusElement.className = 'domain-status';

    try {
      // 并行检测所有规则文件（最多等待 8 秒）
      const checkPromises = groups.map(async (group) => {
        const exists = await api.checkDomainExists(group.path, domain);
        return { groupName: group.name, path: group.path, exists };
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('检测超时')), 8000)
      );

      const results = await Promise.race([
        Promise.all(checkPromises),
        timeoutPromise
      ]);

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
      statusElement.textContent = '⚠️ 检测失败';
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

      // 设置按钮样式
      let btnClass = 'btn btn-proxy';
      if (group.name.includes('直连') || group.type === 'direct') {
        btnClass = 'btn btn-direct';
      } else if (group.name.includes('代理') || group.type === 'proxy') {
        btnClass = 'btn btn-proxy';
      }

      btn.style.marginTop = '0';

      // 已添加的按钮显示删除操作
      if (isAdded) {
        btn.className = 'btn btn-remove';
        btn.innerHTML = `🗑️ 从 ${group.name} 删除`;
        btn.disabled = false;
        btn.addEventListener('click', async () => {
          await removeDomainFromGroup(group.path, btn, group.name);
        });
      } else {
        btn.className = btnClass;
        btn.innerHTML = `➕ 添加到 ${group.name}`;
        btn.disabled = !currentDomain;
        btn.addEventListener('click', async () => {
          await addDomainToGroup(group.path, btn, group.name);
        });
      }

      quickActions.appendChild(btn);
    });
  }

  // 从规则文件删除域名
  async function removeDomainFromGroup(filePath, button, groupName) {
    if (!currentDomain) {
      showToast('无效的域名', 'error');
      return;
    }

    // 二次确认
    if (!confirm(`确定要从 ${groupName} 中删除 ${currentDomain} 吗？`)) {
      return;
    }

    const settings = await chrome.storage.sync.get(['token', 'owner', 'repo', 'branch']);

    if (!settings.token || !settings.owner || !settings.repo) {
      showToast('请先配置 GitHub 设置', 'error');
      return;
    }

    const originalText = button.innerHTML;

    try {
      button.disabled = true;
      button.innerHTML = '<span class="loading"></span>删除中...';

      const api = new GitHubAPI(
        settings.token,
        settings.owner,
        settings.repo,
        settings.branch || 'main'
      );

      await api.removeDomainFromFile(filePath, currentDomain);

      showToast(`已从 ${groupName} 删除`, 'success');

      // 刷新状态
      setTimeout(() => {
        location.reload();
      }, 1000);

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
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }

  // 添加域名到规则文件
  async function addDomainToGroup(filePath, button, groupName) {
    if (!currentDomain) {
      showToast('无效的域名', 'error');
      return;
    }

    const settings = await chrome.storage.sync.get(['token', 'owner', 'repo', 'branch']);

    if (!settings.token || !settings.owner || !settings.repo) {
      showToast('请先配置 GitHub 设置', 'error');
      return;
    }

    const originalText = button.innerHTML;

    try {
      // 显示加载状态
      button.disabled = true;
      button.innerHTML = '<span class="loading"></span>添加中...';

      // 创建 GitHub API 实例
      const api = new GitHubAPI(
        settings.token,
        settings.owner,
        settings.repo,
        settings.branch || 'main'
      );

      // 添加域名
      await api.addDomainToFile(filePath, currentDomain);

      // 显示成功消息
      showToast(`已添加到 ${groupName}`, 'success');

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
    } finally {
      // 恢复按钮状态
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }
  // 打开设置页面
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 显示 Toast 提示
  function showToast(message, type) {
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }
});
