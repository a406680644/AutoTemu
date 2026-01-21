/**
 * 配置存储工具
 *
 * 封装 chrome.storage.local 操作，提供类型安全的配置读写
 */

import type { UserConfig } from "~types/storage"
import { CONFIG_KEYS } from "~types/storage"

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
    const result = await chrome.storage.local.get(key)
    return (result[key] ?? defaultValue) as T
  }

  /**
   * 设置配置值
   * @param key 配置键
   * @param value 配置值
   */
  async set(key: string, value: any): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  }

  /**
   * 获取所有配置
   */
  async getAll(): Promise<Record<string, any>> {
    const result = await chrome.storage.local.get(null)
    return result as unknown as Record<string, any>
  }

  /**
   * 删除配置
   */
  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(key)
  }

  // ============================================
  // 快捷方法（类型安全）
  // ============================================

  /**
   * 获取钉钉 Webhook URL
   */
  async getDingtalkWebhook(): Promise<string | undefined> {
    return this.get(CONFIG_KEYS.DINGTALK_WEBHOOK, undefined)
  }

  /**
   * 设置钉钉 Webhook URL
   */
  async setDingtalkWebhook(url: string): Promise<void> {
    await this.set(CONFIG_KEYS.DINGTALK_WEBHOOK, url)
  }

  /**
   * 获取同步间隔（分钟）
   */
  async getSyncInterval(): Promise<number> {
    return this.get(CONFIG_KEYS.SYNC_INTERVAL, 30)
  }

  /**
   * 设置同步间隔（分钟）
   */
  async setSyncInterval(minutes: number): Promise<void> {
    await this.set(CONFIG_KEYS.SYNC_INTERVAL, minutes)
  }

  /**
   * 获取启用状态
   */
  async getEnabled(): Promise<boolean> {
    return this.get(CONFIG_KEYS.ENABLED, false)
  }

  /**
   * 设置启用状态
   */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.set(CONFIG_KEYS.ENABLED, enabled)

    // 更新定时任务
    await chrome.runtime.sendMessage({ type: "UPDATE_ALARMS" })
  }

  /**
   * 获取用户配置对象
   */
  async getUserConfig(): Promise<UserConfig> {
    const result = await chrome.storage.local.get([
      CONFIG_KEYS.DINGTALK_WEBHOOK,
      CONFIG_KEYS.SYNC_INTERVAL,
      CONFIG_KEYS.ENABLED
    ])

    return {
      dingtalk_webhook: result[CONFIG_KEYS.DINGTALK_WEBHOOK],
      sync_interval: result[CONFIG_KEYS.SYNC_INTERVAL] || 30,
      enabled: result[CONFIG_KEYS.ENABLED] || false
    }
  }

  /**
   * 保存用户配置对象
   */
  async setUserConfig(config: UserConfig): Promise<void> {
    const data: Record<string, any> = {}

    if (config.dingtalk_webhook !== undefined) {
      data[CONFIG_KEYS.DINGTALK_WEBHOOK] = config.dingtalk_webhook
    }
    if (config.sync_interval !== undefined) {
      data[CONFIG_KEYS.SYNC_INTERVAL] = config.sync_interval
    }
    if (config.enabled !== undefined) {
      data[CONFIG_KEYS.ENABLED] = config.enabled
    }

    await chrome.storage.local.set(data)

    // 如果启用状态改变，更新定时任务
    if (config.enabled !== undefined) {
      await chrome.runtime.sendMessage({ type: "UPDATE_ALARMS" })
    }
  }
}

// 导出单例
export const config = new ConfigManager()
