<script setup>
import {
  AtSign,
  BarChart3,
  Clipboard,
  Download,
  Eye,
  Home,
  KeyRound,
  List,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  MailOpen,
  Moon,
  RefreshCw,
  RotateCw,
  Search,
  Shield,
  Sun,
  Trash2,
  X,
} from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { createApi } from './api'
import { parseMailAttachments, parseMailItem, revokeAttachmentUrls } from './mailParser'

const STORAGE_KEYS = {
  sitePassword: 'tm2_site_password',
  addressJwt: 'tm2_address_jwt',
  adminPassword: 'tm2_admin_password',
  localAddressCache: 'LocalAddressCache',
  theme: 'tm2_theme',
}

const initialTheme = readInitialTheme()

const state = reactive({
  loading: false,
  booted: false,
  unlocked: false,
  sitePassword: localStorage.getItem(STORAGE_KEYS.sitePassword) || '',
  addressJwt: localStorage.getItem(STORAGE_KEYS.addressJwt) || '',
  adminPassword: localStorage.getItem(STORAGE_KEYS.adminPassword) || '',
  toast: '',
  error: '',
  theme: initialTheme,
  settings: {
    domains: [],
    defaultDomains: [],
    domainLabels: [],
    prefix: '',
    minAddressLen: 1,
    maxAddressLen: 30,
    needAuth: false,
    enableUserCreateEmail: true,
    enableUserDeleteEmail: false,
    disableAnonymousUserCreateEmail: false,
    disableCustomAddressName: false,
    randomSubdomainDomains: [],
  },
  address: '',
  addressPassword: '',
  localAddresses: [],
  selectedDomain: '',
  draftAddress: '',
  enableRandomSubdomain: false,
  mails: [],
  selectedMailId: null,
  mailViewMode: 'text',
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
  adminMailViewMode: 'text',
  adminMailAttachments: [],
  adminMailAttachmentsForId: null,
  adminMailAttachmentsLoading: false,
  adminQuery: '',
  adminMailAddress: '',
})

const inflight = new Set()
const loadingCount = ref(0)
const { copy: writeClipboard } = useClipboard({ legacy: true })

const api = createApi(() => ({
  sitePassword: state.sitePassword,
  addressJwt: state.addressJwt,
  adminPassword: state.adminPassword,
}))

const domainOptions = computed(() => {
  const domains = state.settings.domains || []
  const defaults = state.settings.defaultDomains || []
  if (!defaults.length) return domains
  return domains.filter((item) => defaults.includes(item.value))
})

const filteredMails = computed(() => {
  const keyword = state.search.trim().toLowerCase()
  if (!keyword) return state.mails
  return state.mails.filter((mail) => {
    return [mail.source, mail.address, mail.subject, mail.text, mail.message]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })
})

const selectedMail = computed(() => {
  return state.mails.find((mail) => mail.id === state.selectedMailId) || state.mails[0] || null
})

const selectedAdminMail = computed(() => {
  return state.adminMails.find((mail) => mail.id === state.adminSelectedMailId) || state.adminMails[0] || null
})

const unreadCount = computed(() => state.mails.length)
const themeActionLabel = computed(() => (state.theme === 'dark' ? '亮色' : '暗色'))
const canCreateAddress = computed(() => (
  state.settings.enableUserCreateEmail !== false
  && state.settings.disableAnonymousUserCreateEmail !== true
))
const canDeleteAddress = computed(() => state.settings.enableUserDeleteEmail !== false)

function readInitialTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark'
  localStorage.setItem(STORAGE_KEYS.theme, state.theme)
  applyTheme(state.theme)
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
      decodeURIComponent(
        atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      ),
    )
    return payload.address || ''
  } catch {
    return ''
  }
}

function syncLocalAddresses() {
  const cached = readLocalAddressCache()
  if (state.addressJwt && !cached.includes(state.addressJwt)) {
    cached.push(state.addressJwt)
    writeLocalAddressCache(cached)
  }
  state.localAddresses = cached.map((jwt) => ({
    jwt,
    address: parseJwtAddress(jwt) || `invalid jwt [${jwt.slice(0, 12)}...]`,
    valid: !!parseJwtAddress(jwt),
  }))
}

function saveAddressJwt(jwt) {
  state.addressJwt = jwt
  localStorage.setItem(STORAGE_KEYS.addressJwt, jwt)
  const cached = readLocalAddressCache()
  if (!cached.includes(jwt)) {
    cached.push(jwt)
    writeLocalAddressCache(cached)
  }
  syncLocalAddresses()
}

function showToast(message) {
  state.toast = message
  window.setTimeout(() => {
    if (state.toast === message) state.toast = ''
  }, 1600)
}

