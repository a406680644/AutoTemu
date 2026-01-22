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
  SiteErrorResponse
} from '~types/api';
import {
  TEMU_API,
  getTemuApiUrl,
  getTemuSupplierEndpoint
} from '~lib/constants';

// 基础请求头（必须包含 Accept，否则某些 API 返回 405）
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
      const response = await bridgeRequestWithRetry(
        TEMU_API.HOST,
        'bridge-fetch',
        {
          url: getTemuApiUrl(TEMU_API.ENDPOINTS.USER_INFO),
          method: 'POST',
          data: {},
          headers: BASE_HEADERS
        }
      );

      if (!response.ok) {
        throw new Error("获取店铺列表失败: HTTP " + response.status)
      }

      const data = response.data as UserInfoResponse

      // Temu API 使用 success: true 或 errorCode: 1000000 表示成功
      if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
        throw new Error(data.errorMsg || '获取店铺列表失败');
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
   * ⭐ 根据 managedType 选择不同接口：
   *    - managedType === 0 (全托): searchForChainSupplier
   *    - managedType === 1 (半托): searchForSemiSupplier
   *
   * @param mallId 店铺 ID（必需）
   * @param managedType 店铺类型（0=全托, 1=半托）
   * @param pageNum 页码（从 1 开始）
   */
  async fetchUnpublishedData(
    mallId: string,
    managedType: number,
    pageNum: number = 1
  ): Promise<{
    total: number
    dataList: Array<{
      skcId: string;
      unPublishedTime: number;
      unPublishedReason: string;
    }>;
  }> {
    try {
      // 根据 managedType 选择接口
      const endpoint = getTemuSupplierEndpoint(managedType);
      const apiUrl = getTemuApiUrl(endpoint);

      // 动态计算最近两天的时间范围（本地时间整点对齐）
      // 使用 Date 构造函数明确指定本地时间，避免 Service Worker 时区问题
      const now = new Date();
      const todayYear = now.getFullYear();
      const todayMonth = now.getMonth();
      const todayDate = now.getDate();

      // timeBegin: 前一天的 00:00:00 本地时间
      const beginDate = new Date(todayYear, todayMonth, todayDate - 1, 0, 0, 0, 0);
      const timeBegin = beginDate.getTime();

      // timeEnd: 当天的 23:59:59.999 本地时间
      const endDate = new Date(todayYear, todayMonth, todayDate, 23, 59, 59, 999);
      const timeEnd = endDate.getTime();

      // 构建请求载荷
      const requestPayload = {
        pageNum,
        pageSize: TEMU_API.PAGINATION.PAGE_SIZE,
        timeType: TEMU_API.FILTERS.TIME_TYPE_UNPUBLISHED,
        timeBegin,
        timeEnd
      };

      const managedTypeLabel = managedType === TEMU_API.MANAGED_TYPE.CHAIN ? '全托' : '半托';
      console.log('[Temu API] 拉取已下架数据 - 店铺:', mallId, '类型:', managedTypeLabel, '页码:', pageNum);
      console.log('[Temu API] 请求载荷:', JSON.stringify(requestPayload));
      console.log('[Temu API] 时间范围:', beginDate.toLocaleString(), '~', endDate.toLocaleString());

      const response = await bridgeRequestWithRetry(
        TEMU_API.HOST,
        'bridge-fetch',
        {
          url: apiUrl,
          method: 'POST',
          data: requestPayload,
          headers: {
            ...BASE_HEADERS,
            'Mallid': String(mallId)  // ⭐ 关键：携带店铺 ID
          }
        }
      })

    if (!response.ok) {
      throw new Error("拉取已下架数据失败: HTTP " + response.status)
    }

    const data = response.data as UnpublishedDataResponse

    // Temu API 使用 success: true 或 errorCode: 1000000 表示成功
    if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
      throw new Error(data.errorMsg || '拉取已下架数据失败');
    }

    const total = data.result?.total || 0
    const rawList = data.result?.dataList || []

    // 解析数据（skcId 在 skcList 数组中，每个 SKC 生成一条记录）
    // 只保留推送必要的字段：skcId, unPublishedTime, unPublishedReason
    const dataList = rawList.flatMap(item => {
      // 收集所有下架原因并去重，用"、"连接
      // ⭐ 注意：trim() 去除首尾空白字符（包括换行符），避免相同原因因空白不同而未去重
      const reasons = [...new Set(
        (item.punishInfoList || [])
          .map(p => p.reason?.trim())
          .filter(Boolean)
      )];
      const unPublishedReason = reasons.length > 0 ? reasons.join('、') : '运营手动下架';

      return (item.skcList || []).map(skc => ({
        skcId: String(skc.skcId),
        unPublishedTime: Number(item.unPublishedTime) || Date.now(),
        unPublishedReason
      }));
    });

    console.log("[Temu API] 已下架数据:", dataList.length, "/", total)
    return { total, dataList }
  } catch(error) {
    console.error("[Temu API] 拉取已下架数据失败:", error)
    throw error
  }
}

  /**
   * 拉取已发布站点数据
   *
   * ⭐ 必须携带 mallId 参数，每个店铺独立请求
   * ⭐ 根据 managedType 选择不同接口：
   *    - managedType === 0 (全托): searchForChainSupplier
   *    - managedType === 1 (半托): searchForSemiSupplier
   *    通过 secondarySelectStatusList: [12] 筛选已上架状态的商品
   *
   * @param mallId 店铺 ID（必需）
   * @param managedType 店铺类型（0=全托, 1=半托）
   * @param pageNum 页码（从 1 开始）
   */
  async fetchPublishedData(
  mallId: string,
  managedType: number,
  pageNum: number = 1
): Promise < {
  total: number
    dataList: Array<{
    goodsId: number;
    goodsName: string;
    skuList?: Array<{
      goodsSkuId: number;
      skcId: string;
    }>;
  }>;
} > {
  try {
    // 根据 managedType 选择接口
    const endpoint = getTemuSupplierEndpoint(managedType);
    const apiUrl = getTemuApiUrl(endpoint);

    const managedTypeLabel = managedType === TEMU_API.MANAGED_TYPE.CHAIN ? '全托' : '半托';
    console.log('[Temu API] 拉取已发布站点数据 - 店铺:', mallId, '类型:', managedTypeLabel, '页码:', pageNum);

    // 使用 Kiana 接口
    // secondarySelectStatusList: [12] 表示已上架状态
    const requestPayload = {
      pageNum,
      pageSize: TEMU_API.PAGINATION.PAGE_SIZE,
      secondarySelectStatusList: TEMU_API.FILTERS.PUBLISHED_STATUS,
      supplierTodoTypeList: []
    };

    console.log('[Temu API] 请求载荷:', JSON.stringify(requestPayload));

    const response = await bridgeRequestWithRetry(
      TEMU_API.HOST,
      'bridge-fetch',
      {
        url: apiUrl,
        method: 'POST',
        data: requestPayload,
        headers: {
          ...BASE_HEADERS,
          'Mallid': String(mallId)  // ⭐ 关键：携带店铺 ID
        }
      }
      })

  if(!response.ok) {
  throw new Error("拉取已发布站点数据失败: HTTP " + response.status)
}

const data = response.data as PublishedDataResponse

// Temu API 使用 success: true 或 errorCode: 1000000 表示成功
if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
  throw new Error(data.errorMsg || '拉取已发布站点数据失败');
}

