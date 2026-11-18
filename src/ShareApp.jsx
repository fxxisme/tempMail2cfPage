import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Modal, Spin, Switch, Toast } from '@douyinfe/semi-ui'
import {
  IconClose,
  IconCopy,
  IconDownload,
  IconExit,
  IconInbox,
  IconKey,
  IconMail,
  IconMoon,
  IconRefresh,
  IconSearch,
  IconSun,
} from '@douyinfe/semi-icons'
import { createApi } from './api'
import { parseMailAttachments, parseMailItem } from './mailParser'

const AUTO_REFRESH_INTERVAL = 10

function cls(...classes) {
  return classes.filter(Boolean).join(' ')
}

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

function compactMailBody(mail) {
  if (!mail) return ''
  const text = mail.text || ''
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
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
  return `<pre style="font-family: inherit; font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: #171923; margin: 0; padding: 16px;">${cleaned}</pre>`
}

const AVATAR_COLORS = [
  '#6366f1', '#3b82f6', '#ec4899', '#8b5cf6',
  '#10b981', '#f59e0b', '#06b6d4', '#14b8a6',
]

function getAvatarColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function parseInitialParams() {
  let hash = window.location.hash || ''
  if (hash.startsWith('#')) hash = hash.slice(1)
  if (hash.startsWith('/')) hash = hash.slice(1)
  if (hash.startsWith('?')) hash = hash.slice(1)

  const hashParams = new URLSearchParams(hash)
  const searchParams = new URLSearchParams(window.location.search)

  const code = hashParams.get('code') || searchParams.get('code') || ''
  const token = hashParams.get('token') || searchParams.get('token') || ''
  const address = hashParams.get('address') || searchParams.get('address') || ''

  return { code, token, address }
}

