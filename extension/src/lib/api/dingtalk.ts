/**
 * 钉钉 API 封装
 *
 * 提供钉钉 Webhook 推送功能
 */

import type { DingtalkCardMessage, DingtalkWebhookResponse } from '~types/api';
import { withRetry } from '~lib/utils/retry';
import {
  DINGTALK_API,
  TEMU_API,
  getTemuPageUrl,
  RETRY
} from '~lib/constants';

/**
 * 钉钉 API 客户端
 */
class DingtalkApiClient {
  /**
   * 发送 Markdown 卡片消息
   *
   * @param webhookUrl 钉钉 Webhook URL
   * @param card 卡片消息内容
   */
  async sendCard(webhookUrl: string, card: DingtalkCardMessage): Promise<void> {
    try {
      console.log("[钉钉 API] 发送消息:", card.markdown.title)

      // 验证 Webhook URL
      if (!webhookUrl || !webhookUrl.startsWith(DINGTALK_API.WEBHOOK_PREFIX)) {
        throw new Error('无效的钉钉 Webhook URL');
      }

      // 发送请求（带重试）
      const response = await withRetry(
        async () => {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(card)
          })

          if (!res.ok) {
            throw new Error("钉钉 Webhook 请求失败: HTTP " + res.status)
          }

          return res.json()
        },
        {
          maxRetries: RETRY.MAX_RETRIES,
          shouldRetry: (error) => {
            // 网络错误可以重试
            return error.message.includes("HTTP")
          }
        }
      )

      const data = response as DingtalkWebhookResponse

      if (data.errcode !== 0) {
        throw new Error(`钉钉推送失败: ${data.errmsg}`)
      }

      console.log("[钉钉 API] 消息发送成功")
    } catch (error) {
      console.error("[钉钉 API] 发送消息失败:", error)
      throw error
    }
  }

  /**
   * 构建已下架商品通知卡片
   *
   * @param mallName 店铺名称
   * @param items 下架商品列表
   * @param mallId 店铺 ID（用于生成跳转链接）
   */
  buildUnpublishedCard(
    mallName: string,
    items: Array<{
      skcId: string
      goodsName: string
      unPublishedReason: string
      unPublishedTime: number
    }>,
    mallId?: string
  ): DingtalkCardMessage {
    const count = items.length
    const skcSet = new Set(items.map((item) => item.skcId))
    const skcCount = skcSet.size

    // 格式化下架时间
    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp)
      return date.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      })
    }

    // 构建商品明细列表（最多显示 10 条）
    const detailLines = items.slice(0, 10).map((item, index) => {
      return `${index + 1}. **${item.skcId}** - ${item.unPublishedReason} (${formatTime(item.unPublishedTime)})`
    })

    // 如果超过 10 条，显示省略提示
    if (items.length > 10) {
      detailLines.push(`... 还有 ${items.length - 10} 条记录`)
    }

    // 构建跳转链接
    const jumpUrl = mallId
      ? getTemuPageUrl(TEMU_API.PAGES.OFFLINE_LIST, { mallId })
      : getTemuPageUrl(TEMU_API.PAGES.OFFLINE_LIST);

    // 构建 Markdown 内容
    const text = `
### ${mallName} - 新增 ${count} 条已下架商品

---

**统计信息**
- 总计：${count} 条
- 涉及 SKC：${skcCount} 个

**商品明细**

${detailLines.join("\n")}

---

[查看详情](${jumpUrl}) | 推送时间：${formatTime(Date.now())}
    `.trim()

    return {
      msgtype: "markdown",
      markdown: {
        title: `${mallName} - 新增 ${count} 条已下架商品`,
        text
      }
    }
  }

  /**
   * 构建聚合的已下架商品通知卡片（多店铺汇总为一条消息）
   *
   * Plan B 数据结构：Map<mallId, Map<date, UnpublishedItem>>
   * UnpublishedItem: { mallName, reasonGroups: [{reason, skcIds}], totalCount }
   *
   * @param recordsByMallDate Map<mallId, Map<date, UnpublishedItem>>
   */
  buildAggregatedUnpublishedCard(
    recordsByMallDate: Map<string, Map<string, {
      mallName: string;
      reasonGroups: Array<{ reason: string; skcIds: string[] }>;
      totalCount: number;
    }>>
  ): DingtalkCardMessage {
    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const mallCount = recordsByMallDate.size;
    let totalSkcCount = 0;

    // 按店铺构建内容
    const mallSections: string[] = [];

    for (const [mallId, dateMap] of recordsByMallDate) {
      if (dateMap.size === 0) continue;

      // 合并所有日期的数据
      let mallName = mallId;
      const mergedReasonGroups = new Map<string, string[]>();

      for (const [, record] of dateMap) {
        mallName = record.mallName || mallId;
        totalSkcCount += record.totalCount;

        // 合并 reasonGroups
        for (const group of record.reasonGroups) {
          const existing = mergedReasonGroups.get(group.reason);
          if (existing) {
            existing.push(...group.skcIds);
          } else {
            mergedReasonGroups.set(group.reason, [...group.skcIds]);
          }
        }
      }

      // 构建该店铺的内容
      const reasonLines: string[] = [];
      for (const [reason, skcIds] of mergedReasonGroups) {
        // 最多显示 10 个 SKC，超过则省略
        const displayIds = skcIds.slice(0, 10).join('、');
        const suffix = skcIds.length > 10 ? `...等${skcIds.length}个` : '';
        reasonLines.push(`🔴 SKC: ${displayIds}${suffix} - ${reason}`);
      }

      mallSections.push(`**【${mallName}】**\n${reasonLines.join('\n')}`);
    }

    // 构建完整的 Markdown 内容
    const text = `
### 【已下架商品预警汇总】

📅 数据日期: ${today}
📊 涉及店铺: ${mallCount} 个
📦 新增 SKC: ${totalSkcCount} 个

──────────────────────────────

${mallSections.join('\n\n')}

──────────────────────────────

[查看商品管理](${getTemuPageUrl(TEMU_API.PAGES.OFFLINE_LIST)}) | 推送时间: ${new Date().toLocaleTimeString('zh-CN')}
    `.trim();

    return {
      msgtype: 'markdown',
      markdown: {
        title: `【已下架预警】${mallCount}个店铺 ${totalSkcCount}条新记录`,
        text
      }
    };
  }
}

// 导出单例
export const dingtalkApi = new DingtalkApiClient()
