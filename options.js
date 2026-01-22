// 设置页面逻辑

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const testBtn = document.getElementById('testBtn');
  const message = document.getElementById('message');
  const addRuleGroupBtn = document.getElementById('addRuleGroupBtn');

  // 默认规则分组
  const defaultRuleGroups = [
    { name: '直连规则', path: 'direct.txt', type: 'direct' },
    { name: '代理规则', path: 'proxy.txt', type: 'proxy' }
  ];

  // 加载已保存的配置
  loadSettings();

  // 添加新规则分组
  addRuleGroupBtn.addEventListener('click', () => {
    addRuleGroupItem();
  });

  // 保存设置
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings();
  });

  // 测试连接
  testBtn.addEventListener('click', async () => {
    await testConnection();
  });

  // 备份与恢复
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');

  exportBtn.addEventListener('click', exportSettings);

  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importSettings(e.target.files[0]);
    }
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
      'ruleGroups', // New standard
      'directFile', // Legacy
      'proxyFile'   // Legacy
    ]);

    if (settings.token) document.getElementById('token').value = settings.token;
    if (settings.owner) document.getElementById('owner').value = settings.owner;
    if (settings.repo) document.getElementById('repo').value = settings.repo;
    if (settings.branch) document.getElementById('branch').value = settings.branch;

    // 处理规则分组：优先使用 ruleGroups，如果没有则尝试从旧配置迁移 or 使用默认值
    let groups = settings.ruleGroups;
    if (!groups || groups.length === 0) {
      if (settings.directFile || settings.proxyFile) {
        // Migration from legacy
        groups = [];
        if (settings.directFile) groups.push({ name: '直连规则', path: settings.directFile, type: 'direct' });
        else groups.push({ name: '直连规则', path: 'direct.txt', type: 'direct' });

        if (settings.proxyFile) groups.push({ name: '代理规则', path: settings.proxyFile, type: 'proxy' });
        else groups.push({ name: '代理规则', path: 'proxy.txt', type: 'proxy' });
      } else {
        // Defaults
        groups = JSON.parse(JSON.stringify(defaultRuleGroups));
      }
    }

    renderRuleGroups(groups);

  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 渲染规则分组列表
function renderRuleGroups(groups) {
  const container = document.getElementById('ruleGroupsList');
  container.innerHTML = '';
  groups.forEach(group => {
    addRuleGroupItem(group.name, group.path);
  });
}

// 添加规则分组输入项
function addRuleGroupItem(name = '', path = '') {
  const container = document.getElementById('ruleGroupsList');
  const div = document.createElement('div');
  div.className = 'rule-group-item form-group';
  div.innerHTML = `
    <input type="text" placeholder="显示名称 (如: 办公网络)" class="group-name" value="${name}" required>
    <input type="text" placeholder="规则文件路径 (如: office.txt)" class="group-path" value="${path}" required>
    <button type="button" class="btn btn-remove">删除</button>
  `;

  div.querySelector('.btn-remove').addEventListener('click', () => {
    div.remove();
  });

  container.appendChild(div);
}

// 保存设置
async function saveSettings() {
  const token = document.getElementById('token').value.trim();
  const owner = document.getElementById('owner').value.trim();
  const repo = document.getElementById('repo').value.trim();
  const branch = document.getElementById('branch').value.trim() || 'main';

  // 获取规则分组配置
  const ruleGroups = [];
  const groupItems = document.querySelectorAll('.rule-group-item');

  groupItems.forEach(item => {
    const name = item.querySelector('.group-name').value.trim();
    const path = item.querySelector('.group-path').value.trim();
    if (name && path) {
      ruleGroups.push({ name, path });
    }
  });

  if (ruleGroups.length === 0) {
    showMessage('请至少添加一个规则分组', 'error');
    return;
  }

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
      ruleGroups
      // 不再单独保存 directFile 和 proxyFile
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

// 导出设置
async function exportSettings() {
  try {
    const settings = await chrome.storage.sync.get(null);
    const json = JSON.stringify(settings, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `clash-config-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('配置已导出', 'success');
  } catch (error) {
    console.error('导出失败:', error);
    showMessage('导出失败: ' + error.message, 'error');
  }
}

// 导入设置
function importSettings(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const settings = JSON.parse(e.target.result);
      await chrome.storage.sync.set(settings);
      await loadSettings();
      showMessage('配置已导入并生效', 'success');
    } catch (error) {
      console.error('导入失败:', error);
      showMessage('导入失败: 文件格式错误', 'error');
    }
    document.getElementById('importFile').value = '';
  };
  reader.readAsText(file);
}

// 显示消息
function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type} show`;

  setTimeout(() => {
    message.classList.remove('show');
  }, 3000);
}
