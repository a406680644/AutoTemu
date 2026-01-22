/**
 * Bridge 请求处理核心逻辑
 *
 * Content Script 消息传递方案
 * 参考项目模式：manifest 自动注入 + 动态注入 fallback
 */

export interface BridgeRequestPayload {
  url: string;
  method?: string;
  data?: any;
  headers?: Record<string, string>;
}

export interface BridgeResult {
  success: boolean;
  data?: any;
  error?: string;
}

// 跟踪是否是新创建的标签页（用于任务结束后关闭）
let createdTabId: number | null = null;

/**
 * 获取或创建 Temu 标签页
 */
async function getOrCreateTemuTab(targetHost: string): Promise<{ tabId: number; isNew: boolean }> {
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find(tab => {
    try {
      const url = new URL(tab.url || '');
      return url.hostname.includes(targetHost);
    } catch {
      return false;
    }
  });

  if (existingTab?.id) {
    console.log('[Bridge] 找到已存在的标签页:', existingTab.id, existingTab.url);
    return { tabId: existingTab.id, isNew: false };
  }

  console.log('[Bridge] 创建新标签页...');
  const newTab = await chrome.tabs.create({
    url: `https://${targetHost}/main/goods-manage`,
    active: false
  });

  if (!newTab.id) {
    throw new Error('创建标签页失败');
  }

  createdTabId = newTab.id;
  console.log('[Bridge] 新标签页已创建:', newTab.id);

  await waitForTabLoaded(newTab.id);
  return { tabId: newTab.id, isNew: true };
}

/**
 * 等待标签页加载完成
 */
function waitForTabLoaded(tabId: number, timeout: number = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkStatus = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          // 额外等待让 Content Script 初始化
          setTimeout(resolve, 1500);
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new Error('等待页面加载超时'));
          return;
        }

        setTimeout(checkStatus, 500);
      } catch (error) {
        reject(error);
      }
    };

    checkStatus();
  });
}

/**
 * 动态注入 Content Script
 * 参考项目模式：当 manifest 自动注入失败时，使用 scripting API 动态注入
 */
async function injectContentScript(tabId: number): Promise<boolean> {
  console.log('[Bridge] 尝试动态注入 Content Script...');

  try {
    // 直接执行 Content Script 代码（内联方式）
    // 这是最可靠的方式，避免文件路径问题
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // 检查是否已经注入过
        if ((window as any).__TEMU_BRIDGE_INJECTED__) {
          console.log('[Bridge] Content Script 已存在，跳过注入');
          return;
        }
        (window as any).__TEMU_BRIDGE_INJECTED__ = true;

        console.log('[Bridge] 动态注入 Content Script');
        console.log('[Bridge] 当前域名:', location.host);

        // 注册消息监听器
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          (async () => {
            console.log('[Bridge] 收到消息:', msg?.type);

            try {
              // Ping 检测
              if (msg?.type === 'ping') {
                sendResponse({ ok: true, host: location.host, url: location.href });
                return;
              }

              // 处理 fetch 请求
              if (msg?.type === 'bridge-fetch') {
                const { url, method = 'POST', data, headers = {} } = msg.payload || {};
                console.log('[Bridge] 处理 fetch 请求:', method, url);

                try {
                  // 构建请求头（参考项目模式）
                  const finalHeaders = {
                    'Content-Type': 'application/json',
                    'Origin': location.origin,
                    'Referer': location.href,  // 必须是完整路径
                    ...headers
                  };

                  const response = await fetch(url, {
                    method,
                    headers: finalHeaders,
                    body: data ? JSON.stringify(data) : undefined,
                    credentials: 'include'
                  });

                  const contentType = response.headers.get('content-type');
                  let responseData: any;
                  if (contentType?.includes('application/json')) {
                    responseData = await response.json();
                  } else {
                    responseData = await response.text();
                  }

                  sendResponse({
                    ok: response.ok,
                    status: response.status,
                    data: responseData
                  });
                } catch (fetchError: any) {
                  sendResponse({
                    ok: false,
                    error: fetchError.message || String(fetchError)
                  });
                }
                return;
              }

              sendResponse({ ok: false, error: '未知消息类型: ' + msg?.type });
            } catch (e: any) {
              sendResponse({ ok: false, error: e.message || String(e) });
            }
          })();
          return true;
        });

        console.log('[Bridge] 消息监听器已注册');
      }
    });

    console.log('[Bridge] Content Script 注入成功');
    return true;
  } catch (error) {
    console.error('[Bridge] Content Script 注入失败:', error);
    return false;
  }
}

