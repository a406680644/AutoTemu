/**
 * 聚水潭ERP Content Script
 *
 * 在聚水潭ERP页面上下文中执行：
 * - 监听商品弹窗出现
 * - 提取SKU ID
 * - 调用亚杰API查询在途数量
 * - 回填数据到弹窗
 */

import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

import type {
  YajiePurchaseOrder,
  YajiePurchaseOrderResponse,
  YajieTransitQueryResponse
} from "~types/yajie"

// Plasmo Content Script 配置
export const config: PlasmoCSConfig = {
  matches: ["https://*.erp321.com/*"],
  run_at: "document_end",
  all_frames: true  // 在 iframe 中也运行，因为弹窗在 list.aspx iframe 中
}

console.log("[JST-Stock] 聚水潭库存脚本加载成功")

// ============================================
// 模块级变量
// ============================================

// MutationObserver 实例，用于清理
let observer: MutationObserver | null = null

// ============================================
// 样式定义
// ============================================

const STYLES = {
  // 主显示区域样式（右浮动）
  container: `
    display: inline-flex;
    align-items: center;
    float: right;
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    background-color: #e6f7ff;
    border: 1px solid #91d5ff;
    color: #1890ff;
  `,
  loading: `
    display: inline-flex;
    align-items: center;
    float: right;
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    background-color: #f5f5f5;
    border: 1px solid #d9d9d9;
    color: #999;
  `,
  error: `
    display: inline-flex;
    align-items: center;
    float: right;
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    background-color: #fff2f0;
    border: 1px solid #ffccc7;
    color: #ff4d4f;
  `,
  // 悬浮面板样式（内联，在右侧）
  hoverContainer: `
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    background-color: #e6f7ff;
    border: 1px solid #91d5ff;
    color: #1890ff;
  `,
  hoverLoading: `
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    background-color: #f5f5f5;
    border: 1px solid #d9d9d9;
    color: #999;
  `,
  hoverError: `
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
    background-color: #fff2f0;
    border: 1px solid #ffccc7;
    color: #ff4d4f;
  `,
  skeleton: `
    display: inline-block;
    width: 40px;
    height: 14px;
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: jst-skeleton 1.5s ease-in-out infinite;
    border-radius: 2px;
  `,
  // 弹窗样式
  modalOverlay: `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 99999;
  `,
  modalContent: `
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    min-width: 800px;
  `,
  modalHeader: `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #e8e8e8;
    background-color: #fafafa;
    border-radius: 8px 8px 0 0;
  `,
  modalTitle: `
    font-size: 16px;
    font-weight: 600;
    color: #333;
    margin: 0;
  `,
  modalCloseBtn: `
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #999;
    padding: 4px 8px;
    line-height: 1;
    border-radius: 4px;
    transition: all 0.2s;
  `,
  modalBody: `
    padding: 16px 20px;
    overflow-x: auto;
    overflow-y: auto;
    max-height: calc(80vh - 100px);
  `,
  table: `
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  `,
  tableHeader: `
    background-color: #fafafa;
    position: sticky;
    top: 0;
  `,
  tableHeaderCell: `
    padding: 10px 12px;
    text-align: left;
    font-weight: 500;
    color: #666;
    border-bottom: 2px solid #e8e8e8;
    white-space: nowrap;
  `,
  tableCell: `
    padding: 10px 12px;
    border-bottom: 1px solid #f0f0f0;
    color: #333;
    vertical-align: top;
  `,
  tableRow: `
    transition: background-color 0.2s;
  `,
  emptyMessage: `
    text-align: center;
    padding: 40px 20px;
    color: #999;
    font-size: 14px;
  `,
  loadingMessage: `
    text-align: center;
    padding: 40px 20px;
    color: #666;
    font-size: 14px;
  `,
  footer: `
    padding: 12px 20px;
    border-top: 1px solid #e8e8e8;
    text-align: center;
    color: #999;
    font-size: 12px;
    background-color: #fafafa;
    border-radius: 0 0 8px 8px;
  `
}

