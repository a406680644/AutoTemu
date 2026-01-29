/**
 * 违规商品监控任务
 *
 * 核心流程：
 * 1. 获取所有店铺列表
 * 2. 逐个店铺串行执行（避免风控）
 * 3. 拉取违规商品数据
 * 4. 差异对比（历史 vs 当前）
 * 5. 新增/更新的记录写入 Bitable
 * 6. 保存到 IndexedDB
 */

import { temuApi } from '~lib/api/temu';
import { feishuBitable } from '~lib/api/feishu-bitable';
import { taskState } from '~lib/storage/task-state';
import db from '~lib/storage/idb';
import type { ViolationItem } from '~types/storage';
import { sleep } from '~lib/utils/retry';
import { TEMU_API, DELAY } from '~lib/constants';

// ============================================
// 差异对比逻辑
// ============================================

/**
 * 差异对比结果
 */
interface ViolationDiffResult {
  newItems: ViolationItem[];       // 新增的记录
  updatedItems: ViolationItem[];   // 更新的记录（描述变化）
  unchangedCount: number;          // 无变化的记录数
}

/**
 * 生成违规商品的唯一键
 */
function getViolationKey(mallId: string, spuId: number): string {
  return `${mallId}:${spuId}`;
}

/**
 * 计算违规商品的差异
 *
 * @param currentItems 当前获取的数据
 * @param historyItems 历史 IndexedDB 数据
 * @returns 差异结果
 */
function computeViolationDiff(
  currentItems: ViolationItem[],
  historyItems: ViolationItem[]
): ViolationDiffResult {
  // 构建历史数据的 Map
  const historyMap = new Map<string, ViolationItem>();
  for (const item of historyItems) {
    const key = getViolationKey(item.mallId, item.spuId);
    historyMap.set(key, item);
  }

  const newItems: ViolationItem[] = [];
  const updatedItems: ViolationItem[] = [];
  let unchangedCount = 0;

  for (const item of currentItems) {
    const key = getViolationKey(item.mallId, item.spuId);
    const historyItem = historyMap.get(key);

    if (!historyItem) {
      // 新记录
      newItems.push(item);
    } else if (historyItem.violationDesc !== item.violationDesc) {
      // 违规描述变化
      updatedItems.push(item);
    } else {
      // 无变化
      unchangedCount++;
    }
  }

  return { newItems, updatedItems, unchangedCount };
}

/**
 * 检查是否应该停止任务
 */
async function checkAndHandleStop(context: string): Promise<boolean> {
  if (await taskState.shouldStop()) {
    await taskState.clearStopFlag();
    console.log(`[违规商品] 任务被用户中止（${context}）`);
    await taskState.addLog('warn', '任务已中止');
    return true;
  }
  return false;
}

/**
 * 运行违规商品监控任务
 *
 * @param mallIds 可选：指定店铺 ID 列表（空表示所有店铺）
 */
