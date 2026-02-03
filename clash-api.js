// Clash API 交互模块

class ClashAPI {
  constructor(apiUrl, secret = '') {
    this.apiUrl = apiUrl.replace(/\/$/, ''); // 移除末尾斜杠
    this.secret = secret;
  }

  // 更新指定的规则提供者
  async updateRuleProvider(providerName) {
    try {
      const headers = {};
      if (this.secret) {
        headers['Authorization'] = `Bearer ${this.secret}`;
      }

      const response = await fetch(`${this.apiUrl}/providers/rules/${providerName}`, {
        method: 'PUT',
        headers
      });

      if (!response.ok) {
        throw new Error(`更新规则提供者失败: ${response.status}`);
      }

      console.log(`规则提供者 ${providerName} 已更新`);
      return true;
    } catch (error) {
      console.error(`更新规则提供者 ${providerName} 失败:`, error);
      throw error;
    }
  }

  // 获取 Clash 版本（用于测试连接）
  async getVersion() {
    try {
      const headers = {};
      if (this.secret) {
        headers['Authorization'] = `Bearer ${this.secret}`;
      }

      const response = await fetch(`${this.apiUrl}/version`, {
        headers
      });

      if (!response.ok) {
        throw new Error(`获取版本失败: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('获取 Clash 版本失败:', error);
      throw error;
    }
  }
}

// 导出供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClashAPI;
}
