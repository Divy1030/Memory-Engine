'use client'

import { useMemo, useState } from 'react'
import type { ChatMessage, Conversation, Memory, Store } from '@/lib/types'
import { MODELS, DEFAULT_MODEL } from '@/lib/config'

type Props = { userEmail: string; initialStores: Store[]; initialConversations: Conversation[]; initialMemories: Memory[] }

export default function Dashboard({ userEmail, initialStores, initialConversations, initialMemories }: Props) {
  const [stores, setStores] = useState(initialStores)
  const [conversations, setConversations] = useState(initialConversations)
  const [memories, setMemories] = useState(initialMemories)
  const [storeId, setStoreId] = useState(initialStores[0]?.id ?? '')
  const [conversationId, setConversationId] = useState(initialConversations.find((c) => c.store_id === initialStores[0]?.id)?.id ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [model, setModel] = useState<string>(DEFAULT_MODEL)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const storeConversations = useMemo(() => conversations.filter((conversation) => conversation.store_id === storeId), [conversations, storeId])
  const storeMemories = memories.filter((memory) => memory.store_id === storeId)

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

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault(); if (!input.trim() || !conversationId || busy) return
    const content = input.trim(); setInput(''); setBusy(true); setNotice('')
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content, model: null, created_at: new Date().toISOString() }, { id: crypto.randomUUID(), role: 'assistant', content: '', model, created_at: new Date().toISOString() }])
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, content, model }) })
    if (!response.ok || !response.body) { const result = await response.json().catch(() => ({})); setNotice(result.error ?? 'Chat failed'); setBusy(false); return }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let answer = ''
    while (true) { const chunk = await reader.read(); if (chunk.done) break; answer += decoder.decode(chunk.value, { stream: true }); setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: answer } : message)) }
    setBusy(false)
    setTimeout(async () => { const response = await fetch('/api/memories'); if (response.ok) setMemories(await response.json()) }, 1200)
  }

  async function deleteMemory(id: string) { await fetch(`/api/memories/${id}`, { method: 'DELETE' }); setMemories((current) => current.filter((memory) => memory.id !== id)) }

  return <main className="flex min-h-screen bg-canvas">
    <aside className="flex w-[310px] shrink-0 flex-col border-r border-line bg-[#151513] p-5">
      <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.25em] text-accent">Memory Engine</p><p className="mt-1 max-w-[200px] truncate text-xs text-white/40">{userEmail}</p></div><form action="/api/auth/sign-out" method="post"><button className="text-xs text-white/40 hover:text-white" onClick={async (e) => { e.preventDefault(); await fetch('/api/auth/sign-out', { method: 'POST' }); location.href = '/login' }}>Exit</button></form></div>
      <div className="mt-9 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-widest text-white/40">Stores</span><button onClick={createStore} className="text-xl leading-none text-accent">+</button></div>
      <div className="scrollbar mt-3 space-y-1 overflow-y-auto">{stores.map((store) => <button key={store.id} onClick={() => { setStoreId(store.id); setConversationId(storeConversations.find((c) => c.store_id === store.id)?.id ?? ''); setMessages([]) }} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${store.id === storeId ? 'bg-accent/15 text-accent' : 'text-white/65 hover:bg-white/5'}`}>◈ {store.name}</button>)}{!stores.length && <p className="px-3 text-sm text-white/35">Create your first store.</p>}</div>
      <div className="mt-8 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-widest text-white/40">Conversations</span><button onClick={createConversation} className="text-xl leading-none text-accent">+</button></div>
      <div className="scrollbar mt-3 flex-1 space-y-1 overflow-y-auto">{storeConversations.map((conversation) => <button key={conversation.id} onClick={() => selectConversation(conversation.id)} className={`w-full truncate rounded-xl px-3 py-2 text-left text-sm ${conversation.id === conversationId ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5'}`}>{conversation.title}</button>)}</div>
      <div className="mt-5 border-t border-line pt-4"><p className="text-[10px] uppercase tracking-widest text-white/35">Long-term memory</p><p className="mt-1 text-xs text-white/45">{storeMemories.length} extracted memories</p></div>
    </aside>
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-line px-8 py-5"><div><p className="text-xs uppercase tracking-widest text-white/35">Playground</p><h1 className="mt-1 text-xl font-semibold">{storeConversations.find((c) => c.id === conversationId)?.title ?? 'Start a conversation'}</h1></div><select value={model} onChange={(e) => setModel(e.target.value)} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-white/75 outline-none">{MODELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></header>
      <div className="scrollbar flex-1 overflow-y-auto px-8 py-8"><div className="mx-auto max-w-3xl space-y-6">{!conversationId && <div className="rounded-3xl border border-dashed border-line p-10 text-center"><p className="text-lg font-medium">Create a conversation to begin.</p><button onClick={createConversation} className="mt-5 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas">New conversation</button></div>}{messages.map((message) => <article key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-5 py-4 text-sm leading-7 ${message.role === 'user' ? 'bg-accent text-canvas' : 'border border-line bg-panel text-white/80'}`}>{message.content || '…'}</div></article>)}{notice && <p className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">{notice}</p>}</div></div>
      <form onSubmit={sendMessage} className="border-t border-line px-8 py-5"><div className="mx-auto flex max-w-3xl gap-3 rounded-2xl border border-line bg-panel p-2"><textarea disabled={!conversationId || busy} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(e) } }} rows={1} placeholder={conversationId ? 'Ask anything…' : 'Create a conversation first'} className="min-h-11 flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-white/30"/><button disabled={!conversationId || busy || !input.trim()} className="rounded-xl bg-accent px-4 text-sm font-semibold text-canvas disabled:opacity-40">{busy ? '…' : 'Send'}</button></div></form>
    </section>
    <aside className="hidden w-[290px] shrink-0 border-l border-line bg-[#151513] p-5 xl:block"><p className="text-xs uppercase tracking-widest text-white/35">Extracted memory</p><div className="scrollbar mt-5 space-y-4 overflow-y-auto">{(['factual', 'episodic'] as const).map((kind) => <div key={kind}><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">{kind}</p>{storeMemories.filter((memory) => memory.kind === kind).map((memory) => <div key={memory.id} className="group mb-2 rounded-xl border border-line bg-panel p-3"><p className="text-xs leading-5 text-white/70">{memory.content}</p><div className="mt-2 flex justify-between text-[10px] text-white/30"><span>{Math.round(memory.confidence * 100)}% confidence</span><button onClick={() => deleteMemory(memory.id)} className="opacity-0 transition group-hover:opacity-100 hover:text-red-300">delete</button></div></div>)}</div>)}{!storeMemories.length && <p className="text-sm leading-6 text-white/35">Memories extracted from your chats will appear here.</p>}</div></aside>
  </main>
}
