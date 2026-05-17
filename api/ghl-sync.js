// api/ghl-sync.js
// Sends data to GHL via webhook — no API key needed, no permissions issues.
// GHL automation handles pipeline moves, emails, SMS internally.

export const config = { runtime: 'nodejs', maxDuration: 15 };

const GHL_WEBHOOK = 'https://services.leadconnectorhq.com/hooks/CSPwezVfjEfKGz0nEkZf/webhook-trigger/7f9b1c9f-a077-49f7-9203-ae4b26a8da7d';
const CALENDAR_URL = 'https://api.leadconnectorhq.com/widget/booking/Dsc60Pg1wGwNSvKayKI9';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { event, email, firstName, lastName, phone, tripType, destinations } = body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  // Build payload for GHL webhook
  const payload = {
    event,
    email,
    firstName: firstName || '',
    lastName:  lastName  || '',
    phone:     phone     || '',
    tripType:  tripType === 'lt' ? 'Long-Term Relocation' : 'Short-Term Travel',
    topDestination:   destinations?.[0]?.city    || '',
    matchScore:       destinations?.[0]?.score   || '',
    allDestinations:  (destinations || []).map(d => `${d.city} (${d.score})`).join(', '),
    source: 'Experience Travel App',
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(GHL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    console.log(`GHL webhook [${event}]:`, email, '→', response.status, text);

    return res.status(200).json({
      success: true,
      event,
      status: response.status,
      ...(event === 'book_call' ? { calendarUrl: CALENDAR_URL } : {}),
    });

  } catch (err) {
    console.error('GHL webhook error:', err);
    return res.status(500).json({ error: 'Webhook failed', detail: err.message });
  }
}
