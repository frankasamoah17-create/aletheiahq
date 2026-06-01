import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export const PLANS = {
  starter_monthly: {
    name: 'Starter',
    price: 29,
    interval: 'monthly',
    priceId: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    posts: 100,
    projects: 1,
  },
  starter_annual: {
    name: 'Starter',
    price: 261,
    interval: 'annual',
    priceId: process.env.STRIPE_PRICE_STARTER_ANNUAL!,
    posts: 100,
    projects: 1,
  },
  growth_monthly: {
    name: 'Growth',
    price: 79,
    interval: 'monthly',
    priceId: process.env.STRIPE_PRICE_GROWTH_MONTHLY!,
    posts: 500,
    projects: 5,
  },
  growth_annual: {
    name: 'Growth',
    price: 711,
    interval: 'annual',
    priceId: process.env.STRIPE_PRICE_GROWTH_ANNUAL!,
    posts: 500,
    projects: 5,
  },
  agency_monthly: {
    name: 'Agency',
    price: 199,
    interval: 'monthly',
    priceId: process.env.STRIPE_PRICE_AGENCY_MONTHLY!,
    posts: 2500,
    projects: 25,
  },
  agency_annual: {
    name: 'Agency',
    price: 1791,
    interval: 'annual',
    priceId: process.env.STRIPE_PRICE_AGENCY_ANNUAL!,
    posts: 2500,
    projects: 25,
  },
}
