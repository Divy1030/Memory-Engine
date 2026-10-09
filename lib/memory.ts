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
      { role: 'system', content: 'Extract only durable user memories. Factual memories are stable attributes, preferences, goals, or constraints. Episodic memories are events or experiences anchored in time or action. Any statement containing a temporal marker such as yesterday, today, last week, recently, or describing something the user learned, attended, decided, visited, completed, or experienced MUST be episodic, not factual. For example, "Yesterday I learned system design" is episodic. Do not extract assistant facts, temporary requests, or secrets. Return JSON exactly as {"memories":[{"kind":"factual"|"episodic","content":"...","confidence":0.0}]}. Return an empty array when there is nothing durable.' },
      { role: 'user', content: `User said:\n${input.userText}\n\nAssistant replied:\n${input.assistantText}` },
    ],
  })
  const raw = completion.choices[0]?.message?.content
  if (!raw) return
  const parsed = extractionSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) return

  for (const memory of parsed.data.memories) {
    const normalized = memory.content.toLowerCase().replace(/\s+/g, ' ').trim()
    const isEpisodic = /\b(yesterday|today|recently|last (night|week|month|year)|this (morning|week)|when i|i (learned|attended|decided|visited|met|went|started|finished|experienced)|user (learned|attended|decided|visited|met|went|started|finished|experienced))\b/i.test(memory.content)
    const kind = isEpisodic ? 'episodic' : memory.kind
    const existing = await client.database.from('memories').select('id, content').eq('store_id', input.storeId).eq('kind', kind).eq('content_normalized', normalized).eq('status', 'active').limit(1)
    if (existing.error) continue
    if (existing.data?.length) continue
    const vector = await embed(memory.content)
    await client.database.from('memories').insert([{ store_id: input.storeId, kind, content: memory.content, content_normalized: normalized, confidence: memory.confidence, embedding: vector, embedding_model: EMBEDDING_MODEL, source_conversation_id: input.conversationId, source_message_id: input.messageId }])
  }
}
