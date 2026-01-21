/**
 * Plasmo Messaging Handler: get-status
 *
 * 获取当前任务状态
 */

import type { PlasmoMessaging } from "@plasmohq/messaging"

import { taskState } from "~lib/storage/task-state"
import type { GetStatusResponse } from "~types/task"

const handler: PlasmoMessaging.MessageHandler<{}, GetStatusResponse> = async (
  req,
  res
) => {
  try {
    const state = await taskState.get()

    // 安全处理 logs 数组
    const logs = Array.isArray(state.logs) ? state.logs : []

    res.send({
      status: state.status || "idle",
      progress: state.progress || 0,
      currentMall: state.currentMall,
      totalMalls: state.totalMalls || 0,
      completedMalls: state.completedMalls || 0,
      startTime: state.startTime,
      endTime: state.endTime,
      error: state.error,
      logs: logs.map((log) => ({
        timestamp: log.timestamp,
        level: log.level,
        message: log.message
      }))
    })
  } catch (error) {
    console.error("[Message] get-status 执行失败:", error)
    res.send({
      status: "idle",
      progress: 0,
      totalMalls: 0,
      completedMalls: 0,
      logs: []
    })
  }
}

export default handler
