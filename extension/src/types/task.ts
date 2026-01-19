/**
 * 任务类型定义
 *
 * 定义任务执行相关的类型
 */

import type { TaskStatus, TaskState } from './storage';

// 重新导出 TaskStatus 和 TaskState
export type { TaskStatus, TaskState };

/**
 * 任务类型枚举
 */
export type TaskType = 'unpublished' | 'site-error';

/**
 * 运行任务请求
 */
export interface RunTaskRequest {
  taskType: TaskType;       // 任务类型
  mallIds?: string[];       // 指定店铺 ID 列表（空表示所有店铺）
}

/**
 * 运行任务响应
 */
export interface RunTaskResponse {
  success: boolean;
  taskId?: string;
  error?: string;
}

/**
 * 获取任务状态响应
 */
export interface GetStatusResponse {
  status: TaskStatus;
  progress: number;
  currentMall?: string;
  totalMalls: number;
  completedMalls: number;
  startTime?: number;
  endTime?: number;
  error?: string;
  logs: Array<{
    timestamp: number;
    level: string;
    message: string;
  }>;
}

/**
 * 导出 CSV 请求
 */
export interface ExportCsvRequest {
  mallIds?: string[];       // 指定店铺 ID 列表（空表示所有店铺）
}

/**
 * 导出 CSV 响应
 */
export interface ExportCsvResponse {
  success: boolean;
  filename?: string;
  csvContent?: string;
  error?: string;
}
