function splitHeaderAndBody(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n')
  const index = normalized.indexOf('\n\n')
  if (index < 0) return { headerText: '', body: normalized }
  return {
    headerText: normalized.slice(0, index),
    body: normalized.slice(index + 2),
  }
}

function parseHeaders(headerText) {
  const headers = {}
  let current = ''
  for (const line of headerText.split('\n')) {
    if (/^\s/.test(line) && current) {
      headers[current] += ` ${line.trim()}`
      continue
    }
    const separator = line.indexOf(':')
    if (separator < 0) continue
    current = line.slice(0, separator).trim().toLowerCase()
    headers[current] = line.slice(separator + 1).trim()
  }
  return headers
}

function getHeaderParam(value, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]+)"|([^;\\s]+))`, 'i')
  const match = String(value || '').match(pattern)
  return match?.[1] || match?.[2] || ''
}

function decodeQuotedPrintable(value) {
  const input = String(value || '').replace(/=\n/g, '')
  const bytes = []
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '=' && /^[0-9a-f]{2}$/i.test(input.slice(index + 1, index + 3))) {
      bytes.push(parseInt(input.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(input.charCodeAt(index))
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

function decodeBody(body, transferEncoding) {
  const encoding = String(transferEncoding || '').toLowerCase()
  if (encoding === 'base64') {
    try {
      return new TextDecoder('utf-8').decode(
        Uint8Array.from(atob(String(body || '').replace(/\s/g, '')), (char) => char.charCodeAt(0)),
      )
    } catch {
      return body
    }
  }
  if (encoding === 'quoted-printable') return decodeQuotedPrintable(body)
  return String(body || '').trim()
}

function decodeMimeWords(value) {
  return String(value || '').replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_match, charset, mode, text) => {
    try {
      const normalizedCharset = String(charset || 'utf-8').toLowerCase()
      const bytes = mode.toUpperCase() === 'B'
        ? Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
        : Uint8Array.from(
            text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16))),
            (char) => char.charCodeAt(0),
          )
      return new TextDecoder(normalizedCharset).decode(bytes)
    } catch {
      return text
    }
  })
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function walkMime(raw, collector) {
  const { headerText, body } = splitHeaderAndBody(raw)
  const headers = parseHeaders(headerText)
  const contentType = headers['content-type'] || ''
  const transferEncoding = headers['content-transfer-encoding'] || ''

  if (/multipart\//i.test(contentType)) {
    const boundary = getHeaderParam(contentType, 'boundary')
    if (!boundary) return
    const delimiter = `--${boundary}`
    const chunks = body.split(delimiter).slice(1)
    for (const chunk of chunks) {
      const cleaned = chunk.replace(/^\n/, '').replace(/\n--\s*$/, '')
      if (!cleaned.trim() || cleaned.trim() === '--') continue
      walkMime(cleaned, collector)
    }
    return
  }

  const decoded = decodeBody(body, transferEncoding)
  if (/text\/html/i.test(contentType)) {
    collector.html ||= decoded
  } else if (/text\/plain/i.test(contentType) || !contentType) {
    collector.text ||= decoded
  }
}

export function parseMailItem(item) {
  if (!item?.raw) return item
  const { headerText } = splitHeaderAndBody(item.raw)
  const headers = parseHeaders(headerText)
  const parsed = { text: '', html: '' }
  walkMime(item.raw, parsed)

  return {
    ...item,
    source: decodeMimeWords(headers.from) || item.source,
    subject: decodeMimeWords(headers.subject) || item.subject || '(无主题)',
    text: parsed.text || stripHtml(parsed.html) || item.text || '',
    message: parsed.html || item.message || '',
  }
}
