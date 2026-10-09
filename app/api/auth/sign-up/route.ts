import { NextResponse, type NextRequest } from 'next/server'
import { createAuthActions } from '@insforge/sdk/ssr'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  const auth = createAuthActions({ requestCookies: request.cookies, responseCookies: response.cookies })
  const body = await request.json()
  const { data, error } = await auth.signUp({ ...body, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login` })
  if (error) return NextResponse.json({ error: error.message ?? 'Sign up failed' }, { status: error.statusCode ?? 400 })
  return NextResponse.json({ user: data?.user ?? null, requireEmailVerification: data?.requireEmailVerification ?? false }, { headers: response.headers })
}
