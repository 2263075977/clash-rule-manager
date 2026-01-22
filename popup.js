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

    // 渲染按钮
    renderActionButtons(groups);
  }

  function renderActionButtons(groups) {
    quickActions.innerHTML = '';
    groups.forEach(group => {
      const btn = document.createElement('button');
      // 默认颜色逻辑：为了保持一定的视觉习惯，如果名字包含"直连"或 type 为 direct 用 direct 样式，否则用 proxy 样式或默认
      // 这里简单起见，交替颜色或者统一颜色。这里为了区分，我们可以根据关键字
      let btnClass = 'btn btn-proxy'; // 默认蓝色
      if (group.name.includes('直连') || group.type === 'direct') {
        btnClass = 'btn btn-direct'; // 绿色
      } else if (group.name.includes('代理') || group.type === 'proxy') {
        btnClass = 'btn btn-proxy';
      }

      btn.className = btnClass;
      btn.innerHTML = `➕ 添加到 ${group.name}`;
      btn.style.marginTop = '0'; // reset because of flex gap

      if (!currentDomain) btn.disabled = true;

      btn.addEventListener('click', async () => {
        await addDomainToGroup(group.path, btn, group.name);
      });

      quickActions.appendChild(btn);
    });
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
