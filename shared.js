// 共享常量模块

// 默认规则分组配置
const defaultRuleGroups = [
  { name: '直连规则', path: 'direct.txt', type: 'direct' },
  { name: '代理规则', path: 'proxy.txt', type: 'proxy' }
];

// 状态检测超时时间（毫秒）
const STATUS_CHECK_TIMEOUT = 8000;

// Toast 提示显示时长（毫秒）
const TOAST_DURATION = 2000;

// 并发状态检测上限
const MAX_CONCURRENT_CHECKS = 4;
