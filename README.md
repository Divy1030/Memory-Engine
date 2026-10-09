# Memory Engine

A private, user-scoped conversational memory engine built with Next.js, InsForge, Postgres, pgvector, and OpenRouter.

Each user can create isolated stores, chat with an LLM, and see the long-term memories extracted from their conversations. InsForge Auth and row-level security protect every store, conversation, message, and memory.

## Local setup

Create `.env.local` in the project root. It is intentionally local-only and is ignored by Git:

```env
NEXT_PUBLIC_INSFORGE_URL=https://your-project.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=your-public-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENROUTER_API_KEY=your-server-only-key
OPENROUTER_CHAT_MODEL=liquid/lfm-2.5-2.6b:free
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

The InsForge project is linked in `.insforge/project.json`. The migration in `migrations/20261009083211_memory-engine.sql` creates the application schema and has been applied to the linked backend.

Start the app with:

```bash
npm install
npm run dev
```

The InsForge anon key is safe for browser use, but the OpenRouter key is server-only. Never commit either environment file or expose `OPENROUTER_API_KEY` through a `NEXT_PUBLIC_*` variable.

## Memory architecture

### Short-term memory: Postgres conversation history

Postgres is the source of truth for the active conversation. The `chat_messages` table stores ordered user, assistant, and system messages, together with the model and usage metadata. On every chat request the server:

1. Authenticates the user and verifies store/conversation ownership.
2. Loads the recent messages for the selected conversation.
3. Adds the current user message to the conversation context.
4. Streams the assistant response from OpenRouter.
5. Persists the completed assistant response exactly once.

This gives the model short-term conversational context and makes history durable across reloads and sessions.

### Long-term memory: factual and episodic pgvector records

After the assistant response is saved, the server runs structured memory extraction. The extractor classifies useful candidates into two kinds:

- **Factual memory**: stable facts, identity details, preferences, goals, or constraints. For example, “I prefer dark mode” or “I am learning TypeScript.”
- **Episodic memory**: meaningful events, decisions, experiences, or time-bound interactions. For example, “Yesterday I learned system design.” Temporal and event language is guarded so it is not incorrectly saved as a fact.

Each non-empty memory is stored in the `memories` table with its type, content, confidence, source message, embedding, embedding model, active/superseded status, and timestamps. Duplicate content is ignored, while a newer conflicting factual memory can supersede an older active fact.

Extraction happens immediately after the assistant message is persisted, so the new memory is available to the sidebar and to the next query without requiring another chat turn.

### Semantic memory retrieval

The current user query is embedded with OpenRouter using `openai/text-embedding-3-small`. The resulting 1536-dimensional vector is passed to the scoped `match_memories` Postgres RPC, which performs cosine-similarity search against active memories in the selected store.

Only memories above the configured similarity threshold are selected. The server places those results inside explicit memory delimiters in the next OpenRouter chat context, allowing the model to use relevant factual and episodic memories without mixing them with untrusted instructions.

The retrieval flow is:

```text
user query
    -> OpenRouter embedding
    -> InsForge Postgres/pgvector semantic search
    -> relevant store-scoped memories
    -> OpenRouter chat context
    -> streamed response
    -> Postgres short-term history
    -> factual/episodic extraction
    -> pgvector long-term memory
```

## Main pieces

- `app/api/chat/route.ts` authenticates, loads short-term history, retrieves relevant memory, streams OpenRouter output, persists messages, and runs extraction.
- `lib/memory.ts` handles embeddings, semantic retrieval, structured extraction, duplicate detection, and factual/episodic classification.
- `migrations/20261009083211_memory-engine.sql` creates stores, conversations, messages, memories, RLS policies, the vector index, and `match_memories`.
- `components/dashboard.tsx` provides the store/conversation playground and the factual/episodic memory sidebar.
- `lib/insforge/server.ts` contains the server-side InsForge client and session handling.

## Verification

```bash
npm run lint
npm run typecheck
npm run build -- --webpack
```

OpenRouter credentials must be configured before sending a chat message. The frontend never receives the OpenRouter key.