async function copyText(text, successMessage) {
  if (!text) return false
  try {
    await writeClipboard(text)
    if (successMessage) showToast(successMessage)
    return true
  } catch {
    window.alert(text)
    return false
  }
}

function setError(error) {
  state.error = error?.message || String(error || '未知错误')
}

async function run(task, successMessage = '', key = '') {
  if (key && inflight.has(key)) {
    showToast('正在查询，请稍候')
    return null
  }
  if (key) inflight.add(key)
  loadingCount.value += 1
  state.loading = true
  state.error = ''
  try {
    const result = await task()
    if (successMessage) showToast(successMessage)
    return result
  } catch (error) {
    setError(error)
    if (error.status === 401) {
      if (state.adminTab === 'overview' || state.adminTab === 'addresses' || state.adminTab === 'mails') {
        state.adminAuthed = false
      }
    }
    return null
  } finally {
    if (key) inflight.delete(key)
    loadingCount.value = Math.max(0, loadingCount.value - 1)
    state.loading = loadingCount.value > 0
  }
}

function normalizeOpenSettings(raw) {
  const rawDomains = Array.isArray(raw?.domains) ? raw.domains : []
  const labels = Array.isArray(raw?.domainLabels) ? raw.domainLabels : []
  return {
    ...state.settings,
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
  if (!settings) return
  state.settings = normalizeOpenSettings(settings)
  state.selectedDomain = domainOptions.value[0]?.value || state.settings.domains[0]?.value || ''
  if (!state.draftAddress) generateDraftAddress(false)
}

async function unlock() {
  if (state.settings.needAuth) {
    const password = state.sitePassword.trim()
    if (!password) {
      state.error = '请输入页面密码'
      return
    }
    const result = await run(() => api.siteLogin(password), '验证通过')
    if (result === null) return
    state.sitePassword = password
  }

  localStorage.setItem(STORAGE_KEYS.sitePassword, state.sitePassword)
  state.unlocked = true
  await refreshAddressSession()
}

function lock() {
  state.unlocked = false
  state.addressJwt = ''
  state.address = ''
  state.mails = []
  localStorage.removeItem(STORAGE_KEYS.addressJwt)
}

function syncRoute() {
  state.isAdminRoute = window.location.pathname.replace(/\/$/, '').endsWith('/admin')
  if (state.isAdminRoute) {
    state.activeMobilePane = 'admin'
  } else if (state.activeMobilePane === 'admin') {
    state.activeMobilePane = 'address'
  }
}

function randomName() {
  const left = ['silver', 'quiet', 'north', 'pixel', 'plain', 'green', 'metro', 'daily']
  const right = ['lake', 'box', 'desk', 'note', 'lane', 'mail', 'room', 'post']
  return `${left[Math.floor(Math.random() * left.length)]}-${right[Math.floor(Math.random() * right.length)]}`
}

function generateDraftAddress(notify = true) {
  const name = state.settings.disableCustomAddressName ? '' : randomName()
  const domain = state.selectedDomain || domainOptions.value[0]?.value || ''
  state.draftAddress = state.settings.disableCustomAddressName ? `自动生成@${domain}` : `${name}@${domain}`
  if (notify) showToast('已生成新地址')
}

function parseDraftAddress() {
  const value = state.draftAddress.trim()
  if (!value) return { name: '', domain: state.selectedDomain }
  if (!value.includes('@')) return { name: value, domain: state.selectedDomain }
  const [name, ...domainParts] = value.split('@')
  return {
    name: name.trim(),
    domain: domainParts.join('@').trim() || state.selectedDomain,
  }
}

async function createAddress() {
  if (!canCreateAddress.value) {
    state.error = '当前配置不允许匿名创建邮箱地址'
    return
  }
  const parsed = parseDraftAddress()
  if (!parsed.domain) {
    state.error = '没有可用域名，请检查 Worker 的 DOMAINS / DEFAULT_DOMAINS 配置'
    return
  }

  const name = state.settings.disableCustomAddressName ? '' : parsed.name
  const result = await run(
    () => api.createAddress(name, parsed.domain, state.enableRandomSubdomain),
    '地址已创建',
  )
  if (!result?.jwt) return

  saveAddressJwt(result.jwt)
  state.addressPassword = result.password || ''
  await refreshAddressSession()
}

async function switchLocalAddress(jwt) {
  if (!jwt || jwt === state.addressJwt) return
  saveAddressJwt(jwt)
  state.mails = []
  state.selectedMailId = null
  await refreshAddressSession()
  showToast('已切换地址')
}

function removeLocalAddress(jwt) {
  if (jwt === state.addressJwt) return
  const cached = readLocalAddressCache().filter((item) => item !== jwt)
  writeLocalAddressCache(cached)
  syncLocalAddresses()
  showToast('已移除历史地址')
}

async function refreshAddressSession() {
  if (!state.addressJwt) return
  const settings = await run(() => api.getAddressSettings())
  if (!settings) return
  state.address = settings.address || ''
  state.draftAddress = state.address || state.draftAddress
  await fetchMails()
}

async function fetchMails() {
  if (!state.addressJwt) return
  const result = await run(() => api.fetchMails(30, 0), '收件箱已刷新', 'mails:current')
  if (!result) return
  state.mails = Array.isArray(result.results) ? result.results.map(parseMailItem) : []
  state.selectedMailId = state.mails[0]?.id || null
  await loadMailAttachments(selectedMail.value)
}

async function deleteSelectedMail() {
  if (!selectedMail.value) return
  if (!confirm('确定删除这封邮件？')) return
  await run(() => api.deleteMail(selectedMail.value.id), '邮件已删除')
  await fetchMails()
}

async function deleteAddress() {
  if (!state.addressJwt || !confirm('确定删除当前地址？')) return
  if (!canDeleteAddress.value) {
    state.error = '当前配置不允许删除邮箱地址'
    return
  }
  const deletingJwt = state.addressJwt
  const ok = await run(() => api.deleteAddress(), '地址已删除')
  if (ok === null) return
  state.addressJwt = ''
  state.address = ''
  state.mails = []
  state.selectedMailId = null
  localStorage.removeItem(STORAGE_KEYS.addressJwt)
  writeLocalAddressCache(readLocalAddressCache().filter((item) => item !== deletingJwt))
  syncLocalAddresses()
}

async function clearInbox() {
  if (!state.addressJwt || !confirm('确定清空当前邮箱的所有邮件？')) return
  const ok = await run(() => api.clearInbox(), '收件箱已清空')
  if (ok === null) return
  state.mails = []
  state.selectedMailId = null
  await loadMailAttachments(null)
}

async function copyAddress() {
  const text = state.draftAddress || state.address
  await copyText(text, '邮箱地址已复制')
}

function selectMail(mail) {
  state.selectedMailId = mail.id
  state.activeMobilePane = 'content'
  void loadMailAttachments(mail)
}

function selectAdminMail(mail) {
  state.adminSelectedMailId = mail.id
  void loadAdminMailAttachments(mail)
}

async function adminLogin() {
  const password = state.adminPassword.trim()
  if (!password) {
    state.error = '请输入管理员密码'
    return
  }
  const result = await run(() => api.adminLogin(password), 'Admin 已登录')
  if (result === null) return
  localStorage.setItem(STORAGE_KEYS.adminPassword, password)
  state.adminAuthed = true
  await loadAdminOverview()
}

function adminLogout() {
  state.adminAuthed = false
  state.adminPassword = ''
  localStorage.removeItem(STORAGE_KEYS.adminPassword)
}

function goHome() {
  window.location.href = '/'
}

async function loadAdminOverview() {
  state.adminTab = 'overview'
  const stats = await run(() => api.adminStatistics(), '', 'admin:stats')
  if (stats) state.adminStats = stats
}

async function loadAdminAddresses() {
  state.adminTab = 'addresses'
  const result = await run(
    () => api.adminAddresses({ query: state.adminQuery, limit: 50, offset: 0 }),
    '',
    `admin:addresses:${state.adminQuery}`,
  )
  if (result) state.adminAddresses = Array.isArray(result.results) ? result.results : []
}

async function loadAdminMails(address = state.adminMailAddress) {
  state.adminTab = 'mails'
  state.adminMailAddress = address || ''
  const result = await run(
    () => api.adminMails({ address: state.adminMailAddress, limit: 50, offset: 0 }),
    '',
    `admin:mails:${state.adminMailAddress}`,
  )
  if (result) {
    state.adminMails = Array.isArray(result.results) ? result.results.map(parseMailItem) : []
    state.adminSelectedMailId = state.adminMails[0]?.id || null
    await loadAdminMailAttachments(selectedAdminMail.value)
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
  return String(mailBody(mail))
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function originalMailSource(mail) {
  if (!mail) return ''
  return mail.message || `<pre>${escapeHtml(mail.raw || mail.text || '')}</pre>`
}

function formatBytes(value) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

async function loadMailAttachments(mail) {
  revokeAttachmentUrls(state.mailAttachments)
  state.mailAttachments = []
  state.mailAttachmentsForId = mail?.id || null
  if (!mail?.raw) return
  state.mailAttachmentsLoading = true
  try {
    const attachments = await parseMailAttachments(mail)
    if (state.mailAttachmentsForId === mail.id) {
      state.mailAttachments = attachments
    } else {
      revokeAttachmentUrls(attachments)
    }
  } catch (error) {
    setError(error)
  } finally {
    if (state.mailAttachmentsForId === mail.id) state.mailAttachmentsLoading = false
  }
}

async function loadAdminMailAttachments(mail) {
  revokeAttachmentUrls(state.adminMailAttachments)
  state.adminMailAttachments = []
  state.adminMailAttachmentsForId = mail?.id || null
  if (!mail?.raw) return
  state.adminMailAttachmentsLoading = true
  try {
    const attachments = await parseMailAttachments(mail)
    if (state.adminMailAttachmentsForId === mail.id) {
      state.adminMailAttachments = attachments
    } else {
      revokeAttachmentUrls(attachments)
    }
  } catch (error) {
    setError(error)
  } finally {
    if (state.adminMailAttachmentsForId === mail.id) state.adminMailAttachmentsLoading = false
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

onMounted(async () => {
  applyTheme(state.theme)
  const systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  systemThemeQuery?.addEventListener?.('change', (event) => {
    if (localStorage.getItem(STORAGE_KEYS.theme)) return
    state.theme = event.matches ? 'dark' : 'light'
    applyTheme(state.theme)
  })
  syncRoute()
  window.addEventListener('popstate', syncRoute)
  syncLocalAddresses()
  if (!state.addressJwt && state.localAddresses.length > 0) {
    state.addressJwt = state.localAddresses[state.localAddresses.length - 1].jwt
    localStorage.setItem(STORAGE_KEYS.addressJwt, state.addressJwt)
  }
  await fetchOpenSettings()
  if (!state.settings.needAuth) {
    state.unlocked = true
    await refreshAddressSession()
  } else if (state.sitePassword) {
    const cachedPassword = state.sitePassword
    const result = await run(() => api.siteLogin(cachedPassword))
    if (result !== null) {
      state.unlocked = true
      await refreshAddressSession()
    } else {
      state.sitePassword = ''
      localStorage.removeItem(STORAGE_KEYS.sitePassword)
    }
  }
  if (state.adminPassword) state.adminAuthed = true
  if (state.isAdminRoute && state.adminAuthed) {
    await loadAdminOverview()
  }
  state.booted = true
})

onBeforeUnmount(() => {
  revokeAttachmentUrls(state.mailAttachments)
  revokeAttachmentUrls(state.adminMailAttachments)
})
</script>

<template>
  <div v-if="!state.booted" class="boot">加载中</div>

  <section v-else-if="!state.unlocked" class="login">
    <div class="login-box">
      <div class="login-head">
        <div class="brand">
          <div class="mark"></div>
          <div>
            <strong>自用临时邮箱</strong>
            <span>基于 Cloudflare 邮件系统</span>
          </div>
        </div>
        <button class="btn theme-toggle" :title="`切换到${themeActionLabel}`" @click="toggleTheme">
          <Sun v-if="state.theme === 'dark'" class="btn-icon" aria-hidden="true" />
          <Moon v-else class="btn-icon" aria-hidden="true" />
          {{ themeActionLabel }}
        </button>
      </div>
      <h1>输入页面密码</h1>
      <p>使用 Worker 中配置的页面密码进入。用户注册和用户中心已隐藏。</p>
      <input
        v-model="state.sitePassword"
        class="field"
        type="password"
        autocomplete="current-password"
        @keyup.enter="unlock"
      />
      <button class="btn primary block" :disabled="state.loading" @click="unlock">
        <LogIn class="btn-icon" aria-hidden="true" />
        进入邮箱
      </button>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </div>
  </section>

  <section v-else-if="state.isAdminRoute" class="admin-page">
    <header class="topbar">
      <div class="brand">
        <div class="mark"></div>
        <div>
          <strong>自用临时邮箱 Admin</strong>
          <span>基于 Cloudflare 邮件系统</span>
        </div>
      </div>
      <div class="top-actions">
        <button class="btn theme-toggle" :title="`切换到${themeActionLabel}`" @click="toggleTheme">
          <Sun v-if="state.theme === 'dark'" class="btn-icon" aria-hidden="true" />
          <Moon v-else class="btn-icon" aria-hidden="true" />
          {{ themeActionLabel }}
        </button>
        <button class="btn" @click="goHome">
          <Home class="btn-icon" aria-hidden="true" />
          返回邮箱
        </button>
        <button class="btn icon" title="锁定" @click="lock">
          <LockKeyhole class="btn-icon" aria-hidden="true" />
        </button>
      </div>
    </header>

    <main class="admin-shell">
      <section class="admin-hero">
        <div class="admin-title">
          <h1>Admin</h1>
          <p>管理地址、邮件和基础统计。</p>
        </div>
        <div v-if="!state.adminAuthed" class="admin-login">
          <input
            v-model="state.adminPassword"
            class="field"
            type="password"
            placeholder="管理员密码"
            @keyup.enter="adminLogin"
          />
          <button class="btn primary" :disabled="state.loading" @click="adminLogin">
            <LogIn class="btn-icon" aria-hidden="true" />
            登录
          </button>
        </div>
        <div v-else class="detail-actions">
          <button class="btn" :class="{ primary: state.adminTab === 'overview' }" @click="loadAdminOverview">
            <BarChart3 class="btn-icon" aria-hidden="true" />
            统计
          </button>
          <button class="btn" :class="{ primary: state.adminTab === 'addresses' }" @click="loadAdminAddresses">
            <AtSign class="btn-icon" aria-hidden="true" />
            地址
          </button>
          <button class="btn" :class="{ primary: state.adminTab === 'mails' }" @click="loadAdminMails()">
            <Mail class="btn-icon" aria-hidden="true" />
            邮件
          </button>
          <button class="btn danger" @click="adminLogout">
            <LogOut class="btn-icon" aria-hidden="true" />
            退出
          </button>
        </div>
      </section>

      <section v-if="state.adminAuthed && state.adminTab === 'overview'" class="admin-section">
        <div class="metric-grid">
          <div class="metric">
            <span>地址总数</span>
            <strong>{{ state.adminStats?.addressCount ?? '-' }}</strong>
          </div>
          <div class="metric">
            <span>7 天活跃地址</span>
            <strong>{{ state.adminStats?.activeAddressCount7days ?? '-' }}</strong>
          </div>
          <div class="metric">
            <span>邮件总数</span>
            <strong>{{ state.adminStats?.mailCount ?? '-' }}</strong>
          </div>
        </div>
      </section>

      <section v-if="state.adminAuthed && state.adminTab === 'addresses'" class="admin-section">
        <div class="admin-filter">
          <input v-model="state.adminQuery" class="field" placeholder="搜索地址" @keyup.enter="loadAdminAddresses" />
          <button class="btn" :disabled="state.loading" @click="loadAdminAddresses">
            <Search class="btn-icon" aria-hidden="true" />
            查询
          </button>
        </div>
        <div class="table-list">
          <div v-for="row in state.adminAddresses" :key="row.id" class="table-row">
            <div>
              <strong>{{ row.name }}</strong>
              <span>ID {{ row.id }} · 邮件 {{ row.mail_count || 0 }} · {{ formatDate(row.created_at) }}</span>
            </div>
            <div class="row-actions">
              <button class="btn" :disabled="state.loading" @click="loadAdminMails(row.name)">
                <Eye class="btn-icon" aria-hidden="true" />
                看邮件
              </button>
              <button class="btn" :disabled="state.loading" @click="adminShowCredential(row.id)">
                <KeyRound class="btn-icon" aria-hidden="true" />
                凭证
              </button>
              <button class="btn danger" :disabled="state.loading" @click="adminDeleteAddress(row.id)">
                <Trash2 class="btn-icon" aria-hidden="true" />
                删除
              </button>
            </div>
          </div>
          <div v-if="!state.adminAddresses.length" class="empty">暂无地址</div>
        </div>
      </section>

      <section v-if="state.adminAuthed && state.adminTab === 'mails'" class="admin-section admin-mail-workspace">
        <div class="admin-mail-toolbar">
          <input v-model="state.adminMailAddress" class="field" placeholder="按地址筛选" @keyup.enter="loadAdminMails()" />
          <button class="btn" :disabled="state.loading" @click="loadAdminMails()">
            <Search class="btn-icon" aria-hidden="true" />
            查询
          </button>
        </div>

        <div class="admin-mail-grid">
          <aside class="admin-mail-list">
            <button
              v-for="mail in state.adminMails"
              :key="mail.id"
              class="message"
              :class="{ active: selectedAdminMail?.id === mail.id }"
              @click="selectAdminMail(mail)"
            >
              <span class="dot"></span>
              <span class="message-main">
                <span class="message-title">
                  <span class="sender">{{ mail.source || '-' }}</span>
                  <span class="tag">邮件</span>
                </span>
                <span class="subject">{{ mail.subject || '(无主题)' }}</span>
                <span class="preview">{{ mail.text || mail.message || mail.raw || '' }}</span>
                <span class="time">{{ formatDate(mail.created_at) }}</span>
              </span>
            </button>
            <div v-if="!state.adminMails.length" class="empty">暂无邮件</div>
          </aside>

          <article class="admin-mail-preview">
            <template v-if="selectedAdminMail">
              <div class="detail-head">
                <h2 class="detail-subject">{{ selectedAdminMail.subject || '(无主题)' }}</h2>
                <div class="detail-meta">
                  <span>来自 {{ selectedAdminMail.source || '-' }}</span>
                  <span>发送到 {{ selectedAdminMail.address || '-' }}</span>
                  <span>{{ formatDate(selectedAdminMail.created_at) }}</span>
                </div>
                <div class="detail-actions">
                  <div class="segment" aria-label="邮件展示模式">
                    <button
                      :class="{ active: state.adminMailViewMode === 'text' }"
                      @click="state.adminMailViewMode = 'text'"
                    >
                      纯文本
                    </button>
                    <button
                      :class="{ active: state.adminMailViewMode === 'raw' }"
                      @click="state.adminMailViewMode = 'raw'"
                    >
                      原文
                    </button>
                  </div>
                  <button class="btn danger" :disabled="state.loading" @click="adminDeleteMail(selectedAdminMail.id)">
                    <Trash2 class="btn-icon" aria-hidden="true" />
                    删除邮件
                  </button>
                </div>
              </div>
              <div class="mail-body">
                <pre v-if="state.adminMailViewMode === 'text'" class="text-mail compact-text-mail">{{ compactMailBody(selectedAdminMail) }}</pre>
                <iframe
                  v-else
                  class="original-mail"
                  sandbox=""
                  :srcdoc="originalMailSource(selectedAdminMail)"
                  title="邮件原文"
                ></iframe>
              </div>
              <section v-if="state.adminMailAttachmentsLoading || state.adminMailAttachments.length" class="attachments">
                <div class="section-label">附件</div>
                <div v-if="state.adminMailAttachmentsLoading" class="empty">正在解析附件</div>
                <a
                  v-for="attachment in state.adminMailAttachments"
                  :key="attachment.id"
                  class="attachment"
                  :href="attachment.url"
                  :download="attachment.filename"
                >
                  <span class="attachment-name">
                    <Download class="btn-icon" aria-hidden="true" />
                    {{ attachment.filename }}
                  </span>
                  <span class="attachment-meta">{{ attachment.mimeType }} · {{ formatBytes(attachment.size) }}</span>
                </a>
              </section>
            </template>
            <div v-else class="empty-state">
              <strong>未选择邮件</strong>
              <span>从左侧列表选择一封邮件查看内容。</span>
            </div>
          </article>
        </div>
      </section>
    </main>
  </section>

  <section v-else class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="mark"></div>
        <div>
          <strong>自用临时邮箱</strong>
          <span>{{ state.address || '基于 Cloudflare 邮件系统' }}</span>
        </div>
      </div>
      <div class="top-actions">
        <button class="btn theme-toggle" :title="`切换到${themeActionLabel}`" @click="toggleTheme">
          <Sun v-if="state.theme === 'dark'" class="btn-icon" aria-hidden="true" />
          <Moon v-else class="btn-icon" aria-hidden="true" />
          {{ themeActionLabel }}
        </button>
        <button class="btn desktop-only" :disabled="state.loading || !state.addressJwt" @click="fetchMails">
          <RefreshCw class="btn-icon" aria-hidden="true" />
          刷新
        </button>
        <button class="btn icon" title="锁定" @click="lock">
          <LockKeyhole class="btn-icon" aria-hidden="true" />
        </button>
      </div>
    </header>

    <main class="main">
      <aside class="pane sidebar" :class="{ 'mobile-active': state.activeMobilePane === 'address' }">
        <div class="compose">
          <h1>临时邮箱</h1>
          <div class="domain-row">
            <label class="field-group">
              <span class="input-label">选择域名</span>
              <select v-model="state.selectedDomain" class="field" @change="generateDraftAddress(false)">
                <option v-for="domain in domainOptions" :key="domain.value" :value="domain.value">
                  {{ domain.label }}
                </option>
              </select>
            </label>
            <button class="btn primary" :disabled="state.loading || !canCreateAddress" @click="createAddress">
              <AtSign class="btn-icon" aria-hidden="true" />
              创建地址
            </button>
          </div>
          <label class="generated">
            <span class="input-label">邮箱地址</span>
            <input
              v-model="state.draftAddress"
              class="address-input"
              :disabled="state.settings.disableCustomAddressName"
              spellcheck="false"
            />
          </label>
          <label v-if="state.settings.randomSubdomainDomains.includes(state.selectedDomain)" class="checkline">
            <input v-model="state.enableRandomSubdomain" type="checkbox" />
            随机子域名
          </label>
          <div class="generated-actions">
            <button @click="copyAddress">
              <Clipboard class="btn-icon" aria-hidden="true" />
              复制
            </button>
            <button @click="generateDraftAddress()">
              <RotateCw class="btn-icon" aria-hidden="true" />
              换一个
            </button>
          </div>
          <p v-if="state.addressPassword" class="hint">地址密码：{{ state.addressPassword }}</p>
        </div>

        <div class="address-list">
          <div class="section-label">地址</div>
          <button v-if="state.address" class="address-item active">
            <span class="address-head">
              <span class="address-name">{{ state.address }}</span>
              <span class="badge">{{ unreadCount }}</span>
            </span>
          </button>
          <div v-if="state.localAddresses.length > 1" class="section-label history-label">历史地址</div>
          <div v-if="state.localAddresses.length > 1" class="history-list">
            <div
              v-for="item in state.localAddresses"
              :key="item.jwt"
              class="history-row"
              :class="{ active: item.jwt === state.addressJwt }"
            >
              <button class="history-address" @click="switchLocalAddress(item.jwt)">
                <span class="address-name">{{ item.address }}</span>
                <span class="address-meta">{{ item.jwt === state.addressJwt ? '当前地址' : '点击切换' }}</span>
              </button>
              <button
                class="history-remove"
                :disabled="item.jwt === state.addressJwt"
                title="移除"
                @click="removeLocalAddress(item.jwt)"
              >
                <X class="btn-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div v-if="!state.address && !state.localAddresses.length" class="empty">还没有创建地址</div>
        </div>
      </aside>

      <section
        class="pane detail"
        :class="{
          'mobile-active': state.activeMobilePane === 'content',
          'admin-hidden': state.isAdminRoute,
        }"
      >
        <template v-if="selectedMail">
          <div class="detail-head">
            <h2 class="detail-subject">{{ selectedMail.subject || '(无主题)' }}</h2>
            <div class="detail-meta">
              <span>来自 {{ selectedMail.source || '-' }}</span>
              <span>发送到 {{ selectedMail.address || state.address || '-' }}</span>
              <span>{{ formatDate(selectedMail.created_at) }}</span>
            </div>
            <div class="detail-actions">
              <div class="segment" aria-label="邮件展示模式">
                <button :class="{ active: state.mailViewMode === 'text' }" @click="state.mailViewMode = 'text'">
                  纯文本
                </button>
                <button :class="{ active: state.mailViewMode === 'raw' }" @click="state.mailViewMode = 'raw'">
                  原文
                </button>
              </div>
              <button class="btn danger" :disabled="state.loading" @click="deleteSelectedMail">
                <Trash2 class="btn-icon" aria-hidden="true" />
                删除邮件
              </button>
            </div>
          </div>
          <article class="mail-body">
            <pre v-if="state.mailViewMode === 'text'" class="text-mail">{{ mailBody(selectedMail) }}</pre>
            <iframe
              v-else
              class="original-mail"
              sandbox=""
              :srcdoc="originalMailSource(selectedMail)"
              title="邮件原文"
            ></iframe>
          </article>
          <section v-if="state.mailAttachmentsLoading || state.mailAttachments.length" class="attachments">
            <div class="section-label">附件</div>
            <div v-if="state.mailAttachmentsLoading" class="empty">正在解析附件</div>
            <a
              v-for="attachment in state.mailAttachments"
              :key="attachment.id"
              class="attachment"
              :href="attachment.url"
              :download="attachment.filename"
            >
              <span class="attachment-name">
                <Download class="btn-icon" aria-hidden="true" />
                {{ attachment.filename }}
              </span>
              <span class="attachment-meta">{{ attachment.mimeType }} · {{ formatBytes(attachment.size) }}</span>
            </a>
          </section>
        </template>
        <div v-else class="empty-state">
          <strong>暂无邮件</strong>
          <span>收到新邮件后会显示在这里。</span>
        </div>
      </section>

      <section
        class="pane inbox"
        :class="{
          'mobile-active': state.activeMobilePane === 'inbox',
          'route-hidden': state.isAdminRoute,
        }"
      >
        <div class="toolbar">
          <div class="toolbar-title">
            <strong>收件箱</strong>
            <span>{{ filteredMails.length }} / {{ state.mails.length }} 封</span>
          </div>
          <div class="search-wrap">
            <Search class="search-icon" aria-hidden="true" />
            <input v-model="state.search" class="field search-field" placeholder="搜索发件人、主题或内容" />
          </div>
          <div class="row-actions">
            <button class="btn" :disabled="state.loading || !state.addressJwt" @click="clearInbox">
              <Trash2 class="btn-icon" aria-hidden="true" />
              清空
            </button>
            <button class="btn danger" :disabled="state.loading || !state.addressJwt || !canDeleteAddress" @click="deleteAddress">
              <Shield class="btn-icon" aria-hidden="true" />
              删除地址
            </button>
          </div>
        </div>
        <div class="message-list">
          <div class="message-head">
            <span>发件人</span>
            <span>主题</span>
            <span>时间</span>
          </div>
          <button
            v-for="mail in filteredMails"
            :key="mail.id"
            class="message"
            :class="{ active: selectedMail?.id === mail.id }"
            @click="selectMail(mail)"
          >
            <span class="sender">{{ mail.source || '-' }}</span>
            <span class="message-main">
              <span class="subject">{{ mail.subject || '(无主题)' }}</span>
              <span class="preview">{{ mail.text || mail.message || mail.raw || '' }}</span>
            </span>
            <span class="time">{{ formatDate(mail.created_at) }}</span>
          </button>
          <div v-if="!filteredMails.length" class="empty">没有匹配的邮件</div>
        </div>
      </section>

      <section v-if="state.isAdminRoute" class="pane admin-view active">
        <div class="detail-head">
          <h2 class="detail-subject">Admin</h2>
          <div class="detail-meta">
            <span>管理员功能使用 Worker 的 Admin Password</span>
          </div>
          <div v-if="!state.adminAuthed" class="admin-login">
            <input
              v-model="state.adminPassword"
              class="field"
              type="password"
              placeholder="管理员密码"
              @keyup.enter="adminLogin"
            />
            <button class="btn primary" :disabled="state.loading" @click="adminLogin">登录</button>
          </div>
          <div v-else class="detail-actions">
            <button class="btn" :class="{ primary: state.adminTab === 'overview' }" @click="loadAdminOverview">统计</button>
            <button class="btn" :class="{ primary: state.adminTab === 'addresses' }" @click="loadAdminAddresses">地址</button>
            <button class="btn" :class="{ primary: state.adminTab === 'mails' }" @click="loadAdminMails()">邮件</button>
            <button class="btn danger" @click="adminLogout">退出</button>
          </div>
        </div>

        <div class="admin-content" v-if="state.adminAuthed">
          <div v-if="state.adminTab === 'overview'" class="metric-grid">
            <div class="metric">
              <span>地址总数</span>
              <strong>{{ state.adminStats?.addressCount ?? '-' }}</strong>
            </div>
            <div class="metric">
              <span>7 天活跃地址</span>
              <strong>{{ state.adminStats?.activeAddressCount7days ?? '-' }}</strong>
            </div>
            <div class="metric">
              <span>邮件总数</span>
              <strong>{{ state.adminStats?.mailCount ?? '-' }}</strong>
            </div>
          </div>

          <div v-if="state.adminTab === 'addresses'" class="admin-block">
            <div class="admin-filter">
              <input v-model="state.adminQuery" class="field" placeholder="搜索地址" @keyup.enter="loadAdminAddresses" />
              <button class="btn" @click="loadAdminAddresses">查询</button>
            </div>
            <div class="table-list">
              <div v-for="row in state.adminAddresses" :key="row.id" class="table-row">
                <div>
                  <strong>{{ row.name }}</strong>
                  <span>ID {{ row.id }} · 邮件 {{ row.mail_count || 0 }} · {{ formatDate(row.created_at) }}</span>
                </div>
                <div class="row-actions">
                  <button class="btn" @click="loadAdminMails(row.name)">看邮件</button>
                  <button class="btn" @click="adminShowCredential(row.id)">凭证</button>
                  <button class="btn danger" @click="adminDeleteAddress(row.id)">删除</button>
                </div>
              </div>
              <div v-if="!state.adminAddresses.length" class="empty">暂无地址</div>
            </div>
          </div>

          <div v-if="state.adminTab === 'mails'" class="admin-block">
            <div class="admin-filter">
              <input v-model="state.adminMailAddress" class="field" placeholder="按地址筛选" @keyup.enter="loadAdminMails()" />
              <button class="btn" @click="loadAdminMails()">查询</button>
            </div>
            <div class="table-list">
              <div v-for="mail in state.adminMails" :key="mail.id" class="table-row">
                <div>
                  <strong>{{ mail.subject || '(无主题)' }}</strong>
                  <span>{{ mail.source || '-' }} -> {{ mail.address || '-' }} · {{ formatDate(mail.created_at) }}</span>
                </div>
                <button class="btn danger" @click="adminDeleteMail(mail.id)">删除</button>
              </div>
              <div v-if="!state.adminMails.length" class="empty">暂无邮件</div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <nav class="mobile-tabs">
      <button :class="{ active: state.activeMobilePane === 'address' }" @click="state.activeMobilePane = 'address'">
        <AtSign class="tab-icon" aria-hidden="true" />
        地址
      </button>
      <button :class="{ active: state.activeMobilePane === 'inbox' }" @click="state.activeMobilePane = 'inbox'">
        <List class="tab-icon" aria-hidden="true" />
        收件箱
      </button>
      <button :class="{ active: state.activeMobilePane === 'content' }" @click="state.activeMobilePane = 'content'">
        <MailOpen class="tab-icon" aria-hidden="true" />
        详情
      </button>
    </nav>
  </section>

  <div v-if="state.loading" class="loading">请求中</div>
  <div v-if="state.toast" class="toast">{{ state.toast }}</div>
  <div v-if="state.error && state.unlocked" class="error-bar">
    <span>{{ state.error }}</span>
    <button @click="state.error = ''">
      <X class="btn-icon" aria-hidden="true" />
    </button>
  </div>
</template>
