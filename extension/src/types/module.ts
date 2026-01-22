/**
 * 模块系统类型定义
 *
 * 用于模块化菜单系统，支持多人协作开发
 */

import type { ComponentType } from "react"

/**
 * 模块元数据
 * 定义模块的基本信息，用于菜单展示和路由
 */
export interface ModuleManifest {
  /** 模块唯一 ID（用于路由，如 'runner'、'settings'） */
  id: string
  /** 菜单显示名称 */
  name: string
  /** 模块描述（可选） */
  description?: string
  /** 菜单图标（emoji 或图标名称） */
  icon: string
  /** 排序权重（数字越小越靠前，默认 100） */
  order?: number
  /** 是否显示在菜单中（默认 true） */
  showInMenu?: boolean
  /** 开发者姓名（可选） */
  author?: string
}

/**
 * 模块组件 Props
 * 所有模块组件都会接收这些 props
 */
export interface ModuleProps {
  /** 当前模块 ID */
  moduleId: string
  /** 导航到其他模块的函数 */
  navigate: (moduleId: string) => void
}

/**
 * 模块定义
 * 包含模块元数据和组件
 */
export interface ModuleDefinition {
  /** 模块元数据 */
  manifest: ModuleManifest
  /** 模块组件（懒加载） */
  component: ComponentType<ModuleProps>
}

/**
 * 模块注册表项
 * 用于自动生成的注册表
 */
export interface ModuleRegistryItem {
  /** 模块元数据 */
  manifest: ModuleManifest
  /** 模块组件懒加载函数 */
  load: () => Promise<{ default: ComponentType<ModuleProps> }>
}

/**
 * 模块注册表
 * 模块 ID 到注册表项的映射
 */
export type ModuleRegistry = Record<string, ModuleRegistryItem>
