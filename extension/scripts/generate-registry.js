/**
 * 模块注册表生成脚本
 *
 * 扫描 src/modules 目录，自动生成 _registry.ts
 * 新模块只需创建目录和文件，无需手动注册
 *
 * 使用方式：node scripts/generate-registry.js
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '..', 'src', 'modules');
const REGISTRY_FILE = path.join(MODULES_DIR, '_registry.ts');

/**
 * 扫描模块目录
 */
function scanModules() {
  const modules = [];

  // 确保 modules 目录存在
  if (!fs.existsSync(MODULES_DIR)) {
    fs.mkdirSync(MODULES_DIR, { recursive: true });
    return modules;
  }

  // 读取 modules 目录
  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    // 跳过非目录和以 _ 开头的项（如 _registry.ts）
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
      continue;
    }

    const modulePath = path.join(MODULES_DIR, entry.name);
    const manifestPath = path.join(modulePath, 'manifest.ts');
    const indexPath = path.join(modulePath, 'index.tsx');

    // 检查必要文件是否存在
    if (fs.existsSync(manifestPath) && fs.existsSync(indexPath)) {
      modules.push(entry.name);
      console.log(`[generate-registry] 发现模块: ${entry.name}`);
    } else {
      console.warn(`[generate-registry] 跳过不完整的模块目录: ${entry.name}`);
      if (!fs.existsSync(manifestPath)) {
        console.warn(`  - 缺少 manifest.ts`);
      }
      if (!fs.existsSync(indexPath)) {
        console.warn(`  - 缺少 index.tsx`);
      }
    }
  }

  return modules;
}

/**
 * 生成注册表文件内容
 */
function generateRegistryContent(modules) {
  const imports = modules
    .map((name) => `import { manifest as ${toCamelCase(name)}Manifest } from './${name}/manifest';`)
    .join('\n');

  const registryEntries = modules
    .map(
      (name) => `  '${toCamelCase(name)}': {
    manifest: ${toCamelCase(name)}Manifest,
    load: () => import('./${name}/index')
  }`
    )
    .join(',\n');

  return `/**
 * 模块注册表
 *
 * 此文件由 scripts/generate-registry.js 自动生成
 * 请勿手动修改！
 *
 * 生成时间：${new Date().toISOString()}
 */

import type { ModuleRegistry } from '~types/module';

${imports}

export const moduleRegistry: ModuleRegistry = {
${registryEntries}
};

/** 获取所有模块的元数据列表 */
export function getModuleManifests() {
  return Object.values(moduleRegistry).map((item) => item.manifest);
}

/** 根据 ID 获取模块 */
export function getModule(id: string) {
  return moduleRegistry[id];
}
`;
}

/**
 * 将 kebab-case 转换为 camelCase
 */
function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 主函数
 */
function main() {
  console.log('[generate-registry] 开始扫描模块...');

  const modules = scanModules();

  if (modules.length === 0) {
    console.log('[generate-registry] 未发现任何模块');
    // 生成空注册表
    const emptyContent = `/**
 * 模块注册表
 *
 * 此文件由 scripts/generate-registry.js 自动生成
 * 请勿手动修改！
 *
 * 生成时间：${new Date().toISOString()}
 */

import type { ModuleRegistry } from '~types/module';

export const moduleRegistry: ModuleRegistry = {};

/** 获取所有模块的元数据列表 */
export function getModuleManifests() {
  return [];
}

/** 根据 ID 获取模块 */
export function getModule(id: string) {
  return moduleRegistry[id];
}
`;
    fs.writeFileSync(REGISTRY_FILE, emptyContent, 'utf-8');
    console.log('[generate-registry] 已生成空注册表');
    return;
  }

  const content = generateRegistryContent(modules);
  fs.writeFileSync(REGISTRY_FILE, content, 'utf-8');

  console.log(`[generate-registry] 已生成注册表，包含 ${modules.length} 个模块`);
  console.log(`[generate-registry] 输出文件: ${REGISTRY_FILE}`);
}

main();
