import { NextResponse, type NextRequest } from 'next/server'
import { createAuthActions } from '@insforge/sdk/ssr'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  const auth = createAuthActions({ requestCookies: request.cookies, responseCookies: response.cookies })
  const { data, error } = await auth.verifyEmail(await request.json())
  if (error) return NextResponse.json({ error: error.message ?? 'Verification failed' }, { status: error.statusCode ?? 400 })
  return NextResponse.json({ verified: true, user: data?.user ?? null }, { headers: response.headers })
}
