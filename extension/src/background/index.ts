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
import { runScheduledPush } from "./tasks/scheduled-push";
import { closeCreatedTab } from "~lib/api/bridge-handler";
import { config } from "~lib/storage/config";

console.log("[SW] Service Worker 加载成功")

// ============================================
// 扩展安装/更新事件
// ============================================

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[SW] 扩展已安装/更新:", details.reason)

  if (details.reason === 'install') {
    await handleFirstInstall();
  } else if (details.reason === 'update') {
    await handleUpdate(details.previousVersion);
  }
})

/**
 * 首次安装处理
 */
async function handleFirstInstall() {
  console.log("[SW] 首次安装，初始化中...")

  try {
    // 初始化 IndexedDB
    await db.init()
    console.log("[SW] IndexedDB 初始化成功")

    // 初始化配置
    await chrome.storage.local.set({
      enabled: false, // 默认不启用自动同步
      sync_interval: 30, // 默认 30 分钟
      task_state: {
        status: "idle",
        progress: 0,
        totalMalls: 0,
        completedMalls: 0,
        logs: []
      },
      pushed_records: {
        unpublished_keys: []
      }
    })
    console.log("[SW] 配置初始化成功")

    // 创建定时任务（默认不启用）
    // 用户在 Options 页面启用后才会生效
    await createAlarms()
    console.log("[SW] 定时任务创建成功")
  } catch (error) {
    console.error("[SW] 初始化失败:", error)
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
// 消息处理
// ============================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'UPDATE_ALARMS') {
    console.log('[SW] 收到 UPDATE_ALARMS 消息，更新定时任务');
    createAlarms()
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('[SW] 更新定时任务失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 表示异步响应
  }

  if (message.type === 'UPDATE_PUSH_ALARM') {
    console.log('[SW] 收到 UPDATE_PUSH_ALARM 消息，更新定时推送任务');
    createPushAlarm()
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('[SW] 更新定时推送任务失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 表示异步响应
  }
});

// ============================================
// 定时任务管理
// ============================================

/**
 * 创建定时任务
 */
async function createAlarms() {
  const storageData = await chrome.storage.local.get(['sync_interval', 'enabled']);
  const interval = storageData.sync_interval || 30;
  const enabled = storageData.enabled || false;

  if (enabled) {
    await chrome.alarms.create('unpublished-monitor', {
      periodInMinutes: interval
    })
    console.log(
      "[SW] 已创建定时任务: unpublished-monitor, 间隔:",
      interval,
      "分钟"
    )
  } else {
    await chrome.alarms.clear('unpublished-monitor');
    console.log('[SW] 已清除定时任务（未启用）');
  }

  // 清理过期缓存任务（每小时执行一次）
  await chrome.alarms.create("cleanup-cache", {
    periodInMinutes: 60
  });
  console.log('[SW] 已创建定时任务: cleanup-cache');

  // 创建定时推送任务
  await createPushAlarm();
}

/**
 * 创建定时推送任务
 *
 * 根据配置的推送时间创建 alarm
 * 每天在指定时间触发一次
 */
async function createPushAlarm() {
  const pushEnabled = await config.getPushEnabled();
  const pushTime = await config.getPushTime();

  if (!pushEnabled) {
    await chrome.alarms.clear('scheduled-push');
    console.log('[SW] 定时推送未启用，已清除 alarm');
    return;
  }

  // 解析时间 "HH:MM"
  const [hours, minutes] = pushTime.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    console.error('[SW] 推送时间格式错误:', pushTime);
    return;
  }

  // 计算下次触发时间
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // 如果今天的时间已过，设置为明天
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delayInMinutes = (target.getTime() - now.getTime()) / (1000 * 60);

  // 创建 alarm（每 24 小时重复）
  await chrome.alarms.create('scheduled-push', {
    delayInMinutes,
    periodInMinutes: 24 * 60  // 每天重复
  });

  console.log(
    '[SW] 已创建定时推送任务: scheduled-push',
    '\n    推送时间:', pushTime,
    '\n    下次触发:', target.toLocaleString(),
    '\n    延迟分钟:', Math.round(delayInMinutes)
  );
}

