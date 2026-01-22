/**
 * 应用外壳组件
 *
 * 提供统一的应用布局：
 * - 左侧：侧边栏导航
 * - 右侧：模块内容区
 */

import type { ReactNode } from "react"

import type { ModuleManifest } from "~types/module"

import { colors, typography } from "../styles/theme"
import { Sidebar } from "./Sidebar"

interface AppShellProps {
  /** 模块列表 */
  modules: ModuleManifest[]
  /** 当前活动模块 ID */
  activeModuleId: string
  /** 导航回调 */
  onNavigate: (moduleId: string) => void
  /** 内容区子组件 */
  children: ReactNode
}

/** 布局样式 */
const styles = {
  container: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: typography.fontFamily
  },
  main: {
    flex: 1,
    backgroundColor: colors.gray[50],
    overflow: "auto"
  },
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    color: colors.gray[500],
    fontSize: typography.sizes.lg
  }
}

export function AppShell({
  modules,
  activeModuleId,
  onNavigate,
  children
}: AppShellProps) {
  return (
    <div style={styles.container}>
      <Sidebar
        modules={modules}
        activeModuleId={activeModuleId}
        onNavigate={onNavigate}
      />
      <main style={styles.main}>{children}</main>
    </div>
  )
}

/** 加载中占位组件 */
export function ModuleLoading() {
  return (
    <div style={styles.loading}>
      <span>加载中...</span>
    </div>
  )
}

/** 模块未找到占位组件 */
export function ModuleNotFound({ moduleId }: { moduleId: string }) {
  return (
    <div style={styles.loading}>
      <span>模块 "{moduleId}" 未找到</span>
    </div>
  )
}
