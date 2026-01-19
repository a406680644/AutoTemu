/**
 * 存储类型定义
 *
 * 定义 IndexedDB 和 chrome.storage 的数据结构
 */

// ============================================
// IndexedDB 数据表类型
// ============================================

/**
 * 已下架商品记录
 */
export interface UnpublishedItem {
  // 唯一键字段
  mallId: string;           // 店铺 ID
  goodsSkuId: string;       // SKU ID
  unPublishedTime: number;  // 下架时间戳

  // 数据字段
  skcId: string;            // SKC ID
  goodsName: string;        // 商品名称
  goodsMainImage: string;   // 商品主图
  unPublishedReason: string; // 下架原因
  createdAt: number;        // 记录创建时间
  pushed: boolean;          // 是否已推送钉钉
}

/**
 * 站点异常记录
 */
export interface SiteErrorItem {
  // 唯一键字段
  mallId: string;           // 店铺 ID
  skcId: string;            // SKC ID
  checkedAt: number;        // 检查时间戳

  // 数据字段
  mallName: string;         // 店铺名称
  goodsSkuId: string;       // SKU ID
  errorReasons: string[];   // 异常原因列表
  affectedSites: string[];  // 涉及的站点国家列表
}

/**
 * SKU 映射（goodsSkuId -> skcId）
 */
export interface SkuMapping {
  mallId: string;           // 店铺 ID
  goodsSkuId: number;       // SKU ID
  skcId: string;            // SKC ID
  updatedAt: number;        // 更新时间
}

/**
 * API 缓存
 */
export interface ApiCache {
  key: string;              // 缓存键
  value: any;               // 缓存值
  expiry: number;           // 过期时间戳
  createdAt: number;        // 创建时间
}

// ============================================
// chrome.storage 配置类型
// ============================================

/**
 * 用户配置
 */
export interface UserConfig {
  dingtalk_webhook?: string;  // 钉钉 Webhook URL
  sync_interval?: number;     // 同步间隔（分钟）
  enabled?: boolean;          // 是否启用自动同步
}

/**
 * 任务状态
 */
export type TaskStatus = 'idle' | 'running' | 'done' | 'fail';

/**
 * 日志级别
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * 任务日志
 */
export interface TaskLog {
  timestamp: number;
  level: LogLevel;
  message: string;
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
}

// ============================================
// 去重标记类型
// ============================================

/**
 * 已推送记录标记（Set 序列化为数组）
 */
export interface PushedRecords {
  unpublished_keys: string[];  // 已推送的下架记录键
}

// ============================================
// 配置键常量
// ============================================

export const CONFIG_KEYS = {
  DINGTALK_WEBHOOK: 'dingtalk_webhook',
  SYNC_INTERVAL: 'sync_interval',
  ENABLED: 'enabled',
  TASK_STATE: 'task_state',
  PUSHED_RECORDS: 'pushed_records'
} as const;

// ============================================
// IndexedDB 表名常量
// ============================================

export const STORE_NAMES = {
  UNPUBLISHED: 'unpublished',       // 已下架记录
  SITE_ERRORS: 'site_errors',       // 站点异常
  SKU_MAPPING: 'sku_mapping',       // SKU 映射
  API_CACHE: 'api_cache'            // API 缓存
} as const;
