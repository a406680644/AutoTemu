/**
 * 模块注册表
 *
 * 此文件由 scripts/generate-registry.js 自动生成
 * 请勿手动修改！
 *
 * 生成时间：2026-01-29T02:34:44.568Z
 */

import type { ModuleRegistry } from '~types/module';

import { manifest as runnerManifest } from './runner/manifest';

export const moduleRegistry: ModuleRegistry = {
  'runner': {
    manifest: runnerManifest,
    load: () => import('./runner/index')
  }
};

/** 获取所有模块的元数据列表 */
export function getModuleManifests() {
  return Object.values(moduleRegistry).map((item) => item.manifest);
}

/** 根据 ID 获取模块 */
export function getModule(id: string) {
  return moduleRegistry[id];
}
