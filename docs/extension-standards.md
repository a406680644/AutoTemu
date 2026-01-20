# Extension 开发标准规范

本文档定义了 AutoTemu 浏览器扩展的开发标准和最佳实践，所有团队成员应遵循这些规范以保持代码质量和一致性。

> **注意**: 本文档专注于开发规范和代码模式。功能介绍和基础教程请参考 [extension.md](./extension.md)。

## 目录

- [技术栈](#技术栈)
- [项目结构规范](#项目结构规范)
- [编码规范](#编码规范)
- [API 调用规范](#api-调用规范)
- [状态管理规范](#状态管理规范)
- [错误处理规范](#错误处理规范)
- [权限配置规范](#权限配置规范)
- [核心功能模板](#核心功能模板)
- [调试规范](#调试规范)
- [测试规范](#测试规范)
- [打包发布规范](#打包发布规范)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 技术栈

| 层级 | 技术 | 版本要求 |
|------|------|---------|
| 框架 | Plasmo | 最新稳定版 |
| UI | React | ^19.0.0 |
| 语言 | TypeScript | ^5.0.0 |
| 样式 | Tailwind CSS | ^3.0.0 |
| 构建 | Plasmo CLI | - |
| 目标 | Chrome/Firefox/Edge | Manifest V3 |

---

## 项目结构规范

### 目录结构

```
extension/
├── src/
│   ├── popup/                    # 扩展弹窗UI
│   │   ├── index.tsx             # Popup 主入口
│   │   ├── index.css             # Popup 样式
│   │   └── components/           # Popup 专用组件
│   │
│   ├── pages/                    # 独立页面
│   │   ├── options.tsx           # 设置页面
│   │   └── newtab.tsx            # 新标签页（可选）
│   │
│   ├── background/               # 后台脚本
│   │   ├── index.ts              # 主后台脚本
│   │   └── messages/             # 消息处理器
│   │
│   ├── content/                  # 内容脚本
│   │   ├── index.ts              # 主内容脚本
│   │   └── styles.css            # 注入样式
│   │
│   ├── components/               # 共享 React 组件
│   │   ├── ui/                   # 基础 UI 组件
│   │   └── common/               # 业务通用组件
│   │
│   ├── lib/                      # 工具库
│   │   ├── api/                  # API 客户端
│   │   ├── hooks/                # 自定义 Hooks
│   │   ├── utils/                # 工具函数
│   │   └── storage/              # 存储工具
│   │
│   ├── types/                    # 类型定义
│   │   ├── api.ts                # API 类型
│   │   ├── storage.ts            # 存储类型
│   │   └── common.ts             # 通用类型
│   │
│   └── constants/                # 常量定义
│       ├── config.ts             # 配置常量
│       └── messages.ts           # 消息类型常量
│
├── assets/                       # 静态资源
│   ├── icon.png                  # 扩展图标
│   └── images/                   # 图片资源
│
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
└── .env.example                  # 环境变量模板
```

### 文件用途说明

| 目录/文件 | 说明 | 运行环境 | 权限 |
|-----------|------|---------|------|
| **popup/** | 扩展菜单弹窗 | 扩展进程 | 有限 |
| **background/** | 后台脚本，处理消息、定时任务 | 后台进程（Service Worker） | 完整 |
| **content/** | 在网页中注入，可访问页面 DOM | 网页上下文 | 受限 |
| **pages/** | 完整页面（选项、新标签页） | 扩展进程 | 有限 |

---

## 编码规范

### 命名规范

| 类型 | 规范 | 示例 | 说明 |
|------|------|------|------|
| **文件名** | kebab-case | `user-card.tsx` | 组件文件可用 PascalCase |
| **组件名** | PascalCase | `UserCard` | React 组件 |
| **函数/变量** | camelCase | `getUserData` | 普通函数和变量 |
| **常量** | UPPER_SNAKE_CASE | `API_BASE_URL` | 配置常量 |
| **类型/接口** | PascalCase | `UserProfile` | TypeScript 类型 |
| **私有成员** | _prefix | `_handleClick` | 私有方法（非必需）|

### 组件编写规范

```tsx
// components/common/user-card.tsx
"use client";  // 仅在需要时添加

import { type FC, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * 用户卡片组件
 * @param user - 用户数据
 * @param className - 自定义样式类
 * @param onEdit - 编辑回调
 */
interface UserCardProps {
  user: User;
  className?: string;
  onEdit?: (id: string) => void;
}

export const UserCard: FC<UserCardProps> = ({
  user,
  className,
  onEdit,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // 副作用逻辑
  }, []);

  const handleEdit = () => {
    if (onEdit) {
      onEdit(user.id);
    }
  };

  return (
    <div className={cn("rounded-lg border p-4", className)}>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      {onEdit && (
        <button onClick={handleEdit}>编辑</button>
      )}
    </div>
  );
};
```

### TypeScript 规范

#### 类型提示要求

- ✅ **必须**为所有函数添加类型注解
- ✅ **必须**为组件 Props 定义接口
- ✅ **必须**为 API 响应定义类型
- ❌ **禁止**使用 `any`（除非必要）
- ✅ 优先使用 `interface` 定义对象类型
- ✅ 使用 `type` 定义联合类型和复杂类型

#### 类型定义示例

```typescript
// types/api.ts

// 用户类型
export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

// API 响应基础类型
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
  request_id?: string;
}

// API 错误类型
export interface ApiError {
  code: number;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
    type: string;
  }>;
  timestamp: string;
}

// 分页响应类型
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}
```

### 代码格式规范

```typescript
// ✅ 正确示例

// 1. 导入顺序：React → 第三方库 → 本地模块
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/hooks/use-auth";
import { apiClient } from "@/lib/api/client";

// 2. 常量定义
const MAX_RETRY = 3;
const API_TIMEOUT = 5000;

// 3. 类型定义
interface FormData {
  email: string;
  password: string;
}

// 4. 组件定义
export const LoginForm: FC = () => {
  // 4.1 Hooks
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  // 4.2 事件处理函数
  const handleSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await login(data);
    } catch (error) {
      console.error("登录失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 4.3 渲染
  return (
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  );
};
```

---

## API 调用规范

### API 客户端配置

```typescript
// lib/api/client.ts
import type { ApiResponse, ApiError } from "@/types/api";

const API_BASE = process.env.PLASMO_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/**
 * API 客户端类
 */
class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  /**
   * 获取存储的 Token
   */
  private async getToken(): Promise<string | null> {
    const result = await chrome.storage.local.get(["access_token"]);
    return result.access_token || null;
  }

  /**
   * 通用请求方法
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = await this.getToken();
    const url = `${this.baseURL}${endpoint}`;

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    // 处理错误响应
    if (!response.ok || data.code !== 0) {
      throw new ApiError(data);
    }

    return data;
  }

  /**
   * GET 请求
   */
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    const queryString = params ? `?${new URLSearchParams(params)}` : "";
    return this.request<T>(`${endpoint}${queryString}`, {
      method: "GET",
    });
  }

  /**
   * POST 请求
   */
  async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH 请求
   */
  async patch<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE 请求
   */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "DELETE",
    });
  }
}

// 自定义 API 错误类
export class ApiError extends Error {
  code: number;
  errors?: any[];

  constructor(data: ApiError) {
    super(data.message);
    this.name = "ApiError";
    this.code = data.code;
    this.errors = data.errors;
  }
}

export const apiClient = new ApiClient(API_BASE);
```

### API 调用模式

```typescript
// lib/api/users.ts
import { apiClient } from "./client";
import type { User, PaginatedResponse } from "@/types/api";

/**
 * 用户相关 API
 */
export const usersApi = {
  /**
   * 获取用户列表
   */
  async list(page: number = 1, pageSize: number = 20) {
    return apiClient.get<PaginatedResponse<User>>("/users", {
      page,
      page_size: pageSize,
    });
  },

  /**
   * 获取单个用户
   */
  async get(userId: string) {
    return apiClient.get<User>(`/users/${userId}`);
  },

  /**
   * 创建用户
   */
  async create(data: { email: string; password: string; full_name: string }) {
    return apiClient.post<User>("/users", data);
  },

  /**
   * 更新用户
   */
  async update(userId: string, data: Partial<User>) {
    return apiClient.patch<User>(`/users/${userId}`, data);
  },

  /**
   * 删除用户
   */
  async delete(userId: string) {
    return apiClient.delete<void>(`/users/${userId}`);
  },

  /**
   * 获取当前用户
   */
  async me() {
    return apiClient.get<User>("/users/me");
  },
};
```

### 在组件中使用 API

```tsx
// popup/index.tsx
import { useState, useEffect } from "react";
import { usersApi } from "@/lib/api/users";
import { ApiError } from "@/lib/api/client";
import type { User } from "@/types/api";

function IndexPopup() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await usersApi.list(1, 10);
      setUsers(response.data.items);
    } catch (err) {
      if (err instanceof ApiError) {
        // 处理业务错误
        if (err.code === 1003) {
          // Token 过期，跳转登录
          setError("登录已过期，请重新登录");
        } else {
          setError(err.message);
        }
      } else {
        setError("网络错误，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-96 p-4">
      <h2 className="text-xl font-bold mb-4">用户列表</h2>

      {loading && <p>加载中...</p>}
      {error && <p className="text-red-500">{error}</p>}

      <ul className="space-y-2">
        {users.map((user) => (
          <li key={user.id} className="border p-2 rounded">
            <p className="font-medium">{user.full_name}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default IndexPopup;
```

---

## 状态管理规范

### Chrome Storage 使用规范

```typescript
// lib/storage/index.ts

/**
 * 存储 Key 常量
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: "access_token",
  USER_INFO: "user_info",
  SETTINGS: "settings",
} as const;

/**
 * 存储工具类
 */
export const storage = {
  /**
   * 保存 Token
   */
  async setToken(token: string): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.ACCESS_TOKEN]: token });
  },

  /**
   * 获取 Token
   */
  async getToken(): Promise<string | null> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.ACCESS_TOKEN]);
    return result[STORAGE_KEYS.ACCESS_TOKEN] || null;
  },

  /**
   * 清除 Token
   */
  async clearToken(): Promise<void> {
    await chrome.storage.local.remove([STORAGE_KEYS.ACCESS_TOKEN]);
  },

  /**
   * 保存用户信息
   */
  async setUserInfo(user: User): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.USER_INFO]: user });
  },

  /**
   * 获取用户信息
   */
  async getUserInfo(): Promise<User | null> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.USER_INFO]);
    return result[STORAGE_KEYS.USER_INFO] || null;
  },

  /**
   * 清除所有数据
   */
  async clear(): Promise<void> {
    await chrome.storage.local.clear();
  },
};
```

### 自定义 Hooks

```typescript
// lib/hooks/use-auth.ts
import { useState, useEffect } from "react";
import { storage } from "@/lib/storage";
import type { User } from "@/types/api";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    setIsLoading(true);
    try {
      const userInfo = await storage.getUserInfo();
      setUser(userInfo);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: { email: string; password: string }) => {
    // 登录逻辑
    const response = await apiClient.post("/login/access-token", credentials);
    await storage.setToken(response.data.access_token);
    await loadUser();
  };

  const logout = async () => {
    await storage.clear();
    setUser(null);
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
```

---

## 错误处理规范

### 业务状态码处理

```typescript
// lib/utils/error-handler.ts
import { BusinessCode } from "@autotemu/shared";
import type { ApiError } from "@/lib/api/client";

/**
 * 统一错误处理器
 */
export function handleApiError(error: ApiError): string {
  switch (error.code) {
    // 认证错误
    case BusinessCode.AUTH_REQUIRED:
    case BusinessCode.AUTH_INVALID_TOKEN:
    case BusinessCode.AUTH_TOKEN_EXPIRED:
      // 清除 Token，跳转登录
      chrome.storage.local.remove(["access_token"]);
      return "登录已过期，请重新登录";

    case BusinessCode.AUTH_INVALID_CREDENTIALS:
      return "用户名或密码错误";

    case BusinessCode.AUTH_USER_DISABLED:
      return "账号已被禁用，请联系管理员";

    // 权限错误
    case BusinessCode.PERMISSION_DENIED:
      return "您没有权限执行此操作";

    // 资源错误
    case BusinessCode.RESOURCE_NOT_FOUND:
      return "资源不存在";

    case BusinessCode.RESOURCE_ALREADY_EXISTS:
      return "资源已存在";

    // 业务错误
    case BusinessCode.VALIDATION_ERROR:
      return "数据验证失败，请检查输入";

    case BusinessCode.RATE_LIMIT_EXCEEDED:
      return "操作过于频繁，请稍后再试";

    // 系统错误
    case BusinessCode.INTERNAL_ERROR:
    case BusinessCode.DATABASE_ERROR:
      return "服务器错误，请稍后重试";

    case BusinessCode.SERVICE_UNAVAILABLE:
      return "服务暂时不可用，请稍后重试";

    default:
      return error.message || "未知错误";
  }
}
```

### Toast 通知（推荐）

```typescript
// lib/utils/toast.ts

/**
 * 简单的 Toast 通知工具
 */
export const toast = {
  success(message: string) {
    console.log("✅", message);
    // 可以使用 Chrome Notifications API
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "成功",
      message,
    });
  },

  error(message: string) {
    console.error("❌", message);
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "错误",
      message,
    });
  },

  info(message: string) {
    console.info("ℹ️", message);
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "提示",
      message,
    });
  },
};
```

---

## 权限配置规范

### package.json 配置

```json
{
  "manifest": {
    "permissions": [
      "storage",          // 本地存储（必需）
      "activeTab",        // 访问当前标签页（需要操作页面时）
      "notifications",    // 通知权限（可选）
      "alarms"            // 定时任务（需要后台任务时）
    ],
    "host_permissions": [
      "http://localhost:8000/*",          // 开发环境 API
      "https://api.autotemu.com/*"        // 生产环境 API
    ],
    "action": {
      "default_popup": "popup.html",
      "default_icon": {
        "16": "assets/icon.png",
        "48": "assets/icon.png",
        "128": "assets/icon.png"
      }
    }
  }
}
```

### 权限最小化原则

- ✅ **只申请必需的权限**
- ❌ **禁止**使用 `<all_urls>` 除非业务必需
- ✅ 在文档中说明每个权限的用途
- ✅ 定期审查权限列表，移除不必要的权限

---

## 核心功能模板

### 1. Popup 模板

```tsx
// popup/index.tsx
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/hooks/use-auth";
import { usersApi } from "@/lib/api/users";
import { handleApiError } from "@/lib/utils/error-handler";
import { toast } from "@/lib/utils/toast";
import type { User } from "@/types/api";
import "./index.css";

