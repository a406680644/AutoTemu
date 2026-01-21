/**
 * 日志工具
 *
 * 提供统一的日志输出，支持不同级别和前缀
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

class Logger {
  private prefix: string

  constructor(prefix: string) {
    this.prefix = prefix
  }

  private formatMessage(level: LogLevel, ...args: any[]): void {
    const timestamp = new Date().toLocaleTimeString()
    const levelTag = level.toUpperCase().padEnd(5)
    const message = `[${timestamp}] [${this.prefix}] [${levelTag}]`

    switch (level) {
      case "debug":
        console.debug(message, ...args)
        break
      case "info":
        console.log(message, ...args)
        break
      case "warn":
        console.warn(message, ...args)
        break
      case "error":
        console.error(message, ...args)
        break
    }
  }

  debug(...args: any[]): void {
    this.formatMessage("debug", ...args)
  }

  info(...args: any[]): void {
    this.formatMessage("info", ...args)
  }

  warn(...args: any[]): void {
    this.formatMessage("warn", ...args)
  }

  error(...args: any[]): void {
    this.formatMessage("error", ...args)
  }
}

/**
 * 创建日志实例
 */
export function createLogger(prefix: string): Logger {
  return new Logger(prefix)
}
