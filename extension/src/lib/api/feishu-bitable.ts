/**
 * 飞书 Bitable（多维表格）API 客户端
 *
 * 用于将站点异常和违规商品数据写入飞书多维表格
 * 支持：批量创建、批量更新、批量获取
 */

import { config } from '~lib/storage/config';
import { feishuApi } from './feishu';
import { FEISHU_API, getFeishuApiUrl } from '~lib/constants';
import type { SiteErrorItem, ViolationItem, BitableTokenType } from '~types/storage';

// ============================================
// 类型定义
// ============================================

interface BitableApiResponse {
  code: number;
  msg: string;
  data?: {
    records?: Array<{
      record_id: string;
      fields: Record<string, any>;
    }>;
    total?: number;
    has_more?: boolean;
    page_token?: string;
  };
}

interface BitableRecord {
  fields: Record<string, any>;
}

interface BitableUpdateRecord {
  record_id: string;
  fields: Record<string, any>;
}

interface DiffWriteResult {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  error?: string;
}

// ============================================
// Bitable 字段名常量
// ============================================

const SITE_ERROR_FIELDS = {
  MALL_ID: '店铺ID',
  MALL_NAME: '店铺名称',
  SKC: 'SKC',
  ERROR_REASONS: '异常原因',
  AFFECTED_SITES: '涉及站点',
  CHECKED_AT: '检查时间',
} as const;

const VIOLATION_FIELDS = {
  MALL_NAME: '店铺名称',
  SPU_ID: 'SPU ID',
  GOODS_NAME: '商品名称',
  VIOLATION_DESC: '违规描述',
  SITE_NUM: '涉及站点数',
  CHECKED_AT: '检查时间',
} as const;

/**
 * 从飞书字段值中提取文本
 * 飞书返回的字段可能是数组格式：[{ "text": "value", "type": "text" }]
 */
function extractFieldText(fieldValue: any): string {
  if (!fieldValue) return '';

  // 如果是数组，取第一个元素的 text
  if (Array.isArray(fieldValue)) {
    const first = fieldValue[0];
    if (first && typeof first === 'object' && first.text) {
      return String(first.text);
    }
    if (first && typeof first === 'string') {
      return first;
    }
    return '';
  }

  // 如果是对象，取 text 属性
  if (typeof fieldValue === 'object' && fieldValue.text) {
    return String(fieldValue.text);
  }

  // 直接返回字符串
  return String(fieldValue);
}

/**
 * 飞书 Bitable API 客户端
 */
class FeishuBitableClient {
  // 缓存 wiki token 转换结果
  private wikiTokenCache: Map<string, { appToken: string; expiry: number }> = new Map();

  /**
   * 获取真实的 Bitable App Token
   *
   * 如果是 wiki 格式，需要先调用 wiki node 接口获取真实的 app_token
   */
  private async getRealAppToken(): Promise<string | undefined> {
    const rawToken = await config.getFeishuBitableAppToken();
    const tokenType = await config.getFeishuBitableTokenType();

    if (!rawToken) return undefined;

    // base 格式直接返回
    if (tokenType === 'base') {
      return rawToken;
    }

    // wiki 格式需要转换
    return this.convertWikiToken(rawToken);
  }

