import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Input, Select, Spin, Toast } from '@douyinfe/semi-ui'
import {
  IconAt,
  IconClose,
  IconCopy,
  IconDelete,
  IconDownload,
  IconExit,
  IconEyeOpened,
  IconHistogram,
  IconHome,
  IconInbox,
  IconKey,
  IconList,
  IconLock,
  IconMail,
  IconMoon,
  IconRefresh,
  IconSearch,
  IconShield,
  IconSun,
  IconSync,
} from '@douyinfe/semi-icons'
import { createApi } from './api'
import { parseMailAttachments, parseMailItem, revokeAttachmentUrls } from './mailParser'

const STORAGE_KEYS = {
  sitePassword: 'tm2_site_password',
  addressJwt: 'tm2_address_jwt',
  adminPassword: 'tm2_admin_password',
  localAddressCache: 'LocalAddressCache',
  theme: 'tm2_theme',
}

const DEFAULT_SETTINGS = {
  domains: [],
  defaultDomains: [],
  domainLabels: [],
  prefix: '',
  minAddressLen: 1,
  maxAddressLen: 30,
  needAuth: true,
  enableUserCreateEmail: true,
  enableUserDeleteEmail: false,
  disableAnonymousUserCreateEmail: false,
  disableCustomAddressName: false,
  randomSubdomainDomains: [],
}

function readInitialTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createInitialState() {
  return {
    loading: false,
    booted: false,
    unlocked: false,
    sitePassword: localStorage.getItem(STORAGE_KEYS.sitePassword) || '',
    addressJwt: localStorage.getItem(STORAGE_KEYS.addressJwt) || '',
    adminPassword: localStorage.getItem(STORAGE_KEYS.adminPassword) || '',
    error: '',
    theme: readInitialTheme(),
    settings: DEFAULT_SETTINGS,
    address: '',
    addressPassword: '',
    localAddresses: [],
    selectedDomain: '',
    draftAddress: '',
    enableRandomSubdomain: false,
    mails: [],
    selectedMailId: null,
    mailViewMode: 'raw',
    mailAttachments: [],
    mailAttachmentsForId: null,
    mailAttachmentsLoading: false,
    search: '',
    activeMobilePane: 'address',
    isAdminRoute: false,
    adminAuthed: false,
    adminTab: 'overview',
    adminStats: null,
    adminAddresses: [],
    adminMails: [],
    adminSelectedMailId: null,
    adminMailViewMode: 'raw',
    adminMailAttachments: [],
    adminMailAttachmentsForId: null,
    adminMailAttachmentsLoading: false,
    adminQuery: '',
    adminMailAddress: '',
  }
}

function getDomainOptions(settings) {
  const domains = settings.domains || []
  const defaults = settings.defaultDomains || []
  if (!defaults.length) return domains
  return domains.filter((item) => defaults.includes(item.value))
}

function canCreateAddress(settings) {
  return settings.enableUserCreateEmail !== false
    && settings.disableAnonymousUserCreateEmail !== true
}

function canDeleteAddress(settings) {
  return settings.enableUserDeleteEmail !== false
}

function randomName(maxLength = 18) {
  const left = ['silver', 'quiet', 'north', 'pixel', 'plain', 'green', 'metro', 'daily']
  const middle = ['river', 'cloud', 'signal', 'field', 'relay', 'orbit', 'paper', 'stone']
  const right = ['lake', 'box', 'desk', 'note', 'lane', 'mail', 'room', 'post']
  const suffix = String(Math.floor(100 + Math.random() * 900))
  const value = `${left[Math.floor(Math.random() * left.length)]}${middle[Math.floor(Math.random() * middle.length)]}${right[Math.floor(Math.random() * right.length)]}${suffix}`
  return value.slice(0, maxLength)
}

function buildDraftAddress(settings, selectedDomain) {
  const name = settings.disableCustomAddressName ? '' : randomName(settings.maxAddressLen || 18)
  const domain = selectedDomain || getDomainOptions(settings)[0]?.value || ''
  return settings.disableCustomAddressName ? `自动生成@${domain}` : `${name}@${domain}`
}

