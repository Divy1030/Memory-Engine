import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'
import { conversationSchema } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const { client } = await requireUser()
    const input = conversationSchema.parse(await request.json())
    const { data, error } = await client.database.from('conversations').insert([{ store_id: input.storeId, title: input.title, model: input.model ?? 'meta-llama/llama-3.3-8b-instruct:free' }]).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create conversation' }, { status: 400 })
  }
}
