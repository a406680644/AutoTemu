# Plasmo 开发命令指南

## 目录结构约定

```
extension/
├── src/
│   ├── background/          # Service Worker（后台脚本）
│   │   ├── index.ts          # 入口文件
│   │   └── messages/         # Plasmo Messaging 处理器
│   │       └── *.ts          # 消息处理器文件
│   ├── contents/             # Content Scripts
│   │   └── *.ts              # 内容脚本（注入页面）
│   ├── options/              # 配置页面 ⚠️ 必须在 src/options/
│   │   └── index.tsx         # 配置页面入口
│   ├── tabs/                 # 自定义标签页 ⚠️ 必须在 src/tabs/
│   │   └── *.tsx             # 每个文件生成一个标签页
│   ├── popup/                # 弹出页面
│   │   └── index.tsx         # 弹出页面入口
│   ├── lib/                  # 工具库
│   └── types/                # 类型定义
├── assets/                   # 静态资源（图标等）
├── .plasmo/                  # 自动生成（勿手动修改）
├── build/                    # 构建输出
│   ├── chrome-mv3-dev/       # 开发版本
│   └── chrome-mv3-prod/      # 生产版本
├── package.json              # 项目配置
└── tsconfig.json             # TypeScript 配置
```

---

## 核心命令

### 开发模式

```bash
# 启动开发服务器（热重载）
pnpm dev:plasmo
# 或
npx plasmo dev

# 指定浏览器
npx plasmo dev --target=firefox-mv2
npx plasmo dev --target=chrome-mv3  # 默认
```

**开发模式特点：**
- 自动热重载（修改代码后自动刷新扩展）
- 生成 `build/chrome-mv3-dev/` 目录
- 扩展名称前缀 `DEV |`
- 包含 Source Map 便于调试

### 生产构建

```bash
# 构建生产版本
pnpm build:plasmo
# 或
npx plasmo build

# 指定目标平台
npx plasmo build --target=firefox-mv2
npx plasmo build --target=chrome-mv3  # 默认

# 带 Source Map（用于调试生产问题）
npx plasmo build --source-maps
```

**生产版本特点：**
- 输出到 `build/chrome-mv3-prod/`
- 代码压缩优化
- 移除开发相关代码
- 可直接上传到 Chrome Web Store

### 打包发布

```bash
# 打包为 ZIP（用于商店提交）
npx plasmo package

# 指定目标
npx plasmo package --target=chrome-mv3
```

---

## Windows 特殊说明

在 Windows Git Bash 中，`npx plasmo` 可能无输出。使用以下方式：

```bash
# 方式 1：直接调用 node
node ./node_modules/plasmo/dist/index.js build

# 方式 2：使用 pnpm
pnpm exec plasmo build

# 方式 3：使用 pnpm scripts
pnpm build:plasmo
```

---

## 依赖管理

### 运行时依赖（dependencies）

这些包在扩展运行时需要，必须放在 `dependencies`：

```json
{
  "dependencies": {
    "plasmo": "0.90.5",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "@plasmohq/messaging": "0.6.2",  // Plasmo 消息 API
    "@plasmohq/storage": "1.15.0"    // Plasmo 存储 API
  }
}
```

### 开发依赖（devDependencies）

仅开发时需要：

```json
{
  "devDependencies": {
    "@types/chrome": "0.0.258",
    "@types/react": "18.2.48",
    "typescript": "5.3.3"
  }
}
```

---

## tsconfig.json 最佳配置

```json
{
  "extends": "plasmo/templates/tsconfig.base",
  "exclude": ["node_modules"],
  "include": ["./**/*.ts", "./**/*.tsx"],
  "compilerOptions": {
    "paths": {
      "~*": ["./src/*"]
    },
    "baseUrl": "."
  }
}
```

**注意：**
- 不要手动添加 `jsx`、`moduleResolution`、`skipLibCheck` 等配置
- `plasmo/templates/tsconfig.base` 已包含所有必要配置
- 修改后需重启 TypeScript 服务器：`Ctrl+Shift+P` → `TypeScript: Restart TS Server`

---

## package.json manifest 配置

