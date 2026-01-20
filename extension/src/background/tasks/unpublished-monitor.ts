/**
 * 已下架商品监控任务
 *
 * 核心流程：
 * 1. 获取所有店铺列表
 * 2. 逐个店铺串行执行（避免风控）
 * 3. 拉取已下架数据
 * 4. 去重判定（mallId + skcId + date）
 * 5. 按店铺+日期聚合，相同原因的 SKC 归纳
 * 6. 保存到 IndexedDB（每店铺每天一条记录）
 * 7. 聚合推送钉钉
 */

import { temuApi } from '~lib/api/temu';
import { dingtalkApi } from '~lib/api/dingtalk';
import { config } from '~lib/storage/config';
import { taskState } from '~lib/storage/task-state';
import { dedup, generateUnpublishedKey, formatDateKey } from '~lib/storage/dedup';
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
 * 运行已下架商品监控任务
 *
 * @param mallIds 可选：指定店铺 ID 列表（空表示所有店铺）
 */
export async function runUnpublishedMonitor(mallIds?: string[]): Promise<void> {
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
    const newRecordsByMallDate = new Map<string, Map<string, UnpublishedItem>>();
    // 用于标记已推送的键
    const allPushedKeys: string[] = [];

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
        const newItemsByDate = new Map<string, Array<{ skcId: string; reason: string }>>();

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

          // 步骤 2.2: 去重判定（mallId + skcId + date）
          for (const item of result.dataList) {
            const isNew = await dedup.isNewUnpublished(
              mallId,
              item.skcId,
              item.unPublishedTime
            );

            if (isNew) {
              const dateKey = formatDateKey(item.unPublishedTime);

              // 按日期分组
              if (!newItemsByDate.has(dateKey)) {
                newItemsByDate.set(dateKey, []);
              }
              newItemsByDate.get(dateKey)!.push({
                skcId: item.skcId,
                reason: item.unPublishedReason
              });

              // 记录需要标记为已推送的键
              allPushedKeys.push(generateUnpublishedKey(mallId, item.skcId, item.unPublishedTime));
            }
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
        if (newItemsByDate.size > 0) {
          if (!newRecordsByMallDate.has(mallId)) {
            newRecordsByMallDate.set(mallId, new Map());
          }
          const mallDateMap = newRecordsByMallDate.get(mallId)!;

          let totalNewCount = 0;
          for (const [dateKey, items] of newItemsByDate) {
            // 按原因分组
            const reasonGroups = groupByReason(items);
            const totalCount = items.length;
            totalNewCount += totalCount;

            const record: UnpublishedItem = {
              mallId,
              unPublishedDate: dateKey,
              mallName,
              reasonGroups,
              totalCount,
              pushed: false
            };

            mallDateMap.set(dateKey, record);
          }

          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 发现 ${totalNewCount} 条新下架记录`
          );
        } else {
          await taskState.addLog('info', `店铺 ${mallName}: 无新下架记录`);
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

    // 步骤 3: 保存到 IndexedDB
    const allRecords: UnpublishedItem[] = [];
    for (const [, dateMap] of newRecordsByMallDate) {
      for (const [, record] of dateMap) {
        allRecords.push(record);
      }
    }

    if (allRecords.length > 0) {
      await db.putBatch('unpublished', allRecords);
      await taskState.addLog('info', `保存 ${allRecords.length} 条聚合记录到数据库`);
    }

    // 步骤 4: 推送到钉钉
    const webhookUrl = await config.getDingtalkWebhook();
    if (webhookUrl && allRecords.length > 0) {
      await taskState.addLog('info', '推送钉钉通知...');

      try {
        // 构建聚合钉钉卡片
        const card = dingtalkApi.buildAggregatedUnpublishedCard(newRecordsByMallDate);

        // 发送钉钉消息
        await dingtalkApi.sendCard(webhookUrl, card);

        // 标记所有记录为已推送
        await dedup.markAsPushed(allPushedKeys);

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

        await taskState.addLog(
          'info',
          `钉钉推送成功: ${newRecordsByMallDate.size} 个店铺, ${totalSkcCount} 条 SKC`
        );
      } catch (error) {
        await taskState.addLog(
          'error',
          `钉钉推送失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if (!webhookUrl) {
      await taskState.addLog('warn', '未配置钉钉 Webhook，跳过推送');
    } else {
      await taskState.addLog('info', '无新下架记录，跳过推送');
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
