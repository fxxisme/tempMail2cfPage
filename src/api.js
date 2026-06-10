const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

function cleanHeaderValue(value) {
  if (!value || value === 'undefined') return ''
  return String(value).replace(/[\r\n\t]/g, '').trim()
}

export async function hashPassword(value) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function createApi(getAuth) {
  async function request(path, options = {}) {
    const auth = getAuth()
    const headers = {
      'Content-Type': 'application/json',
      'x-lang': 'zh',
    }

    const sitePassword = cleanHeaderValue(auth.sitePassword)
    const adminPassword = cleanHeaderValue(auth.adminPassword)
    const addressJwt = cleanHeaderValue(auth.addressJwt)

    if (sitePassword) headers['x-custom-auth'] = sitePassword
    if (adminPassword) headers['x-admin-auth'] = adminPassword
    if (addressJwt) headers.Authorization = `Bearer ${addressJwt}`

    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const text = await response.text()
    let data = text
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }

    if (response.status >= 300) {
      const message = typeof data === 'string' ? data : JSON.stringify(data)
      const error = new Error(`[${response.status}] ${message || '请求失败'}`)
      error.status = response.status
      throw error
    }

    return data
  }

  return {
    request,
    getOpenSettings: () => request('/open_api/settings'),
    siteLogin: async (password) => request('/open_api/site_login', {
      method: 'POST',
      body: { password: await hashPassword(password), cf_token: '' },
    }),
    adminLogin: async (password) => request('/open_api/admin_login', {
      method: 'POST',
      body: { password: await hashPassword(password), cf_token: '' },
    }),
    getAddressSettings: () => request('/api/settings'),
    createAddress: (name, domain, enableRandomSubdomain = false) => request('/api/new_address', {
      method: 'POST',
      body: { name, domain, cf_token: '', enableRandomSubdomain },
    }),
    fetchMails: (limit = 20, offset = 0) => request(`/api/mails?limit=${limit}&offset=${offset}`),
    deleteMail: (id) => request(`/api/mails/${id}`, { method: 'DELETE' }),
    deleteAddress: () => request('/api/delete_address', { method: 'DELETE' }),
    clearInbox: () => request('/api/clear_inbox', { method: 'DELETE' }),
    adminStatistics: () => request('/admin/statistics'),
    adminAddresses: ({ limit = 20, offset = 0, query = '' } = {}) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (query) params.set('query', query)
      return request(`/admin/address?${params.toString()}`)
    },
    adminMails: ({ limit = 20, offset = 0, address = '' } = {}) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (address) params.set('address', address)
      return request(`/admin/mails?${params.toString()}`)
    },
    adminDeleteMail: (id) => request(`/admin/mails/${id}`, { method: 'DELETE' }),
    adminShowAddressCredential: (id) => request(`/admin/show_password/${id}`),
    adminDeleteAddress: (id) => request(`/admin/delete_address/${id}`, { method: 'DELETE' }),
  }
}