/**
 * 定时任务触发
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log("[SW] 定时任务触发:", alarm.name)

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

      // case 'cleanup-cache':
      //   const deleted = await db.clearExpiredCache();
      //   console.log('[SW] 清理过期缓存完成，删除', deleted, '条');
      //   break;

      case 'scheduled-push':
        console.log('[SW] 执行定时推送任务');
        await waitUntil(
          (async () => {
            const pushResult = await runScheduledPush();
            if (pushResult.success) {
              console.log(
                '[SW] 定时推送完成',
                '\n    店铺数:', pushResult.mallCount,
                '\n    SKC 数:', pushResult.pushedCount
              );
            } else {
              console.error('[SW] 定时推送失败:', pushResult.errors);
            }
          })()
        );
        break;

      default:
        console.warn("[SW] 未知的定时任务:", alarm.name)
    }
  } catch (error) {
    console.error("[SW] 定时任务执行失败:", error)
  }
})

// ============================================
// 消息路由
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 跳过 Plasmo messaging 格式的消息（由 Plasmo 的 handler 处理）
  // Plasmo 消息格式: { name: "handler-name", body: {...} }
  if (message.name && typeof message.body !== "undefined") {
    // 不处理，让 Plasmo messaging handler 处理
    return false
  }

  // 只处理有 type 字段的自定义消息
  if (!message.type) {
    // 未知格式，不处理，让其他 handler 处理
    return false
  }

  console.log(
    "[SW] 收到消息:",
    message.type,
    "from:",
    sender.tab?.id || "extension"
  )

  // 使用 async IIFE 处理异步消息
  ;(async () => {
    try {
      switch (message.type) {
        case "ping":
          // Ping 测试
          sendResponse({ ok: true, message: "Service Worker 运行中" })
          break

        case "BRIDGE_REQUEST":
          // 跨域请求代理
          const result = await handleBridgeRequest(message)
          sendResponse(result)
          break

        case "UPDATE_ALARMS":
          // 更新定时任务
          await createAlarms()
          sendResponse({ success: true })
          break

        default:
          // 未知类型，不响应（可能是其他 handler 处理的消息）
          // 不调用 sendResponse，让消息通道自然关闭
          return
      }
    } catch (error) {
      console.error("[SW] 处理消息失败:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })()

  // 返回 true 保持消息通道开放（异步响应）
  return true
})

// ============================================
// 跨域请求代理（Content Script Bridge）
// ============================================

/**
 * 处理跨域请求
 * 通过 Content Script Bridge 在 Temu 域发送请求
 */
async function handleBridgeRequest(message: {
  targetHost: string
  requestData: any
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const { targetHost, requestData } = message

  try {
    // 1. 查找目标域的标签页
    const tabs = await chrome.tabs.query({})
    const targetTab = tabs.find((tab) => {
      try {
        const url = new URL(tab.url || "")
        return url.hostname.includes(targetHost)
      } catch {
        return false
      }
    })

    if (!targetTab || !targetTab.id) {
      return {
        success: false,
        error: `未找到 ${targetHost} 的标签页，请先登录 Temu 卖家中心`
      }
    }

    // 2. Ping 检测 Content Script 是否就绪（带重试）
    let pingSuccess = false
    for (let i = 0; i < 10; i++) {
      try {
        const ping = await chrome.tabs.sendMessage(targetTab.id, {
          type: "ping"
        })
        if (ping?.ok) {
          console.log("[SW] Bridge Ping 成功:", ping.host)
          pingSuccess = true
          break
        }
      } catch {
        console.log("[SW] Bridge Ping 失败，重试中...", i + 1)
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    if (!pingSuccess) {
      // 尝试重新注入 Content Script
      console.log("[SW] 尝试重新注入 Content Script")
      try {
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ["contents/temu-bridge.js"]
        })
        await new Promise((r) => setTimeout(r, 1000))
      } catch (injectError) {
        console.error("[SW] 注入 Content Script 失败:", injectError)
      }
    }

    // 3. 发送实际请求
    const response = await chrome.tabs.sendMessage(targetTab.id, requestData)

    if (!response?.ok) {
      return {
        success: false,
        error: response?.error || "请求失败"
      }
    }

    return {
      success: true,
      data: response
    }
  } catch (error) {
    console.error("[SW] Bridge 请求失败:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// ============================================
// 保活机制（waitUntil 模式）
// ============================================

/**
 * 官方推荐的 waitUntil 辅助函数
 * 通过定期调用扩展 API 保持 Service Worker 活跃
 */
async function waitUntil(promise: Promise<any>): Promise<any> {
  const keepAlive = setInterval(() => {
    chrome.runtime.getPlatformInfo()
  }, 25 * 1000) // 每 25 秒 Ping 一次

  try {
    return await promise
  } finally {
    clearInterval(keepAlive)
  }
}

// ============================================
// 错误处理
// ============================================

self.addEventListener('error', (event) => {
  console.error('[SW] 全局错误:', event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error("[SW] 未处理的 Promise 拒绝:", event.reason)
});

// ============================================
// 初始化
// ============================================

;(async () => {
  try {
    await db.init()
    console.log("[SW] 数据库初始化成功")
  } catch (error) {
    console.error("[SW] 数据库初始化失败:", error)
  }
})()