function IndexPopup() {
  const { user, isAuthenticated, logout } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadUsers();
    }
  }, [isAuthenticated]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await usersApi.list();
      setUsers(response.data.items);
    } catch (error) {
      const message = handleApiError(error);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.info("已退出登录");
  };

  if (!isAuthenticated) {
    return (
      <div className="w-96 p-4">
        <p>请先登录</p>
      </div>
    );
  }

  return (
    <div className="w-96 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">AutoTemu</h2>
        <button onClick={handleLogout} className="text-sm text-red-500">
          退出
        </button>
      </div>

      {loading ? (
        <p>加载中...</p>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id} className="border p-2 rounded">
              <p className="font-medium">{user.full_name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default IndexPopup;
```

### 2. Background Script 模板

```typescript
// background/index.ts
import { storage } from "@/lib/storage";

/**
 * 扩展安装时初始化
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    console.log("扩展已安装");
    // 初始化设置
    await chrome.storage.local.set({
      settings: {
        theme: "light",
        notifications: true,
      },
    });
  }
});

/**
 * 监听来自 Content Script 或 Popup 的消息
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, data } = request;

  (async () => {
    try {
      switch (action) {
        case "GET_USER":
          const user = await storage.getUserInfo();
          sendResponse({ success: true, data: user });
          break;

        case "SAVE_DATA":
          await chrome.storage.local.set({ customData: data });
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: "Unknown action" });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // 保持消息通道开放（异步响应）
});

/**
 * 定时任务：每小时同步数据
 */
chrome.alarms.create("sync-data", {
  periodInMinutes: 60,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sync-data") {
    console.log("执行数据同步");
    // 执行同步逻辑
  }
});

/**
 * 监听扩展图标点击
 */
chrome.action.onClicked.addListener((tab) => {
  console.log("扩展图标被点击，标签页:", tab.id);
  // 可以执行特定操作
});
```

### 3. Content Script 模板

```typescript
// content/index.ts
import type { PlasmoCSConfig } from "plasmo";

/**
 * 配置：指定脚本运行的网站
 */
export const config: PlasmoCSConfig = {
  matches: ["https://*.example.com/*"],
  run_at: "document_end",
};

/**
 * 提取页面数据
 */
function extractPageData() {
  return {
    title: document.title,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 初始化：页面加载时执行
 */
(async () => {
  console.log("Content Script 已加载");

  // 提取页面数据
  const pageData = extractPageData();

  // 发送消息到后台脚本
  chrome.runtime.sendMessage(
    {
      action: "PAGE_LOADED",
      data: pageData,
    },
    (response) => {
      console.log("后台响应:", response);
    }
  );
})();

/**
 * 监听来自后台脚本的消息
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request;

  switch (action) {
    case "GET_PAGE_CONTENT":
      const content = document.body.innerText.substring(0, 1000);
      sendResponse({ content });
      break;

    case "HIGHLIGHT_TEXT":
      // 高亮指定文本
      const { text } = request.data;
      highlightText(text);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: "Unknown action" });
  }

  return true;
});

/**
 * 工具函数：高亮文本
 */
function highlightText(text: string) {
  // 实现文本高亮逻辑
  console.log("高亮文本:", text);
}
```

### 4. Options Page 模板

```tsx
// pages/options.tsx
import { useState, useEffect } from "react";
import { storage } from "@/lib/storage";

interface Settings {
  theme: "light" | "dark";
  notifications: boolean;
  syncInterval: number;
}

function OptionsPage() {
  const [settings, setSettings] = useState<Settings>({
    theme: "light",
    notifications: true,
    syncInterval: 60,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const result = await chrome.storage.local.get(["settings"]);
    if (result.settings) {
      setSettings(result.settings);
    }
  };

  const handleSave = async () => {
    await chrome.storage.local.set({ settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">AutoTemu 设置</h1>

      <div className="space-y-6">
        {/* 主题设置 */}
        <div>
          <label className="block font-medium mb-2">主题</label>
          <select
            value={settings.theme}
            onChange={(e) =>
              setSettings({ ...settings, theme: e.target.value as any })
            }
            className="border rounded px-3 py-2"
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>

        {/* 通知设置 */}
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(e) =>
                setSettings({ ...settings, notifications: e.target.checked })
              }
              className="mr-2"
            />
            启用通知
          </label>
        </div>

        {/* 同步间隔 */}
        <div>
          <label className="block font-medium mb-2">
            同步间隔（分钟）
          </label>
          <input
            type="number"
            value={settings.syncInterval}
            onChange={(e) =>
              setSettings({ ...settings, syncInterval: Number(e.target.value) })
            }
            min={1}
            max={1440}
            className="border rounded px-3 py-2"
          />
        </div>

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          {saved ? "已保存 ✓" : "保存设置"}
        </button>
      </div>
    </div>
  );
}

export default OptionsPage;
```

---

## 调试规范

### 调试工具和方法

| 组件 | 调试方法 | DevTools 位置 |
|------|---------|--------------|
| **Popup** | 右键扩展图标 → 检查弹出内容 | 独立 DevTools |
| **Background Script** | 扩展管理页面 → Service Worker 链接 | 独立 DevTools |
| **Content Script** | 目标网页 → F12 → Console | 网页 DevTools |
| **Options Page** | 右键页面 → 检查 | 独立 DevTools |

### 日志规范

```typescript
// lib/utils/logger.ts

/**
 * 日志级别
 */
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志工具类
 */
class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(message: string, ...args: any[]) {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]) {
    if (this.level <= LogLevel.INFO) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

export const logger = new Logger();

// 生产环境禁用 DEBUG 日志
if (process.env.NODE_ENV === "production") {
  logger.setLevel(LogLevel.INFO);
}
```

### 调试技巧

```typescript
// 1. 条件断点
if (user.id === "specific-id") {
  debugger; // 仅在特定条件下触发
}

// 2. 性能监控
console.time("loadUsers");
await usersApi.list();
console.timeEnd("loadUsers");

// 3. 追踪网络请求
logger.debug("发送 API 请求", {
  url: "/users",
  method: "GET",
  timestamp: Date.now(),
});

// 4. 检查 Storage
chrome.storage.local.get(null, (items) => {
  console.log("所有存储数据:", items);
});
```

---

## 测试规范

### 单元测试（推荐工具：Vitest）

```typescript
// __tests__/lib/storage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { storage, STORAGE_KEYS } from "@/lib/storage";

// Mock Chrome API
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
} as any;

describe("Storage Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should save and get token", async () => {
    const token = "test-token";

    // Mock set
    chrome.storage.local.set.mockResolvedValue(undefined);
    await storage.setToken(token);

    // Mock get
    chrome.storage.local.get.mockResolvedValue({
      [STORAGE_KEYS.ACCESS_TOKEN]: token,
    });
    const result = await storage.getToken();

    expect(result).toBe(token);
  });

  it("should clear token", async () => {
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await storage.clearToken();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith([
      STORAGE_KEYS.ACCESS_TOKEN,
    ]);
  });
});
```

### E2E 测试（推荐工具：Playwright）

```typescript
// e2e/popup.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Popup", () => {
  test("should display user list when authenticated", async ({ page }) => {
    // 加载扩展 Popup
    await page.goto("chrome-extension://<extension-id>/popup.html");

    // 检查标题
    await expect(page.locator("h2")).toHaveText("AutoTemu");

    // 检查用户列表
    const users = page.locator("ul > li");
    await expect(users).toHaveCount(10);
  });

  test("should show login prompt when not authenticated", async ({ page }) => {
    // 清除 Storage
    await page.evaluate(() => chrome.storage.local.clear());

    await page.goto("chrome-extension://<extension-id>/popup.html");

    // 检查登录提示
    await expect(page.locator("text=请先登录")).toBeVisible();
  });
});
```

---

## 打包发布规范

### 构建生产版本

```bash
# 构建所有浏览器版本
pnpm build

# 仅构建 Chrome
pnpm build --target=chrome-mv3

# 仅构建 Firefox
pnpm build --target=firefox-mv3
```

### 发布前检查清单

- [ ] **代码质量**
  - [ ] 通过 ESLint 检查
  - [ ] 通过 TypeScript 类型检查
  - [ ] 通过所有测试
- [ ] **功能测试**
  - [ ] Popup 正常显示
  - [ ] API 调用成功
  - [ ] Content Script 正常注入
  - [ ] Background Script 正常运行
- [ ] **权限审查**
  - [ ] 权限最小化
  - [ ] 已说明每个权限用途
- [ ] **资源检查**
  - [ ] 图标尺寸正确（16x16, 48x48, 128x128）
  - [ ] 无敏感信息泄露
  - [ ] 无调试代码
- [ ] **版本号**
  - [ ] 更新 `package.json` 版本号
  - [ ] 更新 CHANGELOG

### 打包为 ZIP

```bash
cd build/chrome-mv3-prod
zip -r ../../autotemu-chrome-v1.0.0.zip .

cd ../firefox-mv3-prod
zip -r ../../autotemu-firefox-v1.0.0.zip .
```

### 发布到商店

#### Chrome Web Store

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 点击"新建应用"
3. 上传 ZIP 文件
4. 填写应用信息
5. 提交审核

#### Firefox Add-ons

1. 访问 [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/)
2. 提交新附加组件
3. 上传 ZIP 文件
4. 填写附加组件信息
5. 提交审核

---

## 最佳实践

### 1. 安全性

- ✅ **永远不要**在代码中硬编码敏感信息（API Key、密码等）
- ✅ 使用 HTTPS 进行所有 API 通信
- ✅ 验证所有用户输入
- ✅ 使用 Content Security Policy (CSP)
- ✅ 定期更新依赖包，修复安全漏洞

### 2. 性能优化

- ✅ 减少 Background Script 的计算密集型操作
- ✅ 使用 `chrome.alarms` 替代 `setInterval`
- ✅ 懒加载非关键资源
- ✅ 缓存 API 响应（使用 `chrome.storage`）
- ✅ 优化图片资源大小

### 3. 用户体验

- ✅ 提供清晰的错误提示
- ✅ 显示加载状态
- ✅ 支持键盘快捷键
- ✅ 响应式设计（适配不同分辨率）
- ✅ 国际化支持（i18n）

### 4. 代码质量

- ✅ 遵循 DRY 原则（Don't Repeat Yourself）
- ✅ 单一职责原则
- ✅ 代码注释清晰
- ✅ 保持函数简短（< 50 行）
- ✅ 使用有意义的变量名

---

## 常见问题

### Q1: Content Script 无法访问 chrome.storage？

**原因**: Content Script 运行在网页上下文，有部分 Chrome API 限制。

**解决**:
```typescript
// ❌ 错误：直接在 Content Script 中使用
await chrome.storage.local.get(["token"]);

// ✅ 正确：通过 Background Script 代理
chrome.runtime.sendMessage({ action: "GET_TOKEN" }, (response) => {
  console.log("Token:", response.token);
});
```

### Q2: API 请求出现 CORS 错误？

**原因**: Content Script 发起的请求受同源策略限制。

**解决**:
```typescript
// 方案1: 在 Background Script 中发起请求
// background/index.ts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "API_CALL") {
    fetch(request.url, request.options)
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error }));
    return true;
  }
});