export default function ShareApp() {
  const [params] = useState(parseInitialParams)
  const [token, setToken] = useState(params.token)
  const [address, setAddress] = useState(params.address)
  const [code, setCode] = useState(params.code)

  const [inputCode, setInputCode] = useState('')
  const [resolvingCode, setResolvingCode] = useState(false)

  const [mails, setMails] = useState([])
  const [selectedMailId, setSelectedMailId] = useState(null)
  const [search, setSearch] = useState('')
  const [mailViewMode, setMailViewMode] = useState('raw') // 'raw' | 'text'
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL)
  const [activeMobilePane, setActiveMobilePane] = useState('inbox') // 'inbox' | 'detail'

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('tm2_theme')
    if (saved) return saved
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // 主题切换同步
  useEffect(() => {
    document.documentElement.dataset.theme = theme
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

  // 短码解析函数
  async function resolveCode(shareCode) {
    const trimmed = (shareCode || '').trim().replace(/^#/, '')
    if (!trimmed) return false

    // 如果本身就是一长串 JWT (长度 > 60 且包含点)
    if (trimmed.length > 60 && trimmed.includes('.')) {
      setToken(trimmed)
      return true
    }

    setResolvingCode(true)
    try {
      const res = await fetch(`/share/${trimmed}`)
      if (!res.ok) {
        const errText = await res.text()
        let errMsg = '分享提取码无效或已过期'
        try {
          const parsed = JSON.parse(errText)
          if (parsed.error) errMsg = parsed.error
        } catch {}
        throw new Error(errMsg)
      }
      const data = await res.json()
      if (data.token) {
        setToken(data.token)
        if (data.address) setAddress(data.address)
        setCode(trimmed)
        Toast.success('提取码验证成功')
        return true
      }
      throw new Error('未获取到有效的访问凭证')
    } catch (err) {
      Toast.error(err.message || '解析提取码失败')
      return false
    } finally {
      setResolvingCode(false)
    }
  }

  // 初始加载时如果有 code 则自动解析
  useEffect(() => {
    if (!token && code) {
      resolveCode(code)
    }
  }, [code])

  const api = useMemo(() => {
    return createApi(() => ({
      addressJwt: token,
      sitePassword: '',
      adminPassword: '',
    }))
  }, [token])

  // 复制文本
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

  // 获取邮件
  async function fetchMails(isSilent = false) {
    if (!token) return
    if (!isSilent) setLoading(true)
    try {
      if (!address) {
        try {
          const settings = await api.getAddressSettings()
          if (settings?.address) setAddress(settings.address)
        } catch {}
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
        Toast.error(err.message || '拉取邮件失败')
      }
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchMails()
    }
  }, [token])

  // 轮询倒计时
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

  // 过滤邮件
  const filteredMails = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return mails
    return mails.filter((mail) => {
      const subject = String(mail.subject || '').toLowerCase()
      const source = String(mail.source || '').toLowerCase()
      const text = String(mail.text || mail.raw || '').toLowerCase()
      return subject.includes(keyword) || source.includes(keyword) || text.includes(keyword)
    })
  }, [mails, search])

  const selectedMail = useMemo(() => {
    return filteredMails.find((m) => m.id === selectedMailId) || filteredMails[0] || null
  }, [filteredMails, selectedMailId])

  function handleSelectMail(mail) {
    setSelectedMailId(mail.id)
    setActiveMobilePane('detail')
  }

  function handleExitSession() {
    setToken('')
    setAddress('')
    setCode('')
    setMails([])
    setSelectedMailId(null)
    window.location.hash = ''
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    const trimmed = inputCode.trim()
    if (!trimmed) {
      Toast.warning('请输入提取码或凭证')
      return
    }
    resolveCode(trimmed)
  }

  // 未输入凭据时：使用原生规范的 login-box 登录面板
  if (!token) {
    return (
      <div className="share-login-container">
        <div className="login-box">
          <div className="login-head">
            <div className="mark">
              <IconMail />
            </div>
            <Button
              className="btn icon theme-toggle"
              icon={theme === 'dark' ? <IconSun /> : <IconMoon />}
              title={theme === 'dark' ? '浅色模式' : '深色模式'}
              onClick={toggleTheme}
            />
          </div>

          <h1>邮件接收助手</h1>
          <p>请输入 12 位分享提取码或访问凭证查看收件箱</p>

          <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="field-group">
              <span className="input-label">提取秘钥 / Token</span>
              <Input
                className="field"
                value={inputCode}
                onChange={setInputCode}
                prefix={<IconKey />}
              />
            </label>

            <Button
              className="btn primary block"
              type="primary"
              htmlType="submit"
              loading={resolvingCode}
              disabled={resolvingCode || !inputCode.trim()}
            >
              进入收件箱
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <section className="share-shell">
      {/* 顶部规整导航 */}
      <header className="topbar">
        <div className="brand">
          <div className="mark">
            <IconMail />
          </div>
          <div>
            <strong>邮件接收助手</strong>
            <span>{code ? `提取码: ${code}` : '专属共享收件箱'}</span>
          </div>
        </div>

        <div className="top-actions">
          {address ? (
            <div
              className="share-address-badge"
              title="点击复制邮箱地址"
              onClick={() => copyText(address, '邮箱地址已复制')}
            >
              <span className="live-indicator" />
              <span className="text">{address}</span>
              <IconCopy style={{ flexShrink: 0 }} />
            </div>
          ) : null}

          <Button
            className="btn icon"
            icon={<IconRefresh spin={loading} />}
            title="刷新收件箱"
            disabled={loading}
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

          <Button
            className="btn icon"
            icon={<IconExit />}
            title="退出/切换其他邮箱"
            onClick={handleExitSession}
          />
        </div>
      </header>

      {/* 主体工作区：规整双栏结构 */}
      <main className="share-main">
        {/* 左栏：收件箱列表 */}
        <aside className={cls('share-inbox', activeMobilePane === 'inbox' && 'mobile-active')}>
          <div className="toolbar">
            <div className="toolbar-title">
              <strong>收件箱</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge">{filteredMails.length} 封</span>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
                  {countdown}s 刷新
                </span>
                <Switch
                  size="small"
                  checked={autoRefresh}
                  onChange={setAutoRefresh}
                  aria-label="自动刷新"
                />
              </div>
            </div>

            <div className="search-wrap">
              <IconSearch className="search-icon" />
              <Input
                className="field search-field"
                placeholder="搜索发件人、主题或内容"
                value={search}
                onChange={setSearch}
              />
            </div>
          </div>

          <div className="message-list">
            {loading && !filteredMails.length ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <Spin />
              </div>
            ) : null}

            {filteredMails.map((mail, index) => {
              const sender = mail.source || '未知发件人'
              const avatarLetter = (sender.replace(/<.*>/, '').trim() || 'M')[0].toUpperCase()

              return (
                <button
                  key={mail.id}
                  className={cls('message', selectedMail?.id === mail.id && 'active')}
                  style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                  onClick={() => handleSelectMail(mail)}
                >
                  <div className="sender-avatar" style={{ background: getAvatarColor(sender) }}>
                    {avatarLetter}
                  </div>
                  <div className="message-main">
                    <div className="message-top">
                      <span className="sender" title={sender}>{sender}</span>
                      <span className="time">{formatListDate(mail.created_at)}</span>
                    </div>
                    <span className="subject" title={mail.subject || '(无主题)'}>
                      {mail.subject || '(无主题)'}
                    </span>
                    <span className="preview">
                      {mail.text ? mail.text.slice(0, 120) : mail.message ? '(富文本 HTML 邮件)' : '-'}
                    </span>
                  </div>
                </button>
              )
            })}

            {!filteredMails.length && !loading ? (
              <div className="empty-state">
                <div className="empty-state-avatar">
                  <IconInbox />
                </div>
                <strong>收件箱空空如也</strong>
                <span>新收到的邮件将在此实时显示。</span>
              </div>
            ) : null}
          </div>
        </aside>

        {/* 右栏：邮件详情阅读器 */}
        <section className={cls('share-detail', activeMobilePane === 'detail' && 'mobile-active')}>
          {selectedMail ? (
            <>
              <div className="detail-head">
                <h2 className="detail-subject" title={selectedMail.subject || '(无主题)'}>
                  {selectedMail.subject || '(无主题)'}
                </h2>

                <div className="detail-meta">
                  <span title={selectedMail.source || '-'}>来自 {selectedMail.source || '-'}</span>
                  <span title={selectedMail.address || address || '-'}>
                    发送到 {selectedMail.address || address || '-'}
                  </span>
                  <span>{formatDate(selectedMail.created_at)}</span>
                </div>

                <div className="detail-actions">
                  <div className="segment" aria-label="邮件展示模式">
                    <button
                      className={cls(mailViewMode === 'raw' && 'active')}
                      onClick={() => setMailViewMode('raw')}
                    >
                      原文
                    </button>
                    <button
                      className={cls(mailViewMode === 'text' && 'active')}
                      onClick={() => setMailViewMode('text')}
                    >
                      纯文本
                    </button>
                  </div>

                  <Button
                    className="btn mobile-only"
                    onClick={() => setActiveMobilePane('inbox')}
                  >
                    返回列表
                  </Button>
                </div>
              </div>

              <article className="mail-body">
                {mailViewMode === 'text' ? (
                  <pre className="text-mail compact-text-mail">{compactMailBody(selectedMail)}</pre>
                ) : (
                  <iframe
                    className="original-mail"
                    sandbox="allow-same-origin allow-popups"
                    srcDoc={originalMailSource(selectedMail)}
                    title="邮件正文"
                  />
                )}
              </article>

              {/* 附件区域 */}
              {selectedMail.attachments?.length > 0 ? (
                <div className="attachments">
                  {selectedMail.attachments.map((att, idx) => (
                    <a
                      key={idx}
                      className="attachment"
                      href={att.url}
                      download={att.filename || `attachment_${idx + 1}`}
                    >
                      <div className="attachment-name">
                        <IconDownload />
                        <span>{att.filename || '未命名附件'}</span>
                      </div>
                      <span className="attachment-meta">下载附件</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-avatar">
                <IconInbox />
              </div>
              <strong>未选择邮件</strong>
              <span>从左侧邮件列表中点击一封邮件，在这里阅读详情。</span>
            </div>
          )}
        </section>
      </main>

      {/* 移动端底部切换 Tab */}
      <nav className="mobile-tabs">
        <button
          className={cls(activeMobilePane === 'inbox' && 'active')}
          onClick={() => setActiveMobilePane('inbox')}
        >
          <IconInbox className="tab-icon" />
          收件箱 ({filteredMails.length})
        </button>
        <button
          className={cls(activeMobilePane === 'detail' && 'active')}
          onClick={() => setActiveMobilePane('detail')}
        >
          <IconMail className="tab-icon" />
          邮件详情
        </button>
      </nav>
    </section>
  )
}
