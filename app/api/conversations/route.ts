import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'
import { conversationSchema } from '@/lib/validation'
import { DEFAULT_MODEL, MODELS } from '@/lib/config'

export async function POST(request: Request) {
  try {
    const { client } = await requireUser()
    const input = conversationSchema.parse(await request.json())
    const model = input.model ?? DEFAULT_MODEL
    if (!MODELS.some((entry) => entry.id === model)) return NextResponse.json({ error: 'Model is not enabled for this playground' }, { status: 400 })
    const { data, error } = await client.database.from('conversations').insert([{ store_id: input.storeId, title: input.title, model }]).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create conversation' }, { status: 400 })
  }
}
