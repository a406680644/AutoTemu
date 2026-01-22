/**
 * 亚杰API类型定义
 *
 * 定义亚杰开放平台API的请求/响应类型
 */

// ============================================
// 认证相关
// ============================================

/**
 * 获取Access Token请求参数
 */
export interface YajieTokenRequest {
  client_id: string
  client_secret: string
  grant_type: "client_credentials"
}

/**
 * Access Token响应
 */
export interface YajieTokenResponse {
  code: string | number // API 返回字符串 "200"
  msg?: string
  message?: string // API 实际使用 message 字段
  data?: {
    access_token: string
    expires: string // 过期时间，格式如 "2026-01-22 17:54:10"
    expires_in?: number // 备用：过期时间（秒）
    token_type?: string
  }
}

/**
 * 缓存的Token信息
 */
export interface CachedToken {
  access_token: string
  expires_at: number // 过期时间戳（毫秒）
}

// ============================================
// 签名相关
// ============================================

/**
 * 签名参数
 */
export interface SignParams {
  access_token: string
  client_id: string
  method: string
  nonce: string
  timestamp: number
  url: string
}

// ============================================
// 库存查询相关
// ============================================

/**
 * 仓库库存查询请求
 */
export interface YajieStockRequest {
  sku_codes?: string[] // SKU编码列表
  warehouse_ids?: number[] // 仓库ID列表
  page?: number
  page_size?: number
}

/**
 * 库存项
 */
export interface YajieStockItem {
  stock_code: string // SKU编码（API 实际返回 stock_code）
  warehouse_id: number // 仓库ID
  warehouse_name: string // 仓库名称
  available_qty: number // 可用数量
  ontheway_qty: number // 在途数量
  locked_qty: number // 锁定数量
  total_qty: number // 总库存
}

/**
 * 仓库库存查询响应
 */
export interface YajieStockResponse {
  code: string | number // API 可能返回字符串 "200"
  msg?: string
  message?: string // API 可能使用 message 字段
  data?: {
    rows: YajieStockItem[] // API 实际返回 rows 而非 list
    total: number
    page: number
    pageSize: number // API 实际返回 pageSize 而非 page_size
  }
}

// ============================================
// 通用API响应
// ============================================

/**
 * 亚杰API通用响应结构
 */
export interface YajieApiResponse<T = any> {
  code: number
  msg: string
  data?: T
}

// ============================================
// 消息通信类型
// ============================================

/**
 * 在途数量查询消息
 */
export interface YajieTransitQueryMessage {
  type: "YAJIE_TRANSIT_QUERY"
  skuCode: string
}

/**
 * 在途数量查询响应
 */
export interface YajieTransitQueryResponse {
  success: boolean
  onthewayQty?: number
  error?: string
}
