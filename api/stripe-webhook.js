const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }
  
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    if (userId) {
      await supabase.from('profiles').update({ 
        is_pro: true,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription
      }).eq('id', userId);
    }
  }
  
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data } = await supabase.from('profiles')
      .select('id').eq('stripe_subscription_id', sub.id).single();
    if (data) {
      await supabase.from('profiles').update({ is_pro: false }).eq('id', data.id);
    }
  }
  
  res.json({ received: true });
};
