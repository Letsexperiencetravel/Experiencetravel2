const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;

    if (userId) {
      const supa = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
      await supa.from("profiles").update({
        is_pro: true,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      }).eq("id", userId);

      console.log("User upgraded to Pro:", userId);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    await supa.from("profiles")
      .update({ is_pro: false })
      .eq("stripe_subscription_id", sub.id);
    console.log("Subscription cancelled:", sub.id);
  }

  return res.status(200).json({ received: true });
};
