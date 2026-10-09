export const MODELS = [
  { id: 'meta-llama/llama-3.3-8b-instruct:free', label: 'Llama 3.3 8B · Free' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
] as const

export const DEFAULT_MODEL = MODELS[0].id
export const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-3-small'
