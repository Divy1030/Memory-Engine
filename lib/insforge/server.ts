import { cookies } from 'next/headers'
import { createServerClient } from '@insforge/sdk/ssr'

export async function getInsForgeServerClient() {
  return createServerClient({ cookies: await cookies() })
}

export async function requireUser() {
  const client = await getInsForgeServerClient()
  const { data, error } = await client.auth.getCurrentUser()
  if (error || !data?.user) throw new Error('UNAUTHENTICATED')
  return { client, user: data.user }
}
