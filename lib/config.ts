export const MODELS = [
  { id: 'liquid/lfm-2.5-2.6b:free', label: 'Liquid LFM 2.5 2.6B · Free' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
] as const

export const DEFAULT_MODEL = MODELS[0].id
export const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-3-small'