/**
 * 等待 Content Script 就绪
 * 先尝试 ping 一次，失败则直接动态注入
 */
async function waitForContentScript(tabId: number): Promise<void> {
  // 先尝试 ping 一次，检查是否已有 Content Script
  try {
    console.log('[Bridge] Ping Content Script...');
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });

    if (response?.ok) {
      console.log('[Bridge] Content Script 就绪:', response.host);
      return;
    }
  } catch (error) {
    console.log('[Bridge] Ping 失败，准备动态注入');
  }

  // 动态注入 Content Script
  console.log('[Bridge] 动态注入 Content Script...');
  const injected = await injectContentScript(tabId);
  if (!injected) {
    throw new Error('Content Script 注入失败，请刷新 Temu 页面后重试');
  }

  // 等待注入的脚本初始化
  await new Promise(r => setTimeout(r, 1000));

  // 再次尝试 ping
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`[Bridge] 注入后 Ping (${i + 1}/3)...`);
      const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });

      if (response?.ok) {
        console.log('[Bridge] Content Script 就绪:', response.host);
        return;
      }
    } catch (error) {
      console.log('[Bridge] Ping 失败:', error instanceof Error ? error.message : String(error));
    }
    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error('Content Script 未就绪，请确保已登录 Temu 卖家中心并刷新页面');
}

/**
 * 通过 Content Script 发送请求
 */
async function sendViaContentScript(
  tabId: number,
  payload: BridgeRequestPayload
): Promise<{ ok: boolean; status?: number; data?: any; error?: string }> {
  console.log('[Bridge] 发送 bridge-fetch 请求:', payload.url);

  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'bridge-fetch',
    payload
  });

  console.log('[Bridge] Content Script 响应:', response?.ok, response?.status);

  if (!response) {
    throw new Error('Content Script 返回空响应');
  }

  return response;
}

/**
 * 处理跨域请求的核心逻辑
 */
export async function handleBridgeRequest(
  targetHost: string,
  requestData: {
    type: string;
    payload: BridgeRequestPayload;
  }
): Promise<BridgeResult> {
  console.log('[Bridge] 处理请求:', requestData.payload.url);

  try {
    // 1. 获取或创建 Temu 标签页
    const { tabId } = await getOrCreateTemuTab(targetHost);

    // 2. 等待 Content Script 就绪
    await waitForContentScript(tabId);

    // 3. 通过 Content Script 发送请求
    const response = await sendViaContentScript(tabId, requestData.payload);

    if (!response.ok) {
      return {
        success: false,
        error: response.error || `请求失败: HTTP ${response.status}`
      };
    }

    return {
      success: true,
      data: response
    };

  } catch (error) {
    console.error('[Bridge] 请求失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 关闭新创建的标签页
 */
export async function closeCreatedTab(): Promise<void> {
  if (createdTabId !== null) {
    try {
      console.log('[Bridge] 关闭标签页:', createdTabId);
      await chrome.tabs.remove(createdTabId);
    } catch (error) {
      console.warn('[Bridge] 关闭标签页失败:', error);
    } finally {
      createdTabId = null;
    }
  }
}

/**
 * 确保 Bridge 就绪（检查/创建标签页 + 测试 Content Script）
 */
export async function ensureBridgeReady(targetHost: string): Promise<{ ready: boolean; error?: string }> {
  try {
    const { tabId } = await getOrCreateTemuTab(targetHost);

    console.log('[Bridge] 测试 Content Script 就绪状态...');
    await waitForContentScript(tabId);

    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