export async function runViolationMonitor(mallIds?: string[]): Promise<void> {
  try {
    console.log('[违规商品] 开始执行任务');
    await taskState.addLog('info', '开始执行违规商品监控任务');

    // 清理停止标志
    await taskState.clearStopFlag();

    // ⭐ 在写入前获取历史快照（用于差异对比）
    const historySnapshot = (await db.getAll('violations')) as ViolationItem[];
    console.log(`[违规商品] 历史快照: ${historySnapshot.length} 条记录`);

    // 步骤 1: 获取店铺列表
    await taskState.addLog('info', '获取店铺列表...');
    let malls = await temuApi.getMallList();

    if (!malls || malls.length === 0) {
      throw new Error('未找到任何店铺，请先登录 Temu 卖家中心');
    }

    if (mallIds && mallIds.length > 0) {
      malls = malls.filter((mall) => mallIds.includes(mall.mallId));
      if (malls.length === 0) {
        throw new Error('指定的店铺 ID 不存在');
      }
    }

    await taskState.addLog('info', `获取到 ${malls.length} 个店铺`);
    await taskState.start(malls.length);

    let totalViolations = 0;
    const allCurrentItems: ViolationItem[] = [];

    // 步骤 2: 逐个店铺处理
    for (let i = 0; i < malls.length; i++) {
      if (await checkAndHandleStop('店铺循环开始')) return;

      const mall = malls[i];
      const mallName = mall.mallName;
      const mallId = mall.mallId;

      await taskState.addLog('info', `[${i + 1}/${malls.length}] 处理店铺: ${mallName}`);
      await taskState.updateProgress(i, mallName);

      try {
        // 拉取违规商品数据（支持分页）
        const mallViolations: ViolationItem[] = [];
        let pageNum = 1;
        let hasMore = true;

        while (hasMore) {
          if (await checkAndHandleStop('分页循环')) return;

          const result = await temuApi.fetchViolations(mallId, pageNum);

          for (const item of result.dataList) {
            mallViolations.push({
              mallId,
              spuId: item.spuId,
              mallName,
              goodsName: item.goodsName,
              violationDesc: item.violationDesc,
              siteNum: item.siteNum,
              checkedAt: Date.now(),
            });
          }

          // 检查是否有更多页
          const totalPages = Math.ceil(result.total / TEMU_API.PAGINATION.PAGE_SIZE);
          hasMore = pageNum < totalPages;
          pageNum++;

          if (hasMore) {
            await sleep(DELAY.BETWEEN_PAGES);
          }
        }

        // 收集本次采集的数据（先不写入 IndexedDB，等差异对比后再写入）
        if (mallViolations.length > 0) {
          totalViolations += mallViolations.length;
          allCurrentItems.push(...mallViolations);
          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 发现 ${mallViolations.length} 条违规商品`
          );
        } else {
          await taskState.addLog('info', `店铺 ${mallName}: 无违规商品`);
        }
      } catch (error) {
        await taskState.addLog(
          'error',
          `店铺 ${mallName} 处理失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // 店铺间等待
      if (i < malls.length - 1) {
        await sleep(DELAY.BETWEEN_SHOPS);
        if (await checkAndHandleStop('店铺间等待后')) return;
      }
    }

    // ============================================
    // 差异对比 + Bitable 写入 + IndexedDB 存储
    // ============================================

    await taskState.addLog('info', '正在进行差异对比...');

    // ⭐ 使用任务开始前的历史快照与本次采集数据对比
    const diff = computeViolationDiff(allCurrentItems, historySnapshot);

    await taskState.addLog(
      'info',
      `差异对比完成: 新增 ${diff.newItems.length} 条，更新 ${diff.updatedItems.length} 条，无变化 ${diff.unchangedCount} 条`
    );

    // ⭐ 差异写入 Bitable（新增 → 创建，更新 → 更新）
    if (diff.newItems.length > 0 || diff.updatedItems.length > 0) {
      await taskState.addLog('info', `正在写入飞书 Bitable...`);
      try {
        const writeResult = await feishuBitable.writeViolationsWithDiff(
          diff.newItems,
          diff.updatedItems
        );
        if (writeResult.success) {
          await taskState.addLog(
            'info',
            `Bitable 写入成功: 创建 ${writeResult.created} 条，更新 ${writeResult.updated} 条`
          );
        } else {
          await taskState.addLog(
            'warn',
            `Bitable 写入失败: ${writeResult.error}`
          );
        }
      } catch (error) {
        // Bitable 写入失败不影响本地 IndexedDB 存储
        await taskState.addLog(
          'warn',
          `Bitable 写入异常: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      await taskState.addLog('info', '无新增/更新记录，跳过 Bitable 写入');
    }

    // ⭐ 最后写入 IndexedDB（所有采集到的数据）
    if (allCurrentItems.length > 0) {
      await db.putBatch('violations', allCurrentItems);
      console.log(`[违规商品] 已写入 IndexedDB: ${allCurrentItems.length} 条`);
    }

    // 任务完成
    await taskState.updateProgress(malls.length);
    await taskState.complete();
    await taskState.addLog(
      'info',
      `违规商品监控任务完成，共发现 ${totalViolations} 条违规商品`
    );
    console.log('[违规商品] 任务执行完成');
  } catch (error) {
    console.error('[违规商品] 任务执行失败:', error);
    await taskState.fail(error instanceof Error ? error.message : String(error));
    await taskState.addLog(
      'error',
      `任务失败: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}
