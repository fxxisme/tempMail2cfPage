import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Modal, Spin, Toast, Switch } from '@douyinfe/semi-ui'
import {
  IconCopy,
  IconDownload,
  IconInbox,
  IconMail,
  IconMoon,
  IconRefresh,
  IconSun,
  IconSync,
} from '@douyinfe/semi-icons'
import { createApi } from './api'
import { parseMailAttachments, parseMailItem, revokeAttachmentUrls } from './mailParser'

const AUTO_REFRESH_INTERVAL = 10

function parseServerDate(value) {
  if (!value) return null
  if (typeof value === 'number') {
    const d = new Date(value < 1e11 ? value * 1000 : value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const raw = String(value).trim()
  if (/^\d+$/.test(raw)) {
    const num = Number(raw)
    const d = new Date(num < 1e11 ? num * 1000 : num)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
  const normalized = hasTz ? raw : raw.replace(' ', 'T') + (raw.includes('T') || raw.includes(' ') ? 'Z' : '')
  const date = new Date(normalized || raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  if (!value) return '-'
  const date = parseServerDate(value)
  if (!date) return value
  return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

function formatListDate(value) {
  if (!value) return '-'
  const date = parseServerDate(value)
  if (!date) return value
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Shanghai',
    })
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

function mailBody(mail) {
  if (!mail) return ''
  const text = mail.text || ''
  return String(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

function originalMailSource(mail) {
  if (!mail) return ''
  if (mail.message) {
    return mail.message
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  }
  const cleaned = (mail.raw || mail.text || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `<pre style="font-family: inherit; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: #171923; margin: 0;">${cleaned}</pre>`
}

function getShareParams() {
  let hash = window.location.hash || ''
  if (hash.startsWith('#')) hash = hash.slice(1)
  if (hash.startsWith('/')) hash = hash.slice(1)
  if (hash.startsWith('?')) hash = hash.slice(1)
  
  const hashParams = new URLSearchParams(hash)
  const searchParams = new URLSearchParams(window.location.search)

  const token = hashParams.get('token') || searchParams.get('token') || ''
  const address = hashParams.get('address') || searchParams.get('address') || ''
  return { token, address }
}

export default function ShareApp() {
  const [{ token: initialToken, address: initialAddress }] = useState(getShareParams)
  const [token, setToken] = useState(initialToken)
  const [address, setAddress] = useState(initialAddress)
  const [manualTokenInput, setManualTokenInput] = useState('')
  const [mails, setMails] = useState([])
  const [selectedMailId, setSelectedMailId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL)
  const [activePane, setActivePane] = useState('list') // 'list' | 'detail' for mobile
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('tm2_theme')
    if (saved) return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const api = useMemo(() => {
    return createApi(() => ({
      addressJwt: token,
      sitePassword: '',
      adminPassword: '',
    }))
  }, [token])

  // 主题应用
  useEffect(() => {
    const body = document.body
    if (theme === 'dark') {
      body.setAttribute('theme-mode', 'dark')
      body.classList.add('dark')
    } else {
      body.removeAttribute('theme-mode')
      body.classList.remove('dark')
    }
    localStorage.setItem('tm2_theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  async function copyText(text, successMessage) {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      if (successMessage) Toast.success(successMessage)
      return true
    } catch {
      Modal.info({
        title: '手动复制',
        content: <div style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{text}</div>,
        okText: '知道了',
        centered: true,
      })
      return false
    }
  }

  // 获取邮件列表
  async function fetchMails(isSilent = false) {
    if (!token) return
    if (!isSilent) setLoading(true)
    try {
      // 若没有地址，先获取地址
      if (!address) {
        try {
          const settings = await api.getAddressSettings()
          if (settings?.address) setAddress(settings.address)
        } catch {
          // 忽略单独查 settings 的失败
        }
      }
      const res = await api.fetchMails(50, 0)
      const list = Array.isArray(res) ? res : res?.results || []
      const parsedMails = await Promise.all(
        list.map(async (mail) => {
          const parsed = await parseMailItem(mail)
          return {
            ...mail,
            ...parsed,
            attachments: parseMailAttachments(parsed),
          }
        })
      )
      setMails(parsedMails)
      if (parsedMails.length > 0 && !selectedMailId) {
        setSelectedMailId(parsedMails[0].id)
      }
    } catch (err) {
      if (!isSilent) {
        Toast.error(err?.message || '获取邮件失败')
      }
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  // 初始化加载
  useEffect(() => {
    if (token) {
      fetchMails()
    }
  }, [token])

  // 自动刷新倒计时
  useEffect(() => {
    if (!token || !autoRefresh) return
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchMails(true)
          return AUTO_REFRESH_INTERVAL
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [token, autoRefresh, selectedMailId, address])

  const selectedMail = useMemo(() => {
    return mails.find((m) => m.id === selectedMailId) || mails[0] || null
  }, [mails, selectedMailId])

  function handleSelectMail(mail) {
    setSelectedMailId(mail.id)
    setActivePane('detail')
  }

  function handleManualTokenSubmit(e) {
    e.preventDefault()
    const trimmed = manualTokenInput.trim()
    if (!trimmed) {
      Toast.warning('请输入凭证 (Token)')
      return
    }
    setToken(trimmed)
    window.location.hash = `#token=${encodeURIComponent(trimmed)}`
  }

  return (
    <div className="app-shell">
      {/* 顶部导航 */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">
            <IconMail />
          </div>
          <div className="brand-text">
            <span className="brand-name">邮件接收助手</span>
            <span className="brand-desc">专属共享收件箱</span>
          </div>
        </div>

        <div className="header-actions">
          {address ? (
            <div className="address-chip" onClick={() => copyText(address, '地址已复制')}>
              <span className="live-dot" />
              <span className="address-chip-text" title={address}>{address}</span>
              <IconCopy className="chip-copy-icon" />
            </div>
          ) : null}

          <Button
            className="btn icon"
            icon={<IconRefresh spin={loading} />}
            title="立即刷新"
            disabled={!token || loading}
            onClick={() => {
              setCountdown(AUTO_REFRESH_INTERVAL)
              fetchMails()
            }}
          />

          <Button
            className="btn icon theme-toggle"
            icon={theme === 'dark' ? <IconSun /> : <IconMoon />}
            title={theme === 'dark' ? '浅色模式' : '深色模式'}
            onClick={toggleTheme}
          />
        </div>
      </header>

      {/* 主体工作区 */}
      {!token ? (
        <div className="empty-state-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 80px)', padding: '20px' }}>
          <div style={{ maxWidth: 440, width: '100%', background: 'var(--panel)', padding: 32, borderRadius: 'var(--radius)', border: '1px solid var(--panel-border)', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
            <h3 style={{ fontSize: 'var(--fs-xl)', marginBottom: 8, color: 'var(--text-main)' }}>未找到邮箱访问凭证</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', marginBottom: 24, lineHeight: 1.6 }}>
              请确认您打开的是发件人提供的完整分享链接。若您持有访问 Token，也可在下方粘贴直接查看。
            </p>
            <form onSubmit={handleManualTokenSubmit} style={{ display: 'flex', gap: 8 }}>
              <Input
                placeholder="粘贴 Token (addressJwt)"
                value={manualTokenInput}
                onChange={setManualTokenInput}
                style={{ flex: 1 }}
              />
              <Button type="primary" htmlType="submit">进入收件箱</Button>
            </form>
          </div>
        </div>
      ) : (
        <main className="main" style={{ gridTemplateColumns: '360px 1fr' }}>
          {/* 左侧：邮件列表 */}
          <aside className={`pane sidebar ${activePane === 'list' ? 'mobile-active' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 列表头部 */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconInbox style={{ color: 'var(--primary)', fontSize: 18 }} />
                <span style={{ fontWeight: 600, fontSize: 'var(--fs-md)', color: 'var(--text-main)' }}>收件箱</span>
                <span className="badge">{mails.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                <span>{countdown}s 刷新</span>
                <Switch
                  size="small"
                  checked={autoRefresh}
                  onChange={setAutoRefresh}
                  aria-label="自动刷新"
                />
              </div>
            </div>

            {/* 邮件项列表 */}
            <div className="messages" style={{ flex: 1, overflowY: 'auto' }}>
              {loading && mails.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                  <Spin />
                </div>
              ) : mails.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                  <div style={{ fontSize: 'var(--fs-sm)' }}>暂无收到任何邮件</div>
                  <div style={{ fontSize: 'var(--fs-xs)', marginTop: 4 }}>收到新邮件后将在此实时显示</div>
                </div>
              ) : (
                mails.map((mail) => (
                  <div
                    key={mail.id}
                    className={`message ${selectedMail?.id === mail.id ? 'active' : ''}`}
                    onClick={() => handleSelectMail(mail)}
                  >
                    <div className="message-header">
                      <span className="message-sender" title={mail.source || '-'}>{mail.source || '未知发件人'}</span>
                      <span className="message-time">{formatListDate(mail.created_at)}</span>
                    </div>
                    <div className="message-subject" title={mail.subject || '(无主题)'}>
                      {mail.subject || '(无主题)'}
                    </div>
                    <div className="message-preview">
                      {mail.text ? mail.text.slice(0, 100) : mail.message ? '(HTML 邮件)' : '-'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* 右侧：邮件详情 */}
          <section className={`pane mail-detail ${activePane === 'detail' ? 'mobile-active' : ''}`} style={{ height: '100%', overflowY: 'auto' }}>
            {selectedMail ? (
              <div className="mail-detail-container" style={{ padding: '24px 32px' }}>
                {/* 移动端返回列表按钮 */}
                <div className="mobile-only" style={{ marginBottom: 12 }}>
                  <Button size="small" onClick={() => setActivePane('list')}>← 返回邮件列表</Button>
                </div>

                <div className="detail-header" style={{ marginBottom: 20 }}>
                  <h2 className="detail-subject" style={{ fontSize: 'var(--fs-2xl)', fontWeight: 600, color: 'var(--text-main)', marginBottom: 12 }}>
                    {selectedMail.subject || '(无主题)'}
                  </h2>
                  <div className="detail-meta" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>发件人：</span>
                      <strong style={{ color: 'var(--text-main)' }}>{selectedMail.source || '-'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>收件地址：</span>
                      <span>{selectedMail.address || address || '-'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>接收时间：</span>
                      <span>{formatDate(selectedMail.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* 附件区域 */}
                {selectedMail.attachments?.length > 0 ? (
                  <div className="attachments-section" style={{ marginBottom: 20, padding: 14, background: 'var(--panel-hover)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                    <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, marginBottom: 8, color: 'var(--text-main)' }}>
                      附件 ({selectedMail.attachments.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {selectedMail.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.url}
                          download={att.filename || `attachment_${idx + 1}`}
                          className="btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', fontSize: 'var(--fs-xs)', padding: '6px 12px' }}
                        >
                          <IconDownload />
                          <span>{att.filename || '未命名附件'}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 邮件正文渲染 */}
                <div className="detail-body" style={{ marginTop: 24, borderTop: '1px solid var(--panel-border-subtle)', paddingTop: 20 }}>
                  <iframe
                    className="original-mail"
                    sandbox="allow-same-origin allow-popups"
                    srcDoc={originalMailSource(selectedMail)}
                    title="邮件正文"
                    style={{ width: '100%', minHeight: 480, border: 'none', background: '#fff', borderRadius: 'var(--radius-sm)' }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📩</div>
                <div>请选择一封邮件查看内容</div>
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  )
}
