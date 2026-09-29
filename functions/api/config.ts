// GET /api/config — public site config for every visitor (no secrets).
import { type Env, json, checkStorage, readJson, PUBLIC_KEY, adminWalletOf } from '../_lib'

export const onRequestGet = async ({ env }: { env: Env }): Promise<Response> => {
  const bad = checkStorage(env)
  if (bad) return bad
  const config = await readJson(env, PUBLIC_KEY)
  // The server env var is the only source of truth for who the admin is.
  const admin = adminWalletOf(env)
  if (admin) config.adminWallet = admin
  return json({ config })
}
