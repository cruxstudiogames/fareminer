import { Router } from 'express';
import Stripe from 'stripe';
import { getUserCredits, addCredits, getCreditHistory, CREDITS_PER_PURCHASE, PRICE_USD_CENTS } from '../services/creditService.js';

export const creditsRouter = Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key);
}

// Get credit balance
creditsRouter.get('/balance', (req, res) => {
  const credits = getUserCredits(req.user!.id);
  res.json({ credits });
});

// Get credit history
creditsRouter.get('/history', (req, res) => {
  const history = getCreditHistory(req.user!.id);
  res.json({ history });
});

// Create Stripe checkout session
creditsRouter.post('/purchase', async (req, res) => {
  try {
    const stripe = getStripe();
    const isProd = process.env.NODE_ENV === 'production';
    const baseUrl = isProd
      ? `${req.protocol}://${req.get('host')}`
      : 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${CREDITS_PER_PURCHASE} Search Credits`,
            description: 'Credits for custom flight route searches',
          },
          unit_amount: PRICE_USD_CENTS,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}?credits=success`,
      cancel_url: `${baseUrl}?credits=cancel`,
      metadata: {
        userId: String(req.user!.id),
        credits: String(CREDITS_PER_PURCHASE),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Stripe webhook (called outside of requireAuth)
export function createWebhookHandler() {
  const router = Router();

  router.post('/api/credits/webhook', async (req, res) => {
    try {
      const stripe = getStripe();
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error('STRIPE_WEBHOOK_SECRET not set');
        res.status(500).json({ error: 'Webhook not configured' });
        return;
      }

      const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = Number(session.metadata?.userId);
        const credits = Number(session.metadata?.credits);

        if (userId && credits) {
          addCredits(userId, credits, session.id);
          console.log(`Added ${credits} credits to user ${userId} (session: ${session.id})`);
        }
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(400).json({ error: 'Webhook verification failed' });
    }
  });

  return router;
}
