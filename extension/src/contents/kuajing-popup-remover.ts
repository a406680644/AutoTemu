/**
 * 跨境卖家中心 - 手动去除弹窗
 *
 * 在 seller.kuajingmaihuo.com 页面注入一个浮动按钮，
 * 点击后移除平台弹窗和遮罩层。
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://seller.kuajingmaihuo.com/*"],
  run_at: "document_end",
  all_frames: false
}

const BUTTON_ID = "kuajing-manual-remove-popup"

/** 移除弹窗和遮罩层 */
function removePopupAndMask(): void {
  let removed = 0

  // 1. 移除遮罩层（data-testid 匹配）
  document
    .querySelectorAll('[data-testid="beast-core-modal-mask"]')
    .forEach((el) => {
      el.remove()
      removed++
    })

  // 2. 移除弹窗外层包装（类名前缀匹配）
  document
    .querySelectorAll('[class^="MDL_outerWrapper_5-"]')
    .forEach((el) => {
      el.remove()
      removed++
    })

  // 3. 移除包含弹窗内层的顶级 div
  document
    .querySelectorAll('body > div:has(div[class^="MDL_innerWrapper_5-"])')
    .forEach((el) => {
      el.remove()
      removed++
    })

  // 4. 恢复 body 滚动（弹窗常会锁定 body overflow）
  if (document.body.style.overflow === "hidden") {
    document.body.style.overflow = ""
  }

  console.log(`[PopupRemover] 已移除 ${removed} 个弹窗/遮罩元素`)
}

/** 创建手动去除弹窗按钮 */
function createRemoveButton(): void {
  if (document.getElementById(BUTTON_ID)) return

  const btn = document.createElement("button")
  btn.id = BUTTON_ID
  btn.textContent = "去除弹窗"
  btn.style.cssText = [
    "position: fixed",
    "top: 100px",
    "right: 20px",
    "z-index: 99999",
    "cursor: pointer",
    "padding: 8px 14px",
    "color: #fff",
    "background: #e74c3c",
    "border: none",
    "border-radius: 6px",
    "font-size: 14px",
    "box-shadow: 0 2px 8px rgba(0,0,0,0.25)",
    "transition: opacity .2s",
    "opacity: 0.85",
  ].join(";")

  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "1"
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "0.85"
  })
  btn.addEventListener("click", removePopupAndMask)

  document.body.appendChild(btn)
  console.log("[PopupRemover] 按钮已创建")
}

// 页面加载后创建按钮
if (document.readyState === "complete") {
  createRemoveButton()
} else {
  window.addEventListener("load", createRemoveButton)
}

console.log("[PopupRemover] Content Script 已加载 - seller.kuajingmaihuo.com")
