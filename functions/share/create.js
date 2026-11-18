// 生成分享短码，将 token+address 存入 KV
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
    })
  }

  const KV = context.env.SHARE_KV
  if (!KV) {
    return new Response(
      JSON.stringify({ error: '未绑定 SHARE_KV，请在 Pages 设置中绑定 KV Namespace' }),
      { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } },
    )
  }

  let body
  try {
    body = await context.request.json()
  } catch {
    return new Response(JSON.stringify({ error: '请求体格式错误' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
    })
  }

  const { token, address } = body || {}
  if (!token) {
    return new Response(JSON.stringify({ error: '缺少 token 参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
    })
  }

  // 生成 12 位短码
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < 12; i++) {
    code += chars[bytes[i] % chars.length]
  }

  // 存入 KV，30 天过期
  await KV.put(
    `share:${code}`,
    JSON.stringify({ token, address: address || '', created_at: Date.now() }),
    { expirationTtl: 30 * 24 * 60 * 60 },
  )

  return new Response(JSON.stringify({ code }), {
    status: 200,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  })
}
