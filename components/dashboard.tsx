'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive, ArrowUp, Brain, Check, CircleNotch, ClockCounterClockwise,
  Lightning, MagnifyingGlass, PencilSimple, Plus, SignOut, Sparkle, Trash, UserCircle, X,
} from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, Conversation, Memory, Store } from '@/lib/types'
import { MODELS, DEFAULT_MODEL } from '@/lib/config'

type Props = { userEmail: string; initialStores: Store[]; initialConversations: Conversation[]; initialMemories: Memory[] }

const suggestions = [
  { title: 'Reflect on something', text: 'What have I learned recently?', icon: Sparkle },
  { title: 'Find a memory', text: 'What do you remember about my goals?', icon: MagnifyingGlass },
  { title: 'Plan ahead', text: 'Help me turn my ideas into a plan.', icon: Lightning },
]

function initials(email: string) { return email.slice(0, 2).toUpperCase() }
function formatDate(value: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value)) }

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
  const [pendingCount, setPendingCount] = useState(0)
  const [extractionCount, setExtractionCount] = useState(0)
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useState('')
  const storeConversations = useMemo(() => conversations.filter((conversation) => conversation.store_id === storeId), [conversations, storeId])
  const storeMemories = memories.filter((memory) => memory.store_id === storeId)
  const activeConversation = storeConversations.find((conversation) => conversation.id === conversationId)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const busy = pendingCount > 0
  const extracting = extractionCount > 0

  useEffect(() => { if (busy) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, busy, status])

  async function refreshMemories(targetStoreId: string) {
    if (!targetStoreId) return
    const response = await fetch(`/api/memories?storeId=${encodeURIComponent(targetStoreId)}`)
    if (response.ok) {
      const nextMemories = await response.json() as Memory[]
      setMemories((current) => [...current.filter((memory) => memory.store_id !== targetStoreId), ...nextMemories])
    }
  }

  async function createStore() {
    const name = window.prompt('Store name')?.trim(); if (!name) return
    const response = await fetch('/api/stores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
    if (!response.ok) { setNotice('Could not create store'); return }
    const store = await response.json() as Store; setStores((current) => [...current, store]); setStoreId(store.id); setConversationId(''); setMessages([]); setNotice('')
  }

  async function createConversation() {
    if (!storeId) { await createStore(); return }
    const response = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId, title: 'New conversation', model }) })
    if (!response.ok) { setNotice('Could not create conversation'); return }
    const conversation = await response.json() as Conversation; setConversations((current) => [conversation, ...current]); setConversationId(conversation.id); setMessages([]); setNotice('')
  }

  async function selectConversation(id: string) {
    setConversationId(id); setMessages([]); setNotice('')
    const [messagesResponse] = await Promise.all([fetch(`/api/conversations/${id}/messages`), refreshMemories(storeId)])
    if (messagesResponse.ok) setMessages(await messagesResponse.json())
  }

  async function selectStore(nextStoreId: string) {
    const nextConversationId = conversations.find((conversation) => conversation.store_id === nextStoreId)?.id ?? ''
    setStoreId(nextStoreId); setConversationId(nextConversationId); setMessages([]); setNotice('')
    await refreshMemories(nextStoreId)
    if (nextConversationId) {
      const response = await fetch(`/api/conversations/${nextConversationId}/messages`)
      if (response.ok) setMessages(await response.json())
    }
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
    event.preventDefault(); if (!input.trim() || !conversationId) return
    const content = input.trim(); const assistantId = crypto.randomUUID(); setInput(''); setPendingCount((count) => count + 1); setExtractionCount((count) => count + 1); setStatus('Searching memories…'); setNotice('')
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', content, model: null, created_at: new Date().toISOString() }, { id: assistantId, role: 'assistant', content: '', model, created_at: new Date().toISOString() }])
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, content, model }) })
    if (!response.ok || !response.body) { const result = await response.json().catch(() => ({})); setNotice(result.error ?? 'Chat failed'); setPendingCount((count) => Math.max(0, count - 1)); setExtractionCount((count) => Math.max(0, count - 1)); setStatus(''); return }
    const memoryCount = Number(response.headers.get('X-Memory-Count') ?? 0)
    setStatus(memoryCount > 0 ? `Searching ${memoryCount} fact${memoryCount === 1 ? '' : 's'}…` : 'Thinking…')
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let answer = ''; let thinkingShown = memoryCount === 0
    while (true) { const chunk = await reader.read(); if (chunk.done) break; answer += decoder.decode(chunk.value, { stream: true }); if (!thinkingShown && answer) { thinkingShown = true; setStatus('Thinking…') }; setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: answer } : message)) }
    setPendingCount((count) => Math.max(0, count - 1)); setStatus('')
    window.setTimeout(async () => { await refreshMemories(storeId); setExtractionCount((count) => Math.max(0, count - 1)) }, 900)
  }

  async function deleteMemory(id: string) { await fetch(`/api/memories/${id}`, { method: 'DELETE' }); setMemories((current) => current.filter((memory) => memory.id !== id)) }

  return <main className="app-shell flex h-screen overflow-hidden">
    <aside className="sidebar-left flex h-full w-[274px] shrink-0 flex-col overflow-hidden border-r border-white/[.07] bg-[#101115] px-4 py-5">
      <div className="flex items-center justify-between px-2"><div className="flex items-center gap-3"><div className="brand-mark"><Brain size={18} weight="duotone" /></div><div><p className="text-[13px] font-semibold tracking-[-.02em] text-white">Memory Engine</p><p className="mt-0.5 text-[10px] uppercase tracking-[.18em] text-white/35">Personal intelligence</p></div></div><button aria-label="Sign out" className="icon-button text-white/40 hover:text-white" onClick={async () => { await fetch('/api/auth/sign-out', { method: 'POST' }); router.push('/login'); router.refresh() }}><SignOut size={17} /></button></div>
      <div className="mt-8 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-[.2em] text-white/30"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />All systems online</div>
      <div className="mt-7 flex items-center justify-between px-2"><span className="section-label">Memory spaces</span><button aria-label="Create store" onClick={createStore} className="icon-button text-white/45 hover:text-white"><Plus size={17} /></button></div>
      <div className="mt-2 space-y-1">{stores.map((store) => <button key={store.id} onClick={() => { void selectStore(store.id) }} className={`nav-row ${store.id === storeId ? 'nav-row-active' : ''}`}><span className={`nav-icon ${store.id === storeId ? 'nav-icon-active' : ''}`}><Archive size={15} weight="duotone" /></span><span className="truncate">{store.name}</span>{store.id === storeId && <span className="ml-auto h-1 w-1 rounded-full bg-[#b8a4ff]" />}</button>)}{!stores.length && <p className="px-3 text-xs text-white/35">Create your first space.</p>}</div>
      <div className="mt-8 flex items-center justify-between px-2"><span className="section-label">Conversations</span><button aria-label="Create conversation" onClick={createConversation} className="icon-button text-white/45 hover:text-white"><Plus size={17} /></button></div>
      <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-hidden">{storeConversations.map((conversation) => <div key={conversation.id} className={`conversation-row ${conversation.id === conversationId ? 'conversation-row-active' : ''}`}><button onClick={() => selectConversation(conversation.id)} className="min-w-0 flex-1 truncate text-left"><span className="block truncate text-[12px]">{conversation.title}</span><span className="mt-1 block text-[10px] text-white/25">{formatDate(conversation.updated_at)}</span></button><button aria-label={`Rename ${conversation.title}`} onClick={() => renameConversation(conversation)} className="conversation-action"><PencilSimple size={14} /></button></div>)}</div>
      <div className="sidebar-profile mt-5 flex items-center gap-3 border-t border-white/[.07] pt-4"><div className="avatar avatar-small">{initials(userEmail)}</div><div className="min-w-0"><p className="truncate text-xs font-medium text-white/75">{userEmail}</p><p className="mt-0.5 text-[10px] text-white/30">Private workspace</p></div></div>
    </aside>

    <section className="flex h-full min-w-0 min-h-0 flex-1 flex-col bg-[#0d0e12]">
      <header className="topbar flex h-[74px] shrink-0 items-center justify-between border-b border-white/[.07] px-7 lg:px-10"><div className="flex min-w-0 items-center gap-3"><div className="h-2 w-2 rounded-full bg-[#b8a4ff] shadow-[0_0_13px_#b8a4ff]" /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-white/30">Workspace / {stores.find((store) => store.id === storeId)?.name ?? 'New space'}</p><h1 className="mt-1 truncate text-[15px] font-medium tracking-[-.01em] text-white/85">{activeConversation?.title ?? 'Your thinking space'}</h1></div></div><div className="flex items-center gap-3"><div className="model-select-wrap"><Sparkle size={14} className="text-[#b8a4ff]" /><select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Choose model" className="model-select">{MODELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><span className="select-chevron">⌄</span></div></div></header>
      <div className="scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-8 lg:px-10"><div className="mx-auto max-w-[800px]">
        {!conversationId && <div className="empty-state pt-10 sm:pt-16"><div className="memory-orb"><div className="orb-core"><Brain size={30} weight="duotone" /></div></div><p className="mt-7 text-[11px] font-semibold uppercase tracking-[.28em] text-[#b8a4ff]">A clearer mind starts here</p><h2 className="mt-3 text-center text-3xl font-semibold tracking-[-.05em] text-white sm:text-4xl">Think out loud.<br /><span className="text-white/35">We’ll remember the rest.</span></h2><p className="mx-auto mt-4 max-w-[440px] text-center text-sm leading-6 text-white/42">Chat with a memory-aware assistant that learns what matters, while keeping your personal context private.</p><button onClick={createConversation} className="primary-button mt-8"><Plus size={17} weight="bold" />Start a new conversation</button><div className="mt-14 grid gap-2 sm:grid-cols-3">{suggestions.map(({ title, text, icon: Icon }) => <button key={title} onClick={() => { void createConversation().then(() => setInput(text)) }} className="suggestion-card text-left"><Icon size={17} weight="duotone" className="text-[#b8a4ff]" /><span className="mt-4 block text-xs font-medium text-white/75">{title}</span><span className="mt-1 block text-[11px] leading-5 text-white/35">{text}</span></button>)}</div></div>}
        {conversationId && messages.length === 0 && <div className="conversation-intro"><div className="avatar avatar-assistant"><Sparkle size={17} weight="fill" /></div><div><p className="text-sm font-medium text-white/80">A fresh thread</p><p className="mt-1 text-xs leading-5 text-white/35">Your relevant memories will be woven into this conversation as you go.</p></div></div>}
        <div className="space-y-7">{messages.map((message) => <article key={message.id} className={`message-row ${message.role === 'user' ? 'message-user' : ''}`}><div className={`avatar ${message.role === 'user' ? 'avatar-user' : 'avatar-assistant'}`}>{message.role === 'user' ? <UserCircle size={18} weight="duotone" /> : <Sparkle size={17} weight="fill" />}</div><div className={`message-content ${message.role === 'user' ? 'message-content-user' : ''}`}><div className="mb-2 flex items-center gap-2"><span className="text-[11px] font-semibold text-white/55">{message.role === 'user' ? 'You' : 'Memory Engine'}</span>{message.role === 'assistant' && <span className="flex items-center gap-1 text-[10px] text-[#9d8de0]"><span className="h-1 w-1 rounded-full bg-[#b8a4ff]" />context aware</span>}</div><div className={`message-bubble ${message.role === 'user' ? 'message-bubble-user' : ''}`}>{message.content ? (message.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown> : message.content) : <span className="thinking-dots"><i /><i /><i /></span>}</div></div></article>)}</div>
        {notice && <div className="notice mt-6"><X size={15} />{notice}</div>}<div ref={messagesEndRef} aria-hidden="true" />
      </div></div>
      <form onSubmit={sendMessage} className="composer-wrap shrink-0 px-5 pb-5 pt-3 lg:px-10 lg:pb-7"><div className="mx-auto max-w-[800px]">{status && <div className="mb-2 flex items-center gap-2 px-3 text-[11px] text-white/40"><CircleNotch size={13} className="animate-spin text-[#b8a4ff]" />{status}</div>}<div className={`composer ${busy ? 'composer-busy' : ''}`}><textarea disabled={!conversationId} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(e) } }} rows={1} placeholder={conversationId ? 'Share a thought, ask a question…' : 'Create a conversation first'} className="min-h-12 max-h-40 flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3.5 text-sm leading-6 text-white outline-none placeholder:text-white/25"/><div className="flex shrink-0 items-center gap-2 self-center pr-2"><button disabled={!conversationId || !input.trim()} aria-label="Send message" className="send-button">{busy ? <CircleNotch size={18} className="animate-spin" /> : <ArrowUp size={18} weight="bold" />}</button></div></div><p className="mt-2 text-center text-[10px] text-white/20">Your conversations are private and used only to make Memory Engine more useful.</p></div></form>
    </section>

    <aside className="sidebar-right hidden h-full w-[310px] shrink-0 overflow-hidden border-l border-white/[.07] bg-[#101115] px-5 py-6 xl:block"><div className="flex items-start justify-between"><div><p className="section-label">Long-term memory</p><h2 className="mt-2 text-lg font-medium tracking-[-.03em] text-white/85">What I remember</h2></div><div className="memory-count">{storeMemories.length}</div></div><p className="mt-2 text-xs leading-5 text-white/35">Shared across every conversation in this memory space.</p>{extracting && <div className="extracting-card mt-5"><div className="flex items-center gap-2"><CircleNotch size={15} className="animate-spin text-[#b8a4ff]" /><span className="text-xs font-medium text-white/75">Thinking about memory</span></div><p className="mt-2 text-[11px] leading-5 text-white/35">Finding facts and meaningful moments…</p><div className="progress-line mt-3" /></div>}<div className="mt-7 space-y-6 overflow-hidden">{(['factual', 'episodic'] as const).map((kind) => { const items = storeMemories.filter((memory) => memory.kind === kind); return <div key={kind}><div className="mb-3 flex items-center gap-2"><span className={`memory-kind-icon ${kind}`}><Brain size={14} weight="duotone" /></span><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-white/40">{kind}</p><span className="ml-auto text-[10px] text-white/25">{items.length}</span></div>{items.map((memory) => <div key={memory.id} className="memory-card group"><p className="text-xs leading-5 text-white/68">{memory.content}</p><div className="mt-3 flex items-center gap-2 text-[10px] text-white/25"><span>{Math.round(memory.confidence * 100)}% signal</span><span className="h-0.5 w-0.5 rounded-full bg-white/25" /><span>{formatDate(memory.created_at)}</span><button aria-label={`Delete memory: ${memory.content}`} onClick={() => deleteMemory(memory.id)} className="ml-auto opacity-0 transition group-hover:opacity-100 hover:text-white"><Trash size={14} /></button></div></div>)}</div>})}{!storeMemories.length && !extracting && <div className="memory-empty"><ClockCounterClockwise size={22} className="text-white/25" /><p className="mt-3 text-xs font-medium text-white/50">Your memory is still taking shape</p><p className="mt-1 text-[11px] leading-5 text-white/25">Keep chatting. Meaningful facts and moments will surface here.</p></div>}</div><div className="mt-8 border-t border-white/[.07] pt-4"><div className="flex items-center gap-2 text-[10px] text-white/25"><Check size={13} className="text-emerald-400" />Memory retrieval is active</div></div></aside>
  </main>
}
