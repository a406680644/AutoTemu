/**
 * Plasmo Messaging Handler: yajie-purchase-orders
 *
 * 处理亚杰采购单列表查询请求
 */

import type { PlasmoMessaging } from "@plasmohq/messaging"

import { queryPurchaseOrders } from "~lib/api/yajie"
import type {
  YajiePurchaseOrderRequest,
  YajiePurchaseOrderResponse
} from "~types/yajie"

const handler: PlasmoMessaging.MessageHandler<
  YajiePurchaseOrderRequest,
  YajiePurchaseOrderResponse
> = async (req, res) => {
  const { skuCode } = req.body

  console.log("[Message] yajie-purchase-orders 收到请求:", skuCode)

  try {
    if (!skuCode) {
      res.send({
        success: false,
        error: "SKU编码不能为空"
      })
      return
    }

    // 查询采购单列表
    const orders = await queryPurchaseOrders(skuCode)

    console.log(
      "[Message] yajie-purchase-orders 查询成功:",
      skuCode,
      "=>",
      orders.length,
      "条"
    )

    res.send({
      success: true,
      orders
    })
  } catch (error) {
    console.error("[Message] yajie-purchase-orders 执行失败:", error)
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export default handler
