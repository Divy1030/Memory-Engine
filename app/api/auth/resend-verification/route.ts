import { NextResponse, type NextRequest } from 'next/server'
import { getInsForgeServerClient } from '@/lib/insforge/server'

export async function POST(request: NextRequest) {
  const client = await getInsForgeServerClient()
  const { error } = await client.auth.resendVerificationEmail({
    ...(await request.json()),
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login`,
  })
  if (error) return NextResponse.json({ error: error.message ?? 'Could not resend verification code' }, { status: error.statusCode ?? 400 })
  return NextResponse.json({ sent: true })
}
