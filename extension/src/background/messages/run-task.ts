/**
 * Plasmo Messaging Handler: run-task
 *
 * 处理任务运行请求
 *
 * 流程：
 * 1. 验证任务类型
 * 2. 确保 Bridge 就绪（检查/创建 Temu 标签页）
 * 3. 异步执行任务
 * 4. 任务完成后清理资源（关闭新创建的标签页）
 */

import type { PlasmoMessaging } from "@plasmohq/messaging";
import type { RunTaskRequest, RunTaskResponse } from "~types/task";
import { runUnpublishedMonitor } from "../tasks/unpublished-monitor";
import { runSiteErrorSync } from "../tasks/site-error-sync";
import { taskState } from "~lib/storage/task-state";
import { ensureBridgeReady, closeCreatedTab } from "~lib/api/bridge-handler";

const TEMU_HOST = 'agentseller.temu.com';

const handler: PlasmoMessaging.MessageHandler<RunTaskRequest, RunTaskResponse> = async (req, res) => {
  const { taskType, mallIds, skipPush } = req.body;

  console.log('[run-task] 收到请求:', taskType, mallIds, 'skipPush:', skipPush);

  try {
    // 1. 验证任务类型
    if (!taskType || !['unpublished', 'site-error'].includes(taskType)) {
      res.send({
        success: false,
        error: "无效的任务类型"
      })
      return
    }

    // 2. 前置检查：确保 Bridge 就绪（会自动创建标签页如果不存在）
    console.log('[run-task] 检查 Bridge 状态...');
    const bridgeStatus = await ensureBridgeReady(TEMU_HOST);
    if (!bridgeStatus.ready) {
      res.send({
        success: false,
        error: bridgeStatus.error || 'Bridge 不可用'
      });
      return;
    }
    console.log('[run-task] Bridge 就绪');

    // 3. 重置任务状态
    await taskState.reset();

    // 4. 根据任务类型执行不同的任务
    switch (taskType) {
      case 'unpublished':
        console.log('[run-task] 启动下架监控任务', skipPush ? '(仅采集)' : '(采集+推送)');

        // 异步执行任务（不阻塞响应）
        runUnpublishedMonitor({ mallIds, skipPush })
          .catch(async (error) => {
            console.error('[run-task] 下架监控任务失败:', error);
            await taskState.fail(error instanceof Error ? error.message : String(error));
          })
          .finally(async () => {
            // 任务完成后关闭新创建的标签页
            await closeCreatedTab();
          });

        res.send({
          success: true,
          taskId: "unpublished-" + Date.now()
        })
        break

      case 'site-error':
        console.log('[run-task] 启动站点异常导出任务');

        // 异步执行任务（不阻塞响应）
        runSiteErrorSync(mallIds)
          .catch(async (error) => {
            console.error('[run-task] 站点异常导出任务失败:', error);
            await taskState.fail(error instanceof Error ? error.message : String(error));
          })
          .finally(async () => {
            // 任务完成后关闭新创建的标签页
            await closeCreatedTab();
          });

        res.send({
          success: true,
          taskId: "site-error-" + Date.now()
        })
        break

      default:
        res.send({
          success: false,
          error: "未知的任务类型"
        })
    }
  } catch (error) {
    console.error('[run-task] 执行失败:', error);
    res.send({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export default handler
