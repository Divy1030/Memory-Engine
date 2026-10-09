'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const router = useRouter()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [verificationMode, setVerificationMode] = useState(false)
  const [otp, setOtp] = useState('')
  const [verificationEmail, setVerificationEmail] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    if (verificationMode) {
      const response = await fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verificationEmail, otp }) })
      const result = await response.json()
      setBusy(false)
      if (!response.ok) { setError(result.error ?? 'Verification failed'); return }
      setVerificationMode(false); setMode('sign-in'); setEmail(verificationEmail); setOtp(''); setError('Email verified. Sign in to continue.')
      return
    }
    const response = await fetch(`/api/auth/${mode === 'sign-in' ? 'sign-in' : 'sign-up'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, name }) })
    const result = await response.json()
    setBusy(false)
    if (!response.ok) {
      if (mode === 'sign-in' && response.status === 403 && /verif/i.test(result.error ?? '')) {
        setVerificationEmail(email); setVerificationMode(true); setError('Verify your email with the code we sent you, then sign in.')
      } else setError(result.error ?? 'Authentication failed')
      return
    }
    if (result.requireEmailVerification) { setVerificationEmail(email); setVerificationMode(true); setError('Enter the 6-digit code sent to your email.'); return }
    router.push('/dashboard'); router.refresh()
  }

  return <section className="w-full max-w-md rounded-3xl border border-line bg-panel p-8 shadow-2xl shadow-black/20">
    <div className="mb-8"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-accent">Memory Engine</p><h1 className="text-3xl font-semibold tracking-tight">A sharper memory for every conversation.</h1><p className="mt-3 text-sm leading-6 text-white/55">Private stores, thoughtful retrieval, and a playground for your models.</p></div>
    <form className="space-y-4" onSubmit={submit}>
      {verificationMode ? <>
        <p className="text-sm leading-6 text-white/60">We sent a 6-digit verification code to <span className="text-white">{verificationEmail}</span>.</p>
        <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoFocus className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-accent" placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <button type="button" className="text-sm text-white/55 hover:text-white" onClick={async () => { const response = await fetch('/api/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verificationEmail }) }); setError(response.ok ? 'A new code was sent.' : 'Could not resend the code.') }}>Resend code</button>
      </> : <>
        {mode === 'sign-up' && <input className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-accent" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}
        <input required type="email" className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-accent" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input required minLength={8} type="password" className="w-full rounded-xl border border-line bg-canvas px-4 py-3 text-sm outline-none focus:border-accent" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </>}
      {error && <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-canvas transition hover:bg-[#f2bc85] disabled:opacity-50">{busy ? 'Working…' : verificationMode ? 'Verify email' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
    </form>
    {!verificationMode && <button className="mt-5 text-sm text-white/55 hover:text-white" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError('') }}>{mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button>}
  </section>
}
