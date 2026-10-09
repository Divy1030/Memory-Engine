CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  retrieval_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('factual', 'episodic')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  content_normalized TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  embedding_model TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
  source_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, kind, content_normalized, status)
);

CREATE OR REPLACE FUNCTION public.owns_store(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.owns_conversation(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c JOIN public.stores s ON s.id = c.store_id
    WHERE c.id = p_conversation_id AND s.owner_id = auth.uid()
  );
$$;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_owner_policy ON public.stores;
CREATE POLICY stores_owner_policy ON public.stores FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS conversations_owner_policy ON public.conversations;
CREATE POLICY conversations_owner_policy ON public.conversations FOR ALL TO authenticated USING (public.owns_store(store_id)) WITH CHECK (public.owns_store(store_id));
DROP POLICY IF EXISTS messages_owner_policy ON public.chat_messages;
CREATE POLICY messages_owner_policy ON public.chat_messages FOR ALL TO authenticated USING (public.owns_conversation(conversation_id)) WITH CHECK (public.owns_conversation(conversation_id));
DROP POLICY IF EXISTS memories_owner_policy ON public.memories;
CREATE POLICY memories_owner_policy ON public.memories FOR ALL TO authenticated USING (public.owns_store(store_id)) WITH CHECK (public.owns_store(store_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores, public.conversations, public.chat_messages, public.memories TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_store(UUID), public.owns_conversation(UUID) TO authenticated;

CREATE INDEX IF NOT EXISTS conversations_store_updated_idx ON public.conversations(store_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.chat_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS memories_store_status_idx ON public.memories(store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_embedding_hnsw_idx ON public.memories USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_memories(
  p_store_id UUID, p_query_embedding vector(1536), p_match_count INTEGER DEFAULT 6, p_match_threshold DOUBLE PRECISION DEFAULT 0.68
)
RETURNS TABLE (id UUID, kind TEXT, content TEXT, confidence NUMERIC, similarity DOUBLE PRECISION)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT m.id, m.kind, m.content, m.confidence, 1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM public.memories m
  WHERE m.store_id = p_store_id AND m.status = 'active' AND public.owns_store(m.store_id)
    AND 1 - (m.embedding <=> p_query_embedding) >= p_match_threshold
  ORDER BY m.embedding <=> p_query_embedding LIMIT LEAST(p_match_count, 20);
$$;

GRANT EXECUTE ON FUNCTION public.match_memories(UUID, vector, INTEGER, DOUBLE PRECISION) TO authenticated;
