/**
 * 已下架商品监控任务
 *
 * 核心流程：
 * 1. 获取所有店铺列表
 * 2. 逐个店铺串行执行（避免风控）
 * 3. 拉取已下架数据
 * 4. 去重判定
 * 5. 按店铺聚合推送钉钉
 * 6. 保存到 IndexedDB
 */

import { dingtalkApi } from "~lib/api/dingtalk"
import { temuApi } from "~lib/api/temu"
import { config } from "~lib/storage/config"
import { dedup, generateUnpublishedKey } from "~lib/storage/dedup"
import db from "~lib/storage/idb"
import { taskState } from "~lib/storage/task-state"
import { sleep } from "~lib/utils/retry"
import type { UnpublishedItem } from "~types/storage"

/**
 * 运行已下架商品监控任务
 *
 * @param mallIds 可选：指定店铺 ID 列表（空表示所有店铺）
 */
export async function runUnpublishedMonitor(mallIds?: string[]): Promise<void> {
  try {
    console.log("[下架监控] 开始执行任务")
    await taskState.addLog("info", "开始执行下架监控任务")

    // 步骤 1: 获取店铺列表
    await taskState.addLog("info", "获取店铺列表...")
    let malls = await temuApi.getMallList()

    if (!malls || malls.length === 0) {
      throw new Error("未找到任何店铺，请先登录 Temu 卖家中心")
    }

    // 如果指定了店铺 ID，则过滤
    if (mallIds && mallIds.length > 0) {
      malls = malls.filter((mall) => mallIds.includes(mall.mallId))
      if (malls.length === 0) {
        throw new Error("指定的店铺 ID 不存在")
      }
    }

    await taskState.addLog("info", `获取到 ${malls.length} 个店铺`)
    await taskState.start(malls.length)

    // 步骤 2: 逐个店铺串行执行
    const newRecordsByMall = new Map<string, UnpublishedItem[]>()

    for (let i = 0; i < malls.length; i++) {
      const mall = malls[i]
      const mallName = mall.mallName
      const mallId = mall.mallId

      await taskState.addLog(
        "info",
        `[${i + 1}/${malls.length}] 处理店铺: ${mallName}`
      )
      await taskState.updateProgress(i, mallName)

      try {
        // 步骤 2.1: 拉取该店铺的已下架数据（最近 7 天）
        const timeEnd = Date.now()
        const timeBegin = timeEnd - 7 * 24 * 60 * 60 * 1000 // 7 天前

        let pageNum = 1
        let hasMore = true
        const mallNewRecords: UnpublishedItem[] = []

        while (hasMore) {
          const result = await temuApi.fetchUnpublishedData(
            mallId,
            timeBegin,
            timeEnd,
            pageNum
          )

          await taskState.addLog(
            "info",
            `店铺 ${mallName}: 拉取第 ${pageNum} 页，共 ${result.total} 条记录`
          )

          // 步骤 2.2: 解析并去重
          for (const item of result.dataList) {
            const key = generateUnpublishedKey(
              mallId,
              item.goodsSkuId,
              item.unPublishedTime
            )

            // 判断是否为新记录
            const isNew = await dedup.isNewUnpublished(
              mallId,
              item.goodsSkuId,
              item.unPublishedTime
            )

            if (isNew) {
              const record: UnpublishedItem = {
                mallId,
                goodsSkuId: item.goodsSkuId,
                unPublishedTime: item.unPublishedTime,
                skcId: item.skcId,
                goodsName: item.goodsName,
                goodsMainImage: item.goodsMainImage,
                unPublishedReason: item.unPublishedReason,
                createdAt: Date.now(),
                pushed: false
              }

              mallNewRecords.push(record)
            }
          }

          // 检查是否还有更多页
          const totalPages = Math.ceil(result.total / 100)
          hasMore = pageNum < totalPages
          pageNum++

          // 避免请求过快
          if (hasMore) {
            await sleep(1000)
          }
        }

        // 步骤 2.3: 保存新记录到 IndexedDB
        if (mallNewRecords.length > 0) {
          await db.putBatch("unpublished", mallNewRecords)
          newRecordsByMall.set(mallId, mallNewRecords)
          await taskState.addLog(
            "info",
            `店铺 ${mallName}: 发现 ${mallNewRecords.length} 条新下架记录`
          )
        } else {
          await taskState.addLog("info", `店铺 ${mallName}: 无新下架记录`)
        }
      } catch (error) {
        await taskState.addLog(
          "error",
          `店铺 ${mallName} 处理失败: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      // 等待 2 秒后处理下一个店铺（避免风控）
      if (i < malls.length - 1) {
        await sleep(2000)
      }
    }

    // 步骤 3: 推送到钉钉（按店铺聚合）
    const webhookUrl = await config.getDingtalkWebhook()
    if (webhookUrl && newRecordsByMall.size > 0) {
      await taskState.addLog("info", "推送钉钉通知...")

      for (const [mallId, records] of newRecordsByMall) {
        const mall = malls.find((m) => m.mallId === mallId)
        if (!mall) continue

        try {
          // 构建钉钉卡片
          const card = dingtalkApi.buildUnpublishedCard(
            mall.mallName,
            records,
            mallId
          )

          // 发送钉钉消息
          await dingtalkApi.sendCard(webhookUrl, card)

          // 标记为已推送
          const keys = records.map((r) =>
            generateUnpublishedKey(r.mallId, r.goodsSkuId, r.unPublishedTime)
          )
          await dedup.markAsPushed(keys)

          await taskState.addLog(
            "info",
            `店铺 ${mall.mallName}: 钉钉推送成功 (${records.length} 条)`
          )

          // 避免推送过快
          await sleep(1000)
        } catch (error) {
          await taskState.addLog(
            "error",
            `店铺 ${mall.mallName} 钉钉推送失败: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
    } else if (!webhookUrl) {
      await taskState.addLog("warn", "未配置钉钉 Webhook，跳过推送")
    }

    // 任务完成
    await taskState.updateProgress(malls.length)
    await taskState.complete()
    await taskState.addLog("info", "下架监控任务完成")
    console.log("[下架监控] 任务执行完成")
  } catch (error) {
    console.error("[下架监控] 任务执行失败:", error)
    await taskState.fail(error instanceof Error ? error.message : String(error))
    await taskState.addLog(
      "error",
      `任务失败: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}
