/**
 * 配置存储工具
 *
 * 封装 chrome.storage.local 操作，提供类型安全的配置读写
 */

import type { UserConfig, NotifyChannel } from '~types/storage';
import { CONFIG_KEYS } from '~types/storage';

/**
 * 配置管理器
 */
class ConfigManager {
  /**
   * 获取配置值
   * @param key 配置键
   * @param defaultValue 默认值
   */
  async get<T>(key: string, defaultValue: T): Promise<T> {
    const result = await chrome.storage.local.get(key);
    return (result[key] ?? defaultValue) as T;
  }

  /**
   * 设置配置值
   * @param key 配置键
   * @param value 配置值
   */
  async set(key: string, value: any): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  /**
   * 获取所有配置
   */
  async getAll(): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (result) => {
        resolve(result || {});
      });
    });
  }

  /**
   * 删除配置
   */
  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  }

  // ============================================
  // 快捷方法（类型安全）
  // ============================================

  /**
   * 获取钉钉 Webhook URL
   */
  async getDingtalkWebhook(): Promise<string | undefined> {
    return this.get(CONFIG_KEYS.DINGTALK_WEBHOOK, undefined);
  }

  /**
   * 设置钉钉 Webhook URL
   */
  async setDingtalkWebhook(url: string): Promise<void> {
    await this.set(CONFIG_KEYS.DINGTALK_WEBHOOK, url);
  }

  /**
   * 获取同步间隔（分钟）
   */
  async getSyncInterval(): Promise<number> {
    return this.get(CONFIG_KEYS.SYNC_INTERVAL, 30);
  }

  /**
   * 设置同步间隔（分钟）
   */
  async setSyncInterval(minutes: number): Promise<void> {
    await this.set(CONFIG_KEYS.SYNC_INTERVAL, minutes);
  }

  /**
   * 获取启用状态
   */
  async getEnabled(): Promise<boolean> {
    return this.get(CONFIG_KEYS.ENABLED, false);
  }

  /**
   * 设置启用状态
   */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.set(CONFIG_KEYS.ENABLED, enabled);

    // 更新定时任务
    await chrome.runtime.sendMessage({ type: 'UPDATE_ALARMS' });
  }

  // ============================================
  // 飞书配置方法
  // ============================================

  /**
   * 获取飞书 App ID
   */
  async getFeishuAppId(): Promise<string | undefined> {
    return this.get(CONFIG_KEYS.FEISHU_APP_ID, undefined);
  }

  /**
   * 设置飞书 App ID
   */
  async setFeishuAppId(appId: string): Promise<void> {
    await this.set(CONFIG_KEYS.FEISHU_APP_ID, appId);
  }

  /**
   * 获取飞书 App Secret
   */
  async getFeishuAppSecret(): Promise<string | undefined> {
    return this.get(CONFIG_KEYS.FEISHU_APP_SECRET, undefined);
  }

  /**
   * 设置飞书 App Secret
   */
  async setFeishuAppSecret(appSecret: string): Promise<void> {
    await this.set(CONFIG_KEYS.FEISHU_APP_SECRET, appSecret);
  }

  /**
   * 获取飞书群聊 ID
   */
  async getFeishuChatId(): Promise<string | undefined> {
    return this.get(CONFIG_KEYS.FEISHU_CHAT_ID, undefined);
  }

  /**
   * 设置飞书群聊 ID
   */
  async setFeishuChatId(chatId: string): Promise<void> {
    await this.set(CONFIG_KEYS.FEISHU_CHAT_ID, chatId);
  }

  /**
   * 获取推送渠道
   */
  async getNotifyChannel(): Promise<NotifyChannel> {
    return this.get(CONFIG_KEYS.NOTIFY_CHANNEL, 'feishu');
  }

  /**
   * 设置推送渠道
   */
  async setNotifyChannel(channel: NotifyChannel): Promise<void> {
    await this.set(CONFIG_KEYS.NOTIFY_CHANNEL, channel);
  }

  // ============================================
  // 定时推送配置方法
  // ============================================

  /**
   * 获取定时推送时间
   * @returns 推送时间字符串 "HH:MM"，默认 "09:00"
   */
  async getPushTime(): Promise<string> {
    return this.get(CONFIG_KEYS.PUSH_TIME, '09:00');
  }

  /**
   * 设置定时推送时间
   * @param time 时间字符串 "HH:MM"
   */
  async setPushTime(time: string): Promise<void> {
    await this.set(CONFIG_KEYS.PUSH_TIME, time);
    // 通知 Service Worker 更新 alarm
    await chrome.runtime.sendMessage({ type: 'UPDATE_PUSH_ALARM' });
  }

  /**
   * 获取定时推送启用状态
   */
  async getPushEnabled(): Promise<boolean> {
    return this.get(CONFIG_KEYS.PUSH_ENABLED, false);
  }

  /**
   * 设置定时推送启用状态
   */
  async setPushEnabled(enabled: boolean): Promise<void> {
    await this.set(CONFIG_KEYS.PUSH_ENABLED, enabled);
    // 通知 Service Worker 更新 alarm
    await chrome.runtime.sendMessage({ type: 'UPDATE_PUSH_ALARM' });
  }

  /**
   * 获取用户配置对象
   */
  async getUserConfig(): Promise<UserConfig> {
    const result = await chrome.storage.local.get([
      CONFIG_KEYS.DINGTALK_WEBHOOK,
      CONFIG_KEYS.FEISHU_APP_ID,
      CONFIG_KEYS.FEISHU_APP_SECRET,
      CONFIG_KEYS.FEISHU_CHAT_ID,
      CONFIG_KEYS.NOTIFY_CHANNEL,
      CONFIG_KEYS.PUSH_TIME,
      CONFIG_KEYS.PUSH_ENABLED,
      CONFIG_KEYS.SYNC_INTERVAL,
      CONFIG_KEYS.ENABLED
    ]);

    return {
      dingtalk_webhook: result[CONFIG_KEYS.DINGTALK_WEBHOOK],
      feishu_app_id: result[CONFIG_KEYS.FEISHU_APP_ID],
      feishu_app_secret: result[CONFIG_KEYS.FEISHU_APP_SECRET],
      feishu_chat_id: result[CONFIG_KEYS.FEISHU_CHAT_ID],
      notify_channel: result[CONFIG_KEYS.NOTIFY_CHANNEL] || 'feishu',
      push_time: result[CONFIG_KEYS.PUSH_TIME] || '09:00',
      push_enabled: result[CONFIG_KEYS.PUSH_ENABLED] || false,
      sync_interval: result[CONFIG_KEYS.SYNC_INTERVAL] || 30,
      enabled: result[CONFIG_KEYS.ENABLED] || false
    };
  }

  /**
   * 保存用户配置对象
   */
  async setUserConfig(userConfig: UserConfig): Promise<void> {
    const data: Record<string, any> = {};

    if (userConfig.dingtalk_webhook !== undefined) {
      data[CONFIG_KEYS.DINGTALK_WEBHOOK] = userConfig.dingtalk_webhook;
    }
    if (userConfig.feishu_app_id !== undefined) {
      data[CONFIG_KEYS.FEISHU_APP_ID] = userConfig.feishu_app_id;
    }
    if (userConfig.feishu_app_secret !== undefined) {
      data[CONFIG_KEYS.FEISHU_APP_SECRET] = userConfig.feishu_app_secret;
    }
    if (userConfig.feishu_chat_id !== undefined) {
      data[CONFIG_KEYS.FEISHU_CHAT_ID] = userConfig.feishu_chat_id;
    }
    if (userConfig.notify_channel !== undefined) {
      data[CONFIG_KEYS.NOTIFY_CHANNEL] = userConfig.notify_channel;
    }
    if (userConfig.push_time !== undefined) {
      data[CONFIG_KEYS.PUSH_TIME] = userConfig.push_time;
    }
    if (userConfig.push_enabled !== undefined) {
      data[CONFIG_KEYS.PUSH_ENABLED] = userConfig.push_enabled;
    }
    if (userConfig.sync_interval !== undefined) {
      data[CONFIG_KEYS.SYNC_INTERVAL] = userConfig.sync_interval;
    }
    if (userConfig.enabled !== undefined) {
      data[CONFIG_KEYS.ENABLED] = userConfig.enabled;
    }

    await chrome.storage.local.set(data);

    // 如果启用状态改变，更新定时任务
    if (userConfig.enabled !== undefined) {
      await chrome.runtime.sendMessage({ type: 'UPDATE_ALARMS' });
    }

    // 如果定时推送配置改变，更新推送 alarm
    if (userConfig.push_time !== undefined || userConfig.push_enabled !== undefined) {
      await chrome.runtime.sendMessage({ type: 'UPDATE_PUSH_ALARM' });
    }
  }
}

// 导出单例
export const config = new ConfigManager();
