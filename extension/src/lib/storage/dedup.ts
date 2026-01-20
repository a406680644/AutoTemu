/**
 * 去重逻辑工具
 *
 * 用于判断下架记录是否已推送，避免重复通知
 */

import { CONFIG_KEYS } from '~types/storage';

/**
 * 生成日期字符串（YYYY-MM-DD）
 */
export function formatDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 生成已下架记录的唯一键
 * 格式：mallId:skcId:date（同一店铺同一SKC同一天只推送一次）
 */
export function generateUnpublishedKey(
  mallId: string,
  skcId: string,
  unPublishedTime: number
): string {
  const date = formatDateKey(unPublishedTime);
  return `${mallId}:${skcId}:${date}`;
}

/**
 * 去重管理器
 */
class DedupManager {
  /**
   * 获取已推送的记录键集合
   */
  private async getPushedKeys(): Promise<Set<string>> {
    const result = await chrome.storage.local.get(CONFIG_KEYS.PUSHED_RECORDS);
    const record = result[CONFIG_KEYS.PUSHED_RECORDS] || { unpublished_keys: [] };
    return new Set(record.unpublished_keys);
  }

  /**
   * 保存已推送的记录键集合
   */
  private async savePushedKeys(keys: Set<string>): Promise<void> {
    await chrome.storage.local.set({
      [CONFIG_KEYS.PUSHED_RECORDS]: {
        unpublished_keys: Array.from(keys)
      }
    });
  }

  /**
   * 判断下架记录是否为新记录（未推送过）
   * 使用 mallId + skcId + date 去重
   */
  async isNewUnpublished(
    mallId: string,
    skcId: string,
    unPublishedTime: number
  ): Promise<boolean> {
    const key = generateUnpublishedKey(mallId, skcId, unPublishedTime);
    const pushedKeys = await this.getPushedKeys();
    return !pushedKeys.has(key);
  }

  /**
   * 标记记录为已推送
   */
  async markAsPushed(keys: string[]): Promise<void> {
    const pushedKeys = await this.getPushedKeys();
    keys.forEach(key => pushedKeys.add(key));
    await this.savePushedKeys(pushedKeys);
  }

  /**
   * 批量判断哪些记录是新记录
   * @returns 新记录的键数组
   */
  async filterNewRecords(records: Array<{
    mallId: string;
    skcId: string;
    unPublishedTime: number;
  }>): Promise<string[]> {
    const pushedKeys = await this.getPushedKeys();
    const newKeys: string[] = [];

    for (const record of records) {
      const key = generateUnpublishedKey(
        record.mallId,
        record.skcId,
        record.unPublishedTime
      );
      if (!pushedKeys.has(key)) {
        newKeys.push(key);
      }
    }

    return newKeys;
  }

  /**
   * 清理过期的已推送记录（保留最近 N 天）
   */
  async cleanupOldRecords(daysToKeep: number = 30): Promise<number> {
    const pushedKeys = await this.getPushedKeys();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffDateStr = formatDateKey(cutoffDate.getTime());
    let deletedCount = 0;

    const keysToKeep = new Set<string>();
    for (const key of pushedKeys) {
      // 解析日期（格式：mallId:skcId:YYYY-MM-DD）
      const parts = key.split(':');
      if (parts.length >= 3) {
        const dateStr = parts[2];
        if (dateStr >= cutoffDateStr) {
          keysToKeep.add(key);
        } else {
          deletedCount++;
        }
      }
    }

    await this.savePushedKeys(keysToKeep);
    return deletedCount;
  }

  /**
   * 获取已推送记录的统计信息
   */
  async getStats(): Promise<{
    total: number;
    byMall: Map<string, number>;
  }> {
    const pushedKeys = await this.getPushedKeys();
    const byMall = new Map<string, number>();

    for (const key of pushedKeys) {
      const mallId = key.split(':')[0];
      byMall.set(mallId, (byMall.get(mallId) || 0) + 1);
    }

    return {
      total: pushedKeys.size,
      byMall
    };
  }

  /**
   * 清空所有已推送记录
   */
  async clearAll(): Promise<void> {
    await this.savePushedKeys(new Set());
  }
}

// 导出单例
export const dedup = new DedupManager();
