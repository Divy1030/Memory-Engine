# Memory Engine

Memory Engine is a private, user-scoped conversational intelligence system. It combines InsForge Authentication, PostgreSQL, pgvector, OpenRouter chat completion, embedding-based retrieval, and structured memory extraction into a single memory-aware playground.

The central architectural distinction is between **short-term memory (STM)** and **long-term memory (LTM)**:

- **STM** preserves the chronological conversational state required to answer the current thread coherently.
- **LTM** preserves durable, semantically retrievable information that can be reused across conversations within the same memory space.

The system does not indiscriminately replay an entire user history to the model. Instead, it performs scoped retrieval and injects only the most relevant memories into the current inference context.

## Local setup

Create `.env.local` in the project root. This file is intentionally local-only and is ignored by Git:

```env
NEXT_PUBLIC_INSFORGE_URL=https://your-project.insforge.app
NEXT_PUBLIC_INSFORGE_ANON_KEY=your-public-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENROUTER_API_KEY=your-server-only-key
OPENROUTER_CHAT_MODEL=liquid/lfm-2.5-2.6b:free
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
```

The InsForge project is linked in `.insforge/project.json`. The migration at `migrations/20261009083211_memory-engine.sql` establishes the application schema, vector extension, similarity-search RPC, indexes, grants, and row-level security policies.

Install and start the application:

```bash
npm install
npm run dev
```

The InsForge anon key is a browser-safe public project key. The OpenRouter key is a privileged server credential and must never be exposed through `NEXT_PUBLIC_*`, committed to source control, or returned to the browser.

## Conceptual architecture

```text
┌──────────────────────┐
│  Authenticated user  │
└──────────┬───────────┘
           │ selects a store and conversation
           ▼
┌───────────────────────────────┐
│ STM: ordered Postgres history │
│ chat_messages                  │
└──────────┬────────────────────┘
           │ recent context + current query
           ▼
┌───────────────────────────────┐       ┌─────────────────────────────┐
│ Query embedding                │──────▶│ LTM: pgvector memory index  │
│ OpenRouter embedding model    │       │ factual + episodic memories │
└──────────┬────────────────────┘       └──────────────┬──────────────┘
           │ relevant semantic memories                │
           └──────────────────────┬────────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │ LLM context construction │
                    │ OpenRouter chat model    │
                    └────────────┬────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │ streamed assistant reply │
                    └────────────┬────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │ async memory extraction  │
                    └─────────────────────────┘
```

## Short-term memory (STM)

Short-term memory is the bounded, sequential context of the active conversation. It is not an ephemeral in-memory JavaScript array; PostgreSQL is the authoritative persistence layer.

The `chat_messages` table records:

- conversation ownership and ordering;
- message role: `user`, `assistant`, or `system`;
- message content;
- model identifier;
- prompt and completion token usage;
- number of memories retrieved for the response;
- creation timestamp.

For every chat request, the server performs the following sequence:

1. Authenticates the request through the InsForge SSR session.
2. Verifies that the conversation belongs to a store owned by the authenticated user.
3. Loads the bounded recent message window for that conversation.
4. Embeds the new user query for memory retrieval.
5. Constructs the LLM prompt from recent STM, the current query, and relevant LTM.
6. Streams the assistant response from OpenRouter.
7. Persists the completed assistant message exactly once.

STM provides local conversational coherence: pronouns, immediate references, follow-up questions, and the current thread’s working context. Because it is bounded, it prevents unbounded conversation replay from consuming the model’s context window.

## Long-term memory (LTM)

Long-term memory is a durable, cross-conversation knowledge layer. It stores information that may remain useful after the original conversation has ended.

The `memories` table stores:

- `kind`: `factual` or `episodic`;
- normalized memory content;
- confidence score;
- vector embedding;
- embedding model identifier;
- source conversation and source message;
- active/superseded lifecycle status;
- timestamps and ownership scope.

### Factual memory

Factual memory represents comparatively stable attributes or semantic assertions about the user. Examples include:

- age, name, location, occupation, or identity details;
- preferences and recurring tastes;
- goals, constraints, and long-lived requirements;
- technical experience or learning objectives.

Example:

```text
I am learning system design and prefer practical architecture examples.
```

### Episodic memory

Episodic memory represents an event, experience, decision, or interaction anchored to a moment, action, or temporal reference. It is not merely a fact about the user; it describes something that happened.

Examples:

```text
Yesterday I learned about distributed consensus algorithms.
I decided to study database sharding this weekend.
I attended a system design workshop last month.
```

Temporal and event-oriented language is deliberately classified as episodic. This prevents a statement such as “Yesterday I learned system design” from being incorrectly promoted into a timeless factual attribute.

## Memory extraction and consolidation

