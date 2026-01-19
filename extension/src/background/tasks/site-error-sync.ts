/**
 * 站点异常同步任务
 *
 * 核心流程：
 * 1. 获取所有店铺列表
 * 2. 逐个店铺串行执行（避免风控）
 * 3. 拉取已发布商品数据
 * 4. 构建 SKU 映射
 * 5. 批量查询站点异常
 * 6. 保存到 IndexedDB
 */

import { temuApi } from '~lib/api/temu';
import { taskState } from '~lib/storage/task-state';
import db from '~lib/storage/idb';
import type { SiteErrorItem } from '~types/storage';
import { sleep } from '~lib/utils/retry';

/**
 * 运行站点异常同步任务
 *
 * @param mallIds 可选：指定店铺 ID 列表（空表示所有店铺）
 */
export async function runSiteErrorSync(mallIds?: string[]): Promise<void> {
  try {
    console.log('[站点异常] 开始执行任务');
    await taskState.addLog('info', '开始执行站点异常同步任务');

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
    let totalErrors = 0;

    for (let i = 0; i < malls.length; i++) {
      const mall = malls[i];
      const mallName = mall.mallName;
      const mallId = mall.mallId;

      await taskState.addLog('info', `[${i + 1}/${malls.length}] 处理店铺: ${mallName}`);
      await taskState.updateProgress(i, mallName);

      try {
        // 步骤 2.1: 拉取该店铺的已发布数据
        await taskState.addLog('info', `店铺 ${mallName}: 拉取已发布商品...`);

        let pageNum = 1;
        let hasMore = true;
        const skuMapping = new Map<string, string>();  // goodsSkuId -> skcId
        const goodsIds = new Set<number>();

        // 分页拉取已发布数据
        while (hasMore) {
          const result = await temuApi.fetchPublishedData(mallId, pageNum);

          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 拉取第 ${pageNum} 页，共 ${result.total} 条记录`
          );

          // 步骤 2.2: 构建映射和收集 goodsId
          for (const item of result.dataList) {
            // 收集 goodsId
            if (item.goodsId) {
              goodsIds.add(item.goodsId);
            }

            // 构建 SKU 映射（goodsSkuId -> skcId）
            // skuList 是数组，需要遍历
            if (item.skuList && Array.isArray(item.skuList)) {
              for (const sku of item.skuList) {
                if (sku.goodsSkuId && sku.skcId) {
                  skuMapping.set(sku.goodsSkuId, sku.skcId);
                }
              }
            }
          }

          // 检查是否还有更多页
          const totalPages = Math.ceil(result.total / 100);
          hasMore = pageNum < totalPages;
          pageNum++;

          // 避免请求过快
          if (hasMore) {
            await sleep(1000);
          }
        }

        await taskState.addLog(
          'info',
          `店铺 ${mallName}: 共收集 ${goodsIds.size} 个商品`
        );

        // 步骤 2.3: 批量查询站点异常（每批 100 个）
        const goodsIdArray = Array.from(goodsIds);
        const BATCH_SIZE = 100;
        const mallErrors: SiteErrorItem[] = [];

        for (let batchStart = 0; batchStart < goodsIdArray.length; batchStart += BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + BATCH_SIZE, goodsIdArray.length);
          const batchGoodsIds = goodsIdArray.slice(batchStart, batchEnd);

          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 查询站点异常 [${batchStart + 1}-${batchEnd}/${goodsIdArray.length}]`
          );

          // 构建请求参数
          const pairs = batchGoodsIds.map(goodsId => ({
            goodsId,
            skuIdList: []  // 空数组表示查询该商品的所有 SKU
          }));

          try {
            const errorResult = await temuApi.querySiteErrors(mallId, pairs);

            // 步骤 2.4: 解析站点异常
            if (errorResult.fullyBindSiteFailVO?.skcList) {
              for (const skcError of errorResult.fullyBindSiteFailVO.skcList) {
                const skcId = skcError.skcId;
                const goodsSkuId = Array.from(skuMapping.entries()).find(
                  ([_, skc]) => skc === skcId
                )?.[0];

                if (!goodsSkuId) continue;

                // 解析站点异常原因
                const reasons: string[] = [];
                const sites: string[] = [];

                if (skcError.staticDescVOList) {
                  for (const desc of skcError.staticDescVOList) {
                    if (desc.desc) {
                      reasons.push(desc.desc);
                    }
                    if (desc.siteName) {
                      sites.push(desc.siteName);
                    }
                  }
                }

                const errorItem: SiteErrorItem = {
                  mallId,
                  mallName,
                  goodsSkuId,
                  skcId,
                  errorReasons: reasons,
                  affectedSites: sites,
                  checkedAt: Date.now()
                };

                mallErrors.push(errorItem);
              }
            }

            // 避免请求过快
            await sleep(500);

          } catch (error) {
            await taskState.addLog(
              'warn',
              `店铺 ${mallName}: 批次 [${batchStart + 1}-${batchEnd}] 查询失败: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }

        // 步骤 2.5: 保存到 IndexedDB
        if (mallErrors.length > 0) {
          await db.putBatch('site_errors', mallErrors);
          totalErrors += mallErrors.length;
          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 发现 ${mallErrors.length} 条站点异常记录`
          );
        } else {
          await taskState.addLog('info', `店铺 ${mallName}: 无站点异常`);
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

    // 任务完成
    await taskState.updateProgress(malls.length);
    await taskState.complete();
    await taskState.addLog('info', `站点异常同步任务完成，共发现 ${totalErrors} 条异常`);
    console.log('[站点异常] 任务执行完成');

  } catch (error) {
    console.error('[站点异常] 任务执行失败:', error);
    await taskState.fail(error instanceof Error ? error.message : String(error));
    await taskState.addLog('error', `任务失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * 导出站点异常 CSV
 *
 * @param mallIds 可选：指定店铺 ID 列表（空表示所有店铺）
 * @returns CSV 内容
 */
export async function exportSiteErrorCsv(mallIds?: string[]): Promise<string> {
  const { generateCsv, formatTimestamp } = await import('~lib/utils/csv');

  // 从 IndexedDB 获取数据
  let allErrors = await db.getAll('site_errors') as SiteErrorItem[];

  // 如果指定了店铺 ID，则过滤
  if (mallIds && mallIds.length > 0) {
    allErrors = allErrors.filter(error => mallIds.includes(error.mallId));
  }

  // 按检查时间降序排序
  allErrors.sort((a, b) => b.checkedAt - a.checkedAt);

  // 构建 CSV 行
  const headers = ['店铺名称', 'SKC', '站点异常原因', '涉及站点国家', '检查时间'];
  const rows = allErrors.map(error => ({
    '店铺名称': error.mallName,
    'SKC': error.skcId,
    '站点异常原因': error.errorReasons.join('; '),
    '涉及站点国家': error.affectedSites.join(', '),
    '检查时间': formatTimestamp(error.checkedAt)
  }));

  return generateCsv(headers, rows);
}
