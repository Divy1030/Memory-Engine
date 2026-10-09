import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/insforge/server'
import Dashboard from '@/components/dashboard'

export default async function DashboardPage() {
  let userEmail = ''
  let initialStores: unknown[] = []
  let initialConversations: unknown[] = []
  let initialMemories: unknown[] = []
  try {
    const { client, user } = await requireUser()
    userEmail = user.email ?? ''
    const [stores, conversations, memories] = await Promise.all([
      client.database.from('stores').select('id, name, description, created_at').order('created_at', { ascending: true }).limit(50),
      client.database.from('conversations').select('id, store_id, title, model, created_at, updated_at').order('updated_at', { ascending: false }).limit(100),
      client.database.from('memories').select('id, store_id, kind, content, confidence, created_at, source_conversation_id').eq('status', 'active').order('created_at', { ascending: false }).limit(100),
    ])
    initialStores = stores.data ?? []
    initialConversations = conversations.data ?? []
    initialMemories = memories.data ?? []
  } catch { redirect('/login') }
  return <Dashboard userEmail={userEmail} initialStores={initialStores as never} initialConversations={initialConversations as never} initialMemories={initialMemories as never} />
}
