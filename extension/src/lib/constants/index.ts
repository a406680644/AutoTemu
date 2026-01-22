/**
 * 常量配置中心
 *
 * 集中管理所有硬编码值，提高可维护性
 */

// ============================================
// Temu API 配置
// ============================================

export const TEMU_API = {
  /** Temu 卖家中心域名 */
  HOST: 'agentseller.temu.com',

  /** API 端点 */
  ENDPOINTS: {
    /** 用户信息（获取店铺列表） */
    USER_INFO: '/api/seller/auth/userInfo',
    /** 全托店铺商品查询 */
    CHAIN_SUPPLIER: '/api/kiana/mms/robin/searchForChainSupplier',
    /** 半托店铺商品查询 */
    SEMI_SUPPLIER: '/api/kiana/mms/robin/searchForSemiSupplier',
    /** 站点异常查询 */
    SITE_ERRORS: '/api/kiana/mms/robin/queryFullyOtherMessage',
  },

  /** 页面 URL */
  PAGES: {
    /** 商品管理页 */
    GOODS_MANAGE: '/main/goods-manage',
    /** 离线商品列表 */
    OFFLINE_LIST: '/goods/offlineList',
    /** 新上架产品选择 */
    PRODUCT_SELECT: '/newon/product-select',
  },

  /** 分页配置 */
  PAGINATION: {
    /** 默认分页大小 */
    PAGE_SIZE: 100,
  },

  /** 筛选条件 */
  FILTERS: {
    /** 已上架状态码 */
    PUBLISHED_STATUS: [12],
    /** 时间类型（7 表示下架时间） */
    TIME_TYPE_UNPUBLISHED: 7,
  },

  /** 店铺管理类型 */
  MANAGED_TYPE: {
    /** 全托管 */
    CHAIN: 0,
    /** 半托管 */
    SEMI: 1,
  },
} as const;

// ============================================
// 飞书 API 配置
// ============================================

export const FEISHU_API = {
  /** 飞书开放平台域名 */
  HOST: 'open.feishu.cn',

  /** API 端点 */
  ENDPOINTS: {
    /** 获取 Tenant Access Token */
    TOKEN: '/open-apis/auth/v3/tenant_access_token/internal',
    /** 发送消息 */
    MESSAGES: '/open-apis/im/v1/messages',
  },

  /** Token 配置 */
  TOKEN: {
    /** 默认有效期（秒） */
    DEFAULT_EXPIRE: 7200,
    /** 提前刷新时间（毫秒），5 分钟 */
    REFRESH_BUFFER: 5 * 60 * 1000,
  },

  /** 卡片样式 */
  CARD: {
    /** 预警卡片颜色 */
    ALERT_COLOR: 'red',
  },
} as const;

// ============================================
// 钉钉 API 配置
// ============================================

export const DINGTALK_API = {
  /** Webhook URL 前缀 */
  WEBHOOK_PREFIX: 'https://oapi.dingtalk.com/',
} as const;

// ============================================
// 超时配置（毫秒）
// ============================================

export const TIMEOUT = {
  /** HTTP 请求超时 */
  REQUEST: 30000,
  /** 页面加载超时 */
  PAGE_LOAD: 30000,
  /** Content Script 初始化等待 */
  SCRIPT_INIT: 1500,
  /** 注入脚本初始化等待 */
  INJECT_INIT: 1000,
} as const;

// ============================================
// 延迟配置（毫秒）
// ============================================

export const DELAY = {
  /** 店铺间处理间隔（防风控） */
  BETWEEN_SHOPS: 2000,
  /** 分页间处理间隔（防风控） */
  BETWEEN_PAGES: 1000,
  /** 批次间处理间隔 */
  BETWEEN_BATCHES: 200,
  /** 请求间处理间隔 */
  BETWEEN_REQUESTS: 300,
  /** Ping 重试间隔 */
  PING_RETRY: 500,
} as const;

// ============================================
// 重试配置
// ============================================

export const RETRY = {
  /** 默认最大重试次数 */
  MAX_RETRIES: 3,
  /** Ping 最大重试次数 */
  PING_MAX_RETRIES: 10,
} as const;

// ============================================
// 批处理配置
// ============================================

export const BATCH = {
  /** 站点异常查询批大小 */
  SITE_ERROR_QUERY: 100,
} as const;

// ============================================
// 默认配置值
// ============================================

export const DEFAULTS = {
  /** 同步间隔（分钟） */
  SYNC_INTERVAL: 30,
  /** 定时推送时间 */
  PUSH_TIME: '09:00',
  /** 默认推送渠道 */
  NOTIFY_CHANNEL: 'feishu' as const,
  /** 是否启用自动同步 */
  ENABLED: false,
  /** 是否启用定时推送 */
  PUSH_ENABLED: false,
} as const;

// ============================================
// 站点异常原因简化模板
// ============================================

export const SIMPLIFIED_REASON_TEMPLATES: Record<number, string> = {
  3: '该商品暂无可销售的库存',
  14: '受物流运输渠道限制影响，暂不支持在部分站点售卖',
  15: '调价失败',
};

// ============================================
// 工具函数
// ============================================

/**
 * 获取完整的 Temu API URL
 */
export function getTemuApiUrl(endpoint: string): string {
  return `https://${TEMU_API.HOST}${endpoint}`;
}

/**
 * 获取完整的 Temu 页面 URL
 */
export function getTemuPageUrl(page: string, params?: Record<string, string>): string {
  const url = `https://${TEMU_API.HOST}${page}`;
  if (params) {
    const queryString = new URLSearchParams(params).toString();
    return `${url}?${queryString}`;
  }
  return url;
}

/**
 * 获取完整的飞书 API URL
 */
export function getFeishuApiUrl(endpoint: string): string {
  return `https://${FEISHU_API.HOST}${endpoint}`;
}

/**
 * 根据店铺类型获取对应的 API 端点
 */
export function getTemuSupplierEndpoint(managedType: number): string {
  return managedType === TEMU_API.MANAGED_TYPE.CHAIN
    ? TEMU_API.ENDPOINTS.CHAIN_SUPPLIER
    : TEMU_API.ENDPOINTS.SEMI_SUPPLIER;
}
