/**
 * 侧边导航组件
 *
 * 显示模块菜单列表，支持：
 * - 模块图标和名称
 * - 当前选中状态高亮
 * - 点击导航
 */

import type { ModuleManifest } from "~types/module"

import {
  borderRadius,
  colors,
  sidebar,
  spacing,
  transitions,
  typography
} from "../styles/theme"

interface SidebarProps {
  /** 模块列表 */
  modules: ModuleManifest[]
  /** 当前活动模块 ID */
  activeModuleId: string
  /** 导航回调 */
  onNavigate: (moduleId: string) => void
}

/** 侧边栏样式 */
const styles = {
  sidebar: {
    width: sidebar.width,
    minHeight: "100vh",
    backgroundColor: colors.white,
    borderRight: `1px solid ${colors.gray[200]}`,
    display: "flex",
    flexDirection: "column" as const,
    flexShrink: 0
  },
  header: {
    padding: `${spacing.xl}px ${spacing.lg}px`,
    borderBottom: `1px solid ${colors.gray[200]}`
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: spacing.md
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.white,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold
  },
  logoText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.gray[800]
  },
  logoSubtext: {
    fontSize: typography.sizes.xs,
    color: colors.gray[500],
    marginTop: 2
  },
  nav: {
    flex: 1,
    padding: `${spacing.lg}px ${spacing.sm}px`,
    overflowY: "auto" as const
  },
  navTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.gray[400],
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    padding: `${spacing.sm}px ${spacing.md}px`,
    marginBottom: spacing.xs
  },
  menuItem: (isActive: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: spacing.md,
    padding: `${spacing.md}px ${spacing.md}px`,
    margin: `${spacing.xs}px 0`,
    borderRadius: borderRadius.md,
    cursor: "pointer",
    backgroundColor: isActive ? colors.info.bg : "transparent",
    color: isActive ? colors.primary : colors.gray[700],
    fontWeight: isActive
      ? typography.weights.medium
      : typography.weights.normal,
    fontSize: typography.sizes.md,
    transition: `all ${transitions.fast}`,
    border: "none",
    width: "100%",
    textAlign: "left" as const
  }),
  menuIcon: {
    fontSize: sidebar.iconSize,
    width: sidebar.iconSize,
    height: sidebar.iconSize,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  menuText: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const
  },
  footer: {
    padding: spacing.lg,
    borderTop: `1px solid ${colors.gray[200]}`,
    fontSize: typography.sizes.xs,
    color: colors.gray[400],
    textAlign: "center" as const
  }
}

export function Sidebar({ modules, activeModuleId, onNavigate }: SidebarProps) {
  // 过滤显示在菜单中的模块，并按 order 排序
  const visibleModules = modules
    .filter((m) => m.showInMenu !== false)
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))

  return (
    <aside style={styles.sidebar}>
      {/* Logo */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>A</div>
          <div>
            <div style={styles.logoText}>AutoTemu</div>
            <div style={styles.logoSubtext}>Temu 卖家助手</div>
          </div>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav style={styles.nav}>
        <div style={styles.navTitle}>功能模块</div>
        {visibleModules.map((module) => {
          const isActive = module.id === activeModuleId
          return (
            <button
              key={module.id}
              style={styles.menuItem(isActive)}
              onClick={() => onNavigate(module.id)}
              onMouseOver={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = colors.gray[50]
                }
              }}
              onMouseOut={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent"
                }
              }}>
              <span style={styles.menuIcon}>{module.icon}</span>
              <span style={styles.menuText}>{module.name}</span>
            </button>
          )
        })}
      </nav>

      {/* 底部 */}
      <div style={styles.footer}>v0.0.1</div>
    </aside>
  )
}
