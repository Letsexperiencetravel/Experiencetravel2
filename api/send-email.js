// Send share notification emails using Resend API
// You need to add RESEND_API_KEY to Vercel environment variables
// Get a free key at resend.com (100 emails/day free)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { to, subject, html } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'Missing fields' });
  
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    // No email key configured - just log and return success
    console.log(`[Email not sent - no RESEND_API_KEY] To: ${to}, Subject: ${subject}`);
    return res.json({ ok: true, note: 'Email logging only - add RESEND_API_KEY to enable' });
  }
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify({
        from: 'Experience Travel <noreply@letsexperiencetravel.com>',
        to: [to],
        subject,
        html
      })
    });
    
    const data = await response.json();
    if (!response.ok) {
      console.error('Resend error:', data);
      return res.status(500).json({ error: data.message || 'Email failed' });
    }
    res.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('Send email exception:', err);
    res.status(500).json({ error: err.message });
  }
};
