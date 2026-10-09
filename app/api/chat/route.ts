import { after, NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'
import { getOpenRouter } from '@/lib/openrouter'
import { embed } from '@/lib/memory'
import { chatSchema } from '@/lib/validation'
import { MODELS } from '@/lib/config'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { client } = await requireUser()
    const input = chatSchema.parse(await request.json())
    if (!MODELS.some((model) => model.id === input.model)) return NextResponse.json({ error: 'Model is not enabled for this playground' }, { status: 400 })
    const conversationResult = await client.database.from('conversations').select('id, store_id, model').eq('id', input.conversationId).single()
    if (conversationResult.error || !conversationResult.data) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const conversation = conversationResult.data as { id: string; store_id: string; model: string }

    const historyResult = await client.database.from('chat_messages').select('id, role, content, model, created_at').eq('conversation_id', input.conversationId).order('created_at', { ascending: true }).limit(40)
    if (historyResult.error) throw historyResult.error
    const history = (historyResult.data ?? []) as Array<{ id: string; role: 'user' | 'assistant'; content: string; model: string | null }>

    const queryVector = await embed(input.content)
    const memoriesResult = await client.database.rpc('match_memories', { p_store_id: conversation.store_id, p_query_embedding: queryVector, p_match_count: 6, p_match_threshold: 0.68 })
    const memories = memoriesResult.error ? [] : (memoriesResult.data ?? []) as Array<{ content: string; kind: string; similarity: number }>

    const userMessage = await client.database.from('chat_messages').insert([{ conversation_id: input.conversationId, role: 'user', content: input.content }]).select('id').single()
    if (userMessage.error || !userMessage.data) throw userMessage.error ?? new Error('Could not save user message')

    const memoryContext = memories.length ? `\n\nRELEVANT USER MEMORIES (use only when relevant; do not mention this section unless asked):\n${memories.map((m) => `- [${m.kind}] ${m.content}`).join('\n')}` : ''
    const completion = await getOpenRouter().chat.completions.create({
      model: input.model || conversation.model,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 1200,
      messages: [
        { role: 'system', content: `You are Memory Engine, a helpful assistant. Use relevant memories naturally and do not invent personal facts.${memoryContext}` },
        ...history.map((message) => ({ role: message.role, content: message.content })),
        { role: 'user', content: input.content },
      ],
    })

    const encoder = new TextEncoder()
    let assistantText = ''
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content ?? ''
            if (delta) { assistantText += delta; controller.enqueue(encoder.encode(delta)) }
            if (chunk.usage) usage = chunk.usage
          }
          const assistant = await client.database.from('chat_messages').insert([{ conversation_id: input.conversationId, role: 'assistant', content: assistantText, model: input.model, prompt_tokens: usage?.prompt_tokens ?? null, completion_tokens: usage?.completion_tokens ?? null, retrieval_count: memories.length }]).select('id').single()
          if (assistant.error || !assistant.data) throw assistant.error ?? new Error('Could not save assistant message')
          after(async () => {
            try {
              const { extractMemories } = await import('@/lib/memory')
              await extractMemories(client, { storeId: conversation.store_id, conversationId: input.conversationId, messageId: assistant.data.id, userText: input.content, assistantText })
            } catch { /* Memory extraction must never break a completed chat. */ }
          })
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Chat failed' }, { status: 400 })
  }
}
