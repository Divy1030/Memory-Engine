import { z } from 'zod'

export const storeSchema = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(240).optional() })
export const conversationSchema = z.object({ storeId: z.string().uuid(), title: z.string().trim().min(1).max(120).default('New conversation'), model: z.string().min(1).max(160).optional() })
export const chatSchema = z.object({ conversationId: z.string().uuid(), content: z.string().trim().min(1).max(12000), model: z.string().min(1).max(160) })
export const extractionSchema = z.object({ memories: z.array(z.object({ kind: z.enum(['factual', 'episodic']), content: z.string().trim().min(1).max(1000), confidence: z.number().min(0).max(1) })).max(8) })
