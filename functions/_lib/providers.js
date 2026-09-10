export const PROVIDERS = [
  { id: 'qwen', name: '通义千问 · 脚本', connection: 'api_key', capability: 'script', status: 'available', account_url: 'https://bailian.console.aliyun.com/' },
  { id: 'deepseek', name: 'DeepSeek · 脚本', connection: 'api_key', capability: 'script', status: 'available', account_url: 'https://platform.deepseek.com/' },
  { id: 'minimax', name: 'MiniMax H3', connection: 'api_key', status: 'available', account_url: 'https://platform.minimaxi.com/' },
  { id: 'runninghub', name: 'RunningHub AI 实例', connection: 'api_key', capability: 'video', status: 'available', account_url: 'https://www.runninghub.ai/' },
  { id: 'runway', name: 'Runway', connection: 'external', status: 'export', account_url: 'https://app.runwayml.com/' },
  { id: 'kling', name: '可灵', connection: 'external', status: 'export', account_url: 'https://klingai.kuaishou.com/' },
  { id: 'seedance', name: 'Seedance', connection: 'external', status: 'export', account_url: 'https://jimeng.jianying.com/' },
  { id: 'local-svd', name: '本地 SVD', connection: 'local', status: 'demo', account_url: null },
];
