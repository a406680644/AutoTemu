/**
 * 统一推送管理器
 *
 * 根据配置选择推送渠道（飞书/钉钉/两者都推）
 * 封装多渠道推送逻辑，对外提供统一接口
 */

import { config } from '~lib/storage/config';
import { dingtalkApi } from './dingtalk';
import { feishuApi } from './feishu';
import type { NotifyChannel } from '~types/storage';

// ============================================
// 类型定义
// ============================================

/**
 * 推送结果
 */
export interface NotifyResult {
  dingtalk: boolean;
  feishu: boolean;
  errors: string[];
}

/**
 * 已下架商品记录（按店铺和日期聚合）
 */
export type UnpublishedRecordsByMallDate = Map<string, Map<string, {
  mallName: string;
  reasonGroups: Array<{ reason: string; skcIds: string[] }>;
  totalCount: number;
}>>;

/**
 * 统一推送管理器
 */
class NotificationManager {
  /**
   * 发送已下架商品预警
   *
   * 根据配置的推送渠道，自动选择发送到钉钉、飞书或两者
   *
   * @param recordsByMallDate 按店铺和日期聚合的下架记录
   * @returns 推送结果
   */
  async sendUnpublishedAlert(
    recordsByMallDate: UnpublishedRecordsByMallDate
  ): Promise<NotifyResult> {
    const channel = await config.getNotifyChannel();
    const result: NotifyResult = {
      dingtalk: false,
      feishu: false,
      errors: []
    };

    // 如果没有数据，跳过推送
    if (recordsByMallDate.size === 0) {
      console.log('[Notifier] 无数据，跳过推送');
      return result;
    }

    // 如果渠道为 none，跳过推送
    if (channel === 'none') {
      console.log('[Notifier] 推送渠道已禁用');
      return result;
    }

    console.log('[Notifier] 开始推送，渠道:', channel);

    // 钉钉推送
    if (channel === 'dingtalk' || channel === 'both') {
      result.dingtalk = await this.sendToDingtalk(recordsByMallDate, result.errors);
    }

    // 飞书推送
    if (channel === 'feishu' || channel === 'both') {
      result.feishu = await this.sendToFeishu(recordsByMallDate, result.errors);
    }

    console.log('[Notifier] 推送完成:', result);
    return result;
  }

  /**
   * 发送到钉钉
   */
  private async sendToDingtalk(
    recordsByMallDate: UnpublishedRecordsByMallDate,
    errors: string[]
  ): Promise<boolean> {
    try {
      const webhookUrl = await config.getDingtalkWebhook();

      if (!webhookUrl) {
        console.warn('[Notifier] 钉钉 Webhook 未配置，跳过');
        errors.push('钉钉 Webhook 未配置');
        return false;
      }

      const card = dingtalkApi.buildAggregatedUnpublishedCard(recordsByMallDate);
      await dingtalkApi.sendCard(webhookUrl, card);

      console.log('[Notifier] 钉钉推送成功');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Notifier] 钉钉推送失败:', message);
      errors.push(`钉钉: ${message}`);
      return false;
    }
  }

  /**
   * 发送到飞书
   */
  private async sendToFeishu(
    recordsByMallDate: UnpublishedRecordsByMallDate,
    errors: string[]
  ): Promise<boolean> {
    try {
      const chatId = await config.getFeishuChatId();

      if (!chatId) {
        console.warn('[Notifier] 飞书群聊 ID 未配置，跳过');
        errors.push('飞书群聊 ID 未配置');
        return false;
      }

      const card = await feishuApi.buildAggregatedUnpublishedCard(recordsByMallDate);
      await feishuApi.sendCard(chatId, card);

      console.log('[Notifier] 飞书推送成功');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Notifier] 飞书推送失败:', message);
      errors.push(`飞书: ${message}`);
      return false;
    }
  }

  /**
   * 测试推送配置
   *
   * 根据当前配置的渠道发送测试消息
   *
   * @returns 测试结果
   */
  async testNotification(): Promise<{
    channel: NotifyChannel;
    dingtalk?: { success: boolean; message: string };
    feishu?: { success: boolean; message: string };
  }> {
    const channel = await config.getNotifyChannel();
    const result: {
      channel: NotifyChannel;
      dingtalk?: { success: boolean; message: string };
      feishu?: { success: boolean; message: string };
    } = { channel };

    // 测试钉钉
    if (channel === 'dingtalk' || channel === 'both') {
      result.dingtalk = await this.testDingtalk();
    }

    // 测试飞书
    if (channel === 'feishu' || channel === 'both') {
      result.feishu = await feishuApi.testConnection();
    }

    return result;
  }

  /**
   * 测试钉钉连接
   */
  private async testDingtalk(): Promise<{ success: boolean; message: string }> {
    try {
      const webhookUrl = await config.getDingtalkWebhook();

      if (!webhookUrl) {
        return { success: false, message: '未配置钉钉 Webhook URL' };
      }

      // 发送测试消息
      const testCard = {
        msgtype: 'markdown' as const,
        markdown: {
          title: '🔧 AutoTemu 连接测试',
          text: `### 🔧 AutoTemu 连接测试\n\n钉钉推送配置成功！\n\n测试时间: ${new Date().toLocaleString('zh-CN')}`
        }
      };

      await dingtalkApi.sendCard(webhookUrl, testCard);
      return { success: true, message: '钉钉连接测试成功' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 获取当前推送渠道配置状态
   */
  async getChannelStatus(): Promise<{
    channel: NotifyChannel;
    dingtalkConfigured: boolean;
    feishuConfigured: boolean;
  }> {
    const channel = await config.getNotifyChannel();
    const dingtalkWebhook = await config.getDingtalkWebhook();
    const feishuAppId = await config.getFeishuAppId();
    const feishuAppSecret = await config.getFeishuAppSecret();
    const feishuChatId = await config.getFeishuChatId();

    return {
      channel,
      dingtalkConfigured: !!dingtalkWebhook,
      feishuConfigured: !!(feishuAppId && feishuAppSecret && feishuChatId)
    };
  }
}

// 导出单例
export const notifier = new NotificationManager();
