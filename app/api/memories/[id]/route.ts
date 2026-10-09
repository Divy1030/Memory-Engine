import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client } = await requireUser()
    const { id } = await params
    const { error } = await client.database.from('memories').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not delete memory' }, { status: 400 })
  }
}
