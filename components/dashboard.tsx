'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Brain, CircleNotch, PencilSimple, Plus, SignOut, Trash } from '@phosphor-icons/react'
import type { ChatMessage, Conversation, Memory, Store } from '@/lib/types'
import { MODELS, DEFAULT_MODEL } from '@/lib/config'

type Props = { userEmail: string; initialStores: Store[]; initialConversations: Conversation[]; initialMemories: Memory[] }

export default function Dashboard({ userEmail, initialStores, initialConversations, initialMemories }: Props) {
  const router = useRouter()
  const [stores, setStores] = useState(initialStores)
  const [conversations, setConversations] = useState(initialConversations)
  const [memories, setMemories] = useState(initialMemories)
  const [storeId, setStoreId] = useState(initialStores[0]?.id ?? '')
  const [conversationId, setConversationId] = useState(initialConversations.find((c) => c.store_id === initialStores[0]?.id)?.id ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useState('')

  const storeConversations = useMemo(() => conversations.filter((conversation) => conversation.store_id === storeId), [conversations, storeId])
  const storeMemories = memories.filter((memory) => memory.store_id === storeId)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (busy) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy, status])

  async function createStore() {
    const name = window.prompt('Store name')?.trim(); if (!name) return
    const response = await fetch('/api/stores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!response.ok) { setNotice('Could not create store'); return }
    const store = await response.json() as Store; setStores((current) => [...current, store]); setStoreId(store.id); setNotice('')
  }

  async function createConversation() {
    if (!storeId) { await createStore(); return }
    const response = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId, title: 'New conversation', model }) })
    if (!response.ok) { setNotice('Could not create conversation'); return }
    const conversation = await response.json() as Conversation; setConversations((current) => [conversation, ...current]); setConversationId(conversation.id); setMessages([])
  }

  async function selectConversation(id: string) {
    setConversationId(id); setMessages([])
    const response = await fetch(`/api/conversations/${id}/messages`)
    if (response.ok) setMessages(await response.json())
  }

  async function renameConversation(conversation: Conversation) {
    const title = window.prompt('Conversation name', conversation.title)?.trim()
    if (!title || title === conversation.title) return
    const response = await fetch(`/api/conversations/${conversation.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) })
    if (!response.ok) { setNotice('Could not rename conversation'); return }
    const updated = await response.json() as Conversation
    setConversations((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); if (!input.trim() || !conversationId || busy) return
    const content = input.trim(); setInput(''); setBusy(true); setExtracting(true); setStatus('Searching memories…'); setNotice('')
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content, model: null, created_at: new Date().toISOString() }, { id: crypto.randomUUID(), role: 'assistant', content: '', model, created_at: new Date().toISOString() }])
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, content, model }) })
    if (!response.ok || !response.body) { const result = await response.json().catch(() => ({})); setNotice(result.error ?? 'Chat failed'); setBusy(false); setExtracting(false); setStatus(''); return }
    const memoryCount = Number(response.headers.get('X-Memory-Count') ?? 0)
    setStatus(memoryCount > 0 ? `Searching ${memoryCount} fact${memoryCount === 1 ? '' : 's'}…` : 'Thinking…')
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let answer = ''
    let thinkingShown = memoryCount === 0
    while (true) { const chunk = await reader.read(); if (chunk.done) break; answer += decoder.decode(chunk.value, { stream: true }); if (!thinkingShown && answer) { thinkingShown = true; setStatus('Thinking…') }; setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: answer } : message)) }
    const memoryResponse = await fetch('/api/memories')
    if (memoryResponse.ok) setMemories(await memoryResponse.json())
    setBusy(false); setExtracting(false); setStatus('')
  }

  async function deleteMemory(id: string) { await fetch(`/api/memories/${id}`, { method: 'DELETE' }); setMemories((current) => current.filter((memory) => memory.id !== id)) }

  return <main className="flex h-screen overflow-hidden bg-canvas">
    <aside className="flex h-full w-[310px] shrink-0 flex-col overflow-hidden border-r border-line bg-[#151513] p-5">
      <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.25em] text-accent">Memory Engine</p><p className="mt-1 max-w-[200px] truncate text-xs text-white/40">{userEmail}</p></div><form action="/api/auth/sign-out" method="post"><button aria-label="Sign out" className="text-white/70 hover:text-white" onClick={async (e) => { e.preventDefault(); await fetch('/api/auth/sign-out', { method: 'POST' }); router.push('/login'); router.refresh() }}><SignOut size={18} weight="bold" /></button></form></div>
      <div className="mt-9 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-widest text-white/40">Stores</span><button aria-label="Create store" onClick={createStore} className="text-white hover:text-accent"><Plus size={18} weight="bold" /></button></div>
      <div className="mt-3 space-y-1 overflow-hidden">{stores.map((store) => <button key={store.id} onClick={() => { setStoreId(store.id); setConversationId(conversations.find((conversation) => conversation.store_id === store.id)?.id ?? ''); setMessages([]) }} className={`flex w-full items-center gap-2 truncate rounded-xl px-3 py-2 text-left text-sm ${store.id === storeId ? 'bg-accent/15 text-accent' : 'text-white/65 hover:bg-white/5'}`}><Archive size={16} weight="bold" className="shrink-0 text-white" />{store.name}</button>)}{!stores.length && <p className="px-3 text-sm text-white/35">Create your first store.</p>}</div>
      <div className="mt-8 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-widest text-white/40">Conversations</span><button aria-label="Create conversation" onClick={createConversation} className="text-white hover:text-accent"><Plus size={18} weight="bold" /></button></div>
      <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-hidden">{storeConversations.map((conversation) => <div key={conversation.id} className={`flex items-center gap-1 rounded-xl ${conversation.id === conversationId ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5'}`}><button onClick={() => selectConversation(conversation.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm">{conversation.title}</button><button aria-label={`Rename ${conversation.title}`} onClick={() => renameConversation(conversation)} className="px-2 text-white/70 hover:text-white"><PencilSimple size={15} weight="bold" /></button></div>)}</div>
      <div className="mt-5 border-t border-line pt-4"><p className="text-[10px] uppercase tracking-widest text-white/35">Long-term memory</p><p className="mt-1 text-xs text-white/45">{storeMemories.length} extracted memories</p></div>
    </aside>
    <section className="flex h-full min-w-0 min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-8 py-5"><div><p className="text-xs uppercase tracking-widest text-white/35">Playground</p><h1 className="mt-1 text-xl font-semibold">{storeConversations.find((c) => c.id === conversationId)?.title ?? 'Start a conversation'}</h1></div><select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-white/75 outline-none">{MODELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></header>
      <div className="scrollbar min-h-0 flex-1 overflow-y-auto px-8 py-8"><div className="mx-auto max-w-3xl space-y-6">{!conversationId && <div className="rounded-3xl border border-dashed border-line p-10 text-center"><p className="text-lg font-medium">Create a conversation to begin.</p><button onClick={createConversation} className="mt-5 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas">New conversation</button></div>}{messages.map((message) => <article key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-5 py-4 text-sm leading-7 ${message.role === 'user' ? 'bg-accent text-canvas' : 'border border-line bg-panel text-white/80'}`}>{message.content || '…'}</div></article>)}{notice && <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{notice}</p>}<div ref={messagesEndRef} aria-hidden="true" /></div></div>
      <form onSubmit={sendMessage} className="sticky bottom-0 z-10 border-t border-line bg-canvas/90 px-8 py-5 backdrop-blur"><div className="mx-auto max-w-3xl">{status && <p className="mb-2 px-2 text-xs text-white/45">{status}</p>}<div className="flex gap-3 rounded-2xl border border-line bg-panel p-2"><textarea disabled={!conversationId || busy} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(e) } }} rows={1} placeholder={conversationId ? 'Ask anything…' : 'Create a conversation first'} className="min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-white/30"/><button disabled={!conversationId || busy || !input.trim()} className="rounded-xl bg-accent px-4 text-sm font-semibold text-canvas disabled:opacity-40">{busy ? '…' : 'Send'}</button></div></div></form>
    </section>
    <aside className="hidden h-full w-[290px] shrink-0 overflow-hidden border-l border-line bg-[#151513] p-5 xl:block"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-widest text-white/35">Extracted memory</p>{extracting && <CircleNotch size={17} weight="bold" className="animate-spin text-white" />}</div>{extracting && <div className="mt-4 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-3 text-xs text-accent"><CircleNotch size={15} weight="bold" className="animate-spin text-white" /><span>Extracting factual and episodic memories…</span></div>}<div className="mt-5 space-y-4 overflow-hidden">{(['factual', 'episodic'] as const).map((kind) => <div key={kind}><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent"><Brain size={15} weight="bold" className="text-white" />{kind}</p>{storeMemories.filter((memory) => memory.kind === kind).map((memory) => <div key={memory.id} className="group mb-2 rounded-xl border border-line bg-panel p-3"><p className="text-xs leading-5 text-white/70">{memory.content}</p><div className="mt-2 flex justify-between text-[10px] text-white/30"><span>{Math.round(memory.confidence * 100)}% confidence</span><button aria-label={`Delete memory: ${memory.content}`} onClick={() => deleteMemory(memory.id)} className="text-white/70 opacity-0 transition group-hover:opacity-100 hover:text-white"><Trash size={14} weight="bold" /></button></div></div>)}</div>)}{!storeMemories.length && !extracting && <p className="text-sm leading-6 text-white/35">Memories extracted from your chats will appear here.</p>}</div></aside>
  </main>
}
