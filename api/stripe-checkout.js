const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { plan, userId, email } = req.body;
  
  const priceId = plan === 'annual' 
    ? process.env.STRIPE_ANNUAL_PRICE_ID 
    : process.env.STRIPE_MONTHLY_PRICE_ID;
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${req.headers.origin || 'https://experiencetravel2.vercel.app'}/?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'https://experiencetravel2.vercel.app'}/?upgrade=cancelled`,
      customer_email: email,
      metadata: { userId, plan }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
