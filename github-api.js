// GitHub API 交互模块

// Base64 解码：支持 UTF-8（中文等多字节字符）
function base64Decode(base64Str) {
  const binaryStr = atob(base64Str.replace(/\n/g, ''));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Base64 编码：支持 UTF-8（中文等多字节字符）
function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binaryStr = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryStr += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryStr);
}

class GitHubAPI {
  // Per-file 操作锁，防止并发 PUT 竞态
  static _locks = new Set();

  constructor(token, owner, repo, branch = 'main') {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.baseUrl = 'https://api.github.com';
  }

  // 获取文件内容
  async getFileContent(filePath) {
    // 添加时间戳参数绕过缓存
    const timestamp = Date.now();
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${this.branch}&_=${timestamp}`;

    const response = await fetch(url, {
      cache: 'no-store',
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

    // 解码 Base64 内容，使用 TextDecoder 支持 UTF-8
    const content = base64Decode(data.content);

    return {
      content,
      sha: data.sha
    };
  }

  // 更新文件内容
  async updateFile(filePath, content, sha, message) {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${filePath}`;

    // Base64 编码内容，使用 TextEncoder 支持 UTF-8
    const encodedContent = base64Encode(content);

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
      const error = new Error(errorData.message || `更新文件失败: ${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  }

  // 检测域名是否已存在于文件中
  async checkDomainExists(filePath, domain) {
    // getFileContent 对 404 返回空内容不会抛出，
    // 其他错误（401/403/网络）直接向上传播，不再吞掉
    const { content } = await this.getFileContent(filePath);
    const rule = `DOMAIN-SUFFIX,${domain}`;
    return content.includes(rule);
  }

  // 从规则文件中删除域名（409 Conflict 时自动重试完整读写流程）
  async removeDomainFromFile(filePath, domain) {
    // Per-file 锁：防止并发操作
    if (GitHubAPI._locks.has(filePath)) {
      throw new Error('操作进行中，请稍后');
    }
    GitHubAPI._locks.add(filePath);

    const attempt = async () => {
      const { content, sha } = await this.getFileContent(filePath);
      const rule = `DOMAIN-SUFFIX,${domain}`;
      if (!content.includes(rule)) {
        throw new Error('该域名不存在于规则文件中');
      }
      const lines = content.split('\n');
      const newLines = lines.filter(line => line.trim() !== rule);
      let newContent = newLines.join('\n');
      if (newContent && !newContent.endsWith('\n')) {
        newContent += '\n';
      }
      const commitMessage = `Remove ${domain} from ${filePath}`;
      await this.updateFile(filePath, newContent, sha, commitMessage);
    };

    try {
      try {
        await attempt();
      } catch (error) {
        if (error.status === 409) {
          await attempt();
        } else {
          throw error;
        }
      }
      return true;
    } catch (error) {
      console.error('删除域名失败:', error);
      throw error;
    } finally {
      GitHubAPI._locks.delete(filePath);
    }
  }

  // 添加域名到规则文件（409 Conflict 时自动重试完整读写流程）
  async addDomainToFile(filePath, domain) {
    // Per-file 锁：防止并发操作
    if (GitHubAPI._locks.has(filePath)) {
      throw new Error('操作进行中，请稍后');
    }
    GitHubAPI._locks.add(filePath);

    const attempt = async () => {
      const { content, sha } = await this.getFileContent(filePath);
      const rule = `DOMAIN-SUFFIX,${domain}`;
      if (content.includes(rule)) {
        throw new Error('该域名已存在于规则文件中');
      }
      let newContent = content;
      if (newContent && !newContent.endsWith('\n')) {
        newContent += '\n';
      }
      newContent += rule + '\n';
      const commitMessage = `Add ${domain} to ${filePath}`;
      await this.updateFile(filePath, newContent, sha, commitMessage);
    };

    try {
      try {
        await attempt();
      } catch (error) {
        if (error.status === 409) {
          await attempt();
        } else {
          throw error;
        }
      }
      return true;
    } catch (error) {
      console.error('添加域名失败:', error);
      throw error;
    } finally {
      GitHubAPI._locks.delete(filePath);
    }
  }
}

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubAPI;
}
