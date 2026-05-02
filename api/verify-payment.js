const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { userId, sessionId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  try {
    if (sessionId) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') {
        await supabase.from('profiles').update({
          is_pro: true,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription
        }).eq('id', userId);
        return res.json({ isPro: true });
      }
    }
    const { data } = await supabase.from('profiles').select('is_pro').eq('id', userId).single();
    res.json({ isPro: data?.is_pro || false });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: err.message });
  }
};
