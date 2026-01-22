/**
 * 站点异常同步任务
 *
 * 核心流程：
 * 1. 获取所有店铺列表
 * 2. 逐个店铺串行执行（避免风控）
 * 3. 流水线并发：拉取已发布数据 + 查询站点异常并行执行
 * 4. 智能去重异常原因
 * 5. 保存到 IndexedDB
 */

import { temuApi } from '~lib/api/temu';
import { taskState } from '~lib/storage/task-state';
import db from '~lib/storage/idb';
import type { SiteErrorItem } from '~types/storage';
import { sleep } from '~lib/utils/retry';
// ⭐ 静态导入 CSV 工具（Service Worker 不支持动态 import）
import { generateCsv, formatTimestamp } from '~lib/utils/csv';

/**
 * 静态异常原因模板映射（简化版）
 * 仅对特定 checkCode 使用简化模板，替换复杂的 HTML 原因
 * ⭐ 不在此映射中的 checkCode 会使用 API 返回的 staticDescVOList 原因
 */
const SIMPLIFIED_REASON_TEMPLATES: Record<number, string> = {
  3: '该商品暂无可销售的库存',
  14: '受物流运输渠道限制影响，暂不支持在部分站点售卖',
  15: '调价失败',
};

/**
 * 清理异常原因文本
 * - 移除 HTML 标签（<a>、</a> 等）
 * - 移除开头的分号
 * - 去除首尾空白
 */
function cleanErrorReason(text: string): string {
  if (!text) return '';
  return text
    .replace(/<a[^>]*>/gi, '')   // 移除 <a ...> 开标签
    .replace(/<\/a>/gi, '')      // 移除 </a> 闭标签
    .replace(/<[^>]+>/g, '')     // 移除其他 HTML 标签
    .replace(/^[；;、,\s]+/, '') // 移除开头的分号、顿号、逗号、空白
    .trim();
}

/**
 * 获取异常原因（优先级：简化模板 > API静态映射 > 原始描述）
 *
 * @param checkCode 异常代码
 * @param staticDescMap API 返回的 staticDescVOList 构建的映射
 * @param rawDesc failResultVOList 中的 checkDesc
 */
function getErrorReason(
  checkCode: number,
  staticDescMap: Map<number, string>,
  rawDesc?: string
): string {
  // 1. 优先使用简化模板（特定 checkCode 需要精简显示）
  if (SIMPLIFIED_REASON_TEMPLATES[checkCode]) {
    return SIMPLIFIED_REASON_TEMPLATES[checkCode];
  }

  // 2. 使用 API 返回的 staticDescVOList 映射
  const staticDesc = staticDescMap.get(checkCode);
  if (staticDesc) {
    return cleanErrorReason(staticDesc);
  }

  // 3. 使用原始描述并清理
  return rawDesc ? cleanErrorReason(rawDesc) : '';
}

/**
 * 智能去重异常原因列表
 *
 * 策略：
 * 1. 拆分复合原因（按 ; / 等分隔符）
 * 2. 清理 HTML 并去除空白
 * 3. 完全相同的字符串去重
 * 4. 资质缺失类原因合并（多种格式）
 * 5. 信息不合规类原因合并（多种格式）
 * 6. 包含关系去重
 */
