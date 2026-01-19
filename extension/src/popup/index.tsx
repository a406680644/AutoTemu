/**
 * AutoTemu Popup 弹出面板
 *
 * 提供快捷操作入口：
 * - 打开 RPA 运行页
 * - 打开配置页
 * - 查看任务状态
 */

import { useEffect, useState } from 'react';

type TaskStatus = 'idle' | 'running' | 'done' | 'fail';

interface TaskState {
  status: TaskStatus;
  progress: number;
  currentMall?: string;
}

export default function Popup() {
  const [taskState, setTaskState] = useState<TaskState>({
    status: 'idle',
    progress: 0
  });

  // 加载任务状态
  useEffect(() => {
    loadTaskState();
    // 每 2 秒刷新状态
    const interval = setInterval(loadTaskState, 2000);
    return () => clearInterval(interval);
  }, []);

  async function loadTaskState() {
    try {
      const result = await chrome.storage.local.get(['task_state']);
      if (result.task_state) {
        // 安全检查状态值
        const state = result.task_state;
        setTaskState({
          status: state.status || 'idle',
          progress: state.progress || 0,
          currentMall: state.currentMall
        });
      }
    } catch (err) {
      console.error('加载状态失败:', err);
    }
  }

  // 打开 RPA 运行页
  function openRunner() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('tabs/runner.html')
    });
    window.close();
  }

  // 打开配置页
  function openOptions() {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  // 状态颜色（带默认值）
  const statusColors: Record<TaskStatus, string> = {
    idle: '#6b7280',
    running: '#3b82f6',
    done: '#22c55e',
    fail: '#ef4444'
  };

  // 状态文本（带默认值）
  const statusText: Record<TaskStatus, string> = {
    idle: '空闲',
    running: '运行中',
    done: '已完成',
    fail: '失败'
  };

  // 获取安全的状态值
  const currentStatus = taskState.status in statusColors ? taskState.status : 'idle';
  const currentColor = statusColors[currentStatus];
  const currentText = statusText[currentStatus];

  return (
    <div style={{
      width: 320,
      padding: 16,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 标题 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid #e5e7eb'
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12
        }}>
          <span style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>A</span>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>AutoTemu</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Temu 卖家运营助手</div>
        </div>
      </div>

      {/* 任务状态卡片 */}
      <div style={{
        background: '#f9fafb',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }}>
          <span style={{ fontSize: 13, color: '#374151' }}>任务状态</span>
          <span style={{
            fontSize: 12,
            color: 'white',
            background: currentColor,
            padding: '2px 8px',
            borderRadius: 10
          }}>
            {currentText}
          </span>
        </div>

        {currentStatus === 'running' && (
          <>
            <div style={{
              height: 6,
              background: '#e5e7eb',
              borderRadius: 3,
              overflow: 'hidden',
              marginBottom: 6
            }}>
              <div style={{
                height: '100%',
                width: `${taskState.progress}%`,
                background: '#3b82f6',
                borderRadius: 3,
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              {taskState.currentMall ? `正在处理: ${taskState.currentMall}` : '准备中...'}
            </div>
          </>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={openRunner}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 12px',
            border: 'none',
            borderRadius: 8,
            background: '#4f46e5',
            color: 'white',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#4338ca'}
          onMouseOut={(e) => e.currentTarget.style.background = '#4f46e5'}
        >
          <span style={{ marginRight: 8 }}>▶</span>
          打开运行页面
        </button>

        <button
          onClick={openOptions}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: 'white',
            color: '#374151',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
          onMouseOut={(e) => e.currentTarget.style.background = 'white'}
        >
          <span style={{ marginRight: 8 }}>⚙</span>
          扩展设置
        </button>
      </div>

      {/* 底部提示 */}
      <div style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid #e5e7eb',
        fontSize: 11,
        color: '#9ca3af',
        textAlign: 'center'
      }}>
        v0.0.1 · 点击运行页面开始任务
      </div>
    </div>
  );
}
