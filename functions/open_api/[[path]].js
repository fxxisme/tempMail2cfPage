export async function onRequest(context) {
  if (!context.env.BACKEND) {
    return new Response(
      JSON.stringify({
        error: '未检测到 BACKEND 服务绑定。请在 Pages 设置中检查 Service bindings 是否绑定了 temp-mail 并重新部署(Redeploy)。',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } },
    )
  }
  try {
    return await context.env.BACKEND.fetch(context.request)
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: '调用后端 Worker 异常: ' + (err.message || String(err)),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json;charset=utf-8' } },
    )
  }
}
