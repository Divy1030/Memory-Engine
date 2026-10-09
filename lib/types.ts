export type MemoryKind = 'factual' | 'episodic'

export type Store = { id: string; name: string; description: string | null; created_at: string }
export type Conversation = { id: string; store_id: string; title: string; model: string; created_at: string; updated_at: string }
export type ChatMessage = { id: string; role: 'system' | 'user' | 'assistant'; content: string; model: string | null; created_at: string }
export type Memory = { id: string; store_id: string; kind: MemoryKind; content: string; confidence: number; created_at: string; source_conversation_id: string | null }
