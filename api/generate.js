const OpenAI = require('openai')
const { createClient } = require('@supabase/supabase-js')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function scrapeWebsite(url) {
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '169.254', '192.168', '10.', '172.16']
  if (blocked.some(b => url.includes(b))) throw new Error('Private URLs not allowed')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Aletheiahq Bot 1.0' },
    signal: AbortSignal.timeout(10000)
  })
  const html = await response.text()
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, url, businessName, campaignGoal, tone, userId, idea, platform, voice, content } = req.body

  // ── GHOSTWRITE ──
  if (action === 'ghostwrite') {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 800,
        messages: [{ role: 'user', content: `Write a ${platform} post for: "${idea}"\nTone: ${voice}\nFirst person. No fluff. High value. Include hashtags and a CTA.\nReturn post text only.` }]
      })
      return res.status(200).json({ post: completion.choices[0].message.content })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ── REPURPOSE ──
  if (action === 'repurpose') {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 2000,
        messages: [{ role: 'user', content: `Repurpose into 8 platform posts. Return JSON array: [{platform, hook, caption, hashtags:[]}]\nPlatforms: linkedin, instagram, x, tiktok, facebook, youtube_shorts, threads, google_business\nContent: "${content}"\nReturn ONLY JSON array.` }]
      })
      const text = completion.choices[0].message.content || '[]'
      const posts = JSON.parse(text.replace(/```json|```/g, '').trim())
      return res.status(200).json({ posts })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ── ANALYZE PROFILE ──
  if (action === 'analyze_profile') {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 1500,
        messages: [{ role: 'user', content: `Analyze ${platform} profile: ${url}\nReturn JSON: {"currentScore":65,"potentialScore":92,"headlineSuggestion":"...","aboutSuggestion":"...","keywords":[],"recommendations":[{"priority":"Critical","issue":"...","suggestion":"..."}]}` }]
      })
      const text = completion.choices[0].message.content || '{}'
      return res.status(200).json(JSON.parse(text.replace(/```json|```/g, '').trim()))
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // ── GENERATE 100+ POSTS FROM URL ──
  if (!url || !userId) return res.status(400).json({ error: 'URL and userId are required' })

  try {
    const websiteText = await scrapeWebsite(url)

    const analysisRes = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Analyze website and extract business intelligence. Return JSON only.\nURL: ${url}\nContent: ${websiteText.slice(0, 2000)}\nReturn: {"industry":"","targetAudience":"","services":[],"brandVoice":"","valueProposition":"","painPoints":[]}` }]
    })

    let bp = {}
    try { bp = JSON.parse((analysisRes.choices[0].message.content || '{}').replace(/```json|```/g, '').trim()) }
    catch { bp = { industry: 'Business', targetAudience: 'Professionals' } }

    const platforms = ['linkedin', 'instagram', 'facebook', 'x', 'tiktok', 'youtube_shorts', 'threads', 'google_business']
    const allPosts = []

    for (const plat of platforms) {
      const count = plat === 'linkedin' ? 18 : plat === 'instagram' ? 16 : 14
      try {
        const postsRes = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          max_tokens: 2000,
          messages: [{ role: 'user', content: `Generate ${count} unique ${plat} posts.\nBusiness: ${businessName || 'This business'}\nIndustry: ${bp.industry}\nAudience: ${bp.targetAudience}\nGoal: ${campaignGoal || 'Lead generation'}\nTone: ${tone || 'Professional'}\nReturn JSON array: [{"hook":"","caption":"","hashtags":[],"funnelStage":"awareness","category":"authority"}]\nReturn ONLY JSON array.` }]
        })
        const posts = JSON.parse((postsRes.choices[0].message.content || '[]').replace(/```json|```/g, '').trim())
        posts.forEach(p => allPosts.push({ ...p, platform: plat }))
      } catch {}
    }

    // Save to Supabase if we have a real user
    if (userId !== 'demo' && allPosts.length > 0) {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: campaign } = await db.from('campaigns').insert({
        project_id: null,
        campaign_name: `${businessName || url} — ${new Date().toLocaleDateString()}`,
        campaign_goal: campaignGoal,
        status: 'complete',
        total_posts: allPosts.length
      }).select().single()

      if (campaign) {
        await db.from('social_posts').insert(allPosts.map(p => ({
          campaign_id: campaign.id,
          platform: p.platform,
          hook: p.hook || '',
          caption: p.caption || '',
          hashtags: p.hashtags || [],
          funnel_stage: p.funnelStage || 'awareness',
          content_category: p.category || 'educational'
        })))
      }
    }

    return res.status(200).json({ success: true, postsGenerated: allPosts.length, businessProfile: bp, posts: allPosts })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
