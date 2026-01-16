// GitHub API 交互模块

class GitHubAPI {
  constructor(token, owner, repo, branch = 'main') {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.baseUrl = 'https://api.github.com';
  }

  // 获取文件内容
  async getFileContent(filePath) {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${this.branch}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        // 文件不存在，返回空内容
        return { content: '', sha: null };
      }
      throw new Error(`获取文件失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // 解码 Base64 内容
    const content = atob(data.content);

    return {
      content,
      sha: data.sha
    };
  }

  // 更新文件内容
  async updateFile(filePath, content, sha, message) {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}`;

    // Base64 编码内容
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const body = {
      message,
      content: encodedContent,
      branch: this.branch
    };

    // 如果文件已存在，需要提供 SHA
    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `更新文件失败: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // 添加域名到规则文件
  async addDomainToFile(filePath, domain) {
    try {
      // 获取当前文件内容
      const { content, sha } = await this.getFileContent(filePath);

      // 构建 Clash 规则格式
      const rule = `DOMAIN-SUFFIX,${domain}`;

      // 检查规则是否已存在
      if (content.includes(rule)) {
        throw new Error('该域名已存在于规则文件中');
      }

      // 添加新规则（确保文件末尾有换行符）
      let newContent = content;
      if (newContent && !newContent.endsWith('\n')) {
        newContent += '\n';
      }
      newContent += rule + '\n';

      // 更新文件
      const commitMessage = `Add ${domain} to ${filePath}`;
      await this.updateFile(filePath, newContent, sha, commitMessage);

      return true;
    } catch (error) {
      console.error('添加域名失败:', error);
      throw error;
    }
  }
}

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubAPI;
}
