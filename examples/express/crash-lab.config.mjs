// Start your Express server first, then point target at it.
export default {
  target: 'http://localhost:3000/webhooks/stripe',
  secret: process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret',
  event: { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } },
};
