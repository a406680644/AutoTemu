/**
 * Plasmo Messaging Handler: yajie-transit
 *
 * 处理亚杰在途库存查询请求
 */

import type { PlasmoMessaging } from "@plasmohq/messaging"

import { queryTransitStock } from "~lib/api/yajie"
import type { YajieTransitQueryResponse } from "~types/yajie"

interface YajieTransitRequest {
  skuCode: string
}

const handler: PlasmoMessaging.MessageHandler<
  YajieTransitRequest,
  YajieTransitQueryResponse
> = async (req, res) => {
  const { skuCode } = req.body

  console.log("[Message] yajie-transit 收到请求:", skuCode)

  try {
    if (!skuCode) {
      res.send({
        success: false,
        error: "SKU编码不能为空"
      })
      return
    }

    // 查询在途库存
    const onthewayQty = await queryTransitStock(skuCode)

    console.log("[Message] yajie-transit 查询成功:", skuCode, "=>", onthewayQty)

    res.send({
      success: true,
      onthewayQty
    })
  } catch (error) {
    console.error("[Message] yajie-transit 执行失败:", error)
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export default handler
