const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { userId, sessionId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
    );

    // If sessionId provided, verify with Stripe
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log("Session status:", session.payment_status, "for user:", userId);
      
      if (session.payment_status === "paid" || session.status === "complete") {
        await supa.from("profiles").upsert({
          id: userId,
          is_pro: true,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        }, { onConflict: "id" });
        return res.status(200).json({ isPro: true });
      }
    }

    // Fallback: just check current DB status
    const { data } = await supa.from("profiles").select("is_pro").eq("id", userId).single();
    return res.status(200).json({ isPro: data?.is_pro || false });

  } catch (err) {
    console.error("Verify error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
