import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function scrapeWebsite(url: string): Promise<string> {
  try {
    const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '169.254', '192.168', '10.', '172.']
    if (blocked.some(b => url.includes(b))) throw new Error('Private URLs are not allowed')

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Aletheiahq Content Bot 1.0' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await response.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
  } catch (error: any) {
    throw new Error(`Could not scan website: ${error.message}`)
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action } = body

  // ── GHOSTWRITE ──
  if (action === 'ghostwrite') {
    const { idea, platform, voice } = body
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Write a ${platform} post for this idea: "${idea}"
Voice/tone: ${voice}
Requirements: First person. No fluff. High value. Include relevant hashtags. Include a lead hook CTA at the end.
Return only the post text, nothing else.`
        }]
      })
      return NextResponse.json({ post: completion.choices[0].message.content })
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // ── REPURPOSE ──
  if (action === 'repurpose') {
    const { content: sourceContent } = body
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Repurpose this content into 8 platform-specific posts. Return a JSON array with objects: {platform, hook, caption, hashtags:[]}

Platforms: linkedin, instagram, x, tiktok, facebook, youtube_shorts, threads, google_business

Source content: "${sourceContent}"

Return ONLY the JSON array.`
        }]
      })
      const text = completion.choices[0].message.content || '[]'
      const posts = JSON.parse(text.replace(/```json|```/g, '').trim())
      return NextResponse.json({ posts })
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // ── PROFILE ANALYZE ──
  if (action === 'analyze_profile') {
    const { profileUrl, platform: profilePlatform } = body
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Analyze this ${profilePlatform} profile URL and provide optimization recommendations. Profile: ${profileUrl}

Return JSON: {
  "currentScore": 65,
  "potentialScore": 92,
  "headlineSuggestion": "...",
  "aboutSuggestion": "...",
  "keywords": ["keyword1","keyword2"],
  "recommendations": [
    {"priority":"Critical","issue":"...","suggestion":"..."},
    {"priority":"Important","issue":"...","suggestion":"..."}
  ]
}`
        }]
      })
      const text = completion.choices[0].message.content || '{}'
      const analysis = JSON.parse(text.replace(/```json|```/g, '').trim())
      return NextResponse.json(analysis)
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // ── GENERATE 100+ POSTS FROM URL ──
  const { url, businessName, campaignGoal, tone, userId, projectId } = body

  if (!url || !userId) {
    return NextResponse.json({ error: 'URL and userId are required' }, { status: 400 })
  }

  const supabase = createServiceSupabaseClient()

  try {
    const websiteText = await scrapeWebsite(url)

    const analysisResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analyze this website and extract business intelligence. Return JSON only.

URL: ${url}
Content: ${websiteText.slice(0, 3000)}

Return: {"industry":"","targetAudience":"","services":[],"brandVoice":"","valueProposition":"","painPoints":[]}`
      }]
    })

    let businessProfile: any = {}
    try {
      businessProfile = JSON.parse((analysisResponse.choices[0].message.content || '{}').replace(/```json|```/g, '').trim())
    } catch { businessProfile = { industry: 'Business', targetAudience: 'Professionals' } }

    const platforms = ['linkedin', 'instagram', 'facebook', 'x', 'tiktok', 'youtube_shorts', 'threads', 'google_business']
    const allPosts: any[] = []

    for (const platform of platforms) {
      const count = platform === 'linkedin' ? 18 : platform === 'instagram' ? 16 : 14

      const postsResponse = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Generate ${count} unique ${platform} posts for:
Business: ${businessName || 'This business'}
Industry: ${businessProfile.industry}
Audience: ${businessProfile.targetAudience}
Services: ${(businessProfile.services || []).join(', ')}
Goal: ${campaignGoal || 'Lead generation'}
Tone: ${tone || 'Professional and authoritative'}

Return JSON array: [{"hook":"","caption":"","hashtags":[],"callToAction":"","funnelStage":"awareness","category":"authority"}]
Return ONLY the JSON array.`
        }]
      })

      try {
        const posts = JSON.parse((postsResponse.choices[0].message.content || '[]').replace(/```json|```/g, '').trim())
        posts.forEach((p: any) => allPosts.push({ ...p, platform }))
      } catch {}
    }

    if (projectId && allPosts.length > 0) {
      await supabase.from('business_profiles').upsert({
        project_id: projectId,
        business_name: businessName || 'Business',
        industry: businessProfile.industry,
        services: businessProfile.services || [],
        target_audience: [businessProfile.targetAudience],
        brand_voice: businessProfile.brandVoice,
        value_proposition: businessProfile.valueProposition,
        pain_points: businessProfile.painPoints || [],
      })

      const { data: campaign } = await supabase.from('campaigns').insert({
        project_id: projectId,
        campaign_name: `${businessName} — ${new Date().toLocaleDateString()}`,
        campaign_goal: campaignGoal,
        status: 'complete',
        total_posts: allPosts.length,
      }).select().single()

      if (campaign) {
        await supabase.from('social_posts').insert(
          allPosts.map(p => ({
            campaign_id: campaign.id,
            platform: p.platform,
            hook: p.hook || 'Hook',
            caption: p.caption || '',
            hashtags: p.hashtags || [],
            call_to_action: p.callToAction || '',
            funnel_stage: p.funnelStage || 'awareness',
            content_category: p.category || 'educational',
          }))
        )
      }
    }

    return NextResponse.json({
      success: true,
      postsGenerated: allPosts.length,
      businessProfile,
      posts: allPosts,
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}


export async function POST(request: NextRequest) {
  const { url, businessName, campaignGoal, tone, userId, projectId } = await request.json()

  if (!url || !userId) {
    return NextResponse.json({ error: 'URL and userId are required' }, { status: 400 })
  }

  const supabase = createServiceSupabaseClient()

  try {
    // Step 1: Scan website
    const websiteText = await scrapeWebsite(url)

    // Step 2: Analyze business with OpenAI
    const analysisResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analyze this website content and extract: industry, target audience, key services/products, brand voice, main value proposition, and customer pain points. Return as JSON only.

Website: ${url}
Content: ${websiteText.slice(0, 3000)}

Return JSON: {"industry":"","targetAudience":"","services":[],"brandVoice":"","valueProposition":"","painPoints":[]}`
      }]
    })

    let businessProfile: any = {}
    try {
      const analysisText = analysisResponse.choices[0].message.content || '{}'
      businessProfile = JSON.parse(analysisText.replace(/```json|```/g, '').trim())
    } catch { businessProfile = { industry: 'Business', targetAudience: 'Professionals' } }

    // Step 3: Generate 100+ posts
    const platforms = ['linkedin', 'instagram', 'facebook', 'x', 'tiktok', 'youtube_shorts', 'threads', 'google_business']
    const allPosts: any[] = []

    for (const platform of platforms) {
      const count = platform === 'linkedin' ? 18 : platform === 'instagram' ? 16 : platform === 'tiktok' ? 14 : platform === 'x' ? 14 : platform === 'facebook' ? 12 : platform === 'youtube_shorts' ? 12 : platform === 'threads' ? 10 : 8

      const postsResponse = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `You are an expert social media strategist. Generate ${count} unique ${platform} posts for this business.

Business: ${businessName || 'This business'}
Industry: ${businessProfile.industry || 'Business'}
Audience: ${businessProfile.targetAudience || 'Professionals'}
Services: ${(businessProfile.services || []).join(', ')}
Value Prop: ${businessProfile.valueProposition || ''}
Goal: ${campaignGoal || 'Lead generation'}
Tone: ${tone || 'Professional and authoritative'}

For each post return JSON array:
[{"hook":"compelling opening","caption":"full post text","hashtags":["tag1","tag2"],"callToAction":"","funnelStage":"awareness|consideration|conversion","category":"authority|story|educational|lead_magnet"}]

Return ONLY the JSON array, no other text.`
        }]
      })

      try {
        const postsText = postsResponse.choices[0].message.content || '[]'
        const posts = JSON.parse(postsText.replace(/```json|```/g, '').trim())
        posts.forEach((p: any) => allPosts.push({ ...p, platform }))
      } catch { /* skip if parse fails */ }
    }

    // Step 4: Save to database
    if (projectId && allPosts.length > 0) {
      // Save business profile
      await supabase.from('business_profiles').upsert({
        project_id: projectId,
        business_name: businessName || 'Business',
        industry: businessProfile.industry,
        services: businessProfile.services || [],
        target_audience: [businessProfile.targetAudience],
        brand_voice: businessProfile.brandVoice,
        value_proposition: businessProfile.valueProposition,
        pain_points: businessProfile.painPoints || [],
      })

      // Create campaign
      const { data: campaign } = await supabase.from('campaigns').insert({
        project_id: projectId,
        campaign_name: `${businessName} — ${new Date().toLocaleDateString()}`,
        campaign_goal: campaignGoal,
        status: 'complete',
        total_posts: allPosts.length,
      }).select().single()

      // Save posts
      if (campaign) {
        const postsToInsert = allPosts.map(p => ({
          campaign_id: campaign.id,
          platform: p.platform,
          hook: p.hook || 'Compelling hook',
          caption: p.caption || '',
          hashtags: p.hashtags || [],
          call_to_action: p.callToAction || '',
          funnel_stage: p.funnelStage || 'awareness',
          content_category: p.category || 'educational',
        }))

        await supabase.from('social_posts').insert(postsToInsert)
      }
    }

    return NextResponse.json({
      success: true,
      postsGenerated: allPosts.length,
      businessProfile,
      posts: allPosts.slice(0, 20), // Return first 20 for preview
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
