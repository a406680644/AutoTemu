/**
 * 停止任务消息处理器
 *
 * 接收停止请求，设置停止标志
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import { taskState } from "~lib/storage/task-state";

export interface StopTaskRequest {}

export interface StopTaskResponse {
  success: boolean;
  error?: string;
}

const handler: PlasmoMessaging.MessageHandler<StopTaskRequest, StopTaskResponse> = async (req, res) => {
  try {
    console.log('[stop-task] 收到停止任务请求');

    // 立即设置状态为 idle，让 UI 立即响应
    await taskState.set({
      status: 'idle',
      shouldStop: true,  // 设置停止标志（任务循环中会检测）
      endTime: Date.now()
    });

    await taskState.addLog('warn', '任务已被用户中止');

    res.send({ success: true });
  } catch (error) {
    console.error('[stop-task] 停止任务失败:', error);
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export default handler;
