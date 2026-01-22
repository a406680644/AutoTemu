/**
 * Temu Content Script Bridge
 *
 * 在 Temu 域页面上下文中执行，作为跨域请求的桥接
 *
 * 采用参考项目验证过的模式：
 * - 使用 async IIFE + return true 保持消息通道开放
 * - Ping 同步响应
 * - fetch 异步响应
 */

import type { PlasmoCSConfig } from "plasmo"

// Plasmo Content Script 配置
export const config: PlasmoCSConfig = {
  matches: ["https://agentseller.temu.com/*"],
  run_at: "document_end",
  all_frames: false
}

console.log('[Bridge] Content Script 加载成功');
console.log('[Bridge] 当前域名:', location.host);
console.log('[Bridge] 当前 URL:', location.href);

// ============================================
// 消息监听器 - 参考项目模式
// ============================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 使用 async IIFE 处理异步操作
  (async () => {
    console.log('[Bridge] 收到消息:', msg?.type, msg);

    try {
      // Ping 检测
      if (msg?.type === 'ping') {
        console.log('[Bridge] 响应 Ping');
        sendResponse({
          ok: true,
          host: location.host,
          url: location.href
        })
        return
      }

      // 处理 fetch 请求
      if (msg?.type === 'bridge-fetch') {
        console.log('[Bridge] 处理 fetch 请求');

        try {
          const response = await handleBridgeFetch(msg.payload);
          console.log('[Bridge] fetch 响应:', response.ok, response.status);
          sendResponse(response);
        } catch (error) {
          console.error('[Bridge] fetch 错误:', error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return;
      }

      // 未知消息类型
      console.log('[Bridge] 未知消息类型:', msg?.type);
      sendResponse({
        ok: false,
        error: '未知的消息类型: ' + msg?.type
      });

    } catch (e) {
      console.error('[Bridge] 消息处理错误:', e);
      sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  })()

  return true; // 关键：保持消息通道开放以支持异步响应
});

// ============================================
// Fetch 请求处理
// ============================================

/**
 * 处理跨域 fetch 请求
 * 在页面上下文中发送请求，自动携带 Cookie
 */
async function handleBridgeFetch(payload: {
  url: string
  method?: string
  data?: any
  headers?: Record<string, string>
}): Promise<{
  ok: boolean
  status?: number
  data?: any
  error?: string
}> {
  const { url, method = "POST", data, headers = {} } = payload

  try {
    // 构建请求头（参考项目模式）
    const finalHeaders = {
      'Content-Type': 'application/json',
      'Origin': location.origin,
      'Referer': location.href,  // 必须是完整路径
      ...headers
    };

    console.log('[Bridge] 发送请求:', method, url);
    console.log('[Bridge] 请求头:', JSON.stringify(finalHeaders));
    console.log('[Bridge] 请求体:', data ? JSON.stringify(data) : 'null');

    // 发送请求（关键：credentials: 'include' 携带 Cookie）
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: data ? JSON.stringify(data) : undefined,
      credentials: 'include'  // 携带目标域的 Cookie
    });

    // 解析响应
    const contentType = response.headers.get("content-type")
    let responseData: any

    if (contentType?.includes("application/json")) {
      responseData = await response.json()
    } else {
      responseData = await response.text()
    }

    console.log('[Bridge] 请求成功:', response.status);

    return {
      ok: response.ok,
      status: response.status,
      data: responseData
    }
  } catch (error) {
    console.error("[Bridge] 请求失败:", error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// ============================================
// 初始化完成通知
// ============================================

console.log('[Bridge] 消息监听器已注册，等待消息...');
