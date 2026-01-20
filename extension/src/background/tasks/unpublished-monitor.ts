/**
 * 已下架商品监控任务
 *
 * 核心流程：
 * 1. 获取所有店铺列表
 * 2. 逐个店铺串行执行（避免风控）
 * 3. 拉取已下架数据
 * 4. 按店铺+日期聚合，相同原因的 SKC 归纳
 * 5. 保存到 IndexedDB（每店铺每天一条记录，已存在则更新）
 * 6. 推送通知（可选，由 skipPush 参数控制）
 *
 * 去重说明：
 * - 存储：不去重，每次运行都存储/更新所有数据
 * - 推送：通过 IndexedDB 的 pushed 字段控制（定时推送任务使用）
 */

import { temuApi } from '~lib/api/temu';
import { notifier } from '~lib/api/notifier';
import { config } from '~lib/storage/config';
import { taskState } from '~lib/storage/task-state';
import { formatDateKey } from '~lib/storage/dedup';
import db from '~lib/storage/idb';
import type { UnpublishedItem, ReasonGroup } from '~types/storage';
import { sleep } from '~lib/utils/retry';

/**
 * 将 SKC 列表按原因分组
 * ⭐ 注意：对原因 trim() 去除首尾空白字符，避免相同原因因空白不同而未去重
 */
function groupByReason(
  items: Array<{ skcId: string; reason: string }>
): ReasonGroup[] {
  const groupMap = new Map<string, string[]>();

  for (const item of items) {
    // trim 去除首尾空白字符（包括换行符）
    const reason = item.reason?.trim() || '运营手动下架';
    const existing = groupMap.get(reason);
    if (existing) {
      existing.push(item.skcId);
    } else {
      groupMap.set(reason, [item.skcId]);
    }
  }

  return Array.from(groupMap.entries()).map(([reason, skcIds]) => ({
    reason,
    skcIds
  }));
}

/**
 * 监控任务选项
 */
export interface MonitorOptions {
  /** 指定店铺 ID 列表（空表示所有店铺） */
  mallIds?: string[];
  /** 是否跳过推送（用于 RPA 凌晨采集场景） */
  skipPush?: boolean;
}

/**
 * 运行已下架商品监控任务
 *
 * @param options 任务选项
 *   - mallIds: 指定店铺 ID 列表（空表示所有店铺）
 *   - skipPush: 是否跳过推送（默认 false，用于 RPA 凌晨采集场景）
 */
