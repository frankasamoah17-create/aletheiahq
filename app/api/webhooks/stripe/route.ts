import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  const supabase = createServiceSupabaseClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as any
      const userId = session.metadata?.userId
      const priceKey = session.metadata?.priceKey

      if (userId && session.subscription) {
        const planName = priceKey?.split('_')[0] || 'starter'
        const interval = priceKey?.includes('annual') ? 'annual' : 'monthly'

        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_subscription_id: session.subscription,
          plan_name: planName,
          billing_interval: interval,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + (interval === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString(),
          usage_limit: planName === 'agency' ? 2500 : planName === 'growth' ? 500 : 100,
        })

        await supabase.from('users')
          .update({ subscription_status: 'active' })
          .eq('id', userId)
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as any
      await supabase.from('subscriptions')
        .update({ status: sub.status })
        .eq('stripe_subscription_id', sub.id)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as any
      await supabase.from('subscriptions')
        .update({ status: 'canceled' })
        .eq('stripe_subscription_id', sub.id)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as any
      if (invoice.subscription) {
        await supabase.from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', invoice.subscription)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