Memory extraction occurs after the assistant message has been durably persisted. The extraction task is asynchronous so that a slow embedding or model call cannot hold the chat stream open or prevent the user from sending a subsequent message.

The extraction pipeline is:

1. Submit the user message and completed assistant response to the extraction model.
2. Request a constrained JSON object containing candidate memories.
3. Remove Markdown code fences if the provider wraps the JSON response.
4. Validate the decoded object with Zod.
5. Reject malformed, empty, temporary, assistant-derived, or secret-bearing candidates.
6. Apply deterministic temporal/event heuristics as a guardrail over model classification.
7. Normalize candidate text for duplicate detection.
8. Generate a vector embedding for each accepted memory.
9. Persist the memory together with provenance, confidence, and embedding metadata.

The database stores provenance so a memory can be traced back to its originating conversation and message. Exact normalized duplicates are ignored, and the `status` field provides the lifecycle foundation for deactivation and future supersession workflows.

## Semantic retrieval

When a user asks a question in any conversation, Memory Engine embeds the query using the configured embedding model. The embedding is a dense numerical representation of the query’s semantic meaning rather than a literal keyword representation.

The vector is passed to the `match_memories` PostgreSQL RPC. The function:

- scopes retrieval to the active store;
- enforces ownership through InsForge RLS helper functions;
- excludes inactive memories;
- calculates cosine similarity with pgvector;
- applies a configurable similarity threshold;
- returns a bounded number of candidates.

For short fact-seeking queries such as “What is my age?”, the application also uses a small store-scoped lexical fallback. This protects retrieval from semantically sparse queries whose embedding score may be weaker than a longer natural-language question.

Retrieved memories are placed inside an explicit context boundary before the chat model is called:

```text
RELEVANT USER MEMORIES
- [factual] ...
- [episodic] ...
```

The model is instructed to use this material only when relevant and not to treat memory text as executable instructions. The result is a retrieval-augmented generation (RAG) pipeline specialized for personal conversational context.

## Cross-conversation behavior

Conversations are isolated by their `conversation_id`, while memories are isolated by their `store_id`.

This means:

- messages remain private to their original conversation;
- factual and episodic memories can be reused by every conversation in the same store;
- conversations in another store cannot retrieve those memories;
- changing the selected conversation does not erase the store’s LTM;
- the next user query triggers fresh semantic retrieval against the active store.

For example:

```text
Conversation A:
User: I am 25 years old.
      ↓
      factual memory is extracted and embedded

Conversation B, same store:
User: What is my age?
      ↓
      query embedding + factual-memory retrieval
      ↓
Assistant: You told me that you are 25 years old.
```

The memory is not copied into Conversation B’s historical message list. It is retrieved at inference time and injected into the model context only for the relevant request.

## Context-window strategy

The database can preserve substantially more history than can be sent to a single model request. A model context window is a per-request computational boundary, not a database capacity limit.

Memory Engine therefore uses a layered strategy:

- bounded recent STM for local conversational continuity;
- vector-retrieved LTM for durable personal context;
- confidence and similarity thresholds to suppress irrelevant memories;
- future conversation summarization for threads that exceed the practical STM window.

This architecture prevents the common failure mode of replaying an entire conversation on every request, which increases latency, token consumption, and the probability that relevant information is diluted by irrelevant history.

## Security and isolation

Every application table is protected by InsForge row-level security. Ownership is derived from the authenticated session and store relationships rather than from arbitrary browser-provided user identifiers.

The principal isolation boundary is:

```text
auth.uid()
    → stores.owner_id
    → conversations.store_id
    → chat_messages.conversation_id
    → memories.store_id
```

The browser may request a conversation or store by identifier, but InsForge policies determine whether that record is visible or mutable. The server also verifies conversation ownership before loading history, performing vector retrieval, or writing messages.

## Project structure

- `app/api/chat/route.ts` — authenticated chat orchestration, STM loading, query embedding, hybrid memory retrieval, streaming completion, and message persistence.
- `app/api/memories/route.ts` — store-scoped active-memory reads for the sidebar and memory refresh flow.
- `lib/memory.ts` — embeddings, extraction prompts, JSON validation, deterministic classification guardrails, and duplicate detection.
- `lib/openrouter.ts` — server-only OpenRouter client configuration.
- `migrations/20261009083211_memory-engine.sql` — tables, indexes, pgvector RPC, grants, helper functions, and RLS policies.
- `components/dashboard.tsx` — store/conversation playground, streamed transcript, composer, and factual/episodic memory surface.
- `lib/insforge/server.ts` — server-side InsForge client construction and authenticated session handling.

## Verification

```bash
npm run lint
npm run typecheck
npm run build -- --webpack
```

OpenRouter credentials must be configured before sending a chat message. The frontend never receives the OpenRouter API key.
