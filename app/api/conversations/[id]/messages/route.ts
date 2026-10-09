import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client } = await requireUser(); const { id } = await params
    const result = await client.database.from('chat_messages').select('id, role, content, model, created_at').eq('conversation_id', id).order('created_at', { ascending: true }).limit(100)
    if (result.error) throw result.error
    return NextResponse.json(result.data ?? [])
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load messages' }, { status: 400 }) }
}
