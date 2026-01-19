/**
 * Plasmo Messaging Handler: run-task
 *
 * 处理任务运行请求
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import type { RunTaskRequest, RunTaskResponse } from "~types/task";
import { runUnpublishedMonitor } from "../tasks/unpublished-monitor";
import { runSiteErrorSync } from "../tasks/site-error-sync";

const handler: PlasmoMessaging.MessageHandler<RunTaskRequest, RunTaskResponse> = async (req, res) => {
  const { taskType, mallIds } = req.body;

  console.log('[Message] run-task 收到请求:', taskType, mallIds);

  try {
    // 验证任务类型
    if (!taskType || !['unpublished', 'site-error'].includes(taskType)) {
      res.send({
        success: false,
        error: '无效的任务类型'
      });
      return;
    }

    // 根据任务类型执行不同的任务
    switch (taskType) {
      case 'unpublished':
        // 下架监控任务
        console.log('[Message] 执行下架监控任务');

        // 异步执行任务（不阻塞响应）
        runUnpublishedMonitor(mallIds).catch(error => {
          console.error('[Message] 下架监控任务执行失败:', error);
        });

        res.send({
          success: true,
          taskId: 'unpublished-' + Date.now()
        });
        break;

      case 'site-error':
        // 站点异常导出任务
        console.log('[Message] 执行站点异常导出任务');

        // 异步执行任务（不阻塞响应）
        runSiteErrorSync(mallIds).catch(error => {
          console.error('[Message] 站点异常导出任务执行失败:', error);
        });

        res.send({
          success: true,
          taskId: 'site-error-' + Date.now()
        });
        break;

      default:
        res.send({
          success: false,
          error: '未知的任务类型'
        });
    }
  } catch (error) {
    console.error('[Message] run-task 执行失败:', error);
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export default handler;
