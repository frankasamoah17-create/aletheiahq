import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { readFileSync } from 'fs'
import { join } from 'path'

export default async function AppPage() {
  let session = null
  let userRole = 'user'

  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase.auth.getSession()
    session = data.session

    if (session) {
      const { createServiceSupabaseClient } = require('@/lib/supabase-server')
      const serviceClient = createServiceSupabaseClient()
      const { data: userData } = await serviceClient
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single()
      userRole = userData?.role || 'user'
    }
  } catch {}

  // Read the HTML file
  const htmlPath = join(process.cwd(), 'public', 'app.html')
  let html = readFileSync(htmlPath, 'utf8')

  // Inject real auth state into the page
  const authScript = `
<script>
  window.__ALETHEIAHQ_AUTH__ = {
    isLoggedIn: ${!!session},
    userId: "${session?.user?.id || ''}",
    email: "${session?.user?.email || ''}",
    role: "${userRole}",
    supabaseUrl: "${process.env.NEXT_PUBLIC_SUPABASE_URL}",
    supabaseAnonKey: "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}",
  };
</script>`

  // Replace the login function with real Supabase auth
  const realAuthScript = `
<script>
async function doLogin() {
  const em = document.getElementById('li-em').value.trim();
  const pw = document.getElementById('li-pw').value.trim();
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!em) { errEl.textContent = 'Please enter your email.'; errEl.style.display = 'block'; return; }
  if (!pw) { errEl.textContent = 'Please enter your password.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  btn.innerHTML = '<div style="width:13px;height:13px;border:1.5px solid rgba(0,0,0,0.3);border-top-color:#000;border-radius:50%;animation:spin 0.8s linear infinite"></div> Signing in\u2026';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email: em, password: pw })
    });
    const data = await res.json();

    if (data.error) {
      errEl.textContent = data.error === 'Invalid login credentials' ? 'Incorrect email or password.' : data.error;
      errEl.style.display = 'block';
      btn.innerHTML = '<i data-lucide="arrow-right" style="width:14px;height:14px"></i> Sign in';
      btn.disabled = false;
      lucide.createIcons();
      return;
    }

    const isAdmin = data.role === 'admin';
    goAppDirect(isAdmin, em);
  } catch (err) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = 'block';
    btn.innerHTML = '<i data-lucide="arrow-right" style="width:14px;height:14px"></i> Sign in';
    btn.disabled = false;
    lucide.createIcons();
  }
}

async function doRegister(email, password, fullName) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'signup', email, password, fullName })
  });
  return await res.json();
}

async function runRealPipeline(url, businessName, userId) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, businessName, userId, campaignGoal: 'Lead generation', tone: 'Professional and authoritative' })
  });
  return await res.json();
}
</script>`

  // Inject scripts before closing body
  html = html.replace('</body>', `${authScript}${realAuthScript}</body>`)

  // Auto-login if session exists
  if (session) {
    const autoLogin = `
<script>
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    const isAdmin = "${userRole}" === 'admin';
    goAppDirect(isAdmin, "${session.user.email}");
  }, 100);
});
</script>`
    html = html.replace('</body>', `${autoLogin}</body>`)
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  })
}
