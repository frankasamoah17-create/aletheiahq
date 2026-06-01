import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function RootPage() {
  // Check if user is already logged in
  try {
    const supabase = createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      redirect('/dashboard')
    }
  } catch {}

  // Serve the main app
  redirect('/app')
}
