/**
 * RPA 运行模块组件
 *
 * RPA 友好设计：
 * - 大按钮，易于自动化点击
 * - 明确的元素 ID（rpa-run-button, rpa-stop-button, rpa-log-output, rpa-download-button）
 * - 清晰的状态显示（data-status 属性）
 * - 实时进度更新
 * - 数据预览表格
 */

import { useEffect, useState } from "react"

import { sendToBackground } from "@plasmohq/messaging"

import {
  borderRadius,
  colors,
  spacing,
  transitions,
  typography
} from "~components/styles/theme"
import type { ModuleProps } from "~types/module"
import type { TaskStatus, TaskType } from "~types/task"

/** 模块样式 */
const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: colors.gray[50],
    padding: `${spacing.xxl}px ${spacing.lg}px`,
    fontFamily: typography.fontFamily
  },
  container: {
    maxWidth: 900,
    margin: "0 auto"
  },
  header: {
    textAlign: "center" as const,
    marginBottom: spacing.xxl
  },
  title: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    color: colors.gray[800],
    margin: 0
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.lg,
    color: colors.gray[500]
  },
  badgeContainer: {
    display: "flex",
    justifyContent: "center",
    marginBottom: spacing.xxl
  },
  badge: (status: TaskStatus) => {
    const statusColors: Record<TaskStatus, string> = {
      idle: colors.status.idle,
      running: colors.status.running,
      done: colors.status.done,
      fail: colors.status.fail
    }
    return {
      backgroundColor: statusColors[status] || colors.status.idle,
      color: colors.white,
      padding: `${spacing.sm}px ${spacing.xl}px`,
      borderRadius: borderRadius.pill,
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.semibold
    }
  },
  card: {
    backgroundColor: colors.white,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl
  },
  cardTitle: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.gray[800],
    marginTop: 0,
    marginBottom: spacing.lg
  },
  radioGroup: {
    display: "flex",
    gap: spacing.xl
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    cursor: "pointer",
    fontSize: typography.sizes.md
  },
  radio: {
    width: 18,
    height: 18
  },
  runButton: (disabled: boolean) => ({
    width: "100%",
    padding: spacing.xl,
    fontSize: typography.sizes.xxxl,
    fontWeight: typography.weights.bold,
    border: "none",
    borderRadius: borderRadius.lg,
    cursor: disabled ? "not-allowed" : "pointer",
    backgroundColor: disabled ? colors.gray[300] : colors.primary,
    color: disabled ? colors.gray[500] : colors.white,
    marginBottom: spacing.xl,
    transition: `background-color ${transitions.normal}`
  }),
  stopButton: {
    width: "100%",
    padding: spacing.lg,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    border: "none",
    borderRadius: borderRadius.lg,
    cursor: "pointer",
    backgroundColor: "#dc2626",
    color: colors.white,
    marginBottom: spacing.xl
  },
  progressContainer: {
    marginBottom: spacing.sm
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: typography.sizes.md,
    color: colors.gray[500],
    marginBottom: spacing.sm
  },
  progressBar: {
    width: "100%",
    height: 24,
    backgroundColor: colors.gray[200],
    borderRadius: borderRadius.xl,
    overflow: "hidden"
  },
  progressFill: (progress: number) => ({
    width: `${progress}%`,
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    transition: `width ${transitions.slow}`
  }),
  currentMall: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.md,
    color: colors.gray[500]
  },
  errorBox: {
    backgroundColor: colors.error.bg,
    border: `1px solid ${colors.error.border}`,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl
  },
  errorHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  errorIcon: {
    width: 20,
    height: 20,
    color: "#dc2626",
    flexShrink: 0
  },
  errorTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.error.text,
    margin: 0
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: "#b91c1c",
    marginTop: spacing.xs
  },
  logContainer: {
    backgroundColor: colors.gray[800],
    color: colors.gray[100],
    fontFamily: typography.monoFamily,
    fontSize: typography.sizes.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    height: 256,
    overflowY: "auto" as const
  },
  logEmpty: {
    color: colors.gray[500]
  },
  logLine: {
    marginBottom: spacing.xs
  },
  downloadButton: {
    width: "100%",
    padding: spacing.lg,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    border: "none",
    borderRadius: borderRadius.lg,
    cursor: "pointer",
    backgroundColor: colors.status.done,
    color: colors.white,
    marginBottom: spacing.xl
  },
  dataTable: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: typography.sizes.sm
  },
  tableHeader: {
    backgroundColor: colors.gray[100],
    padding: "10px 8px",
    textAlign: "left" as const,
    borderBottom: `2px solid ${colors.gray[200]}`,
    fontWeight: typography.weights.semibold
  },
  tableCell: {
    padding: "8px",
    borderBottom: `1px solid ${colors.gray[200]}`,
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const
  },
  dataContainer: {
    maxHeight: 400,
    overflowY: "auto" as const,
    border: `1px solid ${colors.gray[200]}`,
    borderRadius: borderRadius.md
  },
  helpCard: {
    backgroundColor: colors.info.bg,
    border: `1px solid ${colors.info.border}`,
    borderRadius: borderRadius.lg,
    padding: spacing.xl
  },
  helpTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.medium,
    color: colors.info.text,
    marginTop: 0,
    marginBottom: spacing.md
  },
  helpList: {
    listStyle: "none",
    padding: 0,
    margin: 0
  },
  helpItem: {
    fontSize: typography.sizes.md,
    color: colors.info.text,
    marginBottom: spacing.sm
  },
  code: {
    backgroundColor: "#dbeafe",
    padding: "2px 6px",
    borderRadius: borderRadius.sm,
    fontFamily: typography.monoFamily
  },
  hint: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.gray[500]
  }
}

