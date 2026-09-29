// Admin-only config API. Every method requires a valid admin wallet signature.
//   GET    -> full config including secrets
//   PUT    -> replace config (body: full config object)
//   DELETE -> reset to defaults
import {
  type Env, json, checkStorage, requireAdmin, readJson, adminWalletOf,
  PUBLIC_KEY, SECRET_KEY, SECRET_FIELDS, MAX_BODY_BYTES,
} from '../../_lib'

type Ctx = { request: Request; env: Env }

async function guard({ request, env }: Ctx): Promise<Response | null> {
  return checkStorage(env) ?? (await requireAdmin(request, env))
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const denied = await guard(ctx)
  if (denied) return denied
  const [pub, secret] = await Promise.all([readJson(ctx.env, PUBLIC_KEY), readJson(ctx.env, SECRET_KEY)])
  return json({ config: { ...pub, ...secret, adminWallet: adminWalletOf(ctx.env) } })
}

export const onRequestPut = async (ctx: Ctx): Promise<Response> => {
  const denied = await guard(ctx)
  if (denied) return denied

  const text = await ctx.request.text()
  if (text.length > MAX_BODY_BYTES) return json({ error: 'Config too large.' }, 413)

  let body: unknown
  try { body = JSON.parse(text) } catch { return json({ error: 'Invalid JSON.' }, 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Config must be an object.' }, 400)

  const all = { ...(body as Record<string, unknown>) }
  const secret: Record<string, unknown> = {}
  for (const f of SECRET_FIELDS) {
    secret[f] = typeof all[f] === 'string' ? all[f] : ''
    delete all[f]
  }
  all.adminWallet = adminWalletOf(ctx.env) // cannot be changed from the UI

  await Promise.all([
    ctx.env.PREDARC_KV.put(PUBLIC_KEY, JSON.stringify(all)),
    ctx.env.PREDARC_KV.put(SECRET_KEY, JSON.stringify(secret)),
  ])
  return json({ ok: true })
}

export const onRequestDelete = async (ctx: Ctx): Promise<Response> => {
  const denied = await guard(ctx)
  if (denied) return denied
  await Promise.all([ctx.env.PREDARC_KV.delete(PUBLIC_KEY), ctx.env.PREDARC_KV.delete(SECRET_KEY)])
  return json({ ok: true })
}