  /**
   * 将 wiki token 转换为真实的 bitable app_token
   */
  private async convertWikiToken(wikiToken: string): Promise<string | undefined> {
    // 检查缓存（有效期 30 分钟）
    const cached = this.wikiTokenCache.get(wikiToken);
    if (cached && cached.expiry > Date.now()) {
      return cached.appToken;
    }

    try {
      const accessToken = await feishuApi.getTenantAccessToken();
      const baseUrl = getFeishuApiUrl(FEISHU_API.ENDPOINTS.WIKI_GET_NODE);
      const url = `${baseUrl}?token=${encodeURIComponent(wikiToken)}&obj_type=bitable`;

      console.log(`[Bitable] 转换 wiki token: ${wikiToken}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        console.error(`[Bitable] Wiki 转换 HTTP 错误: ${response.status}`);
        return undefined;
      }

      const data = await response.json();

      if (data.code !== 0) {
        console.error(`[Bitable] Wiki 转换 API 错误: ${data.msg}`);
        return undefined;
      }

      // 从响应中获取真实的 obj_token（即 bitable app_token）
      const objToken = data.data?.node?.obj_token;
      if (!objToken) {
        console.error(`[Bitable] Wiki 节点未找到 obj_token`);
        return undefined;
      }

      console.log(`[Bitable] Wiki token 转换成功: ${wikiToken} -> ${objToken}`);

      // 缓存结果（30 分钟有效）
      this.wikiTokenCache.set(wikiToken, {
        appToken: objToken,
        expiry: Date.now() + 30 * 60 * 1000,
      });

      return objToken;
    } catch (error) {
      console.error(`[Bitable] Wiki 转换失败:`, error);
      return undefined;
    }
  }

  private getBitableUrl(
    endpoint: string,
    appToken: string,
    tableId: string
  ): string {
    return getFeishuApiUrl(
      endpoint
        .replace('{app_token}', appToken)
        .replace('{table_id}', tableId)
    );
  }

  /**
   * 根据条件批量搜索记录
   *
   * @param appToken App Token
   * @param tableId 表 ID
   * @param fieldNames 需要返回的字段
   * @param filter 过滤条件
   */
  async searchRecords(
    appToken: string,
    tableId: string,
    fieldNames: string[],
    filter?: {
      conjunction: 'and' | 'or';
      conditions: Array<{
        field_name: string;
        operator: string;
        value: string[];
      }>;
    }
  ): Promise<Array<{ record_id: string; fields: Record<string, any> }>> {
    const token = await feishuApi.getTenantAccessToken();
    const baseUrl = this.getBitableUrl(
      FEISHU_API.ENDPOINTS.BITABLE_SEARCH,
      appToken,
      tableId
    );

    const allRecords: Array<{ record_id: string; fields: Record<string, any> }> = [];
    let pageToken: string | undefined;

    console.log(`[Bitable] 搜索记录, fieldNames: ${fieldNames.join(', ')}`);
    if (filter) {
      console.log(`[Bitable] Filter: ${JSON.stringify(filter)}`);
    }

    do {
      try {
        const params = new URLSearchParams({ page_size: '500' });
        if (pageToken) params.set('page_token', pageToken);

        const url = `${baseUrl}?${params.toString()}`;

        const body: Record<string, any> = {
          field_names: fieldNames,
        };
        if (filter) {
          body.filter = filter;
        }

        console.log(`[Bitable] 请求 URL: ${url}`);
        console.log(`[Bitable] 请求 Body: ${JSON.stringify(body)}`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          console.error(`[Bitable] Search HTTP 错误: ${response.status}`);
          break;
        }

        const data = await response.json();
        console.log(`[Bitable] 响应: code=${data.code}, total=${data.data?.total}, items=${data.data?.items?.length || 0}`);

        if (data.code !== 0) {
          console.error(`[Bitable] Search API 错误: code=${data.code}, msg=${data.msg}`);
          break;
        }

        const records = data.data?.items || [];
        if (records.length > 0) {
          // 打印第一条记录的字段，便于调试
          console.log(`[Bitable] 第一条记录字段: ${JSON.stringify(records[0].fields)}`);
          allRecords.push(...records);
        }

        pageToken = data.data?.has_more ? data.data.page_token : undefined;
      } catch (error) {
        console.error(`[Bitable] Search 失败:`, error);
        break;
      }
    } while (pageToken);

    console.log(`[Bitable] 搜索完成，共 ${allRecords.length} 条记录`);
    return allRecords;
  }

  /**
   * 根据键值对批量查询 record_id
   *
   * 优化逻辑：用商品ID（SKC/SPU）做 filter 精确查询
   * - 支持同一 key 对应多个 record_id（如违规商品的多条记录）
   * - 自动分批查询，每批最多 50 个条件（飞书 API 限制）
   *
   * @param appToken App Token
   * @param tableId 表 ID
   * @param keys 需要查询的键（如 mallName:skcId）
   * @param keyField1 第一个键字段名（店铺名称，用于客户端匹配）
   * @param keyField2 第二个键字段名（商品ID，用于 filter）
   */
  async batchGetRecordIds(
    appToken: string,
    tableId: string,
    keys: string[],
    keyField1: string,
    keyField2: string
  ): Promise<Map<string, string[]>> {
    const keyToRecordIds = new Map<string, string[]>();

    if (keys.length === 0) return keyToRecordIds;

    // 将 keys 转换为 Set 便于快速查找
    const keySet = new Set(keys);

    // 提取唯一的商品ID（keyField2 的值）用于 filter
    const uniqueField2Values = [...new Set(keys.map(k => k.split(':')[1]))];

    console.log(`[Bitable] 查询 ${keys.length} 条记录的 record_id，涉及 ${uniqueField2Values.length} 个 ${keyField2}`);
    console.log(`[Bitable] 待查询的 keys 示例: ${keys.slice(0, 3).join(', ')}`);

    // 飞书 API 限制：filter.conditions 最多 50 个
    const MAX_CONDITIONS = 50;
    const allRecords: Array<{ record_id: string; fields: Record<string, any> }> = [];

    // 分批查询
    for (let i = 0; i < uniqueField2Values.length; i += MAX_CONDITIONS) {
      const batchValues = uniqueField2Values.slice(i, i + MAX_CONDITIONS);
      const batchIndex = Math.floor(i / MAX_CONDITIONS) + 1;
      const totalBatches = Math.ceil(uniqueField2Values.length / MAX_CONDITIONS);

      console.log(`[Bitable] 分批查询 ${batchIndex}/${totalBatches}，本批 ${batchValues.length} 个条件`);

      // 使用商品ID（SKC/SPU）做 filter，更精确
      // filter: keyField2 = val1 OR keyField2 = val2 OR ...
      const filter = {
        conjunction: 'or' as const,
        conditions: batchValues.map(val => ({
          field_name: keyField2,
          operator: 'is',
          value: [val],
        })),
      };

      const records = await this.searchRecords(
        appToken,
        tableId,
        [keyField1, keyField2],
        filter
      );

      allRecords.push(...records);
    }

    console.log(`[Bitable] 获取到 ${allRecords.length} 条相关记录`);

    // 打印前几条记录便于调试
    for (let i = 0; i < Math.min(allRecords.length, 2); i++) {
      const record = allRecords[i];
      const val1 = extractFieldText(record.fields[keyField1]);
      const val2 = extractFieldText(record.fields[keyField2]);
      console.log(`[Bitable] 记录示例: ${keyField1}="${val1}", ${keyField2}="${val2}"`);
    }

    // 构建映射，支持同一 key 对应多个 record_id
    for (const record of allRecords) {
      const val1 = extractFieldText(record.fields[keyField1]);
      const val2 = extractFieldText(record.fields[keyField2]);
      const key = `${val1}:${val2}`;

      if (keySet.has(key)) {
        if (!keyToRecordIds.has(key)) {
          keyToRecordIds.set(key, []);
        }
        keyToRecordIds.get(key)!.push(record.record_id);
      }
    }

    // 统计匹配情况
    let totalRecordIds = 0;
    for (const ids of keyToRecordIds.values()) {
      totalRecordIds += ids.length;
    }
    const unmatchedKeys = keys.filter(k => !keyToRecordIds.has(k));

    console.log(`[Bitable] 匹配结果: ${keyToRecordIds.size}/${keys.length} 个 key 找到记录，共 ${totalRecordIds} 个 record_id`);
    if (unmatchedKeys.length > 0 && unmatchedKeys.length <= 10) {
      console.log(`[Bitable] 未匹配的 keys: ${unmatchedKeys.join(', ')}`);
    } else if (unmatchedKeys.length > 10) {
      console.log(`[Bitable] 未匹配的 keys (前10个): ${unmatchedKeys.slice(0, 10).join(', ')} ...共 ${unmatchedKeys.length} 个`);
    }

    return keyToRecordIds;
  }

  /**
   * 批量创建记录
   */
  async batchCreateRecords(
    appToken: string,
    tableId: string,
    records: BitableRecord[]
  ): Promise<number> {
    if (records.length === 0) return 0;

    const token = await feishuApi.getTenantAccessToken();
    const url = this.getBitableUrl(
      FEISHU_API.ENDPOINTS.BITABLE_BATCH_CREATE,
      appToken,
      tableId
    );

    let totalCreated = 0;
    const batchSize = FEISHU_API.BITABLE.BATCH_SIZE;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ records: batch }),
        });

        if (!response.ok) {
          console.error(`[Bitable] 创建 HTTP 错误: ${response.status}`);
          continue;
        }

        const data = (await response.json()) as BitableApiResponse;

        if (data.code !== 0) {
          console.error(`[Bitable] 创建 API 错误: ${data.msg}`);
          continue;
        }

        totalCreated += data.data?.records?.length || 0;
      } catch (error) {
        console.error(`[Bitable] 批量创建失败:`, error);
      }
    }

    console.log(`[Bitable] 批量创建完成: ${totalCreated} 条`);
    return totalCreated;
  }

  /**
   * 批量更新记录
   */
  async batchUpdateRecords(
    appToken: string,
    tableId: string,
    records: BitableUpdateRecord[]
  ): Promise<number> {
    if (records.length === 0) return 0;

    const token = await feishuApi.getTenantAccessToken();
    const url = this.getBitableUrl(
      FEISHU_API.ENDPOINTS.BITABLE_BATCH_UPDATE,
      appToken,
      tableId
    );

    let totalUpdated = 0;
    const batchSize = FEISHU_API.BITABLE.BATCH_SIZE;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ records: batch }),
        });

        if (!response.ok) {
          console.error(`[Bitable] 更新 HTTP 错误: ${response.status}`);
          continue;
        }

        const data = (await response.json()) as BitableApiResponse;

        if (data.code !== 0) {
          console.error(`[Bitable] 更新 API 错误: ${data.msg}`);
          continue;
        }

        totalUpdated += data.data?.records?.length || 0;
      } catch (error) {
        console.error(`[Bitable] 批量更新失败:`, error);
      }
    }

    console.log(`[Bitable] 批量更新完成: ${totalUpdated} 条`);
    return totalUpdated;
  }

  /**
   * 差异写入站点异常数据（批量版本）
   *
   * 每个 SKC 对应一条记录，errorReasons 数组合并为字符串
   */
  async writeSiteErrorsWithDiff(
    newItems: SiteErrorItem[],
    updatedItems: SiteErrorItem[]
  ): Promise<DiffWriteResult> {
    const appToken = await this.getRealAppToken();
    const tableId = await config.getFeishuBitableSiteErrorTableId();

    if (!appToken || !tableId) {
      return {
        success: false,
        created: 0,
        updated: 0,
        skipped: 0,
        error: '未配置飞书 Bitable App Token 或站点异常子表 ID',
      };
    }

    let created = 0;
    let updated = 0;

    // 1. 批量创建新记录（每个 SKC 一条记录）
    if (newItems.length > 0) {
      console.log(`[Bitable] 准备创建 ${newItems.length} 条新站点异常记录`);
      const newRecords: BitableRecord[] = newItems.map((item) => ({
        fields: {
          [SITE_ERROR_FIELDS.MALL_ID]: Number(item.mallId),
          [SITE_ERROR_FIELDS.MALL_NAME]: item.mallName,
          [SITE_ERROR_FIELDS.SKC]: item.skcId,
          [SITE_ERROR_FIELDS.ERROR_REASONS]: item.errorReasons.join('; '),
          [SITE_ERROR_FIELDS.AFFECTED_SITES]: item.affectedSites.join(', '),
          [SITE_ERROR_FIELDS.CHECKED_AT]: item.checkedAt,
        },
      }));
      created = await this.batchCreateRecords(appToken, tableId, newRecords);
    }

    // 2. 批量更新已有记录
    if (updatedItems.length > 0) {
      console.log(`[Bitable] 准备更新 ${updatedItems.length} 条站点异常记录`);

      // 2.1 只查询需要更新的记录的 record_id（用 SKC 做 filter）
      const keysToUpdate = updatedItems.map(item => `${item.mallName}:${item.skcId}`);
      const keyToRecordIds = await this.batchGetRecordIds(
        appToken,
        tableId,
        keysToUpdate,
        SITE_ERROR_FIELDS.MALL_NAME,
        SITE_ERROR_FIELDS.SKC
      );

      console.log(`[Bitable] 匹配到 ${keyToRecordIds.size} 个 key 的现有记录`);

      // 2.2 构建更新/创建数据（每个 SKC 只对应一条记录）
      const updateRecords: BitableUpdateRecord[] = [];
      const createRecords: BitableRecord[] = [];

      for (const item of updatedItems) {
        const key = `${item.mallName}:${item.skcId}`;
        const recordIds = keyToRecordIds.get(key);

        if (recordIds && recordIds.length > 0) {
          // 更新第一条匹配的记录
          updateRecords.push({
            record_id: recordIds[0],
            fields: {
              [SITE_ERROR_FIELDS.ERROR_REASONS]: item.errorReasons.join('; '),
              [SITE_ERROR_FIELDS.AFFECTED_SITES]: item.affectedSites.join(', '),
              [SITE_ERROR_FIELDS.CHECKED_AT]: item.checkedAt,
            },
          });
        } else {
          // 没有匹配记录，创建新记录
          createRecords.push({
            fields: {
              [SITE_ERROR_FIELDS.MALL_ID]: Number(item.mallId),
              [SITE_ERROR_FIELDS.MALL_NAME]: item.mallName,
              [SITE_ERROR_FIELDS.SKC]: item.skcId,
              [SITE_ERROR_FIELDS.ERROR_REASONS]: item.errorReasons.join('; '),
              [SITE_ERROR_FIELDS.AFFECTED_SITES]: item.affectedSites.join(', '),
              [SITE_ERROR_FIELDS.CHECKED_AT]: item.checkedAt,
            },
          });
        }
      }

      console.log(`[Bitable] 准备更新 ${updateRecords.length} 条，创建 ${createRecords.length} 条`);

      // 2.3 执行批量更新
      if (updateRecords.length > 0) {
        updated = await this.batchUpdateRecords(appToken, tableId, updateRecords);
      }

      // 2.4 执行批量创建
      if (createRecords.length > 0) {
        created += await this.batchCreateRecords(appToken, tableId, createRecords);
      }
    }

    console.log(`[Bitable] 站点异常差异写入完成: 创建 ${created}, 更新 ${updated}`);

    return { success: true, created, updated, skipped: 0 };
  }

  /**
   * 差异写入违规商品数据（批量版本）
   *
   * 每条记录就是一个原因，直接写入，不需要拆分。
   * 同一 key 可能有多条记录，按 1:1 匹配 record_id。
   */
  async writeViolationsWithDiff(
    newItems: ViolationItem[],
    updatedItems: ViolationItem[]
  ): Promise<DiffWriteResult> {
    const appToken = await this.getRealAppToken();
    const tableId = await config.getFeishuBitableViolationTableId();

    if (!appToken || !tableId) {
      return {
        success: false,
        created: 0,
        updated: 0,
        skipped: 0,
        error: '未配置飞书 Bitable App Token 或违规商品子表 ID',
      };
    }

    let created = 0;
    let updated = 0;

    // 1. 批量创建新记录（每条记录直接写入）
    if (newItems.length > 0) {
      console.log(`[Bitable] 准备创建 ${newItems.length} 条新违规商品记录`);
      const newRecords: BitableRecord[] = newItems.map((item) => ({
        fields: {
          [VIOLATION_FIELDS.MALL_NAME]: item.mallName,
          [VIOLATION_FIELDS.SPU_ID]: String(item.spuId),
          [VIOLATION_FIELDS.GOODS_NAME]: item.goodsName,
          [VIOLATION_FIELDS.VIOLATION_DESC]: item.violationDesc,
          [VIOLATION_FIELDS.SITE_NUM]: item.siteNum,
          [VIOLATION_FIELDS.CHECKED_AT]: item.checkedAt,
        },
      }));
      created = await this.batchCreateRecords(appToken, tableId, newRecords);
    }

    // 2. 批量更新已有记录
    if (updatedItems.length > 0) {
      // 2.1 按 key 分组本地记录（同一 key 可能有多条）
      const keyToItems = new Map<string, ViolationItem[]>();
      for (const item of updatedItems) {
        const key = `${item.mallName}:${item.spuId}`;
        if (!keyToItems.has(key)) {
          keyToItems.set(key, []);
        }
        keyToItems.get(key)!.push(item);
      }

      // 2.2 查询需要更新的 record_id（用 SPU ID 做 filter）
      const keysToUpdate = Array.from(keyToItems.keys());
      const keyToRecordIds = await this.batchGetRecordIds(
        appToken,
        tableId,
        keysToUpdate,
        VIOLATION_FIELDS.MALL_NAME,
        VIOLATION_FIELDS.SPU_ID
      );

      console.log(`[Bitable] 匹配到 ${keyToRecordIds.size} 个 key 的现有记录`);

      // 2.3 按 1:1 匹配更新
      const updateRecords: BitableUpdateRecord[] = [];
      const createRecords: BitableRecord[] = [];

      for (const [key, items] of keyToItems) {
        const recordIds = keyToRecordIds.get(key) || [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (i < recordIds.length) {
            // 有对应的 record_id，更新
            updateRecords.push({
              record_id: recordIds[i],
              fields: {
                [VIOLATION_FIELDS.GOODS_NAME]: item.goodsName,
                [VIOLATION_FIELDS.VIOLATION_DESC]: item.violationDesc,
                [VIOLATION_FIELDS.SITE_NUM]: item.siteNum,
                [VIOLATION_FIELDS.CHECKED_AT]: item.checkedAt,
              },
            });
          } else {
            // 没有对应的 record_id，创建新记录
            createRecords.push({
              fields: {
                [VIOLATION_FIELDS.MALL_NAME]: item.mallName,
                [VIOLATION_FIELDS.SPU_ID]: String(item.spuId),
                [VIOLATION_FIELDS.GOODS_NAME]: item.goodsName,
                [VIOLATION_FIELDS.VIOLATION_DESC]: item.violationDesc,
                [VIOLATION_FIELDS.SITE_NUM]: item.siteNum,
                [VIOLATION_FIELDS.CHECKED_AT]: item.checkedAt,
              },
            });
          }
        }
      }

      console.log(`[Bitable] 准备更新 ${updateRecords.length} 条，创建 ${createRecords.length} 条`);

      // 2.4 执行批量更新
      if (updateRecords.length > 0) {
        updated = await this.batchUpdateRecords(appToken, tableId, updateRecords);
      }

      // 2.5 执行批量创建
      if (createRecords.length > 0) {
        created += await this.batchCreateRecords(appToken, tableId, createRecords);
      }
    }

    console.log(`[Bitable] 违规商品差异写入完成: 创建 ${created}, 更新 ${updated}`);

    return { success: true, created, updated, skipped: 0 };
  }

  /**
   * 测试 Bitable 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const appToken = await this.getRealAppToken();
      if (!appToken) {
        return { success: false, message: '未配置 Bitable App Token 或 Wiki Token 转换失败' };
      }

      await feishuApi.getTenantAccessToken();
      return { success: true, message: 'Bitable 连接测试成功' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const feishuBitable = new FeishuBitableClient();