const total = data.result?.total || 0;
const rawList = data.result?.dataList || [];

// 解析数据：从 Kiana 接口响应中提取 goodsId 和 skuList
// Kiana 接口返回的结构：dataList[].goodsId, dataList[].skcList[].skuList[].goodsSkuId
const dataList = rawList.map((item: any) => ({
  goodsId: item.goodsId,
  goodsName: item.goodsName || '',
  skuList: (item.skcList || []).flatMap((skc: any) =>
    (skc.skuList || []).map((sku: any) => ({
      goodsSkuId: sku.goodsSkuId,
      skcId: String(skc.skcId)
    }))
  )
}));

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
   * ⭐ 使用 Kiana 接口 queryFullyOtherMessage
   * ⭐ 必须携带 mallId 参数，每个店铺独立请求
   *
   * @param mallId 店铺 ID（必需）
   * @param pairs goodsId 和 skuIdList 的组合数组
   */
  async querySiteErrors(
  mallId: string,
  pairs: Array<{ goodsId: number; skuIdList: number[] }>
): Promise < SiteErrorResponse > {
  try {
    console.log(
      "[Temu API] 查询站点异常 - 店铺:",
      mallId,
      "商品数:",
      pairs.length
    )

      // 使用 queryFullyOtherMessage 接口
      const requestData: SiteErrorQueryRequest = {
      goodsIdSkuIdPairList: pairs
    };

    console.log('[Temu API] 请求载荷:', JSON.stringify(requestData));

    const response = await bridgeRequestWithRetry(
      TEMU_API.HOST,
      'bridge-fetch',
      {
        url: getTemuApiUrl(TEMU_API.ENDPOINTS.SITE_ERRORS),
        method: 'POST',
        data: requestData,
        headers: {
          ...BASE_HEADERS,
          'Mallid': String(mallId)  // ⭐ 关键：携带店铺 ID
        }
      }
      })

  if(!response.ok) {
  throw new Error("查询站点异常失败: HTTP " + response.status)
}

const data = response.data as SiteErrorResponse

// Temu API 使用 success: true 或 errorCode: 1000000 表示成功
if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
  throw new Error(data.errorMsg || '查询站点异常失败');
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
