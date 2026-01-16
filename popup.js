// 弹出窗口逻辑

document.addEventListener('DOMContentLoaded', async () => {
  const domainDisplay = document.getElementById('domain');
  const addDirectBtn = document.getElementById('addDirect');
  const addProxyBtn = document.getElementById('addProxy');
  const settingsLink = document.getElementById('settingsLink');
  const toast = document.getElementById('toast');

  let currentDomain = '';

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
      addDirectBtn.disabled = true;
      addProxyBtn.disabled = true;
    }
  } catch (error) {
    console.error('获取域名失败:', error);
    domainDisplay.textContent = '获取失败';
    addDirectBtn.disabled = true;
    addProxyBtn.disabled = true;
  }

  // 检查是否已配置
  const settings = await chrome.storage.sync.get(['token', 'owner', 'repo']);
  if (!settings.token || !settings.owner || !settings.repo) {
    showToast('请先配置 GitHub 设置', 'error');
    addDirectBtn.disabled = true;
    addProxyBtn.disabled = true;
  }

  // 添加到直连规则
  addDirectBtn.addEventListener('click', async () => {
    await addDomain('direct');
  });

  // 添加到代理规则
  addProxyBtn.addEventListener('click', async () => {
    await addDomain('proxy');
  });

  // 打开设置页面
  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 添加域名到规则文件
  async function addDomain(type) {
    if (!currentDomain) {
      showToast('无效的域名', 'error');
      return;
    }

    // 获取配置
    const settings = await chrome.storage.sync.get([
      'token',
      'owner',
      'repo',
      'branch',
      'directFile',
      'proxyFile'
    ]);

    if (!settings.token || !settings.owner || !settings.repo) {
      showToast('请先配置 GitHub 设置', 'error');
      return;
    }

    const filePath = type === 'direct' ?
      (settings.directFile || 'direct.txt') :
      (settings.proxyFile || 'proxy.txt');

    const button = type === 'direct' ? addDirectBtn : addProxyBtn;
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
      const typeText = type === 'direct' ? '直连规则' : '代理规则';
      showToast(`已添加到${typeText}`, 'success');

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

  // 显示 Toast 提示
  function showToast(message, type) {
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }
});
