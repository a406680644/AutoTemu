/**
 * Temu API 封装
 *
 * 封装 Temu 卖家中心 API 调用
 *
 * ⭐ 关键点：所有 API 请求必须携带 'Mallid' 请求头来指定店铺
 */

import { bridgeRequestWithRetry } from './client';
import type {
  Mall,
  UserInfoResponse,
  UnpublishedDataResponse,
  PublishedDataResponse,
  SiteErrorQueryRequest,
  SiteErrorResponse
} from '~types/api';

// Temu 卖家中心域名
const TEMU_HOST = 'agentseller.temu.com';

// 基础请求头
const BASE_HEADERS = {
  'Content-Type': 'application/json'
};

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
        TEMU_HOST,
        'bridge-fetch',
        {
          url: 'https://agentseller.temu.com/api/seller/auth/userInfo',
          method: 'POST',
          data: {},
          headers: BASE_HEADERS
        }
      );

      if (!response.ok) {
        throw new Error('获取店铺列表失败: HTTP ' + response.status);
      }

      const data = response.data as UserInfoResponse;

      // Temu API 使用 success: true 或 errorCode: 1000000 表示成功
      if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
        throw new Error(data.errorMsg || '获取店铺列表失败');
      }

      const mallList = data.result?.mallList || [];
      console.log('[Temu API] 获取到', mallList.length, '个店铺');

      return mallList.map(mall => ({
        mallId: mall.mallId,
        mallName: mall.mallName,
        managedType: mall.managedType
      }));
    } catch (error) {
      console.error('[Temu API] 获取店铺列表失败:', error);
      throw error;
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
    total: number;
    dataList: Array<{
      skcId: string;
      unPublishedTime: number;
      unPublishedReason: string;
    }>;
  }> {
    try {
      // 根据 managedType 选择接口
      const apiUrl = managedType === 0
        ? 'https://agentseller.temu.com/api/kiana/mms/robin/searchForChainSupplier'   // 全托
        : 'https://agentseller.temu.com/api/kiana/mms/robin/searchForSemiSupplier';   // 半托

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
        pageSize: 100,
        timeType: 7,
        timeBegin,
        timeEnd
      };

      console.log('[Temu API] 拉取已下架数据 - 店铺:', mallId, '类型:', managedType === 0 ? '全托' : '半托', '页码:', pageNum);
      console.log('[Temu API] 请求载荷:', JSON.stringify(requestPayload));
      console.log('[Temu API] 时间范围:', beginDate.toLocaleString(), '~', endDate.toLocaleString());

      const response = await bridgeRequestWithRetry(
        TEMU_HOST,
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
      );

      if (!response.ok) {
        throw new Error('拉取已下架数据失败: HTTP ' + response.status);
      }

      const data = response.data as UnpublishedDataResponse;

      // Temu API 使用 success: true 或 errorCode: 1000000 表示成功
      if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
        throw new Error(data.errorMsg || '拉取已下架数据失败');
      }

      const total = data.result?.total || 0;
      const rawList = data.result?.dataList || [];

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

        return item.skcList.map(skc => ({
          skcId: String(skc.skcId),
          unPublishedTime: Number(item.unPublishedTime) || Date.now(),
          unPublishedReason
        }));
      });

      console.log('[Temu API] 已下架数据:', dataList.length, '/', total);
      return { total, dataList };
    } catch (error) {
      console.error('[Temu API] 拉取已下架数据失败:', error);
      throw error;
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
    total: number;
    dataList: Array<{
      goodsId: number;
      goodsName: string;
      skuList: Array<{
        goodsSkuId: number;
        skcId: string;
      }>;
    }>;
  }> {
    try {
      console.log('[Temu API] 拉取已发布站点数据 - 店铺:', mallId, '页码:', pageNum);

      const response = await bridgeRequestWithRetry(
        TEMU_HOST,
        'bridge-fetch',
        {
          url: 'https://agentseller.temu.com/api/bg/goods/spu/querySpuList',
          method: 'POST',
          data: {
            pageNum,
            pageSize: 100
          },
          headers: {
            ...BASE_HEADERS,
            'Mallid': String(mallId)  // ⭐ 关键：携带店铺 ID
          }
        }
      );

      if (!response.ok) {
        throw new Error('拉取已发布站点数据失败: HTTP ' + response.status);
      }

      const data = response.data as PublishedDataResponse;

      // Temu API 使用 success: true 或 errorCode: 1000000 表示成功
      if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
        throw new Error(data.errorMsg || '拉取已发布站点数据失败');
      }

      const total = data.result?.total || 0;
      const dataList = data.result?.dataList || [];

      console.log('[Temu API] 已发布站点数据:', dataList.length, '/', total);
      return { total, dataList };
    } catch (error) {
      console.error('[Temu API] 拉取已发布站点数据失败:', error);
      throw error;
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
      console.log('[Temu API] 查询站点异常 - 店铺:', mallId, '商品数:', pairs.length);

      const requestData: SiteErrorQueryRequest = {
        mallProductVOList: pairs
      };

      const response = await bridgeRequestWithRetry(
        TEMU_HOST,
        'bridge-fetch',
        {
          url: 'https://agentseller.temu.com/api/bg/goods/spu/checkSiteStatus',
          method: 'POST',
          data: requestData,
          headers: {
            ...BASE_HEADERS,
            'Mallid': String(mallId)  // ⭐ 关键：携带店铺 ID
          }
        }
      );

      if (!response.ok) {
        throw new Error('查询站点异常失败: HTTP ' + response.status);
      }

      const data = response.data as SiteErrorResponse;

      // Temu API 使用 success: true 或 errorCode: 1000000 表示成功
      if (data.success === false || (data.errorCode !== undefined && data.errorCode !== 1000000)) {
        throw new Error(data.errorMsg || '查询站点异常失败');
      }

      console.log('[Temu API] 站点异常查询完成');
      return data;
    } catch (error) {
      console.error('[Temu API] 查询站点异常失败:', error);
      throw error;
    }
  }
}

// 导出单例
export const temuApi = new TemuApiClient();