function normalizeAddressName(name) {
  return name.trim().replace(/[^a-zA-Z0-9]/g, '')
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function mailBody(mail) {
  if (!mail) return ''
  return mail.text || mail.message || mail.raw || ''
}

function compactMailBody(mail) {
  if (!mail) return ''
  const text = mail.text || mail.message || mail.raw || ''
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function originalMailSource(mail) {
  if (!mail) return ''
  if (mail.message) {
    // 如果有 HTML 内容，清理多余换行
    return mail.message
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
  }
  // 纯文本内容，清理多余换行后包裹在 pre 中
  const cleaned = (mail.raw || mail.text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `<pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-family: inherit; line-height: 1.6;">${escapeHtml(cleaned)}</pre>`
}

function formatBytes(value) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

function cls(...items) {
  return items.filter(Boolean).join(' ')
}

export default function App() {
  const [state, setState] = useState(createInitialState)
  const stateRef = useRef(state)
  const inflightRef = useRef(new Set())
  const loadingCountRef = useRef(0)

  function setAppState(patch) {
    setState((current) => {
      const patchValue = typeof patch === 'function' ? patch(current) : patch
      const next = { ...current, ...patchValue }
      stateRef.current = next
      return next
    })
  }

  function getState() {
    return stateRef.current
  }

  const api = useMemo(() => createApi(() => {
    const current = getState()
    return {
      sitePassword: current.sitePassword,
      addressJwt: current.addressJwt,
      adminPassword: current.adminPassword,
    }
  }), [])

  const domainOptions = useMemo(() => getDomainOptions(state.settings), [state.settings])
  const filteredMails = useMemo(() => {
    const keyword = state.search.trim().toLowerCase()
    if (!keyword) return state.mails
    return state.mails.filter((mail) => [mail.source, mail.address, mail.subject, mail.text, mail.message]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword))
  }, [state.mails, state.search])
  const selectedMail = useMemo(() => (
    state.mails.find((mail) => mail.id === state.selectedMailId) || state.mails[0] || null
  ), [state.mails, state.selectedMailId])
  const selectedAdminMail = useMemo(() => (
    state.adminMails.find((mail) => mail.id === state.adminSelectedMailId) || state.adminMails[0] || null
  ), [state.adminMails, state.adminSelectedMailId])
  const unreadCount = state.mails.length
  const themeActionLabel = state.theme === 'dark' ? '亮色' : '暗色'
  const createEnabled = canCreateAddress(state.settings)
  const deleteEnabled = canDeleteAddress(state.settings)

  function showToast(message) {
    if (!message) return
    Toast.info({ content: message, duration: 1.6 })
  }

  async function copyText(text, successMessage) {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      if (successMessage) showToast(successMessage)
      return true
    } catch {
      window.alert(text)
      return false
    }
  }

  function setError(error) {
    setAppState({ error: error?.message || String(error || '未知错误') })
  }

  async function run(task, successMessage = '', key = '') {
    if (key && inflightRef.current.has(key)) {
      showToast('正在查询，请稍候')
      return null
    }
    if (key) inflightRef.current.add(key)
    loadingCountRef.current += 1
    setAppState({ loading: true, error: '' })
    try {
      const result = await task()
      if (successMessage) showToast(successMessage)
      return result
    } catch (error) {
      setError(error)
      if (error.status === 401) {
        const { adminTab } = getState()
        if (adminTab === 'overview' || adminTab === 'addresses' || adminTab === 'mails') {
          setAppState({ adminAuthed: false })
        } else {
          setAppState({ unlocked: false, error: '访问密码已过期或未设置，请重新输入' })
        }
      }
      return null
    } finally {
      if (key) inflightRef.current.delete(key)
      loadingCountRef.current = Math.max(0, loadingCountRef.current - 1)
      setAppState({ loading: loadingCountRef.current > 0 })
    }
  }

  function normalizeOpenSettings(raw) {
    const rawDomains = Array.isArray(raw?.domains) ? raw.domains : []
    const labels = Array.isArray(raw?.domainLabels) ? raw.domainLabels : []
    return {
      ...getState().settings,
      ...raw,
      domains: rawDomains.map((domain, index) => ({
        label: labels[index] || domain,
        value: domain,
      })),
      defaultDomains: Array.isArray(raw?.defaultDomains) ? raw.defaultDomains : [],
      domainLabels: labels,
      prefix: raw?.prefix || '',
      minAddressLen: raw?.minAddressLen || 1,
      maxAddressLen: raw?.maxAddressLen || 30,
      disableAnonymousUserCreateEmail: raw?.disableAnonymousUserCreateEmail === true,
      randomSubdomainDomains: Array.isArray(raw?.randomSubdomainDomains) ? raw.randomSubdomainDomains : [],
    }
  }

  async function fetchOpenSettings() {
    const settings = await run(() => api.getOpenSettings())
    if (!settings) {
      setAppState({ booted: true })
      return false
    }
    const normalized = normalizeOpenSettings(settings)
    const options = getDomainOptions(normalized)
    const selectedDomain = options[0]?.value || normalized.domains[0]?.value || ''
    const patch = { settings: normalized, selectedDomain }
    if (!getState().draftAddress) patch.draftAddress = buildDraftAddress(normalized, selectedDomain)
    setAppState(patch)
    return true
  }

  function readLocalAddressCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.localAddressCache) || '[]')
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return []
    }
  }

  function writeLocalAddressCache(items) {
    localStorage.setItem(STORAGE_KEYS.localAddressCache, JSON.stringify([...new Set(items.filter(Boolean))]))
  }

  function parseJwtAddress(jwt) {
    try {
      const payload = JSON.parse(
        decodeURIComponent(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))),
      )
      return payload.address || ''
    } catch {
      return ''
    }
  }

  function syncLocalAddresses() {
    const current = getState()
    const cached = readLocalAddressCache()
    if (current.addressJwt && !cached.includes(current.addressJwt)) {
      cached.push(current.addressJwt)
      writeLocalAddressCache(cached)
    }
    setAppState({
      localAddresses: cached.map((jwt) => ({
        jwt,
        address: parseJwtAddress(jwt) || `invalid jwt [${jwt.slice(0, 12)}...]`,
        valid: !!parseJwtAddress(jwt),
      })).reverse(), // 倒序，最新的在前面
    })
  }

  function saveAddressJwt(jwt) {
    setAppState({ addressJwt: jwt })
    localStorage.setItem(STORAGE_KEYS.addressJwt, jwt)
    const cached = readLocalAddressCache()
    if (!cached.includes(jwt)) {
      cached.push(jwt)
      writeLocalAddressCache(cached)
    }
    syncLocalAddresses()
  }

  function toggleTheme() {
    const nextTheme = getState().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEYS.theme, nextTheme)
    applyTheme(nextTheme)
    setAppState({ theme: nextTheme })
  }

  function syncRoute() {
    const isAdminRoute = window.location.pathname.replace(/\/$/, '').endsWith('/admin')
    const current = getState()
    setAppState({
      isAdminRoute,
      activeMobilePane: isAdminRoute ? 'admin' : current.activeMobilePane === 'admin' ? 'address' : current.activeMobilePane,
    })
  }

  function generateDraftAddress(notify = true, selectedDomain = getState().selectedDomain) {
    const draftAddress = buildDraftAddress(getState().settings, selectedDomain)
    setAppState({ draftAddress })
    if (notify) showToast('已生成新地址')
  }

  function parseDraftAddress() {
    const current = getState()
    const value = current.draftAddress.trim()
    if (!value) return { name: '', domain: current.selectedDomain }
    if (!value.includes('@')) return { name: value, domain: current.selectedDomain }
    const [name, ...domainParts] = value.split('@')
    return {
      name: name.trim(),
      domain: domainParts.join('@').trim() || current.selectedDomain,
    }
  }

  async function unlock() {
    const current = getState()
    if (current.settings.needAuth) {
      const password = current.sitePassword.trim()
      if (!password) {
        setAppState({ error: '请输入页面密码' })
        return
      }
      const result = await run(() => api.siteLogin(password), '验证通过')
      if (result === null) return
      setAppState({ sitePassword: password })
    }
    localStorage.setItem(STORAGE_KEYS.sitePassword, getState().sitePassword)
    setAppState({ unlocked: true })
    await refreshAddressSession()
  }

  function lock() {
    setAppState({
      unlocked: false,
      addressJwt: '',
      address: '',
      mails: [],
    })
    localStorage.removeItem(STORAGE_KEYS.addressJwt)
  }

  async function createAddress() {
    const current = getState()
    if (!canCreateAddress(current.settings)) {
      setAppState({ error: '当前配置不允许匿名创建邮箱地址' })
      return
    }
    const parsed = parseDraftAddress()
    if (!parsed.domain) {
      setAppState({ error: '没有可用域名，请检查 Worker 的 DOMAINS / DEFAULT_DOMAINS 配置' })
      return
    }
    const name = current.settings.disableCustomAddressName ? '' : parsed.name.trim()
    const normalizedName = normalizeAddressName(name)
    if (!current.settings.disableCustomAddressName && normalizedName !== name) {
      const normalizedDraft = parsed.domain ? `${normalizedName}@${parsed.domain}` : normalizedName
      setAppState({
        draftAddress: normalizedDraft,
        error: '邮箱名前缀只支持字母和数字，已移除横线或特殊字符，请确认后再创建',
      })
      return
    }
    const result = await run(
      () => api.createAddress(normalizedName, parsed.domain, getState().enableRandomSubdomain),
      '地址已创建',
    )
    if (!result?.jwt) return
    saveAddressJwt(result.jwt)
    setAppState({ addressPassword: result.password || '' })
    await refreshAddressSession()
  }

  async function switchLocalAddress(jwt) {
    if (!jwt || jwt === getState().addressJwt) return
    saveAddressJwt(jwt)
    setAppState({ mails: [], selectedMailId: null })
    await refreshAddressSession()
    showToast('已切换地址')
  }

  function removeLocalAddress(jwt) {
    if (jwt === getState().addressJwt) return
    const cached = readLocalAddressCache().filter((item) => item !== jwt)
    writeLocalAddressCache(cached)
    syncLocalAddresses()
    showToast('已移除历史地址')
  }

  async function refreshAddressSession() {
    if (!getState().addressJwt) return
    const settings = await run(() => api.getAddressSettings())
    if (!settings) return
    setAppState({ address: settings.address || '' })
    await fetchMails()
  }

  async function fetchMails(notify = true) {
    if (!getState().addressJwt) return
    const result = await run(() => api.fetchMails(30, 0), notify ? '收件箱已刷新' : '', 'mails:current')
    if (!result) return
    const mails = Array.isArray(result.results) ? result.results.map(parseMailItem) : []
    const firstMail = mails[0] || null
    setAppState({ mails, selectedMailId: firstMail?.id || null })
    await loadMailAttachments(firstMail)
  }

  async function deleteSelectedMail() {
    const mail = getState().mails.find((item) => item.id === getState().selectedMailId) || getState().mails[0]
    if (!mail) return
    if (!confirm('确定删除这封邮件？')) return
    await run(() => api.deleteMail(mail.id), '邮件已删除')
    await fetchMails()
  }

  async function deleteAddress() {
    const current = getState()
    if (!current.addressJwt || !confirm('确定删除当前地址？')) return
    if (!canDeleteAddress(current.settings)) {
      setAppState({ error: '当前配置不允许删除邮箱地址' })
      return
    }
    const deletingJwt = current.addressJwt
    const ok = await run(() => api.deleteAddress(), '地址已删除')
    if (ok === null) return
    setAppState({
      addressJwt: '',
      address: '',
      mails: [],
      selectedMailId: null,
    })
    localStorage.removeItem(STORAGE_KEYS.addressJwt)
    writeLocalAddressCache(readLocalAddressCache().filter((item) => item !== deletingJwt))
    syncLocalAddresses()
  }

  async function clearInbox() {
    if (!getState().addressJwt || !confirm('确定清空当前邮箱的所有邮件？')) return
    const ok = await run(() => api.clearInbox(), '收件箱已清空')
    if (ok === null) return
    setAppState({ mails: [], selectedMailId: null })
    await loadMailAttachments(null)
  }

  function selectMail(mail) {
    setAppState({ selectedMailId: mail.id, activeMobilePane: 'content' })
    void loadMailAttachments(mail)
  }

  function selectAdminMail(mail) {
    setAppState({ adminSelectedMailId: mail.id })
    void loadAdminMailAttachments(mail)
  }

  async function adminLogin() {
    const password = getState().adminPassword.trim()
    if (!password) {
      setAppState({ error: '请输入管理员密码' })
      return
    }
    const result = await run(() => api.adminLogin(password), 'Admin 已登录')
    if (result === null) return
    localStorage.setItem(STORAGE_KEYS.adminPassword, password)
    setAppState({ adminAuthed: true })
    await loadAdminOverview()
  }

  function adminLogout() {
    setAppState({ adminAuthed: false, adminPassword: '' })
    localStorage.removeItem(STORAGE_KEYS.adminPassword)
  }

  function goHome() {
    window.location.href = '/'
  }

  async function loadAdminOverview() {
    setAppState({ adminTab: 'overview' })
    const stats = await run(() => api.adminStatistics(), '', 'admin:stats')
    if (stats) setAppState({ adminStats: stats })
  }

  async function loadAdminAddresses() {
    const query = getState().adminQuery
    setAppState({ adminTab: 'addresses' })
    const result = await run(
      () => api.adminAddresses({ query, limit: 50, offset: 0 }),
      '',
      `admin:addresses:${query}`,
    )
    if (result) setAppState({ adminAddresses: Array.isArray(result.results) ? result.results : [] })
  }

  async function loadAdminMails(address = getState().adminMailAddress) {
    const adminMailAddress = address || ''
    setAppState({ adminTab: 'mails', adminMailAddress })
    const result = await run(
      () => api.adminMails({ address: adminMailAddress, limit: 50, offset: 0 }),
      '',
      `admin:mails:${adminMailAddress}`,
    )
    if (result) {
      const adminMails = Array.isArray(result.results) ? result.results.map(parseMailItem) : []
      const firstMail = adminMails[0] || null
      setAppState({ adminMails, adminSelectedMailId: firstMail?.id || null })
      await loadAdminMailAttachments(firstMail)
    }
  }

  async function adminDeleteAddress(id) {
    if (!confirm('确定删除这个地址？')) return
    await run(() => api.adminDeleteAddress(id), '地址已删除')
    await loadAdminAddresses()
  }

  async function adminShowCredential(id) {
    const result = await run(() => api.adminShowAddressCredential(id), '地址凭证已读取')
    if (!result) return
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    await copyText(text, '地址凭证已复制')
  }

  async function adminDeleteMail(id) {
    if (!confirm('确定删除这封邮件？')) return
    await run(() => api.adminDeleteMail(id), '邮件已删除')
    await loadAdminMails()
  }

  async function loadMailAttachments(mail) {
    revokeAttachmentUrls(getState().mailAttachments)
    setAppState({
      mailAttachments: [],
      mailAttachmentsForId: mail?.id || null,
      mailAttachmentsLoading: !!mail?.raw,
    })
    if (!mail?.raw) return
    try {
      const attachments = await parseMailAttachments(mail)
      if (getState().mailAttachmentsForId === mail.id) {
        setAppState({ mailAttachments: attachments })
      } else {
        revokeAttachmentUrls(attachments)
      }
    } catch (error) {
      setError(error)
    } finally {
      if (getState().mailAttachmentsForId === mail.id) {
        setAppState({ mailAttachmentsLoading: false })
      }
    }
  }

  async function loadAdminMailAttachments(mail) {
    revokeAttachmentUrls(getState().adminMailAttachments)
    setAppState({
      adminMailAttachments: [],
      adminMailAttachmentsForId: mail?.id || null,
      adminMailAttachmentsLoading: !!mail?.raw,
    })
    if (!mail?.raw) return
    try {
      const attachments = await parseMailAttachments(mail)
      if (getState().adminMailAttachmentsForId === mail.id) {
        setAppState({ adminMailAttachments: attachments })
      } else {
        revokeAttachmentUrls(attachments)
      }
    } catch (error) {
      setError(error)
    } finally {
      if (getState().adminMailAttachmentsForId === mail.id) {
        setAppState({ adminMailAttachmentsLoading: false })
      }
    }
  }

  useEffect(() => {
    applyTheme(getState().theme)
    const systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    const systemThemeHandler = (event) => {
      if (localStorage.getItem(STORAGE_KEYS.theme)) return
      const theme = event.matches ? 'dark' : 'light'
      applyTheme(theme)
      setAppState({ theme })
    }
    systemThemeQuery?.addEventListener?.('change', systemThemeHandler)
    syncRoute()
    window.addEventListener('popstate', syncRoute)

    let alive = true
    async function boot() {
      syncLocalAddresses()
      const current = getState()
      if (!current.addressJwt && current.localAddresses.length > 0) {
        const addressJwt = current.localAddresses[current.localAddresses.length - 1].jwt
        setAppState({ addressJwt })
        localStorage.setItem(STORAGE_KEYS.addressJwt, addressJwt)
      }
      const settingsLoaded = await fetchOpenSettings()
      if (!settingsLoaded) {
        if (alive) {
          setAppState({ booted: true, sitePassword: '', error: '无法连接到服务器，请输入页面密码后重试' })
        }
        return
      }
      const afterSettings = getState()
      if (!afterSettings.settings.needAuth) {
        setAppState({ unlocked: true })
        await refreshAddressSession()
      } else if (afterSettings.sitePassword) {
        const cachedPassword = afterSettings.sitePassword
        const result = await run(() => api.siteLogin(cachedPassword))
        if (result !== null) {
          setAppState({ unlocked: true })
          await refreshAddressSession()
        } else {
          setAppState({ sitePassword: '' })
          localStorage.removeItem(STORAGE_KEYS.sitePassword)
        }
      }
      if (getState().adminPassword) setAppState({ adminAuthed: true })
      if (getState().isAdminRoute && getState().adminAuthed) {
        await loadAdminOverview()
      }
      if (alive) setAppState({ booted: true })
    }

    void boot()

    return () => {
      alive = false
      systemThemeQuery?.removeEventListener?.('change', systemThemeHandler)
      window.removeEventListener('popstate', syncRoute)
      revokeAttachmentUrls(getState().mailAttachments)
      revokeAttachmentUrls(getState().adminMailAttachments)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = getState()
      if (!current.booted || !current.unlocked || current.isAdminRoute || !current.addressJwt) return
      if (inflightRef.current.has('mails:current')) return
      void fetchMails(false)
    }, 60000)
    return () => window.clearInterval(timer)
  }, [])

  function onEnter(event, handler) {
    if (event.key === 'Enter') handler()
  }

  function renderThemeButton() {
    return (
      <Button
        className="btn theme-toggle"
        icon={state.theme === 'dark' ? <IconSun /> : <IconMoon />}
        title={`切换到${themeActionLabel}`}
        onClick={toggleTheme}
      >
        {themeActionLabel}
      </Button>
    )
  }

  function renderAttachments(loading, attachments) {
    if (!loading && !attachments.length) return null
    return (
      <section className="attachments">
        <div className="section-label">附件</div>
        {loading ? <div className="empty">正在解析附件</div> : null}
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            className="attachment"
            href={attachment.url}
            download={attachment.filename}
          >
            <span className="attachment-name">
              <IconDownload />
              {attachment.filename}
            </span>
            <span className="attachment-meta">{attachment.mimeType} · {formatBytes(attachment.size)}</span>
          </a>
        ))}
      </section>
    )
  }

  if (!state.booted) {
    return <div className="boot">加载中</div>
  }

  return (
    <>
      <Spin spinning={state.loading} wrapperClassName="app-spin">
        {!state.unlocked ? (
          <section className="login">
            <div className="login-box">
              <div className="login-head">
                <div className="brand">
                  <div className="mark"></div>
                  <div>
                    <strong>自用临时邮箱</strong>
                    <span>基于 Cloudflare 邮件系统</span>
                  </div>
                </div>
                {renderThemeButton()}
              </div>
              <h1>输入页面密码</h1>
              <p>使用 Worker 中配置的页面密码进入。用户注册和用户中心已隐藏。</p>
              <Input
                className="field"
                type="password"
                value={state.sitePassword}
                autoComplete="current-password"
                onChange={(value) => setAppState({ sitePassword: value })}
                onKeyDown={(event) => onEnter(event, unlock)}
              />
              <Button
                className="btn block"
                theme="solid"
                type="primary"
                icon={<IconExit />}
                disabled={state.loading}
                onClick={unlock}
              >
                进入邮箱
              </Button>
              {state.error ? <p className="error">{state.error}</p> : null}
            </div>
          </section>
        ) : state.isAdminRoute ? (
          <section className="admin-page">
            <header className="topbar">
              <div className="brand">
                <div className="mark"></div>
                <div>
                  <strong>自用临时邮箱 Admin</strong>
                  <span>基于 Cloudflare 邮件系统</span>
                </div>
              </div>
              <div className="top-actions">
                {renderThemeButton()}
                <Button className="btn" icon={<IconHome />} onClick={goHome}>返回邮箱</Button>
                <Button className="btn icon" icon={<IconLock />} title="锁定" onClick={lock} />
              </div>
            </header>

            <main className="admin-shell">
              <section className="admin-hero">
                <div className="admin-title">
                  <h1>Admin</h1>
                  <p>管理地址、邮件和基础统计。</p>
                </div>
                {!state.adminAuthed ? (
                  <div className="admin-login">
                    <Input
                      className="field"
                      type="password"
                      placeholder="管理员密码"
                      value={state.adminPassword}
                      onChange={(value) => setAppState({ adminPassword: value })}
                      onKeyDown={(event) => onEnter(event, adminLogin)}
                    />
                    <Button
                      className="btn"
                      theme="solid"
                      type="primary"
                      icon={<IconExit />}
                      disabled={state.loading}
                      onClick={adminLogin}
                    >
                      登录
                    </Button>
                  </div>
                ) : (
                  <div className="detail-actions">
                    <Button className={cls('btn', state.adminTab === 'overview' && 'primary')} icon={<IconHistogram />} onClick={loadAdminOverview}>统计</Button>
                    <Button className={cls('btn', state.adminTab === 'addresses' && 'primary')} icon={<IconAt />} onClick={loadAdminAddresses}>地址</Button>
                    <Button className={cls('btn', state.adminTab === 'mails' && 'primary')} icon={<IconMail />} onClick={() => loadAdminMails()}>邮件</Button>
                    <Button className="btn danger" type="danger" icon={<IconExit />} onClick={adminLogout}>退出</Button>
                  </div>
                )}
              </section>

              {state.adminAuthed && state.adminTab === 'overview' ? (
                <section className="admin-section">
                  <div className="metric-grid">
                    <div className="metric">
                      <span>地址总数</span>
                      <strong>{state.adminStats?.addressCount ?? '-'}</strong>
                    </div>
                    <div className="metric">
                      <span>7 天活跃地址</span>
                      <strong>{state.adminStats?.activeAddressCount7days ?? '-'}</strong>
                    </div>
                    <div className="metric">
                      <span>邮件总数</span>
                      <strong>{state.adminStats?.mailCount ?? '-'}</strong>
                    </div>
                  </div>
                </section>
              ) : null}

              {state.adminAuthed && state.adminTab === 'addresses' ? (
                <section className="admin-section">
                  <div className="admin-filter">
                    <Input
                      className="field"
                      placeholder="搜索地址"
                      value={state.adminQuery}
                      onChange={(value) => setAppState({ adminQuery: value })}
                      onKeyDown={(event) => onEnter(event, loadAdminAddresses)}
                    />
                    <Button className="btn" icon={<IconSearch />} disabled={state.loading} onClick={loadAdminAddresses}>查询</Button>
                  </div>
                  <div className="table-list">
                    {state.adminAddresses.map((row) => (
                      <div key={row.id} className="table-row">
                        <div>
                          <strong>{row.name}</strong>
                          <span>ID {row.id} · 邮件 {row.mail_count || 0} · {formatDate(row.created_at)}</span>
                        </div>
                        <div className="row-actions">
                          <Button className="btn" icon={<IconEyeOpened />} disabled={state.loading} onClick={() => loadAdminMails(row.name)}>看邮件</Button>
                          <Button className="btn" icon={<IconKey />} disabled={state.loading} onClick={() => adminShowCredential(row.id)}>凭证</Button>
                          <Button className="btn danger" type="danger" icon={<IconDelete />} disabled={state.loading} onClick={() => adminDeleteAddress(row.id)}>删除</Button>
                        </div>
                      </div>
                    ))}
                    {!state.adminAddresses.length ? <div className="empty">暂无地址</div> : null}
                  </div>
                </section>
              ) : null}

              {state.adminAuthed && state.adminTab === 'mails' ? (
                <section className="admin-section admin-mail-workspace">
                  <div className="admin-mail-toolbar">
                    <Input
                      className="field"
                      placeholder="按地址筛选"
                      value={state.adminMailAddress}
                      onChange={(value) => setAppState({ adminMailAddress: value })}
                      onKeyDown={(event) => onEnter(event, () => loadAdminMails())}
                    />
                    <Button className="btn" icon={<IconSearch />} disabled={state.loading} onClick={() => loadAdminMails()}>查询</Button>
                  </div>

                  <div className="admin-mail-grid">
                    <aside className="admin-mail-list">
                      {state.adminMails.map((mail) => (
                        <button
                          key={mail.id}
                          className={cls('message', selectedAdminMail?.id === mail.id && 'active')}
                          onClick={() => selectAdminMail(mail)}
                        >
                          <span className="dot"></span>
                          <span className="message-main">
                            <span className="message-title">
                              <span className="sender">{mail.source || '-'}</span>
                              <span className="tag">邮件</span>
                            </span>
                            <span className="subject">{mail.subject || '(无主题)'}</span>
                            <span className="preview">{mail.text || mail.message || mail.raw || ''}</span>
                            <span className="time">{formatDate(mail.created_at)}</span>
                          </span>
                        </button>
                      ))}
                      {!state.adminMails.length ? <div className="empty">暂无邮件</div> : null}
                    </aside>

                    <article className="admin-mail-preview">
                      {selectedAdminMail ? (
                        <>
                          <div className="detail-head">
                            <h2 className="detail-subject">{selectedAdminMail.subject || '(无主题)'}</h2>
                            <div className="detail-meta">
                              <span>来自 {selectedAdminMail.source || '-'}</span>
                              <span>发送到 {selectedAdminMail.address || '-'}</span>
                              <span>{formatDate(selectedAdminMail.created_at)}</span>
                            </div>
                            <div className="detail-actions">
                              <div className="segment" aria-label="邮件展示模式">
                                <button className={cls(state.adminMailViewMode === 'raw' && 'active')} onClick={() => setAppState({ adminMailViewMode: 'raw' })}>原文</button>
                                <button className={cls(state.adminMailViewMode === 'text' && 'active')} onClick={() => setAppState({ adminMailViewMode: 'text' })}>纯文本</button>
                              </div>
                              <Button className="btn danger" type="danger" icon={<IconDelete />} disabled={state.loading} onClick={() => adminDeleteMail(selectedAdminMail.id)}>删除邮件</Button>
                            </div>
                          </div>
                          <div className="mail-body">
                            {state.adminMailViewMode === 'text' ? (
                              <pre className="text-mail compact-text-mail">{compactMailBody(selectedAdminMail)}</pre>
                            ) : (
                              <iframe className="original-mail" sandbox="" srcDoc={originalMailSource(selectedAdminMail)} title="邮件原文"></iframe>
                            )}
                          </div>
                          {renderAttachments(state.adminMailAttachmentsLoading, state.adminMailAttachments)}
                        </>
                      ) : (
                        <div className="empty-state">
                          <strong>未选择邮件</strong>
                          <span>从左侧列表选择一封邮件查看内容。</span>
                        </div>
                      )}
                    </article>
                  </div>
                </section>
              ) : null}
            </main>
          </section>
        ) : (
          <section className="shell">
            <header className="topbar">
              <div className="brand">
                <div className="mark"></div>
                <div>
                  <strong>自用临时邮箱</strong>
                  <span>{state.address || '基于 Cloudflare 邮件系统'}</span>
                </div>
              </div>
              <div className="top-actions">
                {renderThemeButton()}
                <Button className="btn desktop-only" icon={<IconRefresh />} disabled={state.loading || !state.addressJwt} onClick={() => fetchMails()}>刷新</Button>
                <Button className="btn icon" icon={<IconLock />} title="锁定" onClick={lock} />
              </div>
            </header>

            <main className="main">
              <aside className={cls('pane sidebar', state.activeMobilePane === 'address' && 'mobile-active')}>
                <div className="compose">
                  <h1>临时邮箱</h1>
                  <label className="field-group">
                    <span className="input-label">选择域名</span>
                    <Select
                      className="field semi-select-field"
                      value={state.selectedDomain}
                      optionList={domainOptions}
                      onChange={(value) => {
                        const selectedDomain = String(value || '')
                        setAppState({
                          selectedDomain,
                          draftAddress: buildDraftAddress(getState().settings, selectedDomain),
                        })
                      }}
                    />
                  </label>
                  <label className="generated">
                    <span className="input-label">邮箱地址</span>
                    <Input
                      className="address-input"
                      value={state.draftAddress}
                      disabled={state.settings.disableCustomAddressName}
                      spellCheck={false}
                      onChange={(value) => setAppState({ draftAddress: value })}
                    />
                  </label>
                  {state.settings.randomSubdomainDomains.includes(state.selectedDomain) ? (
                    <Checkbox
                      className="checkline"
                      checked={state.enableRandomSubdomain}
                      onChange={(event) => setAppState({ enableRandomSubdomain: event.target.checked })}
                    >
                      随机子域名
                    </Checkbox>
                  ) : null}
                  <div className="generated-actions">
                    <button className="action-btn primary" title="创建地址" disabled={state.loading || !createEnabled} onClick={createAddress}>
                      <IconAt />
                    </button>
                    <button className="action-btn" title="换一个地址" onClick={() => generateDraftAddress()}>
                      <IconSync />
                    </button>
                  </div>
                  {state.addressPassword ? <p className="hint">地址密码：{state.addressPassword}</p> : null}
                </div>

                <div className="address-list">
                  <div className="section-label">历史地址</div>
                  {state.localAddresses.length > 0 ? (
                    <div className="history-list">
                      {state.localAddresses.map((item) => (
                        <div key={item.jwt} className={cls('history-row', item.jwt === state.addressJwt && 'active')}>
                          <button className="history-address" onClick={() => switchLocalAddress(item.jwt)}>
                            <span className="address-name">{item.address}</span>
                            <span className="address-meta">{item.jwt === state.addressJwt ? '当前地址' : '点击切换'}</span>
                          </button>
                          <button className="history-copy" title="复制地址" onClick={() => copyText(item.address, '已复制')}>
                            <IconCopy />
                          </button>
                          <button className="history-remove" disabled={item.jwt === state.addressJwt} title="移除" onClick={() => removeLocalAddress(item.jwt)}>
                            <IconClose />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty">还没有创建地址</div>
                  )}
                </div>
              </aside>

              <section className={cls('pane detail', state.activeMobilePane === 'content' && 'mobile-active')}>
                {selectedMail ? (
                  <>
                    <div className="detail-head">
                      <h2 className="detail-subject">{selectedMail.subject || '(无主题)'}</h2>
                      <div className="detail-meta">
                        <span>来自 {selectedMail.source || '-'}</span>
                        <span>发送到 {selectedMail.address || state.address || '-'}</span>
                        <span>{formatDate(selectedMail.created_at)}</span>
                      </div>
                      <div className="detail-actions">
                        <div className="segment" aria-label="邮件展示模式">
                          <button className={cls(state.mailViewMode === 'raw' && 'active')} onClick={() => setAppState({ mailViewMode: 'raw' })}>原文</button>
                          <button className={cls(state.mailViewMode === 'text' && 'active')} onClick={() => setAppState({ mailViewMode: 'text' })}>纯文本</button>
                        </div>
                        <Button className="btn danger" type="danger" icon={<IconDelete />} disabled={state.loading} onClick={deleteSelectedMail}>删除邮件</Button>
                      </div>
                    </div>
                    <article className="mail-body">
                      {state.mailViewMode === 'text' ? (
                        <pre className="text-mail">{mailBody(selectedMail)}</pre>
                      ) : (
                        <iframe className="original-mail" sandbox="" srcDoc={originalMailSource(selectedMail)} title="邮件原文"></iframe>
                      )}
                    </article>
                    {renderAttachments(state.mailAttachmentsLoading, state.mailAttachments)}
                  </>
                ) : (
                  <div className="empty-state">
                    <strong>暂无邮件</strong>
                    <span>收到新邮件后会显示在这里。</span>
                  </div>
                )}
              </section>

              <section className={cls('pane inbox', state.activeMobilePane === 'inbox' && 'mobile-active')}>
                <div className="toolbar">
                  <div className="toolbar-title">
                    <strong>收件箱</strong>
                    <span>{filteredMails.length} / {state.mails.length} 封</span>
                  </div>
                  <div className="search-wrap">
                    <IconSearch className="search-icon" />
                    <Input
                      className="field search-field"
                      placeholder="搜索发件人、主题或内容"
                      value={state.search}
                      onChange={(value) => setAppState({ search: value })}
                    />
                  </div>
                  <div className="row-actions">
                    <Button className="btn" icon={<IconDelete />} disabled={state.loading || !state.addressJwt} onClick={clearInbox}>清空</Button>
                    <Button className="btn danger" type="danger" icon={<IconShield />} disabled={state.loading || !state.addressJwt || !deleteEnabled} onClick={deleteAddress}>删除地址</Button>
                  </div>
                </div>
                <div className="message-list">
                  <div className="message-head">
                    <span>发件人</span>
                    <span>主题</span>
                    <span>时间</span>
                  </div>
                  {filteredMails.map((mail) => (
                    <button
                      key={mail.id}
                      className={cls('message', selectedMail?.id === mail.id && 'active')}
                      onClick={() => selectMail(mail)}
                    >
                      <span className="sender">{mail.source || '-'}</span>
                      <span className="message-main">
                        <span className="subject">{mail.subject || '(无主题)'}</span>
                        <span className="preview">{mail.text || mail.message || mail.raw || ''}</span>
                      </span>
                      <span className="time">{formatDate(mail.created_at)}</span>
                    </button>
                  ))}
                  {!filteredMails.length ? <div className="empty">没有匹配的邮件</div> : null}
                </div>
              </section>
            </main>

            <nav className="mobile-tabs">
              <button className={cls(state.activeMobilePane === 'address' && 'active')} onClick={() => setAppState({ activeMobilePane: 'address' })}>
                <IconAt className="tab-icon" />
                地址
              </button>
              <button className={cls(state.activeMobilePane === 'inbox' && 'active')} onClick={() => setAppState({ activeMobilePane: 'inbox' })}>
                <IconList className="tab-icon" />
                收件箱
              </button>
              <button className={cls(state.activeMobilePane === 'content' && 'active')} onClick={() => setAppState({ activeMobilePane: 'content' })}>
                <IconInbox className="tab-icon" />
                详情
              </button>
            </nav>
          </section>
        )}
      </Spin>

      {state.loading ? <div className="loading">请求中</div> : null}
      {state.error && state.unlocked ? (
        <div className="error-bar">
          <span>{state.error}</span>
          <button onClick={() => setAppState({ error: '' })}>
            <IconClose />
          </button>
        </div>
      ) : null}
    </>
  )
}