export async function runUnpublishedMonitor(options?: MonitorOptions): Promise<void> {
  const mallIds = options?.mallIds;
  const skipPush = options?.skipPush ?? false;
  try {
    console.log('[下架监控] 开始执行任务');
    await taskState.addLog('info', '开始执行下架监控任务');

    // 清理停止标志和展示数据
    await taskState.clearStopFlag();
    await taskState.clearFetchedData();

    // 步骤 1: 获取店铺列表
    await taskState.addLog('info', '获取店铺列表...');
    let malls = await temuApi.getMallList();

    if (!malls || malls.length === 0) {
      throw new Error('未找到任何店铺，请先登录 Temu 卖家中心');
    }

    // 如果指定了店铺 ID，则过滤
    if (mallIds && mallIds.length > 0) {
      malls = malls.filter(mall => mallIds.includes(mall.mallId));
      if (malls.length === 0) {
        throw new Error('指定的店铺 ID 不存在');
      }
    }

    await taskState.addLog('info', `获取到 ${malls.length} 个店铺`);
    await taskState.start(malls.length);

    // 步骤 2: 逐个店铺串行执行
    // 存储结构：mallId -> date -> UnpublishedItem
    const recordsByMallDate = new Map<string, Map<string, UnpublishedItem>>();

    for (let i = 0; i < malls.length; i++) {
      // 检查是否需要停止
      if (await taskState.shouldStop()) {
        await taskState.clearStopFlag();
        console.log('[下架监控] 任务被用户中止');
        return;
      }

      const mall = malls[i];
      const mallName = mall.mallName;
      const mallId = mall.mallId;

      await taskState.addLog('info', `[${i + 1}/${malls.length}] 处理店铺: ${mallName}`);
      await taskState.updateProgress(i, mallName);

      try {
        // 步骤 2.1: 拉取该店铺的已下架数据
        let pageNum = 1;
        let hasMore = true;
        // 临时存储：date -> [{skcId, reason}]
        const itemsByDate = new Map<string, Array<{ skcId: string; reason: string }>>();

        while (hasMore) {
          // 检查停止标志
          if (await taskState.shouldStop()) {
            await taskState.clearStopFlag();
            console.log('[下架监控] 任务被用户中止（分页循环中）');
            return;
          }

          // 根据 managedType 选择接口：0=全托, 1=半托
          const result = await temuApi.fetchUnpublishedData(
            mallId,
            mall.managedType,
            pageNum
          );

          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 拉取第 ${pageNum} 页，共 ${result.total} 条记录`
          );

          // 保存拉取的数据用于展示
          const displayItems = result.dataList.map(item => ({
            ...item,
            mallId,
            mallName
          }));
          await taskState.addFetchedData(displayItems);

          // 步骤 2.2: 按日期分组（所有数据都存储，不去重）
          for (const item of result.dataList) {
            const dateKey = formatDateKey(item.unPublishedTime);

            // 按日期分组
            if (!itemsByDate.has(dateKey)) {
              itemsByDate.set(dateKey, []);
            }
            itemsByDate.get(dateKey)!.push({
              skcId: item.skcId,
              reason: item.unPublishedReason
            });
          }

          // 检查是否还有更多页
          const totalPages = Math.ceil(result.total / 100);
          hasMore = pageNum < totalPages;
          pageNum++;

          if (hasMore) {
            await sleep(1000);
          }
        }

        // 步骤 2.3: 构建聚合记录（每店铺每天一条）
        if (itemsByDate.size > 0) {
          if (!recordsByMallDate.has(mallId)) {
            recordsByMallDate.set(mallId, new Map());
          }
          const mallDateMap = recordsByMallDate.get(mallId)!;

          let totalCount = 0;
          for (const [dateKey, items] of itemsByDate) {
            // 按原因分组
            const reasonGroups = groupByReason(items);
            const count = items.length;
            totalCount += count;

            const record: UnpublishedItem = {
              mallId,
              unPublishedDate: dateKey,
              mallName,
              reasonGroups,
              totalCount: count,
              pushed: false  // 新采集的数据默认未推送
            };

            mallDateMap.set(dateKey, record);
          }

          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 采集到 ${totalCount} 条下架记录`
          );
        } else {
          await taskState.addLog('info', `店铺 ${mallName}: 无下架记录`);
        }

      } catch (error) {
        await taskState.addLog(
          'error',
          `店铺 ${mallName} 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // 等待 2 秒后处理下一个店铺（避免风控）
      if (i < malls.length - 1) {
        await sleep(2000);
      }
    }

    // 步骤 3: 保存到 IndexedDB（已存在则更新）
    const allRecords: UnpublishedItem[] = [];
    for (const [, dateMap] of recordsByMallDate) {
      for (const [, record] of dateMap) {
        allRecords.push(record);
      }
    }

    if (allRecords.length > 0) {
      console.log('[下架监控] 准备保存记录:', JSON.stringify(allRecords, null, 2));
      const saveResult = await db.putBatch('unpublished', allRecords);
      console.log('[下架监控] 保存结果:', saveResult);
      if (saveResult.errors.length > 0) {
        console.error('[下架监控] 保存错误:', saveResult.errors);
        await taskState.addLog('error', `保存失败: ${saveResult.errors.length} 条错误`);
      }
      await taskState.addLog('info', `保存 ${saveResult.success} 条聚合记录到数据库（已存在则更新）`);
    }

    // 步骤 4: 推送通知（支持钉钉/飞书/两者）
    // 如果 skipPush 为 true，则仅采集不推送（用于 RPA 凌晨采集场景）
    if (skipPush) {
      if (allRecords.length > 0) {
        // 统计
        let totalSkcCount = 0;
        for (const record of allRecords) {
          totalSkcCount += record.totalCount;
        }
        await taskState.addLog(
          'info',
          `采集完成（跳过推送）: ${recordsByMallDate.size} 个店铺, ${totalSkcCount} 条 SKC，等待定时推送`
        );
      } else {
        await taskState.addLog('info', '无下架记录');
      }
    } else if (allRecords.length > 0) {
      await taskState.addLog('info', '推送通知...');

      try {
        // 使用统一推送管理器发送
        const notifyResult = await notifier.sendUnpublishedAlert(recordsByMallDate);

        // 更新数据库中的 pushed 标记
        for (const record of allRecords) {
          record.pushed = true;
        }
        await db.putBatch('unpublished', allRecords);

        // 统计
        let totalSkcCount = 0;
        for (const record of allRecords) {
          totalSkcCount += record.totalCount;
        }

        // 构建推送结果日志
        const successChannels: string[] = [];
        if (notifyResult.dingtalk) successChannels.push('钉钉');
        if (notifyResult.feishu) successChannels.push('飞书');

        if (successChannels.length > 0) {
          await taskState.addLog(
            'info',
            `推送成功 [${successChannels.join('+')}]: ${recordsByMallDate.size} 个店铺, ${totalSkcCount} 条 SKC`
          );
        }

        // 记录推送失败的渠道
        if (notifyResult.errors.length > 0) {
          await taskState.addLog(
            'warn',
            `部分渠道推送失败: ${notifyResult.errors.join('; ')}`
          );
        }

        // 如果所有渠道都失败
        if (!notifyResult.dingtalk && !notifyResult.feishu) {
          const channel = await config.getNotifyChannel();
          if (channel !== 'none') {
            await taskState.addLog('warn', '所有推送渠道均失败或未配置');
          }
        }
      } catch (error) {
        await taskState.addLog(
          'error',
          `推送失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      await taskState.addLog('info', '无下架记录，跳过推送');
    }

    // 任务完成
    await taskState.updateProgress(malls.length);
    await taskState.complete();
    await taskState.addLog('info', '下架监控任务完成');
    console.log('[下架监控] 任务执行完成');

  } catch (error) {
    console.error('[下架监控] 任务执行失败:', error);
    await taskState.fail(error instanceof Error ? error.message : String(error));
    await taskState.addLog('error', `任务失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
