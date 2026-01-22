/**
 * Plasmo Messaging Handler: export-csv
 *
 * 导出站点异常 CSV
 */

import type { PlasmoMessaging } from "@plasmohq/messaging"

import type { ExportCsvRequest, ExportCsvResponse } from "~types/task"

import { exportSiteErrorCsv } from "../tasks/site-error-sync"

const handler: PlasmoMessaging.MessageHandler<
  ExportCsvRequest,
  ExportCsvResponse
> = async (req, res) => {
  const { mallIds } = req.body

  console.log("[Message] export-csv 收到请求:", mallIds)

  try {
    // 生成 CSV 内容
    const csvContent = await exportSiteErrorCsv(mallIds)

    if (!csvContent) {
      res.send({
        success: false,
        error: "没有可导出的数据"
      })
      return
    }

    // 生成文件名（带时间戳）
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-")
    const filename = `site_errors_${timestamp}.csv`

    // 返回 CSV 内容和文件名
    res.send({
      success: true,
      filename,
      csvContent
    })
  } catch (error) {
    console.error("[Message] export-csv 执行失败:", error)
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export default handler
