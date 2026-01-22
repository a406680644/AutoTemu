/**
 * API 类型定义
 *
 * 定义 Temu API 和钉钉 API 的请求/响应类型
 */

// ============================================
// Temu API 类型
// ============================================

/**
 * 店铺信息
 */
export interface Mall {
  mallId: string // 店铺 ID
  mallName: string // 店铺名称
  managedType: number // 管理类型
}

/**
 * 用户信息响应
 */
export interface UserInfoResponse {
  success?: boolean;
  result?: {
    mallList?: Mall[]
  }
  errorCode?: number
  errorMsg?: string
}

/**
 * 已下架商品数据
 */
export interface UnpublishedDataResponse {
  success?: boolean;
  result?: {
    total?: number
    dataList?: Array<{
      goodsSkuId: string;
      goodsName: string;
      goodsMainImage: string;
      unPublishedTime: number;
      skcList: Array<{
        skcId: number;
        approveStatus?: number;
      }>;
      punishInfoList?: Array<{
        reason?: string
      }>
    }>
  }
  errorCode?: number
  errorMsg?: string
}

/**
 * 已发布站点数据
 */
export interface PublishedDataResponse {
  success?: boolean;
  result?: {
    total?: number
    dataList?: Array<{
      goodsId: number
      goodsName: string
      skuList?: Array<{
        goodsSkuId: number
        skcId: string
      }>
    }>
  }
  errorCode?: number
  errorMsg?: string
}

/**
 * 站点异常查询请求（queryFullyOtherMessage 接口）
 */
export interface SiteErrorQueryRequest {
  goodsIdSkuIdPairList: Array<{
    goodsId: number;
    skuIdList: number[];
  }>;
}

/**
 * 站点异常响应（queryFullyOtherMessage 接口）
 *
 * 响应结构：
 * - fullyBindSiteFailVO.goodsSkuBindSiteFailVOList[].goodsSkuId - 异常商品 SKU ID
 * - fullyBindSiteFailVO.goodsSkuBindSiteFailVOList[].goodsSkuBindSiteFailInfoVOList[].failResultVOList[].checkDesc - 异常原因
 * - fullyBindSiteFailVO.goodsSkuBindSiteFailVOList[].goodsSkuBindSiteFailInfoVOList[].siteName - 异常站点
 * - fullyBindSiteFailVO.staticDescVOList[].checkDesc - 静态异常原因
 */
export interface SiteErrorResponse {
  success?: boolean;
  result?: {
    fullyBindSiteFailVO?: {
      goodsSkuBindSiteFailVOList?: Array<{
        goodsSkuId: number;
        goodsSkuBindSiteFailInfoVOList?: Array<{
          siteName?: string;
          failResultVOList?: Array<{
            checkDesc?: string;
            checkCode?: number;  // ⭐ checkCode 是数字类型
          }>;
        }>;
      }>;
      staticDescVOList?: Array<{
        checkDesc?: string;
        checkCode?: number;  // ⭐ checkCode 是数字类型
      }>;
    };
  };
  errorCode?: number;
  errorMsg?: string;
}

// ============================================
// 钉钉 API 类型
// ============================================

/**
 * 钉钉卡片消息
 */
export interface DingtalkCardMessage {
  msgtype: "markdown"
  markdown: {
    title: string
    text: string
  }
}

/**
 * 钉钉 Webhook 响应
 */
export interface DingtalkWebhookResponse {
  errcode: number
  errmsg: string
}

// ============================================
// Bridge 请求/响应类型
// ============================================

/**
 * Bridge 请求
 */
export interface BridgeRequest {
  type: "bridge-fetch"
  payload: {
    url: string
    method?: string
    data?: any
    headers?: Record<string, string>
  }
}

/**
 * Bridge 响应
 */
export interface BridgeResponse {
  ok: boolean
  status?: number
  data?: any
  error?: string
}
