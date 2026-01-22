/**
 * API 请求客户端
 *
 * 直接调用 Bridge 处理逻辑（因为代码运行在 Service Worker 中）
 */

import type { BridgeResponse } from '~types/api';
import { handleBridgeRequest } from './bridge-handler';
import { withRetry, withTimeout } from '~lib/utils/retry';

/**
 * 通过 Content Script Bridge 发送请求
 *
 * @param targetHost 目标域名（如 'agentseller.temu.com'）
 * @param messageType 消息类型（默认 'bridge-fetch'）
 * @param payload 请求数据
 */
export async function bridgeRequest(
  targetHost: string,
  messageType: string = "bridge-fetch",
  payload: {
    url: string
    method?: string
    data?: any
    headers?: Record<string, string>
  }
): Promise<BridgeResponse> {
  console.log('[API Client] 请求:', payload.url);

  // 直接调用 Bridge 处理逻辑
  const result = await handleBridgeRequest(targetHost, {
    type: messageType,
    payload
  });

  if (!result.success) {
    throw new Error(result.error || '请求失败');
  }

  return result.data;
}

/**
 * 带重试的 Bridge 请求
 */
export async function bridgeRequestWithRetry(
  targetHost: string,
  messageType: string = "bridge-fetch",
  payload: {
    url: string
    method?: string
    data?: any
    headers?: Record<string, string>
  },
  options?: {
    maxRetries?: number
    timeout?: number
  }
): Promise<BridgeResponse> {
  const { maxRetries = 3, timeout = 30000 } = options || {}

  return withRetry(
    async () => {
      const promise = bridgeRequest(targetHost, messageType, payload)
      return withTimeout(promise, timeout, "请求超时")
    },
    {
      maxRetries,
      shouldRetry: (error) => {
        // 网络错误和超时错误可以重试
        return (
          error.message.includes('请求超时') ||
          error.message.includes('未找到') ||
          error.message.includes('Connection') ||
          error.message.includes('未就绪')
        );
      }
    }
  )
}
