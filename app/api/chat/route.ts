import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/insforge/server'
import { getOpenRouter } from '@/lib/openrouter'
import { embed, extractMemories } from '@/lib/memory'
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
    const memoriesResult = await client.database.rpc('match_memories', { p_store_id: conversation.store_id, p_query_embedding: queryVector, p_match_count: 8, p_match_threshold: 0.54 })
    const semanticMemories = memoriesResult.error ? [] : (memoriesResult.data ?? []) as Array<{ id: string; content: string; kind: string; similarity: number }>
    // Short factual questions can be semantically sparse (for example, "my age?").
    // Add a small store-scoped lexical fallback so direct fact lookups do not
    // disappear just because their embedding score is below the ANN threshold.
    const factLookup = /\b(my|me|what|who|where|when|age|name|birthday|born|years? old|prefer|favorite|goal|job|work)\b/i.test(input.content)
    let memories = semanticMemories
    if (factLookup) {
      const fallbackResult = await client.database.from('memories').select('id, content, kind, confidence').eq('store_id', conversation.store_id).eq('status', 'active').order('created_at', { ascending: false }).limit(100)
      const queryTokens = input.content.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !['what', 'when', 'where', 'does', 'have', 'about'].includes(token))
      const directFact = (fallbackResult.data ?? []).filter((memory: { id: string; content: string; kind: string }) => {
        const content = memory.content.toLowerCase()
        const ageQuestion = /\bage\b|\bborn\b|\byears? old\b/.test(input.content.toLowerCase()) && /\bage\b|\bborn\b|\byears? old\b|\byear\b/.test(content)
        return ageQuestion || queryTokens.some((token) => content.includes(token))
      }).map((memory: { id: string; content: string; kind: string }) => ({ ...memory, similarity: 1 }))
      const merged = new Map(memories.map((memory) => [memory.id, memory]))
      for (const memory of directFact) merged.set(memory.id, memory)
      memories = [...merged.values()].slice(0, 8)
    }

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
          controller.close()
          // Extraction starts only after the response is complete, but it must
          // not hold the chat stream open or block the next user message.
          void extractMemories(client, { storeId: conversation.store_id, conversationId: input.conversationId, messageId: assistant.data.id, userText: input.content, assistantText }).catch(() => {
            // Memory extraction must never break a completed chat.
          })
        } catch (error) {
          controller.error(error)
        }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Memory-Count': String(memories.length) } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Chat failed' }, { status: 400 })
  }
}
