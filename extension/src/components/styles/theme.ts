/**
 * 统一样式主题
 *
 * 提取共享的颜色、间距、字体等样式常量
 * 确保整个应用的视觉一致性
 */

/** 颜色主题 */
export const colors = {
  // 主色调
  primary: "#4f46e5",
  primaryHover: "#4338ca",
  primaryLight: "#eff6ff",

  // 状态颜色
  status: {
    idle: "#6b7280",
    running: "#3b82f6",
    done: "#22c55e",
    fail: "#ef4444"
  },

  // 灰度
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827"
  },

  // 语义颜色
  success: {
    bg: "#dcfce7",
    border: "#bbf7d0",
    text: "#166534"
  },
  error: {
    bg: "#fef2f2",
    border: "#fecaca",
    text: "#991b1b"
  },
  info: {
    bg: "#eff6ff",
    border: "#bfdbfe",
    text: "#1e40af"
  },
  warning: {
    bg: "#fffbeb",
    border: "#fde68a",
    text: "#92400e"
  },

  // 基础
  white: "#ffffff",
  black: "#000000"
} as const

/** 间距 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const

/** 字体 */
export const typography = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  monoFamily: 'Consolas, Monaco, "Courier New", monospace',
  sizes: {
    xs: 11,
    sm: 13,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    title: 32
  },
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  }
} as const

/** 圆角 */
export const borderRadius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 20,
  full: 9999
} as const

/** 阴影 */
export const shadows = {
  sm: "0 1px 2px rgba(0,0,0,0.05)",
  md: "0 1px 3px rgba(0,0,0,0.1)",
  lg: "0 4px 6px rgba(0,0,0,0.1)",
  xl: "0 10px 15px rgba(0,0,0,0.1)"
} as const

/** 过渡动画 */
export const transitions = {
  fast: "0.15s ease",
  normal: "0.2s ease",
  slow: "0.3s ease"
} as const

/** 侧边栏配置 */
export const sidebar = {
  width: 240,
  collapsedWidth: 64,
  itemHeight: 44,
  iconSize: 20
} as const

/** 布局 */
export const layout = {
  maxContentWidth: 900,
  headerHeight: 64,
  pageGutter: 16
} as const