// 注入骨架动画样式
function injectStyles(): void {
  if (document.getElementById("jst-stock-styles")) return

  const style = document.createElement("style")
  style.id = "jst-stock-styles"
  style.textContent = `
    @keyframes jst-skeleton {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `
  document.head.appendChild(style)
}

// ============================================
// 采购单弹窗
// ============================================

// 弹窗实例（全局单例）
let purchaseModal: {
  overlay: HTMLDivElement
  bodyContainer: HTMLDivElement
  titleElement: HTMLElement
  footerElement: HTMLElement
} | null = null

/**
 * 创建采购单弹窗DOM结构
 */
function createPurchaseModal(): NonNullable<typeof purchaseModal> {
  if (purchaseModal) return purchaseModal

  // 遮罩层
  const overlay = document.createElement("div")
  overlay.id = "jst-purchase-modal-overlay"
  overlay.style.cssText = STYLES.modalOverlay
  overlay.style.display = "none"

  // 弹窗内容区
  const content = document.createElement("div")
  content.style.cssText = STYLES.modalContent

  // 头部
  const header = document.createElement("div")
  header.style.cssText = STYLES.modalHeader

  const title = document.createElement("h3")
  title.style.cssText = STYLES.modalTitle
  title.textContent = "采购单详情"

  const closeBtn = document.createElement("button")
  closeBtn.style.cssText = STYLES.modalCloseBtn
  closeBtn.textContent = "×"
  closeBtn.title = "关闭"
  closeBtn.addEventListener("click", hidePurchaseModal)
  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.backgroundColor = "#f0f0f0"
    closeBtn.style.color = "#333"
  })
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.backgroundColor = "transparent"
    closeBtn.style.color = "#999"
  })

  header.appendChild(title)
  header.appendChild(closeBtn)

  // 主体
  const body = document.createElement("div")
  body.style.cssText = STYLES.modalBody

  // 页脚
  const footer = document.createElement("div")
  footer.style.cssText = STYLES.footer
  footer.textContent = "共 0 条采购单"

  content.appendChild(header)
  content.appendChild(body)
  content.appendChild(footer)
  overlay.appendChild(content)

  // 点击遮罩关闭
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      hidePurchaseModal()
    }
  })

  // ESC键关闭
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && purchaseModal?.overlay.style.display !== "none") {
      hidePurchaseModal()
    }
  })

  document.body.appendChild(overlay)

  purchaseModal = {
    overlay,
    bodyContainer: body,
    titleElement: title,
    footerElement: footer
  }

  return purchaseModal
}

/**
 * 显示采购单弹窗（加载状态）
 */
function showPurchaseModalLoading(skuId: string): void {
  const modal = createPurchaseModal()
  modal.titleElement.textContent = `采购单详情 - SKU: ${skuId}`
  modal.bodyContainer.innerHTML = ""

  const loadingDiv = document.createElement("div")
  loadingDiv.style.cssText = STYLES.loadingMessage
  loadingDiv.textContent = "正在加载采购单数据..."
  modal.bodyContainer.appendChild(loadingDiv)

  modal.footerElement.textContent = ""
  modal.overlay.style.display = "flex"
}

/**
 * 更新采购单弹窗内容
 */
