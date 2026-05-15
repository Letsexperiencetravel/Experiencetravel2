// api/ghl-sync.js
export const config = { runtime: 'nodejs', maxDuration: 20 };

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

const stageCache = {}; // Cache stage name→id lookups in memory

function headers(key) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
    'Version': GHL_VERSION,
  };
}

// Fetch all stages for the pipeline and cache them by name
async function getStageId(stageName, apiKey, locationId, pipelineId) {
  if (stageCache[stageName]) return stageCache[stageName];
  const res = await fetch(
    `${GHL_BASE}/opportunities/pipelines/${pipelineId}?locationId=${locationId}`,
    { headers: headers(apiKey) }
  );
  const data = await res.json();
  const stages = data?.pipeline?.stages || data?.stages || [];
  stages.forEach(s => { stageCache[s.name] = s.id; });
  return stageCache[stageName] || null;
}

// Find contact by email
async function findContact(email, apiKey, locationId) {
  const res = await fetch(
    `${GHL_BASE}/contacts/?email=${encodeURIComponent(email)}&locationId=${locationId}`,
    { headers: headers(apiKey) }
  );
  const data = await res.json();
  return data?.contacts?.[0] || null;
}

// Create contact
async function createContact(payload, apiKey) {
  const res = await fetch(`${GHL_BASE}/contacts/`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Update contact
async function updateContact(id, payload, apiKey) {
  const res = await fetch(`${GHL_BASE}/contacts/${id}`, {
    method: 'PUT',
    headers: headers(apiKey),
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Move contact to a pipeline stage by name
async function moveToStage(contactId, stageName, apiKey, locationId, pipelineId, label) {
  const stageId = await getStageId(stageName, apiKey, locationId, pipelineId);
  if (!stageId) {
    console.warn(`Stage "${stageName}" not found in pipeline`);
    return null;
  }
  // Check if opportunity already exists for this contact
  const searchRes = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${contactId}`,
    { headers: headers(apiKey) }
  );
  const searchData = await searchRes.json();
  const existing = searchData?.opportunities?.[0];

  if (existing) {
    // Update existing opportunity stage
    const res = await fetch(`${GHL_BASE}/opportunities/${existing.id}`, {
      method: 'PUT',
      headers: headers(apiKey),
      body: JSON.stringify({ pipelineStageId: stageId, status: 'open' }),
    });
    return res.json();
  } else {
    // Create new opportunity
    const res = await fetch(`${GHL_BASE}/opportunities/`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        locationId,
        pipelineId,
        pipelineStageId: stageId,
        contactId,
        name: label || 'Experience Travel Lead',
        status: 'open',
      }),
    });
    return res.json();
  }
}

// Map app events to your exact GHL stage names
const EVENT_TO_STAGE = {
  signup:         'Joined App',
  quiz_completed: 'Finished Quiz',
  got_results:    'Got First Result',
  book_call:      'Book A Call',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey      = process.env.GHL_API_KEY;
  const locationId  = process.env.GHL_LOCATION_ID;
  const pipelineId  = process.env.GHL_PIPELINE_ID;
  const calendarUrl = process.env.GHL_CALENDAR_URL || '';

  if (!apiKey || !locationId || !pipelineId) {
    return res.status(500).json({ error: 'GHL credentials not configured' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { event, email, firstName, lastName, phone, tripType, destinations } = body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  // Tags per event
  const tagMap = {
    signup:         ['experience-travel', 'signed-up'],
    quiz_completed: ['experience-travel', 'quiz-completed'],
    got_results:    ['experience-travel', 'got-results'],
    book_call:      ['experience-travel', 'book-call-requested', 'trigger-book-call-workflow'],
  };
  const tags = tagMap[event] || ['experience-travel'];

  // Custom fields populated from quiz data
  const customFields = [];
  if (tripType) customFields.push({ key: 'trip_type', field_value: tripType === 'lt' ? 'Long-Term Relocation' : 'Short-Term Travel' });
  if (destinations?.length) {
    customFields.push({ key: 'top_destination',   field_value: destinations[0]?.city || '' });
    customFields.push({ key: 'match_score',        field_value: String(destinations[0]?.score || '') });
    customFields.push({ key: 'all_destinations',   field_value: destinations.map(d=>`${d.city} (${d.score})`).join(', ') });
  }

  const contactPayload = {
    locationId,
    firstName: firstName || '',
    lastName:  lastName  || '',
    email,
    ...(phone ? { phone } : {}),
    tags,
    ...(customFields.length ? { customFields } : {}),
    source: 'Experience Travel App',
  };

  try {
    // Create or update contact
    const existing = await findContact(email, apiKey, locationId);
    let contactId;

    if (existing) {
      const mergedTags = [...new Set([...(existing.tags || []), ...tags])];
      await updateContact(existing.id, { ...contactPayload, tags: mergedTags }, apiKey);
      contactId = existing.id;
    } else {
      const created = await createContact(contactPayload, apiKey);
      contactId = created?.contact?.id || created?.id;
    }

    // Move through pipeline automatically
    const stageName = EVENT_TO_STAGE[event];
    if (stageName && contactId) {
      const label = `${firstName || email} — Experience Travel`;
      await moveToStage(contactId, stageName, apiKey, locationId, pipelineId, label);
    }

    console.log(`GHL sync [${event}] → stage "${stageName}":`, email);
    return res.status(200).json({
      success: true,
      contactId,
      event,
      stage: stageName,
      ...(event === 'book_call' && calendarUrl ? { calendarUrl } : {}),
    });

  } catch (err) {
    console.error('GHL sync error:', err);
    return res.status(500).json({ error: 'GHL sync failed', detail: err.message });
  }
}
