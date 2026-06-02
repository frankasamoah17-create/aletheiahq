const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end()

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` })
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata?.userId
    const priceKey = session.metadata?.priceKey

    if (userId && session.subscription) {
      const planName = priceKey?.split('_')[0] || 'starter'
      const interval = priceKey?.includes('annual') ? 'annual' : 'monthly'
      const limit = planName === 'agency' ? 2500 : planName === 'growth' ? 500 : 100

      await db.from('subscriptions').upsert({
        user_id: userId,
        stripe_subscription_id: session.subscription,
        plan_name: planName,
        billing_interval: interval,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + (interval === 'annual' ? 365 : 30) * 86400000).toISOString(),
        usage_limit: limit
      })
      await db.from('users').update({ subscription_status: 'active' }).eq('id', userId)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    await db.from('subscriptions').update({ status: 'canceled' }).eq('stripe_subscription_id', event.data.object.id)
  }

  res.status(200).json({ received: true })
}
