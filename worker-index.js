const htmlResponse = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });

const jsonResponse = (data, status = 200, origin = '*') =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });

const unauthorized = () =>
  new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Luxtravco Admin"'
    }
  });

const parseBasicAuth = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  const encoded = authHeader.replace('Basic ', '').trim();
  try {
    const decoded = atob(encoded);
    const [user, pass] = decoded.split(':');
    return { user, pass };
  } catch (error) {
    return null;
  }
};

const sendSlack = async (env, message) => {
  const webhook = env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const payload = {
    text: message
  };

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    // Ignore Slack errors so booking still saves.
  }
};

const renderAdminPage = (rows) => {
  const tableRows = rows
    .map(
      (row) => {
        let stopsText = '';
        if (row.stops) {
          try {
            const parsed = JSON.parse(row.stops);
            stopsText = Array.isArray(parsed) ? parsed.join(', ') : row.stops;
          } catch (error) {
            stopsText = row.stops;
          }
        }
        return `
        <tr>
          <td>${row.id}</td>
          <td>${row.full_name}</td>
          <td>${row.pickup_date}</td>
          <td>${row.pickup_time || ''}</td>
          <td>${row.pickup_location}</td>
          <td>${row.dropoff_location}</td>
          <td>${stopsText}</td>
          <td>${row.travelers || ''}</td>
          <td>${row.kids || ''}</td>
          <td>${row.bags || ''}</td>
          <td>${row.contact_number || ''}</td>
          <td>${row.created_at}</td>
        </tr>
      `;
      }
    )
    .join('');

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luxtravco Admin</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0b0b0b; color: #f4ecd9; margin: 0; }
    header { padding: 20px 32px; border-bottom: 1px solid rgba(240,178,71,0.3); }
    h1 { margin: 0; font-size: 1.4rem; letter-spacing: 0.12em; text-transform: uppercase; }
    main { padding: 24px 32px; }
    .actions { display: flex; gap: 12px; margin: 16px 0; align-items: center; flex-wrap: wrap; }
    .warning { color: rgba(240,178,71,0.8); font-size: 0.8rem; letter-spacing: 0.08em; }
    .danger { background: transparent; border: 1px solid rgba(240,178,71,0.4); color: #f0b247; padding: 8px 14px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 10px 12px; border-bottom: 1px solid rgba(240,178,71,0.15); text-align: left; }
    th { color: #f0b247; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.7rem; }
    tr:hover { background: rgba(240,178,71,0.06); }
  </style>
</head>
<body>
  <header>
    <h1>Luxtravco Bookings</h1>
  </header>
  <main>
    <div class="actions">
      <button class="danger" id="download-bookings" type="button">Download CSV</button>
      <button class="danger" id="clear-bookings" type="button">Clear Bookings</button>
      <span class="warning">Warning: this permanently deletes all bookings.</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Date</th>
          <th>Time</th>
          <th>Pickup</th>
          <th>Dropoff</th>
          <th>Stops</th>
          <th>Travelers</th>
          <th>Kids</th>
          <th>Bags</th>
          <th>Contact</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="12">No bookings yet.</td></tr>'}
      </tbody>
    </table>
  </main>
  <script>
    const downloadButton = document.getElementById('download-bookings');
    if (downloadButton) {
      downloadButton.addEventListener('click', () => {
        window.location.href = '/admin/export';
      });
    }
    const clearButton = document.getElementById('clear-bookings');
    if (clearButton) {
      clearButton.addEventListener('click', async () => {
        const ok = confirm('This will delete all bookings. Continue?');
        if (!ok) return;
        const response = await fetch('/admin/clear', { method: 'POST', credentials: 'include' });
        if (response.ok) {
          window.location.reload();
        } else {
          alert('Failed to clear bookings.');
        }
      });
    }
  </script>
</body>
</html>
  `;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (url.pathname === '/admin' || url.pathname === '/admin/clear' || url.pathname === '/admin/export') {
      const auth = parseBasicAuth(request.headers.get('Authorization'));
      if (!auth || auth.user !== 'admin' || auth.pass !== env.ADMIN_PASSWORD) {
        return unauthorized();
      }
    }

    if (url.pathname === '/admin/export') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM bookings ORDER BY id DESC'
      ).all();
      const header = [
        'id',
        'full_name',
        'pickup_date',
        'pickup_time',
        'pickup_location',
        'dropoff_location',
        'stops',
        'travelers',
        'kids',
        'bags',
        'contact_number',
        'created_at'
      ];
      const rows = (results || []).map((row) =>
        header
          .map((key) => {
            const value = row[key] ?? '';
            const safe = String(value).replace(/\"/g, '\"\"');
            return `"${safe}"`;
          })
          .join(',')
      );
      const csv = [header.join(','), ...rows].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=\"luxtravco-bookings.csv\"'
        }
      });
    }

    if (url.pathname === '/admin/clear') {
      if (request.method !== 'POST') {
        return htmlResponse('Method not allowed', 405);
      }
      await env.DB.prepare('DELETE FROM bookings').run()
      const stopsText = stops
        ? Array.isArray(stops)
          ? stops.filter(Boolean).join(', ')
          : String(stops)
        : '';
      const slackMessage = [
        '*New booking request*',
        `Name: ${full_name}`,
        `Pickup date: ${pickup_date}`,
        `Pickup time: ${pickup_time || '—'}`,
        `Pickup: ${pickup_location}`,
        `Dropoff: ${dropoff_location}`,
        stopsText ? `Stops: ${stopsText}` : null,
        `Travelers: ${travelers || '—'}`,
        `Kids: ${kids || '—'}`,
        `Bags: ${bags || '—'}`,
        `Contact: ${contact_number || '—'}`
      ].filter(Boolean).join('\n');
      await sendSlack(env, slackMessage);
;
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (url.pathname === '/admin') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM bookings ORDER BY id DESC LIMIT 200'
      ).all();
      return htmlResponse(renderAdminPage(results || []));
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
    }

    const {
      full_name,
      pickup_date,
      pickup_time,
      pickup_location,
      dropoff_location,
      stops,
      travelers,
      kids,
      bags,
      contact_number
    } = payload || {};

    if (!full_name || !pickup_date || !pickup_location || !dropoff_location) {
      return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, origin);
    }

    const createdAt = new Date().toISOString();

    try {
      await env.DB.prepare(
        `INSERT INTO bookings (
          full_name,
          pickup_date,
          pickup_time,
          pickup_location,
          dropoff_location,
          stops,
          travelers,
          kids,
          bags,
          contact_number,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          full_name,
          pickup_date,
          pickup_time || '',
          pickup_location,
          dropoff_location,
          stops ? JSON.stringify(stops) : '',
          travelers || '',
          kids || '',
          bags || '',
          contact_number || '',
          createdAt
        )
        .run();
      const stopsText = stops
        ? Array.isArray(stops)
          ? stops.filter(Boolean).join(', ')
          : String(stops)
        : '';
      const slackMessage = [
        '*New booking request*',
        `Name: ${full_name}`,
        `Pickup date: ${pickup_date}`,
        `Pickup time: ${pickup_time || '—'}`,
        `Pickup: ${pickup_location}`,
        `Dropoff: ${dropoff_location}`,
        stopsText ? `Stops: ${stopsText}` : null,
        `Travelers: ${travelers || '—'}`,
        `Kids: ${kids || '—'}`,
        `Bags: ${bags || '—'}`,
        `Contact: ${contact_number || '—'}`
      ]
        .filter(Boolean)
        .join('\n');
      await sendSlack(env, slackMessage);
    } catch (error) {
      return jsonResponse({ ok: false, error: 'Database error' }, 500, origin);
    }

    return jsonResponse({ ok: true }, 200, origin);
  }
};
