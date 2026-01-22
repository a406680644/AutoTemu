/**
 * 亚杰API客户端
 *
 * 提供与亚杰开放平台的交互功能：
 * - Access Token获取与缓存
 * - HMAC-SHA256签名生成
 * - 库存查询API调用
 */

import db from "~lib/storage/idb"
import type {
  CachedToken,
  SignParams,
  YajieStockItem,
  YajieStockResponse,
  YajieTokenResponse
} from "~types/yajie"

// ============================================
// 环境变量配置
// ============================================

const YAJIE_CONFIG = {
  baseUrl: process.env.PLASMO_PUBLIC_YAJIE_API_BASE_URL || "",
  clientId: process.env.PLASMO_PUBLIC_YAJIE_CLIENT_ID || "",
  clientSecret: process.env.PLASMO_PUBLIC_YAJIE_CLIENT_SECRET || "",
  warehouseId: parseInt(process.env.PLASMO_PUBLIC_YAJIE_WAREHOUSE_ID || "0", 10)
}

// Token缓存键
const TOKEN_CACHE_KEY = "yajie_access_token"
// Token缓存TTL（23小时，预留1小时缓冲）
const TOKEN_TTL_MINUTES = 23 * 60

// ============================================
// HMAC-SHA256 签名生成
// ============================================

/**
 * 生成HMAC-SHA256签名
 *
 * 签名算法：
 * 1. 参数列表: access_token, client_id, method, nonce, timestamp, url
 * 2. 格式: 参数名=参数值
 * 3. 按参数名字母排序，用&连接
 * 4. 使用client_secret作为密钥进行HMAC-SHA256加密
 */
export async function generateSign(params: SignParams): Promise<string> {
  // 按字母顺序排序参数并构建签名字符串
  const sortedKeys = Object.keys(params).sort() as (keyof SignParams)[]
  const signString = sortedKeys.map((key) => `${key}=${params[key]}`).join("&")

  // 签名字符串包含敏感信息，不输出到日志

  // 使用Web Crypto API进行HMAC-SHA256加密
  const encoder = new TextEncoder()
  const keyData = encoder.encode(YAJIE_CONFIG.clientSecret)
  const messageData = encoder.encode(signString)

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData)

  // 转换为十六进制字符串
  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")

  // 签名结果不输出到日志

  return hashHex
}

// ============================================
// Access Token 获取
// ============================================

/**
 * 获取Access Token
 * 优先从IndexedDB缓存获取，过期则重新请求
 */
export async function getAccessToken(): Promise<string> {
  // 1. 尝试从缓存获取
  const cached = await db.getCache(TOKEN_CACHE_KEY)
  if (cached) {
    const tokenData = cached as CachedToken
    // 检查是否过期（预留5分钟缓冲）
    if (tokenData.expires_at > Date.now() + 5 * 60 * 1000) {
      console.log("[Yajie] 使用缓存的Token")
      return tokenData.access_token
    }
    console.log("[Yajie] 缓存Token即将过期，重新获取")
  }

  // 2. 请求新Token
  console.log("[Yajie] 请求新的Access Token")

  const tokenUrl = `${YAJIE_CONFIG.baseUrl}/api/v1/token`
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: YAJIE_CONFIG.clientId,
      client_secret: YAJIE_CONFIG.clientSecret
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[Yajie] Token请求HTTP失败:", response.status, errorText)
    throw new Error(`Token请求失败: ${response.status} ${response.statusText}`)
  }

  const data: YajieTokenResponse = await response.json()
  // Token响应包含敏感信息，不输出到日志

  // 亚杰 API 成功状态码是 "200" 或 200
  const isSuccess = String(data.code) === "200" || data.code === 0
  if (!isSuccess || !data.data?.access_token) {
    console.error("[Yajie] Token获取失败，完整响应:", data)
    // 构建详细错误信息
    const errorDetails = [
      `code=${data.code}`,
      data.msg ? `msg=${data.msg}` : null,
      data.message ? `message=${data.message}` : null,
      !data.data?.access_token ? "无access_token" : null
    ].filter(Boolean).join(", ")
    throw new Error(`Token获取失败: ${errorDetails}`)
  }

  const accessToken = data.data.access_token

  // 计算过期时间（秒）
  // 优先使用 expires 日期字符串，否则使用 expires_in
  let expiresIn = 86400 // 默认24小时
  if (data.data.expires) {
    const expiresDate = new Date(data.data.expires).getTime()
    expiresIn = Math.max(0, Math.floor((expiresDate - Date.now()) / 1000))
  } else if (data.data.expires_in) {
    expiresIn = data.data.expires_in
  }

  // 3. 缓存Token
  const tokenCache: CachedToken = {
    access_token: accessToken,
    expires_at: Date.now() + expiresIn * 1000
  }
  await db.setCache(TOKEN_CACHE_KEY, tokenCache, TOKEN_TTL_MINUTES)
  console.log("[Yajie] Token已缓存")

  return accessToken
}

