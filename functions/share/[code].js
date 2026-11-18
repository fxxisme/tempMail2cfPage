// 通过短码解析出 token + address
export async function onRequest(context) {
  if (context.request.method !== 'GET') {
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

  const code = context.params.code
  if (!code) {
    return new Response(JSON.stringify({ error: '缺少短码参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
    })
  }

  const value = await KV.get(`share:${code}`)
  if (!value) {
    return new Response(JSON.stringify({ error: '分享码无效或已过期' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
    })
  }

  let data
  try {
    data = JSON.parse(value)
  } catch {
    return new Response(JSON.stringify({ error: '数据解析失败' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
    })
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json;charset=utf-8' },
  })
}