function updatePurchaseModal(
  skuId: string,
  orders: YajiePurchaseOrder[],
  error?: string
): void {
  const modal = createPurchaseModal()
  modal.bodyContainer.innerHTML = ""

  if (error) {
    const errorDiv = document.createElement("div")
    errorDiv.style.cssText = STYLES.emptyMessage
    errorDiv.style.color = "#ff4d4f"
    errorDiv.textContent = `加载失败: ${error}`
    modal.bodyContainer.appendChild(errorDiv)
    modal.footerElement.textContent = ""
    return
  }

  if (orders.length === 0) {
    const emptyDiv = document.createElement("div")
    emptyDiv.style.cssText = STYLES.emptyMessage
    emptyDiv.textContent = "暂无采购单数据"
    modal.bodyContainer.appendChild(emptyDiv)
    modal.footerElement.textContent = "共 0 条采购单"
    return
  }

  // 创建表格
  const table = document.createElement("table")
  table.style.cssText = STYLES.table

  // 表头
  const thead = document.createElement("thead")
  thead.style.cssText = STYLES.tableHeader
  const headerRow = document.createElement("tr")

  const headers = [
    "采购单号",
    "供应商",
    "采购员",
    "确认交货日期",
    "采购量",
    "采购单价",
    "签收量",
    "良品量",
    "次品量",
    "上架量",
    "收货仓库",
    "采购备注",
    "创建时间",
    "预计到货时间",
    "物流单号"
  ]

  for (const headerText of headers) {
    const th = document.createElement("th")
    th.style.cssText = STYLES.tableHeaderCell
    th.textContent = headerText
    headerRow.appendChild(th)
  }
  thead.appendChild(headerRow)
  table.appendChild(thead)

  // 表体
  const tbody = document.createElement("tbody")

  for (const order of orders) {
    // 遍历该采购单中匹配的 purchase_stock_list 项
    for (const stockItem of order.purchase_stock_list) {
      const row = document.createElement("tr")
      row.style.cssText = STYLES.tableRow
      row.addEventListener("mouseenter", () => {
        row.style.backgroundColor = "#f5f5f5"
      })
      row.addEventListener("mouseleave", () => {
        row.style.backgroundColor = ""
      })

      const cells = [
        order.purchase_code,
        order.supplier_name,
        order.purchase_name,
        stockItem.estimated_arrival_time || "-",
        String(stockItem.purchase_quantity ?? 0),
        String(stockItem.purchase_price ?? 0),
        String(stockItem.signfor_quantity ?? 0),
        String(stockItem.good_quality ?? 0),
        String(stockItem.defective_quality ?? 0),
        String(stockItem.shelves_quantity ?? 0),
        order.warehouse_name,
        order.remark || "-",
        order.create_time,
        order.estimated_arrival_time || "-",
        (order.purchase_logistics_list || []).join(", ") || "-"
      ]

      for (const cellText of cells) {
        const td = document.createElement("td")
        td.style.cssText = STYLES.tableCell
        td.textContent = cellText
        row.appendChild(td)
      }

      tbody.appendChild(row)
    }
  }

  table.appendChild(tbody)
  modal.bodyContainer.appendChild(table)

  // 计算总行数
  const totalRows = orders.reduce(
    (sum, order) => sum + order.purchase_stock_list.length,
    0
  )
  modal.footerElement.textContent = `共 ${totalRows} 条采购单记录`
}

/**
 * 隐藏采购单弹窗
 */
function hidePurchaseModal(): void {
  if (purchaseModal) {
    purchaseModal.overlay.style.display = "none"
  }
}

/**
 * 处理在途元素点击事件
 */
