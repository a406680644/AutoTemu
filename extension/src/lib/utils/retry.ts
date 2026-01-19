/**
 * 重试机制工具
 *
 * 提供指数退避重试功能
 */

export interface RetryOptions {
  maxRetries?: number;       // 最大重试次数（默认 3）
  initialDelay?: number;     // 初始延迟毫秒数（默认 1000）
  maxDelay?: number;         // 最大延迟毫秒数（默认 10000）
  backoffFactor?: number;    // 退避因子（默认 2）
  shouldRetry?: (error: Error) => boolean;  // 自定义是否重试的判断函数
}

/**
 * 带重试功能的异步函数执行器
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = () => true
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // 如果是最后一次尝试或不应该重试，直接抛出错误
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      // 计算延迟时间（指数退避）
      const currentDelay = Math.min(delay, maxDelay);
      console.warn(
        `[Retry] 尝试 ${attempt + 1}/${maxRetries} 失败，${currentDelay}ms 后重试...`,
        lastError.message
      );

      // 等待后重试
      await sleep(currentDelay);
      delay *= backoffFactor;
    }
  }

  // 理论上不会执行到这里，但为了类型安全
  throw lastError || new Error('重试失败');
}

/**
 * 睡眠函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的 Promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string = '请求超时'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
    )
  ]);
}