function smartDedupeReasons(reasons: string[]): string[] {
  // 步骤1: 拆分复合原因（按 ; / 分隔）
  const split: string[] = [];
  for (const reason of reasons) {
    // 按 ; 或 / 或 ； 拆分，但避免拆分 FCM/RSL-PFAS 这类资质名称
    const parts = reason
      .replace(/FCM\/RSL-PFAS/gi, 'FCM_RSL_PFAS_PLACEHOLDER')  // 保护资质名称
      .split(/[;；/]/)
      .map(p => p.replace(/FCM_RSL_PFAS_PLACEHOLDER/gi, 'FCM/RSL-PFAS'));  // 恢复
    split.push(...parts);
  }

  // 步骤2: 清理并过滤空白
  const cleaned = split
    .map(r => cleanErrorReason(r))
    .filter(r => r.length > 0);

  // 步骤3: 完全相同去重
  const unique = [...new Set(cleaned)];

  if (unique.length <= 1) return unique;

  // 步骤4: 分类原因
  const certMissingReasons: string[] = [];   // 资质缺失类
  const infoInvalidReasons: string[] = [];   // 信息不合规类
  const otherReasons: string[] = [];         // 其他

  for (const reason of unique) {
    if (isCertMissingReason(reason)) {
      certMissingReasons.push(reason);
    } else if (isInfoInvalidReason(reason)) {
      infoInvalidReasons.push(reason);
    } else {
      otherReasons.push(reason);
    }
  }

  // 步骤5: 合并"资质缺失"类原因
  const mergedCertMissing = mergeCertMissingReasons(certMissingReasons);

  // 步骤6: 合并"信息不合规"类原因
  const mergedInfoInvalid = mergeInfoInvalidReasons(infoInvalidReasons);

  // 步骤7: 包含关系去重（只对其他原因）
  const dedupedOthers: string[] = [];
  for (const reason of otherReasons) {
    let isContainedByOther = false;
    for (const other of otherReasons) {
      if (reason !== other && other.length > reason.length && other.includes(reason)) {
        isContainedByOther = true;
        break;
      }
    }
    if (!isContainedByOther) {
      dedupedOthers.push(reason);
    }
  }

  return [...mergedCertMissing, ...mergedInfoInvalid, ...dedupedOthers];
}

/**
 * 判断是否为"资质缺失"类原因
 * 支持格式：
 * - "商品XXX资质缺失或上传中"
 * - "缺失XXX资质"
 * - "缺失XXX, YYY资质"
 */
function isCertMissingReason(reason: string): boolean {
  return /^商品.+资质缺失或上传中$/.test(reason) ||
         /^缺失.+资质$/.test(reason);
}

/**
 * 判断是否为"信息不合规"类原因
 * 支持格式：
 * - ""XXX" 未填写或不合规"
 * - "信息缺失或不合规：XXX"
 */
function isInfoInvalidReason(reason: string): boolean {
  return /^".+" 未填写或不合规$/.test(reason) ||
         /^信息缺失或不合规：.+$/.test(reason);
}

/**
 * 合并"资质缺失"类原因
 * 提取所有资质名称，合并为一条
 */
function mergeCertMissingReasons(reasons: string[]): string[] {
  if (reasons.length === 0) return [];
  if (reasons.length === 1) return reasons;

  // 提取所有资质名称
  const allCerts = new Set<string>();

  for (const reason of reasons) {
    // 格式1: "商品XXX资质、YYY资质缺失或上传中"
    const match1 = reason.match(/^商品(.+)资质缺失或上传中$/);
    if (match1) {
      const certsPart = match1[1];
      const certs = certsPart.split(/资质、|、/).map(c => c.replace(/资质$/, '').trim()).filter(c => c);
      certs.forEach(c => allCerts.add(c));
      continue;
    }

    // 格式2: "缺失XXX, YYY资质" 或 "缺失XXX资质"
    const match2 = reason.match(/^缺失(.+)资质$/);
    if (match2) {
      const certsPart = match2[1];
      // 按逗号或顿号分隔
      const certs = certsPart.split(/[,，、]/).map(c => c.trim()).filter(c => c);
      certs.forEach(c => allCerts.add(c));
    }
  }

  if (allCerts.size === 0) return reasons.slice(0, 1);

  // 生成合并后的原因
  const sortedCerts = Array.from(allCerts).sort();
  return [`商品${sortedCerts.join('、')}资质缺失或上传中`];
}

/**
 * 合并"信息不合规"类原因
 * 提取所有字段名，合并为一条
 */
function mergeInfoInvalidReasons(reasons: string[]): string[] {
  if (reasons.length === 0) return [];
  if (reasons.length === 1) return reasons;

  // 提取所有字段名
  const allFields = new Set<string>();

  for (const reason of reasons) {
    // 格式1: ""XXX" 未填写或不合规"
    const match1 = reason.match(/^"(.+)" 未填写或不合规$/);
    if (match1) {
      allFields.add(match1[1]);
      continue;
    }

    // 格式2: "信息缺失或不合规：XXX"
    const match2 = reason.match(/^信息缺失或不合规：(.+)$/);
    if (match2) {
      allFields.add(match2[1]);
    }
  }

  if (allFields.size === 0) return reasons.slice(0, 1);

  // 生成合并后的原因
  const sortedFields = Array.from(allFields).sort();
  return [`"${sortedFields.join('、')}" 未填写或不合规`];
}

