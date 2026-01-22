/**
 * AutoTemu 主应用入口
 *
 * 模块化容器，负责：
 * - 加载模块注册表
 * - 路由管理（基于 URL Hash）
 * - 渲染侧边栏和当前模块
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react"

import {
  AppShell,
  ModuleLoading,
  ModuleNotFound
} from "~components/layout/AppShell"
import { getModule, getModuleManifests } from "~modules/_registry"
import type { ModuleProps } from "~types/module"

/** 默认模块 ID */
const DEFAULT_MODULE_ID = "runner"

/** 从 URL Hash 获取当前模块 ID */
function getModuleIdFromHash(): string {
  const hash = window.location.hash.slice(1) // 移除 #
  return hash || DEFAULT_MODULE_ID
}

export default function MainApp() {
  const [activeModuleId, setActiveModuleId] = useState(getModuleIdFromHash)
  const modules = useMemo(() => getModuleManifests(), [])

  // 监听 URL Hash 变化
  useEffect(() => {
    function handleHashChange() {
      setActiveModuleId(getModuleIdFromHash())
    }

    window.addEventListener("hashchange", handleHashChange)
    return () => window.removeEventListener("hashchange", handleHashChange)
  }, [])

  // 导航函数
  function navigate(moduleId: string) {
    window.location.hash = moduleId
  }

  // 获取当前模块
  const currentModule = getModule(activeModuleId)

  // 懒加载当前模块组件
  const ModuleComponent = useMemo(() => {
    if (!currentModule) return null
    return lazy(currentModule.load)
  }, [activeModuleId, currentModule])

  // 模块 Props
  const moduleProps: ModuleProps = {
    moduleId: activeModuleId,
    navigate
  }

  return (
    <AppShell
      modules={modules}
      activeModuleId={activeModuleId}
      onNavigate={navigate}>
      {ModuleComponent ? (
        <Suspense fallback={<ModuleLoading />}>
          <ModuleComponent {...moduleProps} />
        </Suspense>
      ) : (
        <ModuleNotFound moduleId={activeModuleId} />
      )}
    </AppShell>
  )
}