const statusLabels: Record<TaskStatus, { text: string; icon: string }> = {
  idle: { text: "空闲", icon: "⚪" },
  running: { text: "运行中", icon: "🔵" },
  done: { text: "完成", icon: "✅" },
  fail: { text: "失败", icon: "❌" }
}

export default function RunnerModule(_props: ModuleProps) {
  const [taskType, setTaskType] = useState<TaskType>("unpublished")
  const [status, setStatus] = useState<TaskStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [currentMall, setCurrentMall] = useState<string>()
  const [totalMalls, setTotalMalls] = useState(0)
  const [completedMalls, setCompletedMalls] = useState(0)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [fetchedData, setFetchedData] = useState<any[]>([])

  // 轮询任务状态
  useEffect(() => {
    // 页面加载时立即获取一次状态
    updateStatus()

    const interval = setInterval(async () => {
      // 运行中时持续轮询，其他状态也定期检查
      await updateStatus()
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // 更新任务状态
  async function updateStatus() {
    try {
      const response = await sendToBackground({
        name: "get-status",
        body: {}
      })

      // 安全检查 response
      if (!response) {
        console.warn("get-status 返回空响应")
        return
      }

      setStatus(response.status || "idle")
      setProgress(response.progress || 0)
      setCurrentMall(response.currentMall)
      setTotalMalls(response.totalMalls || 0)
      setCompletedMalls(response.completedMalls || 0)
      setError(response.error)

      // 安全更新日志
      const logsArray = Array.isArray(response.logs) ? response.logs : []
      const logMessages = logsArray.map(
        (log: { timestamp: string; level?: string; message?: string }) => {
          const time = new Date(log.timestamp).toLocaleTimeString()
          return `[${time}] [${log.level?.toUpperCase() || "INFO"}] ${log.message || ""}`
        }
      )
      setLogs(logMessages)

      // 更新拉取的数据
      const dataArray = Array.isArray(response.fetchedData)
        ? response.fetchedData
        : []
      setFetchedData(dataArray)
    } catch (error) {
      console.error("更新状态失败:", error)
    }
  }

  // 停止任务
  async function handleStopTask() {
    try {
      const response = await sendToBackground({
        name: "stop-task",
        body: {}
      })

      if (!response?.success) {
        setError(response?.error || "停止任务失败")
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  // 运行任务
  async function handleRunTask() {
    try {
      setError(undefined)
      setLogs([])
      setFetchedData([]) // 清空之前的数据
      setStatus("running") // 立即设置为运行中
      setProgress(0)
      setCompletedMalls(0)
      setTotalMalls(0)

      const response = await sendToBackground({
        name: "run-task",
        body: {
          taskType,
          mallIds: undefined, // 所有店铺
          skipPush: true // 仅采集，推送由定时任务负责
        }
      })

      if (!response?.success) {
        setError(response?.error || "任务启动失败")
        setStatus("idle") // 失败时恢复为 idle
        return
      }

      // 任务启动成功，等待一小段时间让后台开始执行
      await new Promise((resolve) => setTimeout(resolve, 500))
      await updateStatus()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      setStatus("idle")
    }
  }

  // 下载 CSV
  async function handleDownloadCsv() {
    try {
      const response = await sendToBackground({
        name: "export-csv",
        body: {
          mallIds: undefined // 所有店铺
        }
      })

      if (!response?.success) {
        alert(response?.error || "CSV 导出失败")
        return
      }

      // 触发下载
      const { downloadCsv } = await import("~lib/utils/csv")
      downloadCsv(response.csvContent!, response.filename)

      alert("CSV 导出成功")
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    }
  }

  // 获取安全的状态值
  const currentStatus = status in statusLabels ? status : "idle"
  const statusInfo = statusLabels[currentStatus]

  return (
    <div style={styles.page} data-status={currentStatus}>
      <div style={styles.container}>
        {/* 页面标题 */}
        <div style={styles.header}>
          <h1 style={styles.title}>AutoTemu RPA 运行页</h1>
          <p style={styles.subtitle}>自动化任务执行和监控</p>
        </div>

        {/* 状态徽章 */}
        <div style={styles.badgeContainer}>
          <div style={styles.badge(currentStatus)}>
            {statusInfo.icon} {statusInfo.text}
          </div>
        </div>

        {/* 任务配置 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>任务配置</h2>
          <div style={styles.radioGroup}>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="taskType"
                value="unpublished"
                checked={taskType === "unpublished"}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                disabled={currentStatus === "running"}
                style={styles.radio}
              />
              <span>已下架商品监控</span>
            </label>
            <label style={styles.radioLabel}>
              <input
                type="radio"
                name="taskType"
                value="site-error"
                checked={taskType === "site-error"}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                disabled={currentStatus === "running"}
                style={styles.radio}
              />
              <span>站点异常导出</span>
            </label>
          </div>
          <div style={styles.hint}>下架监控仅采集数据，推送由定时任务统一处理</div>
        </div>

        {/* 运行按钮 */}
        <button
          id="rpa-run-button"
          data-testid="run-task"
          onClick={handleRunTask}
          disabled={currentStatus === "running"}
          style={styles.runButton(currentStatus === "running")}
          onMouseOver={(e) => {
            if (currentStatus !== "running") {
              e.currentTarget.style.backgroundColor = colors.primaryHover
            }
          }}
          onMouseOut={(e) => {
            if (currentStatus !== "running") {
              e.currentTarget.style.backgroundColor = colors.primary
            }
          }}>
          {currentStatus === "running" ? "任务运行中..." : "运行任务"}
        </button>

        {/* 停止按钮（仅在运行中显示） */}
        {currentStatus === "running" && (
          <button
            id="rpa-stop-button"
            data-testid="stop-task"
            onClick={handleStopTask}
            style={styles.stopButton}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#b91c1c")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#dc2626")
            }>
            停止任务
          </button>
        )}

        {/* 进度条 */}
        {currentStatus === "running" && (
          <div style={styles.card}>
            <div style={styles.progressContainer}>
              <div style={styles.progressHeader}>
                <span>执行进度</span>
                <span>
                  {completedMalls} / {totalMalls} 店铺
                </span>
              </div>
              <div style={styles.progressBar}>
                <div style={styles.progressFill(progress)}>
                  {progress > 10 ? `${progress}%` : ""}
                </div>
              </div>
              {currentMall && (
                <div style={styles.currentMall}>当前处理：{currentMall}</div>
              )}
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div style={styles.errorBox}>
            <div style={styles.errorHeader}>
              <svg style={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h4 style={styles.errorTitle}>错误</h4>
                <p style={styles.errorText}>{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 执行日志 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>执行日志</h2>
          <div id="rpa-log-output" style={styles.logContainer}>
            {logs.length === 0 ? (
              <div style={styles.logEmpty}>暂无日志...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} style={styles.logLine}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 数据展示（拉取到的数据预览） */}
        {fetchedData.length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              拉取数据预览 (共 {fetchedData.length} 条)
            </h2>
            <div style={styles.dataContainer}>
              <table style={styles.dataTable}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>店铺</th>
                    <th style={styles.tableHeader}>SKC ID</th>
                    <th style={styles.tableHeader}>商品名称</th>
                    <th style={styles.tableHeader}>下架原因</th>
                    <th style={styles.tableHeader}>下架时间</th>
                  </tr>
                </thead>
                <tbody>
                  {fetchedData.slice(0, 100).map((item, index) => (
                    <tr key={index}>
                      <td style={styles.tableCell}>{item.mallName || "-"}</td>
                      <td style={styles.tableCell}>{item.skcId || "-"}</td>
                      <td style={styles.tableCell} title={item.goodsName}>
                        {item.goodsName || "-"}
                      </td>
                      <td
                        style={styles.tableCell}
                        title={item.unPublishedReason}>
                        {item.unPublishedReason || "-"}
                      </td>
                      <td style={styles.tableCell}>
                        {item.unPublishedTime
                          ? new Date(item.unPublishedTime).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fetchedData.length > 100 && (
              <div style={styles.hint}>
                仅显示前 100 条，共 {fetchedData.length} 条数据
              </div>
            )}
          </div>
        )}

        {/* 下载按钮（仅站点异常任务完成后显示） */}
        {currentStatus === "done" && taskType === "site-error" && (
          <button
            id="rpa-download-button"
            data-testid="download-csv"
            onClick={handleDownloadCsv}
            style={styles.downloadButton}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#15803d")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = colors.status.done)
            }>
            下载 CSV
          </button>
        )}

        {/* 帮助信息 */}
        <div style={styles.helpCard}>
          <h3 style={styles.helpTitle}>RPA 自动化提示</h3>
          <ul style={styles.helpList}>
            <li style={styles.helpItem}>
              • 可通过 <code style={styles.code}>#rpa-run-button</code>{" "}
              定位运行按钮
            </li>
            <li style={styles.helpItem}>
              • 可通过 <code style={styles.code}>#rpa-stop-button</code>{" "}
              定位停止按钮（运行中显示）
            </li>
            <li style={styles.helpItem}>
              • 可通过 <code style={styles.code}>[data-status]</code>{" "}
              属性监控任务状态
            </li>
            <li style={styles.helpItem}>
              • 日志输出在 <code style={styles.code}>#rpa-log-output</code>{" "}
              元素中
            </li>
            <li style={styles.helpItem}>
              • CSV 下载按钮 ID 为{" "}
              <code style={styles.code}>#rpa-download-button</code>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
