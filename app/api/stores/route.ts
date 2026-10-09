import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'
import { storeSchema } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const { client, user } = await requireUser()
    const input = storeSchema.parse(await request.json())
    const { data, error } = await client.database.from('stores').insert([{ owner_id: user.id, name: input.name, description: input.description ?? null }]).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create store' }, { status: 400 })
  }
}
