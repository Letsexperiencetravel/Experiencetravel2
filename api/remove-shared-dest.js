// api/remove-shared-dest.js
// Runs server-side with the Supabase service role key so it can delete
// another user's saved_destinations row (which RLS blocks from the client).

export const config = {
  runtime: 'nodejs',
  maxDuration: 15,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dttjiokwquspfffjjutv.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'Service role key not configured' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { recipientEmail, cityId, requestingUserId } = body;
  if (!recipientEmail || !cityId || !requestingUserId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Use the admin API (bypasses RLS)
  const adminHeaders = {
    'Content-Type': 'application/json',
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
  };

  try {
    // Step 1: Look up the recipient's user ID via Supabase auth admin API
    const userRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(recipientEmail)}`,
      { headers: adminHeaders }
    );
    const userData = await userRes.json();
    const recipientUser = userData?.users?.[0];

    if (!recipientUser?.id) {
      // User hasn't signed up yet — nothing to delete
      return res.status(200).json({ deleted: false, reason: 'User not found' });
    }

    const recipientId = recipientUser.id;

    // Step 2: Delete from saved_destinations using service role (bypasses RLS)
    const deleteRes = await fetch(
      `${supabaseUrl}/rest/v1/saved_destinations?user_id=eq.${recipientId}&city_id=eq.${encodeURIComponent(cityId)}`,
      { method: 'DELETE', headers: adminHeaders }
    );

    if (!deleteRes.ok) {
      const errText = await deleteRes.text();
      console.error('Delete failed:', errText);
      return res.status(500).json({ error: 'Delete failed', detail: errText });
    }

    console.log(`Removed ${cityId} from ${recipientEmail} (${recipientId})`);
    return res.status(200).json({ deleted: true, recipientId });

  } catch (err) {
    console.error('remove-shared-dest error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
