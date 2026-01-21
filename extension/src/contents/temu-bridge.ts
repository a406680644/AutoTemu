/**
 * Temu Content Script Bridge
 *
 * 在 Temu 域页面上下文中执行，作为跨域请求的桥接
 * 核心功能：
 * - 监听来自 Background 的消息
 * - 使用页面上下文发送请求（自动携带 Cookie）
 * - 返回响应数据
 */

import type { PlasmoCSConfig } from "plasmo"

// Plasmo Content Script 配置
export const config: PlasmoCSConfig = {
  matches: ["https://agentseller.temu.com/*"],
  run_at: "document_end",
  all_frames: false
}

console.log("[Bridge] 加载成功, 域名:", location.host)

// ============================================
// 消息监听器
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 使用 async IIFE 保持消息通道开放
  ;(async () => {
    try {
      // Ping 检测 - 验证 bridge 是否就绪
      if (message?.type === "ping") {
        sendResponse({
          ok: true,
          host: location.host,
          url: location.href
        })
        return
      }

      // 处理 fetch 请求
      if (message?.type === "bridge-fetch") {
        const response = await handleBridgeFetch(message.payload)
        sendResponse(response)
        return
      }

      // 未知消息类型
      sendResponse({
        ok: false,
        error: "未知的消息类型: " + message?.type
      })
    } catch (error) {
      console.error("[Bridge] 处理消息失败:", error)
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })()

  // 必须返回 true 以保持消息通道开放（异步响应）
  return true
})

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
    console.log("[Bridge] 发送请求:", method, url)

    // 发送请求（关键：credentials: 'include' 携带 Cookie）
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include" // ⭐ 关键：携带目标域的 Cookie
    })

    // 解析响应
    const contentType = response.headers.get("content-type")
    let responseData: any

    if (contentType?.includes("application/json")) {
      responseData = await response.json()
    } else {
      responseData = await response.text()
    }

    console.log("[Bridge] 请求成功:", response.status, url)

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
// 页面加载完成事件
// ============================================

// 页面加载完成后通知 Background
window.addEventListener("load", () => {
  console.log("[Bridge] 页面加载完成")
})
