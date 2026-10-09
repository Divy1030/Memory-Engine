import { NextResponse, type NextRequest } from 'next/server'
import { createAuthActions } from '@insforge/sdk/ssr'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  const auth = createAuthActions({ requestCookies: request.cookies, responseCookies: response.cookies })
  const { data, error } = await auth.signInWithPassword(await request.json())
  if (error || !data?.user) return NextResponse.json({ error: error?.message ?? 'Sign in failed' }, { status: error?.statusCode ?? 401 })
  return NextResponse.json({ user: data.user }, { headers: response.headers })
}
