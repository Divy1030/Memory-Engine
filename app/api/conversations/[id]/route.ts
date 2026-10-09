import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client } = await requireUser()
    const { id } = await params
    const body = await request.json() as { title?: string }
    const title = body.title?.trim()
    if (!title || title.length > 120) return NextResponse.json({ error: 'Title must be between 1 and 120 characters' }, { status: 400 })
    const result = await client.database.from('conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', id).select('id, store_id, title, model, created_at, updated_at').single()
    if (result.error) throw result.error
    return NextResponse.json(result.data)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not rename conversation' }, { status: 400 })
  }
}
