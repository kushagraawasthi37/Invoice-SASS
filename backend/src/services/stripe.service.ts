import { stripe, PLANS } from '../config/stripe';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import type Stripe from 'stripe';

export const stripeService = {
  async getOrCreateCustomer(workspaceId: string, email: string, name: string): Promise<string> {
    if (!stripe) throw new AppError(503, 'Payment service unavailable');

    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });

    if (sub?.stripeCustomerId) return sub.stripeCustomerId;

    const customer = await stripe.customers.create({ email, name, metadata: { workspaceId } });

    await prisma.subscription.upsert({
      where: { workspaceId },
      update: { stripeCustomerId: customer.id },
      create: { workspaceId, stripeCustomerId: customer.id, plan: 'FREE', status: 'ACTIVE' },
    });

    return customer.id;
  },

  async createCheckoutSession(
    workspaceId: string,
    email: string,
    name: string,
    plan: 'PRO_MONTHLY' | 'PRO_YEARLY',
  ): Promise<string> {
    if (!stripe) throw new AppError(503, 'Payment service unavailable');

    const priceId = PLANS[plan].stripePriceId;
    if (!priceId) throw new AppError(500, 'Price ID not configured');

    const customerId = await this.getOrCreateCustomer(workspaceId, email, name);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.FRONTEND_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.FRONTEND_URL}/billing?canceled=true`,
      metadata: { workspaceId, plan },
      subscription_data: {
        trial_period_days: 0,
        metadata: { workspaceId, plan },
      },
    });

    return session.url!;
  },

  async createPortalSession(workspaceId: string): Promise<string> {
    if (!stripe) throw new AppError(503, 'Payment service unavailable');

    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!sub?.stripeCustomerId) throw new AppError(400, 'No billing account found');

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${env.FRONTEND_URL}/billing`,
    });

    return session.url;
  },

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      throw new AppError(400, 'Invalid webhook signature');
    }

    logger.info('Stripe webhook', { type: event.type });

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscription(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: 'CANCELED', plan: 'FREE' },
        });
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: inv.subscription as string },
            data: { status: 'PAST_DUE' },
          });
        }
        break;
      }
    }
  },
};

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId) return;

  const plan = (subscription.metadata?.plan as 'PRO_MONTHLY' | 'PRO_YEARLY') || 'PRO_MONTHLY';

  const statusMap: Record<string, string> = {
    active: 'ACTIVE',
    trialing: 'TRIALING',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'UNPAID',
  };

  await prisma.subscription.upsert({
    where: { workspaceId },
    update: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id,
      plan,
      status: (statusMap[subscription.status] || 'ACTIVE') as never,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      workspaceId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id,
      plan,
      status: (statusMap[subscription.status] || 'ACTIVE') as never,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}
