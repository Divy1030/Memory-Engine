import { NextResponse, type NextRequest } from 'next/server'
import { createAuthActions } from '@insforge/sdk/ssr'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  const auth = createAuthActions({ requestCookies: request.cookies, responseCookies: response.cookies })
  await auth.signOut()
  return response
}
