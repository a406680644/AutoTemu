/**
 * Runner 页面重定向
 *
 * 保留此文件用于向后兼容
 * 自动重定向到新的主应用页面
 */

import { useEffect } from "react"

export default function RunnerRedirect() {
  useEffect(() => {
    // 重定向到新的主应用页面，保持 runner 模块
    window.location.replace(chrome.runtime.getURL("tabs/main.html#runner"))
  }, [])

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#6b7280"
      }}>
      正在跳转...
    </div>
  )
}
