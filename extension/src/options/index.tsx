/**
 * AutoTemu 配置页面
 *
 * 用户可以在这里配置：
 * - 钉钉 Webhook URL
 * - 同步间隔
 * - 启用/禁用自动同步
 */

import { useEffect, useState } from 'react';
import { config } from '~lib/storage/config';
import type { UserConfig } from '~types/storage';

// 样式常量
const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f9fafb',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  container: {
    maxWidth: 640,
    margin: '0 auto'
  },
  header: {
    marginBottom: 32
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1f2937',
    margin: 0
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280'
  },
  card: {
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderRadius: 8,
    padding: 24
  },
  formGroup: {
    marginBottom: 24
  },
  label: {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 8
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    boxSizing: 'border-box' as const,
    outline: 'none'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280'
  },
  link: {
    color: '#2563eb',
    textDecoration: 'none',
    marginLeft: 4
  },
  switchRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 6
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: '#374151'
  },
  switchHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280'
  },
  switch: {
    position: 'relative' as const,
    width: 48,
    height: 24,
    cursor: 'pointer'
  },
  switchTrack: (checked: boolean) => ({
    width: 48,
    height: 24,
    backgroundColor: checked ? '#2563eb' : '#d1d5db',
    borderRadius: 12,
    transition: 'background-color 0.2s'
  }),
  switchThumb: (checked: boolean) => ({
    position: 'absolute' as const,
    top: 2,
    left: checked ? 26 : 2,
    width: 20,
    height: 20,
    backgroundColor: 'white',
    borderRadius: '50%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    transition: 'left 0.2s'
  }),
  buttonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginTop: 24
  },
  button: {
    padding: '10px 24px',
    backgroundColor: '#2563eb',
    color: 'white',
    fontWeight: 500,
    fontSize: 14,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer'
  },
  successText: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    color: '#16a34a'
  },
  helpCard: {
    marginTop: 32,
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    padding: 24
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: 500,
    color: '#1e40af',
    marginTop: 0,
    marginBottom: 16
  },
  helpList: {
    listStyle: 'none',
    padding: 0,
    margin: 0
  },
  helpItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    fontSize: 14,
    color: '#1e40af'
  },
  checkIcon: {
    width: 20,
    height: 20,
    flexShrink: 0,
    marginTop: 2
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    color: '#6b7280',
    fontSize: 16
  }
};

export default function OptionsPage() {
  const [formData, setFormData] = useState<UserConfig>({
    dingtalk_webhook: '',
    sync_interval: 30,
    enabled: false
  });

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // 加载配置
  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const userConfig = await config.getUserConfig();
      setFormData(userConfig);
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setLoading(false);
    }
  }

  // 保存配置
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);

    try {
      await config.setUserConfig(formData);
      setSaved(true);

      // 3 秒后隐藏提示
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('保存配置失败:', error);
      alert('保存失败：' + (error as Error).message);
    }
  }

  // 表单输入处理
  function handleInputChange(field: keyof UserConfig, value: any) {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }

  if (loading) {
    return <div style={styles.loading}>加载中...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* 页面标题 */}
        <div style={styles.header}>
          <h1 style={styles.title}>AutoTemu 配置</h1>
          <p style={styles.subtitle}>配置自动化任务和钉钉通知</p>
        </div>

        {/* 配置表单 */}
        <form onSubmit={handleSave} style={styles.card}>
          {/* 钉钉 Webhook */}
          <div style={styles.formGroup}>
            <label htmlFor="webhook" style={styles.label}>
              钉钉 Webhook URL
            </label>
            <input
              id="webhook"
              type="url"
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
              value={formData.dingtalk_webhook || ''}
              onChange={(e) => handleInputChange('dingtalk_webhook', e.target.value)}
              style={styles.input}
            />
            <p style={styles.hint}>
              用于接收已下架商品通知。
              <a
                href="https://open.dingtalk.com/document/robots/custom-robot-access"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.link}
              >
                如何获取 Webhook？
              </a>
            </p>
          </div>

          {/* 同步间隔 */}
          <div style={styles.formGroup}>
            <label htmlFor="interval" style={styles.label}>
              同步间隔（分钟）
            </label>
            <select
              id="interval"
              value={formData.sync_interval}
              onChange={(e) => handleInputChange('sync_interval', parseInt(e.target.value))}
              style={styles.select}
            >
              <option value={30}>30 分钟</option>
              <option value={60}>60 分钟（1 小时）</option>
              <option value={120}>120 分钟（2 小时）</option>
              <option value={180}>180 分钟（3 小时）</option>
              <option value={360}>360 分钟（6 小时）</option>
              <option value={720}>720 分钟（12 小时）</option>
            </select>
            <p style={styles.hint}>自动检查已下架商品的时间间隔</p>
          </div>

          {/* 启用开关 */}
          <div style={styles.formGroup}>
            <div style={styles.switchRow}>
              <div>
                <div style={styles.switchLabel}>启用自动同步</div>
                <div style={styles.switchHint}>开启后将按设定的间隔自动检查已下架商品</div>
              </div>
              <div
                style={styles.switch}
                onClick={() => handleInputChange('enabled', !formData.enabled)}
              >
                <div style={styles.switchTrack(formData.enabled)} />
                <div style={styles.switchThumb(formData.enabled)} />
              </div>
            </div>
          </div>

          {/* 保存按钮 */}
          <div style={styles.buttonRow}>
            <button
              type="submit"
              style={styles.button}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            >
              保存配置
            </button>

            {saved && (
              <span style={styles.successText}>
                <svg style={styles.checkIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                配置已保存
              </span>
            )}
          </div>
        </form>

        {/* 帮助信息 */}
        <div style={styles.helpCard}>
          <h3 style={styles.helpTitle}>使用说明</h3>
          <ul style={styles.helpList}>
            <li style={styles.helpItem}>
              <svg style={styles.checkIcon} fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>配置钉钉 Webhook 后，扩展会自动将新下架的商品推送到钉钉群</span>
            </li>
            <li style={styles.helpItem}>
              <svg style={styles.checkIcon} fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>启用自动同步后，扩展会在后台定时检查，无需手动操作</span>
            </li>
            <li style={styles.helpItem}>
              <svg style={styles.checkIcon} fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>如需手动执行任务，可使用扩展的 Runner 页面进行操作</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