// 方案2: 配置后端 CORS 允许扩展来源
// backend: allow_origins = ["chrome-extension://*"]
```

### Q3: Popup 关闭后状态丢失？

**原因**: Popup 关闭后会销毁，状态不会保留。

**解决**:
```typescript
// 使用 chrome.storage 持久化状态
const [data, setData] = useState([]);

useEffect(() => {
  // 加载状态
  chrome.storage.local.get(["cachedData"], (result) => {
    if (result.cachedData) {
      setData(result.cachedData);
    }
  });
}, []);

useEffect(() => {
  // 保存状态
  if (data.length > 0) {
    chrome.storage.local.set({ cachedData: data });
  }
}, [data]);
```

### Q4: 如何调试 Service Worker？

**方法**:
1. 打开 `chrome://extensions/`
2. 找到扩展，点击"Service Worker"链接
3. 在 DevTools 中查看日志
4. 使用 `chrome.runtime.reload()` 重新加载扩展

### Q5: 如何在开发环境和生产环境使用不同的 API URL？

**解决**:
```bash
# .env.development
PLASMO_PUBLIC_API_URL=http://localhost:8000/api/v1

# .env.production
PLASMO_PUBLIC_API_URL=https://api.autotemu.com/api/v1
```

```typescript
// lib/api/client.ts
const API_BASE = process.env.PLASMO_PUBLIC_API_URL;
```

---

## 附录

### 相关文档

- [Extension 功能介绍](./extension.md)
- [开发规范](./DEVELOPMENT.md)
- [API 标准规范](./API-STANDARDS.md)
- [Plasmo 官方文档](https://docs.plasmo.com/)
- [Chrome Extensions 官方文档](https://developer.chrome.com/docs/extensions/)

### 常用命令

```bash
# 开发
pnpm dev              # 启动开发服务器（热重载）
pnpm build            # 构建生产版本
pnpm type-check       # TypeScript 类型检查
pnpm lint             # ESLint 检查
pnpm lint:fix         # 自动修复 ESLint 问题
pnpm test             # 运行测试
pnpm test:watch       # 监听模式运行测试
```

### 版本历史

- **v1.0.0** (2025-01-16) - 初始版本

---

**文档维护**: 本文档由开发团队维护，如有问题或建议，请提交 Issue 或 PR。
