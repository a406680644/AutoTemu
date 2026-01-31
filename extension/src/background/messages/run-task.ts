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
import { runViolationMonitor } from "../tasks/violation-monitor";
import { taskState } from "~lib/storage/task-state";
import { ensureBridgeReady, closeCreatedTab } from "~lib/api/bridge-handler";
import { temuApi } from "~lib/api/temu";

const TEMU_HOST = 'agentseller.temu.com';

const handler: PlasmoMessaging.MessageHandler<RunTaskRequest, RunTaskResponse> = async (req, res) => {
  const { taskType, mallIds, skipPush } = req.body;

  console.log('[run-task] 收到请求:', taskType, mallIds, 'skipPush:', skipPush);

  try {
    // 1. 验证任务类型
    if (!taskType || !['unpublished', 'site-error', 'violation', 'all'].includes(taskType)) {
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

      case 'violation':
        console.log('[run-task] 启动违规商品监控任务');

        // 异步执行任务（不阻塞响应）
        runViolationMonitor(mallIds)
          .catch(async (error) => {
            console.error('[run-task] 违规商品监控任务失败:', error);
            await taskState.fail(error instanceof Error ? error.message : String(error));
          })
          .finally(async () => {
            // 任务完成后关闭新创建的标签页
            await closeCreatedTab();
          });

        res.send({
          success: true,
          taskId: "violation-" + Date.now()
        })
        break

      case 'all':
        console.log('[run-task] 启动一键执行（已下架 + 站点异常 + 违规商品）');

        // 串行执行所有任务（共享店铺列表，避免 taskState 竞争）
        (async () => {
          try {
            // 1. 先获取店铺列表（仅 1 次）
            await taskState.addLog('info', '获取店铺列表...');
            const malls = await temuApi.getMallList();
            if (!malls || malls.length === 0) {
              throw new Error('未找到任何店铺，请先登录 Temu 卖家中心');
            }
            await taskState.addLog('info', `获取到 ${malls.length} 个店铺，开始串行执行任务...`);

            // 根据 mallIds 过滤店铺列表
            let filteredMalls = malls;
            if (mallIds && mallIds.length > 0) {
              filteredMalls = malls.filter((mall) => mallIds.includes(mall.mallId));
              if (filteredMalls.length === 0) {
                throw new Error('指定的店铺 ID 不存在');
              }
            }

            let hasErrors = false;

            // 2. 串行执行已下架商品监控（使用共享店铺列表）
            await taskState.addLog('info', '【1/3】开始执行已下架商品监控...');
            try {
              await runUnpublishedMonitor({ mallIds, skipPush: true, malls: filteredMalls });
              console.log('[run-task] 已下架商品任务完成');
              await taskState.addLog('info', '【1/3】已下架商品任务完成');
            } catch (error) {
              hasErrors = true;
              console.error('[run-task] 已下架商品任务失败:', error);
              await taskState.addLog('error', `【1/3】已下架商品任务失败: ${error instanceof Error ? error.message : String(error)}`);
            }

            // 3. 串行执行站点异常同步（使用共享店铺列表）
            await taskState.addLog('info', '【2/3】开始执行站点异常同步...');
            try {
              await runSiteErrorSync(mallIds, filteredMalls);
              console.log('[run-task] 站点异常任务完成');
              await taskState.addLog('info', '【2/3】站点异常任务完成');
            } catch (error) {
              hasErrors = true;
              console.error('[run-task] 站点异常任务失败:', error);
              await taskState.addLog('error', `【2/3】站点异常任务失败: ${error instanceof Error ? error.message : String(error)}`);
            }

            // 4. 串行执行违规商品监控（使用共享店铺列表）
            await taskState.addLog('info', '【3/3】开始执行违规商品监控...');
            try {
              await runViolationMonitor(mallIds, filteredMalls);
              console.log('[run-task] 违规商品任务完成');
              await taskState.addLog('info', '【3/3】违规商品任务完成');
            } catch (error) {
              hasErrors = true;
              console.error('[run-task] 违规商品任务失败:', error);
              await taskState.addLog('error', `【3/3】违规商品任务失败: ${error instanceof Error ? error.message : String(error)}`);
            }

            // 5. 更新最终状态（不再调用 runScheduledPush，推送由 Chrome Alarm 按配置时间触发）
            if (hasErrors) {
              await taskState.fail('部分任务执行失败，请查看日志');
            } else {
              await taskState.complete();
              await taskState.addLog('info', '一键执行完成（推送由定时任务负责）');
            }
          } catch (error) {
            console.error('[run-task] 一键执行失败:', error);
            await taskState.fail(error instanceof Error ? error.message : String(error));
          } finally {
            await closeCreatedTab();
          }
        })();

        res.send({
          success: true,
          taskId: "all-" + Date.now()
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
