# Memory Engine

Next.js App Router playground for private, user-scoped LLM conversations with InsForge authentication, Postgres history, and pgvector long-term memory.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill `NEXT_PUBLIC_INSFORGE_ANON_KEY` with the linked project’s public anon key.
3. Add `OPENROUTER_API_KEY` as a server-only environment variable. It can also be stored in InsForge with the CLI as `OPENROUTER_API_KEY`.
4. Start the app with `npm run dev`.

The InsForge project is already linked in `.insforge/project.json`. The migration in `migrations/20261009083211_memory-engine.sql` has been applied to the linked backend.

## Architecture

- `app/api/chat/route.ts` authenticates, retrieves relevant memory, streams OpenRouter output, persists history, and starts extraction.
- `lib/memory.ts` handles embeddings and structured factual/episodic extraction.
- `migrations/20261009083211_memory-engine.sql` creates stores, conversations, messages, memories, RLS policies, and `match_memories`.
- The dashboard keeps InsForge as the source of truth and shows extracted memories in the right sidebar.

## Verification

```bash
npm run typecheck
npm run build -- --webpack
```

OpenRouter credentials must be configured before sending a chat message. The frontend never receives the OpenRouter key.
