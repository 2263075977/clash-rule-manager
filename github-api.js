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

// 域名归一化:小写 + 去除尾随点
function normalizeDomain(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/\.+$/, '');
}

// 把一行规则归一化为 { kind, value };
// 无法识别(注释 / 空行 / 非域名规则)返回 null
function parseRuleLine(rawLine) {
  if (typeof rawLine !== 'string') return null;

  // 1. 去首尾空白
  let line = rawLine.trim();
  if (!line) return null;

  // 2. yaml 数组项前缀 '-'
  if (line.startsWith('-')) {
    line = line.slice(1).trim();
    if (!line) return null;
  }

  // 3. 从第一个 '#' 处截断行尾注释(域名不含 '#')
  const hashIndex = line.indexOf('#');
  if (hashIndex !== -1) {
    line = line.slice(0, hashIndex).trim();
    if (!line) return null;
  }

  // 4. 去掉成对的包裹引号
  if (line.length >= 2) {
    const first = line[0];
    const last = line[line.length - 1];
    if ((first === "'" || first === '"') && first === last) {
      line = line.slice(1, -1).trim();
      if (!line) return null;
    }
  }

  // 5. 前缀判定
  const upper = line.toUpperCase();
  if (upper.startsWith('DOMAIN-KEYWORD,')) {
    const value = normalizeDomain(line.slice('DOMAIN-KEYWORD,'.length));
    return value ? { kind: 'keyword', value } : null;
  }
  if (upper.startsWith('DOMAIN-SUFFIX,')) {
    const value = normalizeDomain(line.slice('DOMAIN-SUFFIX,'.length));
    return value ? { kind: 'suffix', value } : null;
  }
  if (upper.startsWith('DOMAIN,')) {
    const value = normalizeDomain(line.slice('DOMAIN,'.length));
    return value ? { kind: 'exact', value } : null;
  }
  if (line.startsWith('+.')) {
    const value = normalizeDomain(line.slice(2));
    return value ? { kind: 'suffix', value } : null;
  }
  if (line.startsWith('*.')) {
    const value = normalizeDomain(line.slice(2));
    return value ? { kind: 'wildcard', value } : null;
  }
  if (line.startsWith('.')) {
    const value = normalizeDomain(line.slice(1));
    return value ? { kind: 'wildcard', value } : null;
  }

  // 6. 兜底 hostname 字符集校验(挡掉 payload: / geodata-mode: 等键行)
  if (!/^[a-z0-9*][a-z0-9\-.*]*$/i.test(line)) return null;
  const value = normalizeDomain(line);
  return value ? { kind: 'exact', value } : null;
}

// 判重:仅 suffix / exact 参与,wildcard 与 keyword 永不判重
function isDomainCovered(content, domain) {
  const target = normalizeDomain(domain);
  if (!target || typeof content !== 'string') return false;
  for (const line of content.split('\n')) {
    const rule = parseRuleLine(line);
    if (!rule) continue;
    if (rule.kind !== 'suffix' && rule.kind !== 'exact') continue;
    if (rule.value === target) return true;
  }
  return false;
}

// 追加一条 '+.<domain>' 规则,返回新的完整文件内容
function appendRule(content, domain) {
  const value = normalizeDomain(domain);
  if (!value) return typeof content === 'string' ? content : '';
  const ruleLine = `- '+.${value}'`;
  const source = typeof content === 'string' ? content : '';
  const lines = source.split('\n');

  // 锚点 1:最后一个符合 parseRuleLine 的行(同时推断缩进)
  let lastRuleIndex = -1;
  let indent = null;
  for (let i = 0; i < lines.length; i++) {
    if (parseRuleLine(lines[i])) {
      lastRuleIndex = i;
      indent = (lines[i].match(/^[ \t]*/) || [''])[0];
    }
  }

  if (lastRuleIndex !== -1) {
    lines.splice(lastRuleIndex + 1, 0, (indent !== null ? indent : '  ') + ruleLine);
    let newContent = lines.join('\n');
    if (newContent && !newContent.endsWith('\n')) newContent += '\n';
    return newContent;
  }

  // 锚点 2:已存在 'payload:' 键但还没有规则行(避免重复键)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*payload\s*:\s*$/.test(lines[i])) {
      lines.splice(i + 1, 0, '  ' + ruleLine);
      let newContent = lines.join('\n');
      if (newContent && !newContent.endsWith('\n')) newContent += '\n';
      return newContent;
    }
  }

  // 锚点 3:重建(空文件 / 只有注释的文件)
  const trimmed = source.replace(/\s+$/, '');
  return (trimmed ? trimmed + '\n' : '') + 'payload:\n  ' + ruleLine + '\n';
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
    return isDomainCovered(content, domain);
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
      const target = normalizeDomain(domain);
      const lines = content.split('\n');
      const kept = [];
      let removed = 0;
      for (const rawLine of lines) {
        const rule = parseRuleLine(rawLine);
        const hit = rule
          && (rule.kind === 'suffix' || rule.kind === 'exact')
          && rule.value === target;
        if (hit) {
          removed++;
          continue;
        }
        kept.push(rawLine);
      }
      if (removed === 0) {
        throw new Error('该域名不存在于规则文件中');
      }
      let newContent = kept.join('\n');
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
      if (isDomainCovered(content, domain)) {
        throw new Error('该域名已存在于规则文件中');
      }
      const newContent = appendRule(content, domain);
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
