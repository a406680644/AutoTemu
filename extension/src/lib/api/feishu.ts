/**
 * 飞书 API 客户端
 *
 * 通过飞书开放平台 API 发送消息到群聊
 * 文档: https://open.feishu.cn/document/server-docs/im-v1/message/create
 */

import { config } from '~lib/storage/config';
import { withRetry } from '~lib/utils/retry';
import {
  FEISHU_API,
  getFeishuApiUrl,
  TEMU_API,
  getTemuPageUrl,
  RETRY
} from '~lib/constants';

// ============================================
// 类型定义
// ============================================

/**
 * 飞书 API 响应基础结构
 */
interface FeishuApiResponse {
  code: number;
  msg: string;
  data?: any;
}

/**
 * 飞书 Token 响应
 */
interface FeishuTokenResponse extends FeishuApiResponse {
  tenant_access_token?: string;
  expire?: number;
}

/**
 * 飞书卡片模板
 */
interface FeishuCardTemplate {
  config: {
    wide_screen_mode: boolean;
  };
  header: {
    title: {
      tag: string;
      content: string;
    };
    template: string;  // 颜色：red, orange, yellow, green, blue, purple
  };
  elements: Array<{
    tag: string;
    text?: {
      tag: string;
      content: string;
    };
    fields?: Array<{
      is_short: boolean;
      text: {
        tag: string;
        content: string;
      };
    }>;
    actions?: Array<{
      tag: string;
      text: {
        tag: string;
        content: string;
      };
      url: string;
      type: string;
    }>;
    elements?: Array<{
      tag: string;
      content?: string;
    }>;
  }>;
}

/**
 * 飞书卡片消息结构
 */
interface FeishuCardMessage {
  msg_type: 'interactive';
  content: string;  // JSON 字符串化的 FeishuCardTemplate
}

// Token 缓存
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * 飞书 API 客户端
 */
class FeishuApiClient {
  /**
   * 获取 Tenant Access Token
   * 使用内部应用凭证获取
   */
  async getTenantAccessToken(): Promise<string> {
    // 检查缓存的 Token 是否有效（提前刷新，避免使用即将过期的 Token）
    if (cachedToken && Date.now() < tokenExpiry - FEISHU_API.TOKEN.REFRESH_BUFFER) {
      return cachedToken;
    }

    const appId = await config.getFeishuAppId();
    const appSecret = await config.getFeishuAppSecret();

    if (!appId || !appSecret) {
      throw new Error('未配置飞书应用凭证（App ID 或 App Secret）');
    }

    console.log('[飞书 API] 获取 Tenant Access Token...');

    const response = await fetch(
      getFeishuApiUrl(FEISHU_API.ENDPOINTS.TOKEN),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret
        })
      }
    );

    if (!response.ok) {
      throw new Error(`获取飞书 Token 失败: HTTP ${response.status}`);
    }

    const data = await response.json() as FeishuTokenResponse;

    if (data.code !== 0) {
      throw new Error(`获取飞书 Token 失败: ${data.msg}`);
    }

    if (!data.tenant_access_token) {
      throw new Error('飞书 API 返回空 Token');
    }

    // 缓存 Token（默认 2 小时有效）
    cachedToken = data.tenant_access_token;
    tokenExpiry = Date.now() + (data.expire || FEISHU_API.TOKEN.DEFAULT_EXPIRE) * 1000;

    console.log('[飞书 API] Token 获取成功，有效期:', data.expire, '秒');
    return cachedToken;
  }

  /**
   * 发送卡片消息到群聊
   *
   * @param chatId 群聊 ID（chat_id）
   * @param card 卡片消息内容
   */
  async sendCard(chatId: string, card: FeishuCardMessage): Promise<void> {
    try {
      const token = await this.getTenantAccessToken();

      console.log('[飞书 API] 发送卡片消息到群聊:', chatId);

      const response = await withRetry(
        async () => {
          const res = await fetch(
            `${getFeishuApiUrl(FEISHU_API.ENDPOINTS.MESSAGES)}?receive_id_type=chat_id`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                receive_id: chatId,
                msg_type: card.msg_type,
                content: card.content
              })
            }
          );

          if (!res.ok) {
            throw new Error(`飞书消息发送失败: HTTP ${res.status}`);
          }

          return res.json();
        },
        {
          maxRetries: RETRY.MAX_RETRIES,
          shouldRetry: (error) => {
            // Token 过期时清除缓存并重试
            if (error.message.includes('99991663') || error.message.includes('token')) {
              cachedToken = null;
              tokenExpiry = 0;
              return true;
            }
            return error.message.includes('HTTP');
          }
        }
      );

      const data = response as FeishuApiResponse;

      if (data.code !== 0) {
        throw new Error(`飞书消息发送失败: ${data.msg}`);
      }

      console.log('[飞书 API] 消息发送成功');
    } catch (error) {
      console.error('[飞书 API] 发送消息失败:', error);
      throw error;
    }
  }

  /**
   * 构建聚合的已下架商品通知卡片（飞书格式）
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
  ): FeishuCardMessage {
    const today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const mallCount = recordsByMallDate.size;
    let totalSkcCount = 0;

    // 按店铺构建内容
    const mallContents: string[] = [];

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
        reasonLines.push(`🔴 SKC: ${displayIds}${suffix}\n   原因: ${reason}`);
      }

      mallContents.push(`**【${mallName}】**\n${reasonLines.join('\n')}`);
    }

    // 构建飞书卡片
    const card: FeishuCardTemplate = {
      config: {
        wide_screen_mode: true
      },
      header: {
        title: {
          tag: 'plain_text',
          content: `⚠️ 已下架商品预警汇总`
        },
        template: FEISHU_API.CARD.ALERT_COLOR
      },
      elements: [
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**📅 数据日期**\n${today}`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**📊 涉及店铺**\n${mallCount} 个`
              }
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**📦 新增 SKC**\n${totalSkcCount} 个`
              }
            }
          ]
        },
        {
          tag: 'hr'
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: mallContents.join('\n\n')
          }
        },
        {
          tag: 'hr'
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: '查看商品管理'
              },
              url: getTemuPageUrl(TEMU_API.PAGES.PRODUCT_SELECT),
              type: 'primary'
            }
          ]
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `推送时间: ${new Date().toLocaleTimeString('zh-CN')}`
            }
          ]
        }
      ]
    };

    return {
      msg_type: 'interactive',
      content: JSON.stringify(card)
    };
  }

  /**
   * 测试飞书连接
   * 发送一条测试消息验证配置是否正确
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const chatId = await config.getFeishuChatId();
      if (!chatId) {
        return { success: false, message: '未配置飞书群聊 ID' };
      }

      // 尝试获取 Token
      await this.getTenantAccessToken();

      // 发送测试消息
      const testCard: FeishuCardMessage = {
        msg_type: 'interactive',
        content: JSON.stringify({
          config: { wide_screen_mode: true },
          header: {
            title: { tag: 'plain_text', content: '🔧 AutoTemu 连接测试' },
            template: 'green'
          },
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `飞书推送配置成功！\n\n测试时间: ${new Date().toLocaleString('zh-CN')}`
              }
            }
          ]
        })
      };

      await this.sendCard(chatId, testCard);
      return { success: true, message: '飞书连接测试成功' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

// 导出单例
export const feishuApi = new FeishuApiClient();
