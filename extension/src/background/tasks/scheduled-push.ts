/**
 * 定时推送任务
 *
 * 功能：
 * 1. 读取 IndexedDB 中所有未推送的数据
 * 2. 按店铺+日期聚合
 * 3. 发送一条汇总消息（钉钉/飞书）
 * 4. 标记为已推送
 *
 * 工作流：
 * - 凌晨 RPA 执行采集任务（不推送）
 * - 早上定时（如 09:00）触发此任务
 * - 聚合所有未推送数据，发送汇总消息
 */

import db from '~lib/storage/idb';
import { notifier } from '~lib/api/notifier';
import { config } from '~lib/storage/config';
import type { UnpublishedItem } from '~types/storage';

/**
 * 运行定时推送任务
 *
 * 读取所有未推送的下架记录，聚合后发送通知
 */
export async function runScheduledPush(): Promise<{
  success: boolean;
  pushedCount: number;
  mallCount: number;
  errors: string[];
}> {
  console.log('[定时推送] 开始执行');
  const result = {
    success: false,
    pushedCount: 0,
    mallCount: 0,
    errors: [] as string[]
  };

  try {
    // 检查推送渠道是否配置
    const notifyChannel = await config.getNotifyChannel();
    if (notifyChannel === 'none') {
      console.log('[定时推送] 推送渠道未启用，跳过');
      result.success = true;
      return result;
    }

    // 步骤 1: 读取所有未推送的数据
    const allRecords: UnpublishedItem[] = await db.getAll('unpublished');
    const unpushedRecords = allRecords.filter(r => !r.pushed);

    if (unpushedRecords.length === 0) {
      console.log('[定时推送] 无待推送数据');
      result.success = true;
      return result;
    }

    console.log(`[定时推送] 发现 ${unpushedRecords.length} 条未推送记录`);

    // 步骤 2: 转换为 notifier 需要的格式
    // Map<mallId, Map<date, UnpublishedItem>>
    const recordsByMallDate = new Map<string, Map<string, UnpublishedItem>>();

    for (const record of unpushedRecords) {
      if (!recordsByMallDate.has(record.mallId)) {
        recordsByMallDate.set(record.mallId, new Map());
      }
      const dateMap = recordsByMallDate.get(record.mallId)!;
      dateMap.set(record.unPublishedDate, record);
    }

    result.mallCount = recordsByMallDate.size;

    // 统计总 SKC 数量
    let totalSkcCount = 0;
    for (const record of unpushedRecords) {
      totalSkcCount += record.totalCount;
    }
    result.pushedCount = totalSkcCount;

    console.log(`[定时推送] 准备推送 ${result.mallCount} 个店铺, ${totalSkcCount} 条 SKC`);

    // 步骤 3: 发送聚合消息
    const notifyResult = await notifier.sendUnpublishedAlert(recordsByMallDate);

    // 步骤 4: 标记为已推送（如果至少一个渠道成功）
    if (notifyResult.dingtalk || notifyResult.feishu) {
      for (const record of unpushedRecords) {
        record.pushed = true;
      }
      await db.putBatch('unpublished', unpushedRecords);
      console.log(`[定时推送] 已标记 ${unpushedRecords.length} 条记录为已推送`);

      // 记录今天的推送日期（用于补偿推送判断）
      const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
      await config.setLastPushDate(today);
      console.log(`[定时推送] 已记录推送日期: ${today}`);
    }

    // 记录推送结果
    const successChannels: string[] = [];
    if (notifyResult.dingtalk) successChannels.push('钉钉');
    if (notifyResult.feishu) successChannels.push('飞书');

    if (successChannels.length > 0) {
      console.log(`[定时推送] 推送成功 [${successChannels.join('+')}]`);
      result.success = true;
    } else {
      console.log('[定时推送] 所有渠道推送失败');
      result.errors.push('所有推送渠道均失败');
    }

    // 记录失败的渠道
    if (notifyResult.errors.length > 0) {
      result.errors.push(...notifyResult.errors);
    }

    return result;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[定时推送] 执行失败:', errorMsg);
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * 获取待推送数据统计
 *
 * 用于 UI 显示或调试
 */
export async function getPendingPushStats(): Promise<{
  totalRecords: number;
  totalSkc: number;
  mallCount: number;
  oldestDate: string | null;
  newestDate: string | null;
}> {
  const allRecords: UnpublishedItem[] = await db.getAll('unpublished');
  const unpushedRecords = allRecords.filter(r => !r.pushed);

  if (unpushedRecords.length === 0) {
    return {
      totalRecords: 0,
      totalSkc: 0,
      mallCount: 0,
      oldestDate: null,
      newestDate: null
    };
  }

  const mallIds = new Set(unpushedRecords.map(r => r.mallId));
  const dates = unpushedRecords.map(r => r.unPublishedDate).sort();

  let totalSkc = 0;
  for (const record of unpushedRecords) {
    totalSkc += record.totalCount;
  }

  return {
    totalRecords: unpushedRecords.length,
    totalSkc,
    mallCount: mallIds.size,
    oldestDate: dates[0] || null,
    newestDate: dates[dates.length - 1] || null
  };
}