/**
 * 合并资质类异常原因（备用，当前未使用）
 * 提取所有提到的资质名称，只保留涵盖最多资质的描述
 */
// function mergeQualificationReasons(reasons: string[]): string[] {
//   if (reasons.length <= 1) return reasons;

//   // 提取所有资质名称的正则
//   const qualificationNames = [
//     'CE-LVD', 'CE-RoHS', 'CE-EMC_Electric', 'EU DoC', 'UKCA', 'UKCA DoC',
//     'UKCA-EMC_Electric', 'UKCA-RoHS', 'UL_CSA_ETL', 'RCM', 'VN-RoHS',
//     'UK Plug Test Report', 'Denmark Plug Test Report', 'Switzerland Plug Test Report'
//   ];

//   // 为每个原因计算涵盖的资质数量
//   const reasonWithScore = reasons.map(reason => {
//     const upperReason = reason.toUpperCase();
//     let score = 0;
//     const coveredQuals: string[] = [];
//     for (const qual of qualificationNames) {
//       if (upperReason.includes(qual.toUpperCase())) {
//         score++;
//         coveredQuals.push(qual);
//       }
//     }
//     return { reason, score, coveredQuals };
//   });

//   // 按分数排序，保留分数最高的（涵盖资质最多的）
//   reasonWithScore.sort((a, b) => b.score - a.score);

//   // 贪心算法：选择能覆盖所有资质的最少原因数
//   const allCoveredQuals = new Set<string>();
//   const selectedReasons: string[] = [];

//   for (const item of reasonWithScore) {
//     // 检查是否有新的资质被覆盖
//     const hasNewQual = item.coveredQuals.some(q => !allCoveredQuals.has(q));

//     if (hasNewQual || item.score === 0) {
//       selectedReasons.push(item.reason);
//       item.coveredQuals.forEach(q => allCoveredQuals.add(q));
//     }

//     // 如果只有一条原因或分数为0的，也保留
//     if (selectedReasons.length >= 3) break; // 最多保留3条资质相关原因
//   }

//   return selectedReasons.length > 0 ? selectedReasons : reasons.slice(0, 1);
// }

/**
 * 检查是否应该停止任务
 * 如果需要停止，清除标志并返回 true
 */
async function checkAndHandleStop(context: string): Promise<boolean> {
  if (await taskState.shouldStop()) {
    await taskState.clearStopFlag();
    console.log(`[站点异常] 任务被用户中止（${context}）`);
    await taskState.addLog('warn', '任务已中止');
    return true;
  }
  return false;
}

/**
 * 页面数据结构（用于流水线）
 */
interface PageData {
  pageNum: number;
  dataList: Array<{
    goodsId: number;
    goodsName: string;
    skuList?: Array<{
      goodsSkuId: number;
      skcId: string;
    }>;
  }>;
  total: number;
}

/**
 * 处理单页数据并查询站点异常（流水线中的一个任务）
 */
