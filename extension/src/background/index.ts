/**
 * AutoTemu Service Worker 入口
 *
 * 核心功能：
 * - 扩展生命周期管理
 * - 定时任务调度（chrome.alarms）
 * - 保活机制（waitUntil）
 *
 * 注意：消息处理由 Plasmo Messaging 自动管理（background/messages/*.ts）
 */

import db from "~lib/storage/idb";
import { runUnpublishedMonitor } from "./tasks/unpublished-monitor";
import { closeCreatedTab } from "~lib/api/bridge-handler";

console.log('[SW] Service Worker 加载成功');

// ============================================
// 扩展安装/更新事件
// ============================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SW] 扩展已安装/更新:', details.reason);

  if (details.reason === 'install') {
    await handleFirstInstall();
  } else if (details.reason === 'update') {
    await handleUpdate(details.previousVersion);
  }
});

/**
 * 首次安装处理
 */
async function handleFirstInstall() {
  console.log('[SW] 首次安装，初始化中...');

  try {
    // 初始化 IndexedDB
    await db.init();
    console.log('[SW] IndexedDB 初始化成功');

    // 初始化配置
    await chrome.storage.local.set({
      enabled: false,
      sync_interval: 30,
      task_state: {
        status: 'idle',
        progress: 0,
        totalMalls: 0,
        completedMalls: 0,
        logs: []
      },
      pushed_records: {
        unpublished_keys: []
      }
    });
    console.log('[SW] 配置初始化成功');

    // 创建定时任务
    await createAlarms();
    console.log('[SW] 定时任务创建成功');

  } catch (error) {
    console.error('[SW] 初始化失败:', error);
  }
}

/**
 * 更新处理
 */
async function handleUpdate(previousVersion?: string) {
  console.log('[SW] 从版本', previousVersion, '更新');
}

// ============================================
// 扩展启动事件
// ============================================

chrome.runtime.onStartup.addListener(() => {
  console.log('[SW] 浏览器启动，扩展激活');
});

// ============================================
// 定时任务管理
// ============================================

/**
 * 创建定时任务
 */
async function createAlarms() {
  const config = await chrome.storage.local.get(['sync_interval', 'enabled']);
  const interval = config.sync_interval || 30;
  const enabled = config.enabled || false;

  if (enabled) {
    await chrome.alarms.create('unpublished-monitor', {
      periodInMinutes: interval
    });
    console.log('[SW] 已创建定时任务: unpublished-monitor, 间隔:', interval, '分钟');
  } else {
    await chrome.alarms.clear('unpublished-monitor');
    console.log('[SW] 已清除定时任务（未启用）');
  }

  // 清理过期缓存任务（每小时执行一次）
  await chrome.alarms.create('cleanup-cache', {
    periodInMinutes: 60
  });
  console.log('[SW] 已创建定时任务: cleanup-cache');
}

/**
 * 定时任务触发
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('[SW] 定时任务触发:', alarm.name);

  try {
    switch (alarm.name) {
      case 'unpublished-monitor':
        console.log('[SW] 执行下架监控任务');
        await waitUntil(
          runUnpublishedMonitor()
            .finally(() => closeCreatedTab())
        );
        console.log('[SW] 下架监控任务完成');
        break;

      case 'cleanup-cache':
        const deleted = await db.clearExpiredCache();
        console.log('[SW] 清理过期缓存完成，删除', deleted, '条');
        break;

      default:
        console.warn('[SW] 未知的定时任务:', alarm.name);
    }
  } catch (error) {
    console.error('[SW] 定时任务执行失败:', error);
  }
});

// ============================================
// 保活机制（waitUntil 模式）
// ============================================

/**
 * 官方推荐的 waitUntil 辅助函数
 * 通过定期调用扩展 API 保持 Service Worker 活跃
 */
async function waitUntil(promise: Promise<any>): Promise<any> {
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo();
  }, 25 * 1000);

  try {
    return await promise;
  } finally {
    clearInterval(keepAlive);
  }
}

// ============================================
// 错误处理
// ============================================

self.addEventListener('error', (event) => {
  console.error('[SW] 全局错误:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] 未处理的 Promise 拒绝:', event.reason);
});

// ============================================
// 初始化
// ============================================

(async () => {
  try {
    await db.init();
    console.log('[SW] 数据库初始化成功');
  } catch (error) {
    console.error('[SW] 数据库初始化失败:', error);
  }
})();
