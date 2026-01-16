// 设置页面逻辑

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const testBtn = document.getElementById('testBtn');
  const message = document.getElementById('message');

  // 加载已保存的配置
  loadSettings();

  // 保存设置
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings();
  });

  // 测试连接
  testBtn.addEventListener('click', async () => {
    await testConnection();
  });
});

// 加载设置
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get([
      'token',
      'owner',
      'repo',
      'branch',
      'directFile',
      'proxyFile'
    ]);

    if (settings.token) document.getElementById('token').value = settings.token;
    if (settings.owner) document.getElementById('owner').value = settings.owner;
    if (settings.repo) document.getElementById('repo').value = settings.repo;
    if (settings.branch) document.getElementById('branch').value = settings.branch;
    if (settings.directFile) document.getElementById('directFile').value = settings.directFile;
    if (settings.proxyFile) document.getElementById('proxyFile').value = settings.proxyFile;
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 保存设置
async function saveSettings() {
  const token = document.getElementById('token').value.trim();
  const owner = document.getElementById('owner').value.trim();
  const repo = document.getElementById('repo').value.trim();
  const branch = document.getElementById('branch').value.trim() || 'main';
  const directFile = document.getElementById('directFile').value.trim() || 'direct.txt';
  const proxyFile = document.getElementById('proxyFile').value.trim() || 'proxy.txt';

  // 验证必填字段
  if (!token || !owner || !repo) {
    showMessage('请填写所有必填字段', 'error');
    return;
  }

  try {
    await chrome.storage.sync.set({
      token,
      owner,
      repo,
      branch,
      directFile,
      proxyFile
    });

    showMessage('设置已保存', 'success');
  } catch (error) {
    console.error('保存设置失败:', error);
    showMessage('保存失败: ' + error.message, 'error');
  }
}

// 测试连接
async function testConnection() {
  const token = document.getElementById('token').value.trim();
  const owner = document.getElementById('owner').value.trim();
  const repo = document.getElementById('repo').value.trim();

  if (!token || !owner || !repo) {
    showMessage('请先填写 Token、所有者和仓库名称', 'error');
    return;
  }

  // 显示加载状态
  testBtn.disabled = true;
  testBtn.innerHTML = '<span class="loading"></span>测试中...';

  try {
    // 测试 GitHub API 连接
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (response.ok) {
      showMessage('连接成功！仓库访问正常', 'success');
    } else if (response.status === 404) {
      showMessage('仓库不存在或无访问权限', 'error');
    } else if (response.status === 401) {
      showMessage('Token 无效或已过期', 'error');
    } else {
      showMessage(`连接失败: ${response.status} ${response.statusText}`, 'error');
    }
  } catch (error) {
    console.error('测试连接失败:', error);
    showMessage('网络错误: ' + error.message, 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }
}

// 显示消息
function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type} show`;

  setTimeout(() => {
    message.classList.remove('show');
  }, 3000);
}
