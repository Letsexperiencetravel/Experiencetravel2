const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { plan, userId, email } = req.body;

    // Price IDs for Experience Travel Pro
    const PRICES = {
      monthly: process.env.STRIPE_MONTHLY_PRICE_ID || "price_1TQcVrJMP7AN30LNE3qVchKc",
      annual:  process.env.STRIPE_ANNUAL_PRICE_ID  || "price_1TQcXlJMP7AN30LNsRmNvNgU",
    };

    const priceId = PRICES[plan] || PRICES.monthly;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId },
      success_url: "https://experiencetravel2.vercel.app?upgraded=true",
      cancel_url:  "https://experiencetravel2.vercel.app?upgrade=cancelled",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
