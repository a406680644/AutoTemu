/**
 * 任务状态管理
 *
 * 管理任务执行状态、进度、日志等信息
 * 状态存储在 chrome.storage.local 中，支持实时同步
 */

import type { LogLevel, TaskLog, TaskState, TaskStatus } from "~types/storage"
import { CONFIG_KEYS } from "~types/storage"

/**
 * 任务状态管理器
 */
class TaskStateManager {
  /**
   * 获取当前任务状态
   */
  async get(): Promise<TaskState> {
    const result = await chrome.storage.local.get(CONFIG_KEYS.TASK_STATE)
    return result[CONFIG_KEYS.TASK_STATE] || this.getDefaultState()
  }

  /**
   * 设置任务状态
   */
  async set(state: Partial<TaskState>): Promise<void> {
    const current = await this.get()
    const updated = { ...current, ...state }
    await chrome.storage.local.set({ [CONFIG_KEYS.TASK_STATE]: updated })
  }

  /**
   * 重置任务状态
   */
  async reset(): Promise<void> {
    await chrome.storage.local.set({
      [CONFIG_KEYS.TASK_STATE]: this.getDefaultState()
    })
  }

  /**
   * 获取默认状态
   */
  private getDefaultState(): TaskState {
    return {
      status: "idle",
      progress: 0,
      totalMalls: 0,
      completedMalls: 0,
      logs: [],
      shouldStop: false,
      fetchedData: []
    };
  }

  // ============================================
  // 停止控制
  // ============================================

  /**
   * 请求停止任务
   */
  async requestStop(): Promise<void> {
    await this.set({ shouldStop: true });
    await this.addLog('warn', '收到停止请求，正在中止任务...');
  }

  /**
   * 清除停止标志
   */
  async clearStopFlag(): Promise<void> {
    await this.set({ shouldStop: false });
  }

  /**
   * 检查是否需要停止
   */
  async shouldStop(): Promise<boolean> {
    const state = await this.get();
    return state.shouldStop === true;
  }

  // ============================================
  // 数据展示
  // ============================================

  /**
   * 添加拉取的数据（用于展示）
   */
  async addFetchedData(items: any[]): Promise<void> {
    const state = await this.get();
    const currentData = state.fetchedData || [];
    // 限制最多保存 500 条用于展示
    const newData = [...currentData, ...items].slice(-500);
    await this.set({ fetchedData: newData });
  }

  /**
   * 清空拉取的数据
   */
  async clearFetchedData(): Promise<void> {
    await this.set({ fetchedData: [] });
  }

  // ============================================
  // 状态更新快捷方法
  // ============================================

  /**
   * 开始任务
   */
  async start(totalMalls: number): Promise<void> {
    await this.set({
      status: "running",
      progress: 0,
      totalMalls,
      completedMalls: 0,
      startTime: Date.now(),
      endTime: undefined,
      error: undefined,
      logs: []
    })
  }

  /**
   * 获取任务开始时间
   */
  async getStartTime(): Promise<number | undefined> {
    const state = await this.get();
    return state.startTime;
  }

  /**
   * 更新进度
   */
  async updateProgress(
    completedMalls: number,
    currentMall?: string
  ): Promise<void> {
    const state = await this.get()
    const progress =
      state.totalMalls > 0
        ? Math.round((completedMalls / state.totalMalls) * 100)
        : 0

    await this.set({
      progress,
      completedMalls,
      currentMall
    })
  }

  /**
   * 任务完成
   */
  async complete(): Promise<void> {
    await this.set({
      status: "done",
      progress: 100,
      endTime: Date.now(),
      currentMall: undefined
    })
  }

  /**
   * 任务失败
   */
  async fail(error: string): Promise<void> {
    await this.set({
      status: "fail",
      endTime: Date.now(),
      error
    })
  }

  // ============================================
  // 日志管理
  // ============================================

  /**
   * 添加日志
   */
  async addLog(level: LogLevel, message: string): Promise<void> {
    const state = await this.get()
    const log: TaskLog = {
      timestamp: Date.now(),
      level,
      message
    }

    // 限制日志数量（最多 1000 条）
    const logs = [...state.logs, log]
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000)
    }

    await this.set({ logs })
  }

  /**
   * 清空日志
   */
  async clearLogs(): Promise<void> {
    await this.set({ logs: [] })
  }

  /**
   * 获取格式化的日志文本
   */
  async getFormattedLogs(): Promise<string> {
    const state = await this.get()
    return state.logs
      .map((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString()
        const level = log.level.toUpperCase().padEnd(5)
        return `[${time}] [${level}] ${log.message}`
      })
      .join("\n")
  }

  // ============================================
  // 监听状态变化
  // ============================================

  /**
   * 监听状态变化
   * @param callback 回调函数
   */
  onChange(callback: (state: TaskState) => void): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local" && changes[CONFIG_KEYS.TASK_STATE]) {
        const newValue = changes[CONFIG_KEYS.TASK_STATE].newValue
        if (newValue) {
          callback(newValue)
        }
      }
    })
  }
}

// 导出单例
export const taskState = new TaskStateManager()