async function processPageAndQueryErrors(
  mallId: string,
  mallName: string,
  pageData: PageData,
  skuIdToSkcId: Map<number, string>
): Promise<SiteErrorItem[]> {
  const errors: SiteErrorItem[] = [];

  // 构建 goodsId -> skuIdList 映射
  const goodsIdToSkuIds = new Map<number, number[]>();

  for (const item of pageData.dataList) {
    if (!item.goodsId) continue;

    const goodsId = item.goodsId;
    if (!goodsIdToSkuIds.has(goodsId)) {
      goodsIdToSkuIds.set(goodsId, []);
    }

    if (item.skuList && Array.isArray(item.skuList)) {
      for (const sku of item.skuList) {
        if (sku.goodsSkuId) {
          goodsIdToSkuIds.get(goodsId)!.push(sku.goodsSkuId);
          if (sku.skcId) {
            skuIdToSkcId.set(sku.goodsSkuId, sku.skcId);
          }
        }
      }
    }
  }

  // 批量查询站点异常（每批 100 个 goodsId）
  const goodsIdArray = Array.from(goodsIdToSkuIds.keys());
  const BATCH_SIZE = 100;

  for (let batchStart = 0; batchStart < goodsIdArray.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, goodsIdArray.length);
    const batchGoodsIds = goodsIdArray.slice(batchStart, batchEnd);

    const pairs = batchGoodsIds.map(goodsId => ({
      goodsId,
      skuIdList: goodsIdToSkuIds.get(goodsId) || []
    }));

    try {
      const errorResult = await temuApi.querySiteErrors(mallId, pairs);

      // 构建静态异常 checkCode -> checkDesc 映射
      const staticDescMap = new Map<number, string>();
      const staticDescList = errorResult.result?.fullyBindSiteFailVO?.staticDescVOList;
      if (staticDescList && staticDescList.length > 0) {
        for (const desc of staticDescList) {
          if (desc.checkCode !== undefined && desc.checkDesc) {
            staticDescMap.set(desc.checkCode, desc.checkDesc);
          }
        }
      }

      // 解析异常数据
      const skuFailList = errorResult.result?.fullyBindSiteFailVO?.goodsSkuBindSiteFailVOList;
      if (skuFailList && skuFailList.length > 0) {
        for (const skuFail of skuFailList) {
          const goodsSkuId = skuFail.goodsSkuId;
          const skcId = skuIdToSkcId.get(goodsSkuId) || String(goodsSkuId);

          const rawReasons: string[] = [];
          const sites: string[] = [];

          if (skuFail.goodsSkuBindSiteFailInfoVOList) {
            for (const siteInfo of skuFail.goodsSkuBindSiteFailInfoVOList) {
              if (siteInfo.siteName && !sites.includes(siteInfo.siteName)) {
                sites.push(siteInfo.siteName);
              }

              if (siteInfo.failResultVOList) {
                for (const failResult of siteInfo.failResultVOList) {
                  // ⭐ 使用 getErrorReason()（优先级：简化模板 > staticDescMap > rawDesc）
                  if (failResult.checkCode !== undefined) {
                    const reason = getErrorReason(
                      failResult.checkCode,
                      staticDescMap,
                      failResult.checkDesc
                    );
                    if (reason) {
                      rawReasons.push(reason);
                    }
                  } else if (failResult.checkDesc) {
                    rawReasons.push(failResult.checkDesc);
                  }
                }
              }
            }
          }

          // ⭐ 使用智能去重
          const errorReasons = smartDedupeReasons(rawReasons);

          if (errorReasons.length > 0 || sites.length > 0) {
            errors.push({
              mallId,
              mallName,
              goodsSkuId: String(goodsSkuId),
              skcId,
              errorReasons,
              affectedSites: sites,
              checkedAt: Date.now()
            });
          }
        }
      }

      // 批次间短暂延迟
      await sleep(200);

    } catch (error) {
      console.warn(`[站点异常] 批次查询失败:`, error);
    }
  }

  return errors;
}

/**
 * 运行站点异常同步任务（流水线并发版本）
 *
 * 流水线模式：
 * - 拉取第1页 → 完成后同时：拉取第2页 + 查询第1页异常
 * - 第2页完成 → 同时：拉取第3页 + 查询第2页异常（不等第1页查询完成）
 *
 * @param mallIds 可选：指定店铺 ID 列表（空表示所有店铺）
 */
