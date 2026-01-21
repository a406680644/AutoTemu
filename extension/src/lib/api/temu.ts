/**
 * Temu API 封装
 *
 * 封装 Temu 卖家中心 API 调用
 *
 * ⭐ 关键点：所有 API 请求必须携带 'Mallid' 请求头来指定店铺
 */

import type {
  Mall,
  PublishedDataResponse,
  SiteErrorQueryRequest,
  SiteErrorResponse,
  UnpublishedDataResponse,
  UserInfoResponse
} from "~types/api"

import { bridgeRequestWithRetry } from "./client"

// Temu 卖家中心域名
const TEMU_HOST = "agentseller.temu.com"

// 基础请求头
const BASE_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json"
}

/**
 * Temu API 客户端
 */
class TemuApiClient {
  /**
   * 获取当前账号的所有店铺列表
   */
  async getMallList(): Promise<Mall[]> {
    try {
      const response = await bridgeRequestWithRetry(TEMU_HOST, "bridge-fetch", {
        url: "https://agentseller.temu.com/api/seller/auth/userInfo",
        method: "POST",
        data: {},
        headers: BASE_HEADERS
      })

      if (!response.ok) {
        throw new Error("获取店铺列表失败: HTTP " + response.status)
      }

      const data = response.data as UserInfoResponse

      if (data.errorCode !== undefined && data.errorCode !== 0) {
        throw new Error(data.errorMsg || "获取店铺列表失败")
      }

      const mallList = data.result?.mallList || []
      console.log("[Temu API] 获取到", mallList.length, "个店铺")

      return mallList.map((mall) => ({
        mallId: mall.mallId,
        mallName: mall.mallName,
        managedType: mall.managedType
      }))
    } catch (error) {
      console.error("[Temu API] 获取店铺列表失败:", error)
      throw error
    }
  }

  /**
   * 拉取已下架商品数据
   *
   * ⭐ 必须携带 mallId 参数，每个店铺独立请求
   *
   * @param mallId 店铺 ID（必需）
   * @param timeBegin 开始时间戳（毫秒）
   * @param timeEnd 结束时间戳（毫秒）
   * @param pageNum 页码（从 1 开始）
   */
  async fetchUnpublishedData(
    mallId: string,
    timeBegin: number,
    timeEnd: number,
    pageNum: number = 1
  ): Promise<{
    total: number
    dataList: Array<{
      goodsSkuId: string
      skcId: string
      goodsName: string
      goodsMainImage: string
      unPublishedTime: number
      unPublishedReason: string
    }>
  }> {
    try {
      console.log("[Temu API] 拉取已下架数据 - 店铺:", mallId, "页码:", pageNum)

      const response = await bridgeRequestWithRetry(TEMU_HOST, "bridge-fetch", {
        url: "https://agentseller.temu.com/api/bg/goods/offlineList/search",
        method: "POST",
        data: {
          pageNum,
          pageSize: 100,
          unPublishedTimeBegin: timeBegin,
          unPublishedTimeEnd: timeEnd
        },
        headers: {
          ...BASE_HEADERS,
          Mallid: String(mallId) // ⭐ 关键：携带店铺 ID
        }
      })

      if (!response.ok) {
        throw new Error("拉取已下架数据失败: HTTP " + response.status)
      }

      const data = response.data as UnpublishedDataResponse

      if (data.errorCode !== undefined && data.errorCode !== 0) {
        throw new Error(data.errorMsg || "拉取已下架数据失败")
      }

      const total = data.result?.total || 0
      const rawList = data.result?.dataList || []

      // 解析下架原因
      const dataList = rawList.map((item) => ({
        goodsSkuId: item.goodsSkuId,
        skcId: item.skcId,
        goodsName: item.goodsName,
        goodsMainImage: item.goodsMainImage,
        unPublishedTime: item.unPublishedTime,
        // 解析下架原因（punishInfoList.reason 为 null 时兜底为"运营手动下架"）
        unPublishedReason: item.punishInfoList?.[0]?.reason || "运营手动下架"
      }))

      console.log("[Temu API] 已下架数据:", dataList.length, "/", total)
      return { total, dataList }
    } catch (error) {
      console.error("[Temu API] 拉取已下架数据失败:", error)
      throw error
    }
  }

  /**
   * 拉取已发布站点数据
   *
   * ⭐ 必须携带 mallId 参数，每个店铺独立请求
   *
   * @param mallId 店铺 ID（必需）
   * @param pageNum 页码（从 1 开始）
   */
  async fetchPublishedData(
    mallId: string,
    pageNum: number = 1
  ): Promise<{
    total: number
    dataList: Array<{
      goodsId: number
      goodsName: string
      skuList?: Array<{
        goodsSkuId: number
        skcId: string
      }>
    }>
  }> {
    try {
      console.log(
        "[Temu API] 拉取已发布站点数据 - 店铺:",
        mallId,
        "页码:",
        pageNum
      )

      const response = await bridgeRequestWithRetry(TEMU_HOST, "bridge-fetch", {
        url: "https://agentseller.temu.com/api/bg/goods/spu/querySpuList",
        method: "POST",
        data: {
          pageNum,
          pageSize: 100
        },
        headers: {
          ...BASE_HEADERS,
          Mallid: String(mallId) // ⭐ 关键：携带店铺 ID
        }
      })

      if (!response.ok) {
        throw new Error("拉取已发布站点数据失败: HTTP " + response.status)
      }

      const data = response.data as PublishedDataResponse

      if (data.errorCode !== undefined && data.errorCode !== 0) {
        throw new Error(data.errorMsg || "拉取已发布站点数据失败")
      }

      const total = data.result?.total || 0
      const dataList = data.result?.dataList || []

      console.log("[Temu API] 已发布站点数据:", dataList.length, "/", total)
      return { total, dataList }
    } catch (error) {
      console.error("[Temu API] 拉取已发布站点数据失败:", error)
      throw error
    }
  }

  /**
   * 查询站点异常原因
   *
   * ⭐ 必须携带 mallId 参数，每个店铺独立请求
   *
   * @param mallId 店铺 ID（必需）
   * @param pairs goodsId 和 skuIdList 的组合数组
   */
  async querySiteErrors(
    mallId: string,
    pairs: Array<{ goodsId: number; skuIdList: number[] }>
  ): Promise<SiteErrorResponse> {
    try {
      console.log(
        "[Temu API] 查询站点异常 - 店铺:",
        mallId,
        "商品数:",
        pairs.length
      )

      const requestData: SiteErrorQueryRequest = {
        mallProductVOList: pairs
      }

      const response = await bridgeRequestWithRetry(TEMU_HOST, "bridge-fetch", {
        url: "https://agentseller.temu.com/api/bg/goods/spu/checkSiteStatus",
        method: "POST",
        data: requestData,
        headers: {
          ...BASE_HEADERS,
          Mallid: String(mallId) // ⭐ 关键：携带店铺 ID
        }
      })

      if (!response.ok) {
        throw new Error("查询站点异常失败: HTTP " + response.status)
      }

      const data = response.data as SiteErrorResponse

      if (data.errorCode !== undefined && data.errorCode !== 0) {
        throw new Error(data.errorMsg || "查询站点异常失败")
      }

      console.log("[Temu API] 站点异常查询完成")
      return data
    } catch (error) {
      console.error("[Temu API] 查询站点异常失败:", error)
      throw error
    }
  }
}

// 导出单例
export const temuApi = new TemuApiClient()
