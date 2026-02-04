/**
 * AutoTemu 配置页面
 *
 * 提供以下配置：
 * - 推送渠道选择（钉钉/飞书/两者/禁用）
 * - 钉钉 Webhook URL
 * - 飞书应用凭证（App ID、App Secret、群聊 ID）
 * - 同步间隔设置
 * - 自动同步开关
 */

import { useEffect, useState } from 'react';
import { config } from '~lib/storage/config';
import { notifier } from '~lib/api/notifier';
import type { NotifyChannel, UserConfig, BitableTokenType, UnpublishedPushMode } from '~types/storage';

// 样式常量
const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f9fafb",
    padding: "32px 16px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  container: {
    maxWidth: 700,
    margin: '0 auto'
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 32
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "#1f2937",
    margin: 0
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#6b7280'
  },
  card: {
    backgroundColor: "white",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    borderRadius: 8,
    padding: 24,
    marginBottom: 24
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#1f2937',
    marginTop: 0,
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  formGroup: {
    marginBottom: 20
  },
  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6
  },
  labelHint: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 400
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  inputFocus: {
    borderColor: '#3b82f6'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  radioGroup: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 16
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    fontSize: 14,
    padding: '8px 16px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#d1d5db',
    borderRadius: 6,
    transition: 'all 0.2s'
  },
  radioLabelActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff'
  },
  radio: {
    width: 16,
    height: 16
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer'
  },
  checkboxInput: {
    width: 20,
    height: 20
  },
  buttonGroup: {
    display: 'flex',
    gap: 12,
    marginTop: 24
  },
  saveButton: {
    flex: 1,
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: '#2563eb',
    color: 'white',
    transition: 'background-color 0.2s'
  },
  testButton: {
    padding: '12px 24px',
    fontSize: 16,
    fontWeight: 600,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: 'white',
    color: '#374151',
    transition: 'all 0.2s'
  },
  successMessage: {
    backgroundColor: '#dcfce7',
    border: '1px solid #86efac',
    color: '#166534',
    padding: '12px 16px',
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 14
  },
  errorMessage: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    padding: '12px 16px',
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 14
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    margin: '20px 0'
  },
  statusBadge: (configured: boolean) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 500,
    backgroundColor: configured ? '#dcfce7' : '#fef3c7',
    color: configured ? '#166534' : '#92400e'
  })
};

const channelOptions: Array<{ value: NotifyChannel; label: string; desc: string }> = [
  { value: 'dingtalk', label: '仅钉钉', desc: '只推送到钉钉群' },
  { value: 'feishu', label: '仅飞书', desc: '只推送到飞书群' },
  { value: 'both', label: '两者都推', desc: '同时推送到钉钉和飞书' },
  { value: 'none', label: '禁用推送', desc: '不推送任何通知' }
];

