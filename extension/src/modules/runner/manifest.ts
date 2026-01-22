/**
 * RPA 运行模块元数据
 */

import type { ModuleManifest } from "~types/module"

export const manifest: ModuleManifest = {
  id: "runner",
  name: "RPA 运行",
  description: "自动化任务执行和监控",
  icon: "▶",
  order: 10,
  showInMenu: true,
  author: "AutoTemu Team"
}
