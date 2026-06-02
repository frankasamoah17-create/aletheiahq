const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { action, email, password, fullName } = req.body

  if (action === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return res.status(401).json({ error: error.message })

    const { data: userData } = await supabase
      .from('users')
      .select('role, full_name')
      .eq('id', data.user.id)
      .single()

    return res.status(200).json({
      user: data.user,
      session: data.session,
      role: userData?.role || 'user',
      fullName: userData?.full_name
    })
  }

  if (action === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    })
    if (error) return res.status(400).json({ error: error.message })

    if (data.user) {
      await supabase.from('users').upsert({
        id: data.user.id,
        email: data.user.email,
        full_name: fullName,
        role: email === 'info@asamoahgroup.com' ? 'admin' : 'user'
      })
    }

    return res.status(200).json({ user: data.user, session: data.session })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