// ============================================
// 库存查询
// ============================================

/**
 * 生成随机nonce
 */
function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15)
}

/**
 * 查询SKU在途数量
 *
 * @param skuCode SKU编码
 * @returns 在途数量，未找到返回0
 */
export async function queryTransitStock(skuCode: string): Promise<number> {
  console.log("[Yajie] 查询在途库存:", skuCode)

  // 1. 获取Access Token
  const accessToken = await getAccessToken()

  // 2. 构建请求参数
  const apiPath = "/api/v1/out/yj_warehouse_stock_list"
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = generateNonce()

  // 3. 生成签名
  const signParams: SignParams = {
    access_token: accessToken,
    client_id: YAJIE_CONFIG.clientId,
    method: "post",
    nonce,
    timestamp,
    url: apiPath
  }
  const sign = await generateSign(signParams)

  // 4. 构建带 query 参数的 URL（参数在 query 中，不是 header 中）
  // 注意：client_secret 仅用于签名计算，不应在 URL 中传输
  const queryParams = new URLSearchParams({
    access_token: accessToken,
    client_id: YAJIE_CONFIG.clientId,
    timestamp: timestamp.toString(),
    sign: sign,
    nonce: nonce
  })
  const requestUrl = `${YAJIE_CONFIG.baseUrl}${apiPath}?${queryParams.toString()}`

  // 5. 发送请求（请求体格式按文档要求）
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      list_type: 3,
      search_field: "stock_code",
      warehouse_ids: [String(YAJIE_CONFIG.warehouseId)],
      batch_search_value: [skuCode],
      page: 1,
      pageSize: 10
    })
  })

  if (!response.ok) {
    throw new Error(`库存查询失败: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  // 库存查询响应包含业务数据，不输出完整响应到日志

  // 亚杰 API 成功状态码是 "200" 或 200
  const isSuccess = String(data.code) === "200" || data.code === 0
  if (!isSuccess) {
    throw new Error(`库存查询失败: ${data.msg || data.message || `code=${data.code}`}`)
  }

  // 6. 提取在途数量（响应中是 data.rows，字段是 stock_code）
  const stockItem = data.data?.rows?.find(
    (item: any) =>
      item.stock_code === skuCode &&
      item.warehouse_id === YAJIE_CONFIG.warehouseId
  )

  const onthewayQty = stockItem?.ontheway_qty ?? 0
  console.log("[Yajie] 在途数量:", skuCode, "=>", onthewayQty)

  return onthewayQty
}

/**
 * 批量查询SKU在途数量
 *
 * @param skuCodes SKU编码列表
 * @returns SKU编码到在途数量的映射
 */
export async function queryTransitStockBatch(
  skuCodes: string[]
): Promise<Map<string, number>> {
  console.log("[Yajie] 批量查询在途库存:", skuCodes.length, "个SKU")

  if (skuCodes.length === 0) {
    return new Map()
  }

  // 1. 获取Access Token
  const accessToken = await getAccessToken()

  // 2. 构建请求参数
  const apiPath = "/api/v1/out/yj_warehouse_stock_list"
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = generateNonce()

  // 3. 生成签名
  const signParams: SignParams = {
    access_token: accessToken,
    client_id: YAJIE_CONFIG.clientId,
    method: "post",
    nonce,
    timestamp,
    url: apiPath
  }
  const sign = await generateSign(signParams)

  // 4. 构建带 query 参数的 URL
  // 注意：client_secret 仅用于签名计算，不应在 URL 中传输
  const queryParams = new URLSearchParams({
    access_token: accessToken,
    client_id: YAJIE_CONFIG.clientId,
    timestamp: timestamp.toString(),
    sign: sign,
    nonce: nonce
  })
  const requestUrl = `${YAJIE_CONFIG.baseUrl}${apiPath}?${queryParams.toString()}`

  // 5. 发送请求（请求体格式按文档要求）
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      list_type: 3,
      search_field: "stock_code",
      warehouse_ids: [String(YAJIE_CONFIG.warehouseId)],
      batch_search_value: skuCodes,
      page: 1,
      pageSize: 200
    })
  })

  if (!response.ok) {
    throw new Error(`库存查询失败: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  // 批量库存查询响应包含业务数据，不输出完整响应到日志

  // 亚杰 API 成功状态码是 "200" 或 200
  const isSuccess = String(data.code) === "200" || data.code === 0
  if (!isSuccess) {
    throw new Error(`库存查询失败: ${data.msg || data.message || `code=${data.code}`}`)
  }

  // 6. 构建结果映射（响应中是 data.rows，字段是 stock_code）
  const resultMap = new Map<string, number>()
  for (const item of data.data?.rows || []) {
    if (item.warehouse_id === YAJIE_CONFIG.warehouseId) {
      resultMap.set(item.stock_code, item.ontheway_qty ?? 0)
    }
  }

  console.log("[Yajie] 批量查询完成:", resultMap.size, "个结果")

  return resultMap
}
