/**
 * CSV 生成和下载工具
 *
 * 功能：
 * - 将数据转换为 CSV 格式
 * - 支持中文（UTF-8 BOM）
 * - 触发浏览器下载
 */

/**
 * CSV 行数据类型
 */
export interface CsvRow {
  [key: string]: string | number | undefined
}

/**
 * 生成 CSV 内容
 *
 * @param headers 表头数组
 * @param rows 数据行数组
 * @returns CSV 字符串（带 UTF-8 BOM）
 */
export function generateCsv(headers: string[], rows: CsvRow[]): string {
  // UTF-8 BOM（确保 Excel 正确识别中文）
  const BOM = "\uFEFF"

  // 转义 CSV 字段（处理逗号、引号、换行符）
  const escapeField = (field: string | number | undefined): string => {
    if (field === undefined || field === null) {
      return ""
    }

    const str = String(field)

    // 如果包含逗号、引号或换行符，需要用引号包裹并转义引号
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`
    }

    return str
  }

  // 生成表头行
  const headerLine = headers.map(escapeField).join(",")

  // 生成数据行
  const dataLines = rows.map((row) => {
    return headers.map((header) => escapeField(row[header])).join(",")
  })

  // 拼接所有行
  const csvContent = [headerLine, ...dataLines].join("\n")

  // 添加 BOM
  return BOM + csvContent
}

/**
 * 触发 CSV 下载
 *
 * @param content CSV 内容
 * @param filename 文件名（默认带时间戳）
 */
export function downloadCsv(content: string, filename?: string): void {
  // 生成默认文件名
  const defaultFilename = `export_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`
  const finalFilename = filename || defaultFilename

  // 创建 Blob
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" })

  // 创建下载链接
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)

  link.href = url
  link.download = finalFilename
  link.style.display = "none"

  // 触发下载
  document.body.appendChild(link)
  link.click()

  // 清理
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 从对象数组生成 CSV（自动提取表头）
 *
 * @param data 对象数组
 * @returns CSV 字符串
 */
export function arrayToCsv(data: CsvRow[]): string {
  if (!data || data.length === 0) {
    return ""
  }

  // 自动提取所有字段作为表头
  const headers = Array.from(new Set(data.flatMap((row) => Object.keys(row))))

  return generateCsv(headers, data)
}

/**
 * 格式化时间戳为可读日期
 *
 * @param timestamp 时间戳（毫秒）
 * @returns 格式化的日期字符串 "YYYY-MM-DD HH:mm:ss"
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
