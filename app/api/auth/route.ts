import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const { action, email, password, fullName } = await request.json()
  const supabase = createServerSupabaseClient()

  if (action === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Create user record in public.users
    if (data.user) {
      const serviceClient = createServiceSupabaseClient()
      await serviceClient.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        full_name: fullName,
        role: email === 'info@asamoahgroup.com' ? 'admin' : 'user',
      })
    }
    return NextResponse.json({ user: data.user, session: data.session })
  }

  if (action === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return NextResponse.json({ error: error.message }, { status: 401 })

    // Get user role
    const serviceClient = createServiceSupabaseClient()
    const { data: userData } = await serviceClient
      .from('users')
      .select('role, full_name, subscription_status')
      .eq('id', data.user.id)
      .single()

    return NextResponse.json({
      user: data.user,
      session: data.session,
      role: userData?.role || 'user',
      fullName: userData?.full_name,
      subscriptionStatus: userData?.subscription_status,
    })
  }

  if (action === 'logout') {
    await supabase.auth.signOut()
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
