const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

// CRITICAL: Tell Vercel not to parse the body - Stripe needs raw bytes
export const config = { api: { bodyParser: false } };

const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    const rawBody = await getRawBody(req);
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // No webhook secret configured - parse manually (less secure but works)
      event = JSON.parse(rawBody.toString());
      console.warn("⚠️ No webhook secret - skipping signature verification");
    }
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("Webhook event:", event.type);

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    console.log("Payment completed. userId:", userId, "customer:", session.customer);

    if (userId) {
      const { error } = await supa.from("profiles").upsert({
        id: userId,
        is_pro: true,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      }, { onConflict: "id" });

      if (error) {
        console.error("Supabase update error:", error.message);
        return res.status(500).json({ error: error.message });
      }
      console.log("✅ User upgraded to Pro:", userId);
    } else {
      console.error("❌ No userId in session metadata");
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await supa.from("profiles")
      .update({ is_pro: false })
      .eq("stripe_subscription_id", sub.id);
    console.log("Subscription cancelled:", sub.id);
  }

  return res.status(200).json({ received: true });
};