export async function runSiteErrorSync(mallIds?: string[]): Promise<void> {
  try {
    console.log('[站点异常] 开始执行任务（流水线并发模式）');
    await taskState.addLog('info', '开始执行站点异常同步任务');

    // 清理停止标志
    await taskState.clearStopFlag();

    // 步骤 1: 获取店铺列表
    await taskState.addLog("info", "获取店铺列表...")
    let malls = await temuApi.getMallList()

    if (!malls || malls.length === 0) {
      throw new Error("未找到任何店铺，请先登录 Temu 卖家中心")
    }

    if (mallIds && mallIds.length > 0) {
      malls = malls.filter((mall) => mallIds.includes(mall.mallId))
      if (malls.length === 0) {
        throw new Error("指定的店铺 ID 不存在")
      }
    }

    await taskState.addLog("info", `获取到 ${malls.length} 个店铺`)
    await taskState.start(malls.length)

    let totalErrors = 0;

    // 步骤 2: 逐个店铺处理（店铺间串行，避免风控）
    for (let i = 0; i < malls.length; i++) {
      if (await checkAndHandleStop('店铺循环开始')) return;

      const mall = malls[i];
      const mallName = mall.mallName;
      const mallId = mall.mallId;

      await taskState.addLog(
        "info",
        `[${i + 1}/${malls.length}] 处理店铺: ${mallName}`
      )
      await taskState.updateProgress(i, mallName)

      try {
        // ⭐ 流水线并发：拉取数据和查询异常并行执行
        const skuIdToSkcId = new Map<number, string>();
        const pendingQueries: Promise<SiteErrorItem[]>[] = [];
        const mallErrors: SiteErrorItem[] = [];

        let pageNum = 1;
        let hasMore = true;
        let nextFetchPromise: Promise<PageData> | null = null;

        // 预拉取第一页
        nextFetchPromise = temuApi.fetchPublishedData(mallId, mall.managedType, pageNum) as Promise<PageData>;

        while (hasMore) {
          if (await checkAndHandleStop('流水线循环')) return;

          // 等待当前页数据
          const currentPageData = await nextFetchPromise;

          await taskState.addLog(
            'info',
            `店铺 ${mallName}: 第 ${pageNum} 页 (${currentPageData.dataList.length} 条)`
          );

          // 计算是否还有更多页
          const totalPages = Math.ceil(currentPageData.total / 100);
          hasMore = pageNum < totalPages;

          // ⭐ 并发点1：如果还有下一页，立即开始拉取（不等待当前页查询完成）
          if (hasMore) {
            pageNum++;
            nextFetchPromise = temuApi.fetchPublishedData(mallId, mall.managedType, pageNum) as Promise<PageData>;
          }

          // ⭐ 并发点2：立即启动当前页的异常查询（不等待，加入队列）
          const queryPromise = processPageAndQueryErrors(
            mallId,
            mallName,
            currentPageData,
            skuIdToSkcId
          );
          pendingQueries.push(queryPromise);

          // 短暂延迟避免请求过快
          await sleep(300);
        }

        // 等待所有查询完成
        await taskState.addLog('info', `店铺 ${mallName}: 等待 ${pendingQueries.length} 个查询任务完成...`);
        const queryResults = await Promise.all(pendingQueries);

        // 合并所有结果
        for (const result of queryResults) {
          mallErrors.push(...result);
        }

        // 保存到 IndexedDB
        if (mallErrors.length > 0) {
          await db.putBatch("site_errors", mallErrors)
          totalErrors += mallErrors.length
          await taskState.addLog(
            "info",
            `店铺 ${mallName}: 发现 ${mallErrors.length} 条站点异常记录`
          )
        } else {
          await taskState.addLog("info", `店铺 ${mallName}: 无站点异常`)
        }
      } catch (error) {
        await taskState.addLog(
          "error",
          `店铺 ${mallName} 处理失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      // 店铺间等待
      if (i < malls.length - 1) {
        await sleep(2000);
        if (await checkAndHandleStop('店铺间等待后')) return;
      }
    }

    // 任务完成
    await taskState.updateProgress(malls.length)
    await taskState.complete()
    await taskState.addLog(
      "info",
      `站点异常同步任务完成，共发现 ${totalErrors} 条异常`
    )
    console.log("[站点异常] 任务执行完成")
  } catch (error) {
    console.error("[站点异常] 任务执行失败:", error)
    await taskState.fail(error instanceof Error ? error.message : String(error))
    await taskState.addLog(
      "error",
      `任务失败: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}

/**
 * 导出站点异常 CSV
 *
 * @param mallIds 可选：指定店铺 ID 列表（空表示所有店铺）
 * @returns CSV 内容
 */
export async function exportSiteErrorCsv(mallIds?: string[]): Promise<string> {
  // 从 IndexedDB 获取数据
  let allErrors = (await db.getAll("site_errors")) as SiteErrorItem[]

  // 如果指定了店铺 ID，则过滤
  if (mallIds && mallIds.length > 0) {
    allErrors = allErrors.filter((error) => mallIds.includes(error.mallId))
  }

  // 按检查时间降序排序
  allErrors.sort((a, b) => b.checkedAt - a.checkedAt)

  // 构建 CSV 行
  const headers = [
    "店铺名称",
    "SKC",
    "站点异常原因",
    "涉及站点国家",
    "检查时间"
  ]
  const rows = allErrors.map((error) => ({
    店铺名称: error.mallName,
    SKC: error.skcId,
    站点异常原因: error.errorReasons.join("; "),
    涉及站点国家: error.affectedSites.join(", "),
    检查时间: formatTimestamp(error.checkedAt)
  }))

  return generateCsv(headers, rows)
}