export default function OptionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 配置状态
  const [notifyChannel, setNotifyChannel] = useState<NotifyChannel>('dingtalk');
  const [dingtalkWebhook, setDingtalkWebhook] = useState('');
  const [feishuAppId, setFeishuAppId] = useState('');
  const [feishuAppSecret, setFeishuAppSecret] = useState('');
  const [feishuChatId, setFeishuChatId] = useState('');
  const [syncInterval, setSyncInterval] = useState(30);
  const [enabled, setEnabled] = useState(false);

  // 飞书 Bitable 配置状态
  const [bitableAppToken, setBitableAppToken] = useState('');
  const [bitableTokenType, setBitableTokenType] = useState<BitableTokenType>('base');
  const [bitableSiteErrorTableId, setBitableSiteErrorTableId] = useState('');
  const [bitableViolationTableId, setBitableViolationTableId] = useState('');

  // 定时推送配置状态
  const [pushTime, setPushTime] = useState('09:00');

  // 已下架监控推送模式
  const [unpublishedPushMode, setUnpublishedPushMode] = useState<UnpublishedPushMode>('immediate');

  // 加载配置
  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const userConfig = await config.getUserConfig();
      setNotifyChannel(userConfig.notify_channel || 'dingtalk');
      setDingtalkWebhook(userConfig.dingtalk_webhook || '');
      setFeishuAppId(userConfig.feishu_app_id || '');
      setFeishuAppSecret(userConfig.feishu_app_secret || '');
      setFeishuChatId(userConfig.feishu_chat_id || '');
      setBitableAppToken(userConfig.feishu_bitable_app_token || '');
      setBitableTokenType(userConfig.feishu_bitable_token_type || 'base');
      setBitableSiteErrorTableId(userConfig.feishu_bitable_site_error_table_id || '');
      setBitableViolationTableId(userConfig.feishu_bitable_violation_table_id || '');
      setSyncInterval(userConfig.sync_interval || 30);
      setEnabled(userConfig.enabled || false);
      setPushTime(userConfig.push_time || '09:00');
      setUnpublishedPushMode(userConfig.unpublished_push_mode || 'immediate');
    } catch (error) {
      console.error('加载配置失败:', error);
      setMessage({ type: 'error', text: '加载配置失败' });
    } finally {
      setLoading(false)
    }
  }

  // 保存配置
  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const userConfig: UserConfig = {
        notify_channel: notifyChannel,
        dingtalk_webhook: dingtalkWebhook,
        feishu_app_id: feishuAppId,
        feishu_app_secret: feishuAppSecret,
        feishu_chat_id: feishuChatId,
        feishu_bitable_app_token: bitableAppToken,
        feishu_bitable_token_type: bitableTokenType,
        feishu_bitable_site_error_table_id: bitableSiteErrorTableId,
        feishu_bitable_violation_table_id: bitableViolationTableId,
        sync_interval: syncInterval,
        enabled,
        push_time: pushTime,
        unpublished_push_mode: unpublishedPushMode
      };

      await config.setUserConfig(userConfig);
      setMessage({ type: 'success', text: '配置已保存' });

      // 3 秒后清除消息
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '保存失败'
      });
    } finally {
      setSaving(false);
    }
  }

  // 测试推送
  async function handleTest() {
    setTesting(true);
    setMessage(null);

    try {
      // 先保存配置
      await handleSave();

      // 测试推送
      const result = await notifier.testNotification();

      const messages: string[] = [];
      if (result.dingtalk) {
        messages.push(`钉钉: ${result.dingtalk.success ? '✓ 成功' : '✗ ' + result.dingtalk.message}`);
      }
      if (result.feishu) {
        messages.push(`飞书: ${result.feishu.success ? '✓ 成功' : '✗ ' + result.feishu.message}`);
      }

      const allSuccess = (result.dingtalk?.success ?? true) && (result.feishu?.success ?? true);
      setMessage({
        type: allSuccess ? 'success' : 'error',
        text: messages.join(' | ') || '推送渠道已禁用'
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '测试失败'
      });
    } finally {
      setTesting(false);
    }
  }

  // 检查配置状态
  const dingtalkConfigured = !!dingtalkWebhook;
  const feishuConfigured = !!(feishuAppId && feishuAppSecret && feishuChatId);
  const bitableConfigured = !!(bitableAppToken && (bitableSiteErrorTableId || bitableViolationTableId));

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* 页面标题 */}
        <div style={styles.header}>
          <h1 style={styles.title}>AutoTemu 配置</h1>
          <p style={styles.subtitle}>设置推送渠道和同步选项</p>
        </div>

        {/* 消息提示 */}
        {message && (
          <div style={message.type === 'success' ? styles.successMessage : styles.errorMessage}>
            {message.text}
          </div>
        )}

        {/* 推送渠道选择 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            推送渠道
          </h2>
          <div style={styles.radioGroup}>
            {channelOptions.map(option => (
              <label
                key={option.value}
                style={{
                  ...styles.radioLabel,
                  ...(notifyChannel === option.value ? styles.radioLabelActive : {})
                }}
              >
                <input
                  type="radio"
                  name="notifyChannel"
                  value={option.value}
                  checked={notifyChannel === option.value}
                  onChange={(e) => setNotifyChannel(e.target.value as NotifyChannel)}
                  style={styles.radio}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{option.label}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{option.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 钉钉配置 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            钉钉配置
            <span style={styles.statusBadge(dingtalkConfigured)}>
              {dingtalkConfigured ? '已配置' : '未配置'}
            </span>
          </h2>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Webhook URL
              <span style={styles.labelHint}> （在钉钉群机器人设置中获取）</span>
            </label>
            <input
              type="text"
              value={dingtalkWebhook}
              onChange={(e) => setDingtalkWebhook(e.target.value)}
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
              style={styles.input}
            />
          </div>
        </div>

        {/* 飞书配置 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            飞书配置
            <span style={styles.statusBadge(feishuConfigured)}>
              {feishuConfigured ? '已配置' : '未配置'}
            </span>
          </h2>
          {/* App ID 和 App Secret 已隐藏，使用默认值 */}
          {/* <div style={styles.formGroup}>
            <label style={styles.label}>
              App ID
              <span style={styles.labelHint}> （飞书开放平台应用凭证）</span>
            </label>
            <input
              type="text"
              value={feishuAppId}
              onChange={(e) => setFeishuAppId(e.target.value)}
              placeholder="cli_xxxxxxxxxx"
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              App Secret
              <span style={styles.labelHint}> （请妥善保管，不要泄露）</span>
            </label>
            <input
              type="password"
              value={feishuAppSecret}
              onChange={(e) => setFeishuAppSecret(e.target.value)}
              placeholder="••••••••••••••••"
              style={styles.input}
            />
          </div> */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              群聊 ID (chat_id)
              <span style={styles.labelHint}> （目标推送群的 ID）</span>
            </label>
            <input
              type="text"
              value={feishuChatId}
              onChange={(e) => setFeishuChatId(e.target.value)}
              placeholder="oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              style={styles.input}
            />
          </div>
        </div>

        {/* 飞书 Bitable 配置 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            飞书多维表格 (Bitable)
            <span style={styles.statusBadge(bitableConfigured)}>
              {bitableConfigured ? '已配置' : '未配置'}
            </span>
          </h2>
          <div style={{ marginBottom: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
            用于将站点异常和违规商品数据同步到飞书多维表格，便于数据分析和团队协作。
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              App Token
              <span style={styles.labelHint}> （多维表格的唯一标识，在表格 URL 中获取）</span>
            </label>
            <input
              type="text"
              value={bitableAppToken}
              onChange={(e) => setBitableAppToken(e.target.value)}
              placeholder={bitableTokenType === 'base' ? 'bascnxxxxxxxxxxxxxxxx' : 'wikcnxxxxxxxxxxxxxxxx'}
              style={styles.input}
            />
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <label style={{
                ...styles.radioLabel,
                ...(bitableTokenType === 'base' ? styles.radioLabelActive : {}),
                padding: '6px 12px',
                fontSize: 13
              }}>
                <input
                  type="radio"
                  name="bitableTokenType"
                  value="base"
                  checked={bitableTokenType === 'base'}
                  onChange={(e) => setBitableTokenType(e.target.value as BitableTokenType)}
                  style={styles.radio}
                />
                <span>Base 格式</span>
              </label>
              <label style={{
                ...styles.radioLabel,
                ...(bitableTokenType === 'wiki' ? styles.radioLabelActive : {}),
                padding: '6px 12px',
                fontSize: 13
              }}>
                <input
                  type="radio"
                  name="bitableTokenType"
                  value="wiki"
                  checked={bitableTokenType === 'wiki'}
                  onChange={(e) => setBitableTokenType(e.target.value as BitableTokenType)}
                  style={styles.radio}
                />
                <span>Wiki 格式</span>
              </label>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
              {bitableTokenType === 'base'
                ? 'URL 格式：https://xxx.feishu.cn/base/bascnxxx'
                : 'URL 格式：https://xxx.feishu.cn/wiki/wikcnxxx（知识库中的多维表格）'}
            </div>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              站点异常子表 ID
              <span style={styles.labelHint}> （站点异常数据写入的子表 ID）</span>
            </label>
            <input
              type="text"
              value={bitableSiteErrorTableId}
              onChange={(e) => setBitableSiteErrorTableId(e.target.value)}
              placeholder="tblxxxxxxxxxxxxxxxx"
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              违规商品子表 ID
              <span style={styles.labelHint}> （违规商品数据写入的子表 ID）</span>
            </label>
            <input
              type="text"
              value={bitableViolationTableId}
              onChange={(e) => setBitableViolationTableId(e.target.value)}
              placeholder="tblxxxxxxxxxxxxxxxx"
              style={styles.input}
            />
          </div>
        </div>

        {/* 同步设置 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>同步设置</h2>
          <div style={styles.formGroup}>
            <label style={styles.label}>同步间隔</label>
            <select
              value={syncInterval}
              onChange={(e) => setSyncInterval(Number(e.target.value))}
              style={styles.select}
            >
              <option value={15}>每 15 分钟</option>
              <option value={30}>每 30 分钟</option>
              <option value={60}>每 1 小时</option>
              <option value={120}>每 2 小时</option>
              <option value={360}>每 6 小时</option>
            </select>
          </div>
          <div style={styles.divider} />
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              style={styles.checkboxInput}
            />
            <div>
              <div style={{ fontWeight: 500 }}>启用自动同步</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                开启后将按设定间隔自动执行下架监控任务
              </div>
            </div>
          </label>
        </div>

        {/* 已下架监控推送模式 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>
            已下架监控推送模式
            <span style={styles.statusBadge(unpublishedPushMode === 'scheduled')}>
              {unpublishedPushMode === 'scheduled' ? '定时推送' : '即时推送'}
            </span>
          </h2>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              推送模式
              <span style={styles.labelHint}> （单独执行和一键执行都受此配置影响）</span>
            </label>
            <select
              value={unpublishedPushMode}
              onChange={(e) => setUnpublishedPushMode(e.target.value as UnpublishedPushMode)}
              style={styles.select}
            >
              <option value="immediate">即时推送（采集后立即推送）</option>
              <option value="scheduled">定时推送（仅采集，等待定时任务推送）</option>
            </select>
          </div>
          {unpublishedPushMode === 'scheduled' && (
            <>
              <div style={styles.divider} />
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  推送时间
                  <span style={styles.labelHint}> （每天在此时间统一推送汇总消息）</span>
                </label>
                <input
                  type="time"
                  value={pushTime}
                  onChange={(e) => setPushTime(e.target.value)}
                  style={{ ...styles.input, width: 150 }}
                />
              </div>
              <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                <strong>注意：</strong>定时推送需要浏览器保持运行状态。如果浏览器完全退出，alarm 不会触发。
              </div>
            </>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={styles.buttonGroup}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              ...styles.saveButton,
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || notifyChannel === 'none'}
            style={{
              ...styles.testButton,
              opacity: testing || notifyChannel === 'none' ? 0.5 : 1
            }}
          >
            {testing ? '测试中...' : '测试推送'}
          </button>
        </div>
      </div>
    </div>
  )
}
