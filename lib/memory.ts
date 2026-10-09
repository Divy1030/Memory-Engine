import { getOpenRouter } from '@/lib/openrouter'
import { DEFAULT_MODEL, EMBEDDING_MODEL } from '@/lib/config'
import { extractionSchema } from '@/lib/validation'

type MemoryClient = Awaited<ReturnType<typeof import('@/lib/insforge/server').getInsForgeServerClient>>

export async function embed(text: string) {
  const result = await getOpenRouter().embeddings.create({ model: EMBEDDING_MODEL, input: text })
  const vector = result.data[0]?.embedding
  if (!vector) throw new Error('Embedding provider returned no vector')
  return vector
}

export async function extractMemories(client: MemoryClient, input: { storeId: string; conversationId: string; messageId: string; userText: string; assistantText: string }) {
  const model = process.env.OPENROUTER_CHAT_MODEL ?? DEFAULT_MODEL
  const completion = await getOpenRouter().chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Extract only durable user memories. Factual memories are stable facts, preferences, goals, or constraints. Episodic memories are meaningful events, decisions, or experiences. Do not extract assistant facts, temporary requests, or secrets. Return JSON exactly as {"memories":[{"kind":"factual"|"episodic","content":"...","confidence":0.0}]}. Return an empty array when there is nothing durable.' },
      { role: 'user', content: `User said:\n${input.userText}\n\nAssistant replied:\n${input.assistantText}` },
    ],
  })
  const raw = completion.choices[0]?.message?.content
  if (!raw) return
  const parsed = extractionSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) return

  for (const memory of parsed.data.memories) {
    const normalized = memory.content.toLowerCase().replace(/\s+/g, ' ').trim()
    const existing = await client.database.from('memories').select('id, content').eq('store_id', input.storeId).eq('kind', memory.kind).eq('content_normalized', normalized).eq('status', 'active').limit(1)
    if (existing.error) continue
    if (existing.data?.length) continue
    const vector = await embed(memory.content)
    await client.database.from('memories').insert([{ store_id: input.storeId, kind: memory.kind, content: memory.content, content_normalized: normalized, confidence: memory.confidence, embedding: vector, embedding_model: EMBEDDING_MODEL, source_conversation_id: input.conversationId, source_message_id: input.messageId }])
  }
}
