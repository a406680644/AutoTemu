/**
 * API 请求客户端
 *
 * 提供统一的请求接口，通过 Content Script Bridge 发送跨域请求
 */

import type { BridgeRequest, BridgeResponse } from '~types/api';
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
  messageType: string = 'bridge-fetch',
  payload: {
    url: string;
    method?: string;
    data?: any;
    headers?: Record<string, string>;
  }
): Promise<BridgeResponse> {
  // 包装请求为 BRIDGE_REQUEST 消息
  const message = {
    type: 'BRIDGE_REQUEST',
    targetHost,
    requestData: {
      type: messageType,
      payload
    }
  };

  // 发送消息到 Background Service Worker
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.success) {
        reject(new Error(response?.error || '请求失败'));
        return;
      }

      resolve(response.data);
    });
  });
}

/**
 * 带重试的 Bridge 请求
 */
export async function bridgeRequestWithRetry(
  targetHost: string,
  messageType: string = 'bridge-fetch',
  payload: {
    url: string;
    method?: string;
    data?: any;
    headers?: Record<string, string>;
  },
  options?: {
    maxRetries?: number;
    timeout?: number;
  }
): Promise<BridgeResponse> {
  const { maxRetries = 3, timeout = 30000 } = options || {};

  return withRetry(
    async () => {
      const promise = bridgeRequest(targetHost, messageType, payload);
      return withTimeout(promise, timeout, '请求超时');
    },
    {
      maxRetries,
      shouldRetry: (error) => {
        // 网络错误和超时错误可以重试
        return (
          error.message.includes('请求超时') ||
          error.message.includes('未找到') ||
          error.message.includes('Connection')
        );
      }
    }
  );
}