```json
{
  "manifest": {
    "host_permissions": [
      "https://example.com/*"
    ],
    "permissions": [
      "storage",
      "alarms",
      "tabs",
      "scripting"
    ],
    "options_ui": {
      "page": "options.html",
      "open_in_tab": true
    }
  }
}
```

---

## 常见文件路径映射

| 源文件 | 构建输出 | manifest 配置 |
|--------|----------|---------------|
| `src/background/index.ts` | `static/background/index.js` | `background.service_worker` |
| `src/popup/index.tsx` | `popup.html` + `popup.*.js` | `action.default_popup` |
| `src/options/index.tsx` | `options.html` + `options.*.js` | `options_ui.page` |
| `src/tabs/runner.tsx` | `tabs/runner.html` + `tabs/runner.*.js` | 无（通过 `chrome.tabs.create` 打开） |
| `src/contents/*.ts` | `*.js` | `content_scripts` |

---

## 打开自定义标签页

```typescript
// 在扩展代码中打开 tabs/runner.tsx 页面
chrome.tabs.create({
  url: chrome.runtime.getURL('tabs/runner.html')
});
```

---

## Plasmo Messaging API

### 目录结构

```
src/background/messages/
├── get-status.ts     # 处理 get-status 消息
├── run-task.ts       # 处理 run-task 消息
└── export-csv.ts     # 处理 export-csv 消息
```

### 消息处理器示例

```typescript
// src/background/messages/get-status.ts
import type { PlasmoMessaging } from "@plasmohq/messaging";

export interface GetStatusRequest {
  // 请求参数
}

export interface GetStatusResponse {
  status: string;
  progress: number;
}

const handler: PlasmoMessaging.MessageHandler<
  GetStatusRequest,
  GetStatusResponse
> = async (req, res) => {
  // 处理逻辑
  res.send({
    status: 'running',
    progress: 50
  });
};

export default handler;
```

### 发送消息

```typescript
import { sendToBackground } from "@plasmohq/messaging";

const response = await sendToBackground<GetStatusRequest, GetStatusResponse>({
  name: "get-status",  // 对应 messages/get-status.ts
  body: {}
});
```

---

## Content Script 配置

```typescript
// src/contents/my-script.ts
import type { PlasmoCSConfig } from "plasmo";

export const config: PlasmoCSConfig = {
  matches: ["https://example.com/*"],
  run_at: "document_end",
  all_frames: false
};

// 脚本逻辑...
```

---

## 调试技巧

### 查看 Service Worker

1. 打开 `chrome://extensions/`
2. 找到扩展，点击 "Service Worker" 链接
3. 打开 DevTools 查看日志

### 查看 Content Script

1. 打开目标网页
2. 按 F12 打开 DevTools
3. 在 Console 中查看日志

### 检查构建产物

```bash
# 查看构建输出
ls -la build/chrome-mv3-prod/

# 查看 manifest
cat build/chrome-mv3-prod/manifest.json
```

### 清理缓存重建

```bash
# 完全清理并重建
rm -rf .plasmo build node_modules/.cache
pnpm install
pnpm build:plasmo
```

---

## 常见问题

### 1. 模块找不到错误

```
找不到模块"plasmo"或其相应的类型声明。ts(2307)
```

**解决方案：**
1. 确保 `pnpm dev:plasmo` 正在运行（生成 `.plasmo` 目录）
2. 重启 TypeScript 服务器

### 2. Options/Tabs 页面未包含在构建中

**解决方案：**
- Options 必须在 `src/options/index.tsx`
- Tabs 必须在 `src/tabs/*.tsx`
- 不是 `pages/` 目录！

### 3. @plasmohq/messaging 警告

```
@plasmohq/messaging is not installed, skipping messaging API
```

**解决方案：**
将 `@plasmohq/messaging` 从 `devDependencies` 移到 `dependencies`

### 4. Windows 下命令无输出

**解决方案：**
```bash
node ./node_modules/plasmo/dist/index.js build
```

---

## 参考资源

- [Plasmo 官方文档](https://docs.plasmo.com/)
- [Plasmo GitHub](https://github.com/AntonySkidmore/plasmo)
- [Chrome Extension MV3 文档](https://developer.chrome.com/docs/extensions/mv3/)