async function handleTransitClick(skuId: string): Promise<void> {
  console.log("[JST-Stock] 点击在途按钮:", skuId)

  // 显示加载状态
  showPurchaseModalLoading(skuId)

  try {
    // 调用API获取采购单列表
    const response = await sendToBackground<
      { skuCode: string },
      YajiePurchaseOrderResponse
    >({
      name: "yajie-purchase-orders",
      body: { skuCode: skuId }
    })

    if (response.success) {
      updatePurchaseModal(skuId, response.orders || [])
      console.log(
        "[JST-Stock] 采购单查询成功:",
        skuId,
        "=>",
        response.orders?.length,
        "条"
      )
    } else {
      updatePurchaseModal(skuId, [], response.error)
      console.error("[JST-Stock] 采购单查询失败:", skuId, response.error)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    updatePurchaseModal(skuId, [], errorMsg)
    console.error("[JST-Stock] 采购单API调用失败:", skuId, error)
  }
}

// ============================================
// DOM 操作
// ============================================

/**
 * 创建在途数量显示元素
 * 使用 DOM API 而非 innerHTML 避免潜在 XSS 风险
 * @param skuId SKU ID
 * @param isHoverPanel 是否用于悬浮操作面板（使用不同样式）
 */
function createTransitElement(skuId: string, isHoverPanel = false): HTMLSpanElement {
  const span = document.createElement("span")
  span.className = isHoverPanel ? "jst-transit-stock-hover" : "jst-transit-stock"
  span.dataset.skuId = skuId
  span.dataset.hoverPanel = isHoverPanel ? "true" : "false"
  span.style.cssText = isHoverPanel ? STYLES.hoverLoading : STYLES.loading
  span.style.cursor = "pointer"

  const label = document.createElement("span")
  label.style.marginRight = "4px"
  label.textContent = "在途:"

  const value = document.createElement("span")
  value.className = "jst-transit-value"
  value.style.cssText = STYLES.skeleton

  span.appendChild(label)
  span.appendChild(value)

  // 添加点击事件：点击后弹出采购单详情
  span.addEventListener("click", (e) => {
    e.stopPropagation()
    handleTransitClick(skuId)
  })

  return span
}

/**
 * 更新在途数量显示
 */
function updateTransitElement(
  element: HTMLSpanElement,
  qty: number | null,
  error?: string
): void {
  const valueSpan = element.querySelector(".jst-transit-value")
  if (!valueSpan) return

  const isHoverPanel = element.dataset.hoverPanel === "true"

  if (error) {
    element.style.cssText = isHoverPanel ? STYLES.hoverError : STYLES.error
    valueSpan.textContent = "错误"
    valueSpan.removeAttribute("style")
    element.title = error
  } else {
    element.style.cssText = isHoverPanel ? STYLES.hoverContainer : STYLES.container
    valueSpan.textContent = String(qty ?? 0)
    valueSpan.removeAttribute("style")
    element.title = `在途数量: ${qty ?? 0}`
  }
}

/**
 * 从商品行中提取SKU ID
 * SKU ID 位于 span.btn-icon-copy[skuid] 属性中
 */
function extractSkuIdFromRow(row: Element): string | null {
  // 优先从 span[skuid] 属性获取
  const skuElement = row.querySelector("[skuid]")
  if (skuElement) {
    const skuId = skuElement.getAttribute("skuid")
    if (skuId) {
      return skuId
    }
  }

  // 备用：从 .sku_id 文本内容获取（去除复制按钮等额外内容）
  const skuIdDiv = row.querySelector(".sku_id")
  if (skuIdDiv) {
    // 获取第一个文本节点
    const textNode = Array.from(skuIdDiv.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    )
    if (textNode?.textContent?.trim()) {
      return textNode.textContent.trim()
    }
  }

  return null
}

// ============================================
// 弹窗处理
// ============================================

/**
 * 处理单个商品行
 */
async function handleItemRow(row: Element): Promise<void> {
  // 检查是否已处理
  if (row.querySelector(".jst-transit-stock")) {
    return
  }

  // 提取SKU ID
  const skuId = extractSkuIdFromRow(row)
  if (!skuId) {
    console.warn("[JST-Stock] 商品行未找到SKU ID，跳过")
    return
  }

  // 创建在途显示元素（主显示位置）
  const transitElement = createTransitElement(skuId, false)
  // 创建在途显示元素（悬浮操作面板位置，使用不同样式）
  const transitElementHover = createTransitElement(skuId, true)

  // 直接从行中查找 .stock 元素（可配货库存）
  const stockElement = row.querySelector(".stock")
  if (stockElement) {
    // 插入到 stock 元素后面
    stockElement.after(transitElement)
    console.log("[JST-Stock] 已为SKU插入在途显示:", skuId)
  } else {
    // 回退：插入到 .properties_value 末尾
    const propertiesValue = row.querySelector(".properties_value")
    if (!propertiesValue) {
      console.warn("[JST-Stock] 商品行未找到插入位置，跳过:", skuId)
      return
    }
    propertiesValue.appendChild(transitElement)
    console.log("[JST-Stock] 已为SKU插入在途显示(回退模式):", skuId)
  }

  // 在悬浮操作面板中也插入在途元素
  const operPanel = row.querySelector(".oper.m")
  if (operPanel) {
    // 插入到操作面板末尾（最右侧）
    operPanel.appendChild(transitElementHover)
    console.log("[JST-Stock] 已为SKU插入悬浮面板在途显示:", skuId)
  }

  // 调用API查询
  try {
    const response = await sendToBackground<
      { skuCode: string },
      YajieTransitQueryResponse
    >({
      name: "yajie-transit",
      body: { skuCode: skuId }
    })

    if (response.success) {
      updateTransitElement(transitElement, response.onthewayQty ?? 0)
      updateTransitElement(transitElementHover, response.onthewayQty ?? 0)
      console.log("[JST-Stock] 查询成功:", skuId, "=>", response.onthewayQty)
    } else {
      updateTransitElement(transitElement, null, response.error)
      updateTransitElement(transitElementHover, null, response.error)
      console.error("[JST-Stock] 查询失败:", skuId, response.error)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    updateTransitElement(transitElement, null, errorMsg)
    updateTransitElement(transitElementHover, null, errorMsg)
    console.error("[JST-Stock] API调用失败:", skuId, error)
  }
}

/**
 * 处理弹窗出现 - 遍历所有商品行
 */
async function handlePopup(popup: Element): Promise<void> {
  console.log("[JST-Stock] 开始处理弹窗")

  // 查找所有商品行（排除汇总行 .row.sum）
  const itemRows = popup.querySelectorAll(".jt_item_row")

  if (itemRows.length === 0) {
    console.warn("[JST-Stock] 弹窗中未找到商品行 (.jt_item_row)")
    return
  }

  console.log("[JST-Stock] 找到", itemRows.length, "个商品行")

  // 并行处理所有商品行
  const promises = Array.from(itemRows).map((row) => handleItemRow(row))
  await Promise.all(promises)

  console.log("[JST-Stock] 弹窗处理完成")
}

// ============================================
// MutationObserver 监听
// ============================================

/**
 * 检查元素是否为目标弹窗
 */
function isTargetPopup(element: Element): boolean {
  return (
    element.classList.contains("full_item") ||
    element.matches(".full_item") ||
    element.querySelector(".full_item") !== null
  )
}

/**
 * 检查弹窗是否可见
 */
function isPopupVisible(element: Element): boolean {
  const style = window.getComputedStyle(element)
  return style.display !== "none" && style.visibility !== "hidden"
}

/**
 * 初始化 MutationObserver
 */
function initObserver(): void {
  // 避免重复创建 observer
  if (observer) {
    console.log("[JST-Stock] Observer已存在，跳过")
    return
  }

  console.log("[JST-Stock] 初始化 MutationObserver")

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // 处理属性变化（监听 style 变化以检测弹窗显示）
      if (mutation.type === "attributes" && mutation.attributeName === "style") {
        const target = mutation.target as Element
        // 检查是否为目标弹窗元素
        if (target.classList?.contains("full_item")) {
          if (isPopupVisible(target)) {
            console.log("[JST-Stock] 检测到弹窗显示（style变化）")
            handlePopup(target)
          }
        }
        continue
      }

      // 处理新增节点
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue

        // 检查节点本身
        if (isTargetPopup(node)) {
          console.log("[JST-Stock] 检测到弹窗出现")
          handlePopup(node)
          continue
        }

        // 检查子节点
        const popups = node.querySelectorAll(".full_item")
        for (const popup of popups) {
          console.log("[JST-Stock] 检测到弹窗出现（子节点）")
          handlePopup(popup)
        }
      }
    }
  })

  // 开始观察
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  })

  console.log("[JST-Stock] MutationObserver 已启动")
}

/**
 * 清理 MutationObserver，防止内存泄漏
 */
function cleanup(): void {
  if (observer) {
    observer.disconnect()
    observer = null
    console.log("[JST-Stock] MutationObserver 已清理")
  }
}

// ============================================
// 初始化
// ============================================

function init(): void {
  console.log("[JST-Stock] 开始初始化")

  // 注入样式
  injectStyles()

  // 启动观察器
  initObserver()

  // 处理页面上已存在且可见的弹窗
  const existingPopups = document.querySelectorAll(".full_item")
  for (const popup of existingPopups) {
    if (isPopupVisible(popup)) {
      console.log("[JST-Stock] 检测到已存在的可见弹窗")
      handlePopup(popup)
    }
  }

  // 页面卸载时清理 observer，防止内存泄漏
  window.addEventListener("beforeunload", cleanup)

  console.log("[JST-Stock] 初始化完成")
}

// 页面加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init)
} else {
  init()
}
