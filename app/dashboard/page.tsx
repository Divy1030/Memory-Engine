import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/insforge/server'
import Dashboard from '@/components/dashboard'

export default async function DashboardPage() {
  try {
    const { client, user } = await requireUser()
    const [stores, conversations, memories] = await Promise.all([
      client.database.from('stores').select('id, name, description, created_at').order('created_at', { ascending: true }).limit(50),
      client.database.from('conversations').select('id, store_id, title, model, created_at, updated_at').order('updated_at', { ascending: false }).limit(100),
      client.database.from('memories').select('id, store_id, kind, content, confidence, created_at, source_conversation_id').eq('status', 'active').order('created_at', { ascending: false }).limit(100),
    ])
    return <Dashboard userEmail={user.email ?? ''} initialStores={(stores.data ?? []) as never} initialConversations={(conversations.data ?? []) as never} initialMemories={(memories.data ?? []) as never} />
  } catch { redirect('/login') }
}
