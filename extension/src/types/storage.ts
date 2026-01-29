/**
 * 存储类型定义
 *
 * 定义 IndexedDB 和 chrome.storage 的数据结构
 */

// ============================================
// IndexedDB 数据表类型
// ============================================

/**
 * 按原因分组的 SKC 列表
 */
export interface ReasonGroup {
  reason: string;      // 下架原因
  skcIds: string[];    // 该原因下的所有 SKC ID
}

/**
 * 已下架商品记录（方案B：每个店铺每天一条记录）
 *
 * 主键：mallId + unPublishedDate
 * 同一店铺同一天只存储一条，相同原因的 SKC 归纳在一起
 */
export interface UnpublishedItem {
  // 唯一键字段
  mallId: string;             // 店铺 ID
  unPublishedDate: string;    // 下架日期 "YYYY-MM-DD"

  // 数据字段
  mallName: string;           // 店铺名称
  reasonGroups: ReasonGroup[]; // 按原因分组的 SKC 列表
  totalCount: number;         // SKC 总数
  pushed: boolean;            // 是否已推送钉钉
}

/**
 * 站点异常记录
 *
 * 主键：mallId + skcId（同一店铺同一 SKC 只保留一条，更新时覆盖）
 */
export interface SiteErrorItem {
  // 唯一键字段
  mallId: string;           // 店铺 ID
  skcId: string;            // SKC ID

  // 数据字段
  mallName: string;         // 店铺名称
  goodsSkuId: string;       // SKU ID
  errorReasons: string[];   // 异常原因列表
  affectedSites: string[];  // 涉及的站点国家列表
  checkedAt: number;        // 检查时间戳（更新时间）
}

/**
 * SKU 映射（goodsSkuId -> skcId）
 */
export interface SkuMapping {
  mallId: string // 店铺 ID
  goodsSkuId: number // SKU ID
  skcId: string // SKC ID
  updatedAt: number // 更新时间
}

/**
 * 违规商品记录
 *
 * 主键：mallId + spuId（同一店铺同一 SPU 只保留一条）
 */
export interface ViolationItem {
  // 复合主键
  mallId: string;           // 店铺 ID
  spuId: number;            // SPU ID

  // 数据字段
  mallName: string;         // 店铺名称
  goodsName: string;        // 商品名称
  violationDesc: string;    // 违规描述
  siteNum: number;          // 涉及站点数
  checkedAt: number;        // 检查时间戳
}

/**
 * API 缓存
 */
export interface ApiCache {
  key: string // 缓存键
  value: any // 缓存值
  expiry: number // 过期时间戳
  createdAt: number // 创建时间
}

// ============================================
// chrome.storage 配置类型
// ============================================

/**
 * 推送渠道类型
 */
export type NotifyChannel = 'dingtalk' | 'feishu' | 'both' | 'none';

/**
 * Bitable Token 类型
 * - base: 直接使用 base 格式的 app_token（如 bascnxxxxxxxx）
 * - wiki: 使用 wiki 节点 token，需要先转换为真实的 app_token
 */
export type BitableTokenType = 'base' | 'wiki';

/**
 * 用户配置
 */
export interface UserConfig {
  // 钉钉配置
  dingtalk_webhook?: string;  // 钉钉 Webhook URL

  // 飞书配置
  feishu_app_id?: string;     // 飞书 App ID
  feishu_app_secret?: string; // 飞书 App Secret
  feishu_chat_id?: string;    // 飞书群聊 ID

  // 飞书 Bitable 配置
  feishu_bitable_app_token?: string;           // 多维表格 App Token
  feishu_bitable_token_type?: BitableTokenType; // Token 类型（base 或 wiki）
  feishu_bitable_site_error_table_id?: string; // 站点异常子表 ID
  feishu_bitable_violation_table_id?: string;  // 违规商品子表 ID

  // 推送渠道选择
  notify_channel?: NotifyChannel;  // 推送渠道，默认 'dingtalk'

  // 定时推送配置
  push_time?: string;         // 定时推送时间，格式 "HH:MM"，如 "09:00"
  push_enabled?: boolean;     // 是否启用定时推送

  // 其他配置
  sync_interval?: number;     // 同步间隔（分钟）
  enabled?: boolean;          // 是否启用自动同步
}

/**
 * 任务状态
 */
export type TaskStatus = "idle" | "running" | "done" | "fail"

/**
 * 日志级别
 */
export type LogLevel = "info" | "warn" | "error"

/**
 * 任务日志
 */
export interface TaskLog {
  timestamp: number
  level: LogLevel
  message: string
}

/**
 * 任务状态数据
 */
export interface TaskState {
  status: TaskStatus;
  progress: number;          // 0-100
  currentMall?: string;      // 当前处理的店铺
  totalMalls: number;        // 总店铺数
  completedMalls: number;    // 已完成店铺数
  startTime?: number;        // 开始时间戳
  endTime?: number;          // 结束时间戳
  error?: string;            // 错误信息
  logs: TaskLog[];           // 日志数组
  shouldStop?: boolean;      // 停止标志
  fetchedData?: Array<{              // 拉取的数据（用于展示）
    mallId: string;
    mallName: string;
    skcId: string;
    unPublishedTime: number;
    unPublishedReason: string;
  }>;
}

// ============================================
// 去重标记类型
// ============================================

/**
 * 已推送记录标记（Set 序列化为数组）
 */
export interface PushedRecords {
  unpublished_keys: string[] // 已推送的下架记录键
}

// ============================================
// 配置键常量
// ============================================

export const CONFIG_KEYS = {
  // 钉钉配置
  DINGTALK_WEBHOOK: 'dingtalk_webhook',

  // 飞书配置
  FEISHU_APP_ID: 'feishu_app_id',
  FEISHU_APP_SECRET: 'feishu_app_secret',
  FEISHU_CHAT_ID: 'feishu_chat_id',

  // 飞书 Bitable 配置
  FEISHU_BITABLE_APP_TOKEN: 'feishu_bitable_app_token',
  FEISHU_BITABLE_TOKEN_TYPE: 'feishu_bitable_token_type',
  FEISHU_BITABLE_SITE_ERROR_TABLE_ID: 'feishu_bitable_site_error_table_id',
  FEISHU_BITABLE_VIOLATION_TABLE_ID: 'feishu_bitable_violation_table_id',

  // 推送渠道
  NOTIFY_CHANNEL: 'notify_channel',

  // 定时推送
  PUSH_TIME: 'push_time',
  PUSH_ENABLED: 'push_enabled',

  // 其他配置
  SYNC_INTERVAL: 'sync_interval',
  ENABLED: 'enabled',
  TASK_STATE: 'task_state',
  PUSHED_RECORDS: 'pushed_records'
} as const;

// ============================================
// IndexedDB 表名常量
// ============================================

export const STORE_NAMES = {
  UNPUBLISHED: "unpublished", // 已下架记录
  SITE_ERRORS: "site_errors", // 站点异常
  VIOLATIONS: "violations",   // 违规商品
  SKU_MAPPING: "sku_mapping", // SKU 映射
  API_CACHE: "api_cache" // API 缓存
} as const
