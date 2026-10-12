import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'

export async function GET(request: Request) {
  try {
    const { client } = await requireUser()
    const storeId = new URL(request.url).searchParams.get('storeId')
    let query = client.database.from('memories').select('id, store_id, kind, content, confidence, created_at, source_conversation_id').eq('status', 'active').order('created_at', { ascending: false }).limit(100)
    if (storeId) query = query.eq('store_id', storeId)
    const result = await query
    if (result.error) throw result.error
    return NextResponse.json(result.data ?? [])
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load memories' }, { status: 400 }) }
}
