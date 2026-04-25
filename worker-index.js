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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });

const sendSlack = async (env, message) => {
  const webhook = env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
  } catch (error) {
    // Ignore Slack errors so booking still saves.
  }
};

const sendApprovalEmail = async (env, booking, checkoutUrl) => {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'Resend API key is not configured.' };
  }

  const to = String(booking.customer_email || '').trim();
  if (!to) {
    return { ok: false, error: 'Customer email is missing.' };
  }

  const total = formatCurrency(booking.estimated_total_cents || 0);
  const lines = [
    `Hello ${booking.full_name || 'there'},`,
    '',
    'Your Luxtravco booking has been approved for payment.',
    `Route: ${booking.pickup_location || '—'} -> ${booking.dropoff_location || '—'}`,
    `Pickup date: ${booking.pickup_date || '—'}`,
    `Pickup time: ${booking.pickup_time || '—'}`,
    `Service total: ${total}`,
    '',
    `Pay here: ${checkoutUrl}`,
    '',
    'If you have any questions, reply to this message or contact info@luxtravco.com.',
    '',
    'Luxtravco'
  ];

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'luxtravco-booking/1.0'
      },
      body: JSON.stringify({
        from: 'Luxtravco <info@luxtravco.com>',
        to,
        subject: 'Your Luxtravco booking is approved for payment',
        text: lines.join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2 style="margin:0 0 12px">Your Luxtravco booking is approved</h2>
            <p>Hello ${escapeHtml(booking.full_name || 'there')},</p>
            <p>Your booking has been reviewed and approved for payment.</p>
            <ul>
              <li><strong>Route:</strong> ${escapeHtml(booking.pickup_location || '—')} → ${escapeHtml(booking.dropoff_location || '—')}</li>
              <li><strong>Pickup date:</strong> ${escapeHtml(booking.pickup_date || '—')}</li>
              <li><strong>Pickup time:</strong> ${escapeHtml(booking.pickup_time || '—')}</li>
              <li><strong>Service total:</strong> ${escapeHtml(total)}</li>
            </ul>
            <p>
              <a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#f0b247;color:#111;text-decoration:none;font-weight:bold;">
                Pay Now
              </a>
            </p>
            <p>If you have any questions, reply to this email or contact info@luxtravco.com.</p>
          </div>
        `
      })
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: result?.message || 'Failed to send approval email.'
      };
    }

    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to send approval email.' };
  }
};

const SUPABASE_URL = 'https://vmphayezatepxjauxhcd.supabase.co';
const DEFAULT_HOURLY_RATE = 79;
const DEFAULT_ROUTE_PRICE = 149;
const DEFAULT_RETURN_ROUTE_PRICE = 149;
let bookingColumnsReady;
let pricingSettingsReady;
let supabaseJwksPromise;

const ensureBookingColumns = async (env) => {
  if (bookingColumnsReady) return bookingColumnsReady;

  bookingColumnsReady = (async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(bookings)').all();
    const columns = new Set((results || []).map((row) => row.name));
    const additions = [
      ['booking_mode', 'TEXT'],
      ['route_points', 'TEXT'],
      ['estimated_hours', 'TEXT'],
      ['estimated_total_cents', 'INTEGER'],
      ['payment_status', 'TEXT'],
      ['stripe_session_id', 'TEXT'],
      ['payment_url', 'TEXT'],
      ['customer_email', 'TEXT'],
      ['customer_user_id', 'TEXT']
    ];

    for (const [name, type] of additions) {
      if (!columns.has(name)) {
        await env.DB.prepare(`ALTER TABLE bookings ADD COLUMN ${name} ${type}`).run();
      }
    }
  })();

  return bookingColumnsReady;
};

let crmColumnsReady;
const ensureCrmTables = async (env) => {
  if (crmColumnsReady) return crmColumnsReady;

  crmColumnsReady = (async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS customer_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_key TEXT,
        customer_email TEXT,
        customer_user_id TEXT,
        full_name TEXT,
        phone TEXT,
        tags TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        last_booking_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run();

    const { results } = await env.DB.prepare('PRAGMA table_info(customer_profiles)').all();
    const columns = new Set((results || []).map((row) => row.name));
    if (!columns.has('customer_key')) {
      await env.DB.prepare(
        'ALTER TABLE customer_profiles ADD COLUMN customer_key TEXT'
      ).run();
    }

    await env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_customer_key ON customer_profiles(customer_key)'
    ).run();
  })();

  return crmColumnsReady;
};

const ensurePricingSettings = async (env) => {
  if (pricingSettingsReady) return pricingSettingsReady;

  pricingSettingsReady = (async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS pricing_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run();

    const now = new Date().toISOString();
    const defaults = [
      ['hourly_rate', String(DEFAULT_HOURLY_RATE)],
      ['route_price', String(DEFAULT_ROUTE_PRICE)],
      ['route_price_return', String(DEFAULT_RETURN_ROUTE_PRICE)]
    ];

    for (const [settingKey, settingValue] of defaults) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO pricing_settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, ?)`
      )
        .bind(settingKey, settingValue, now)
        .run();
    }
  })();

  return pricingSettingsReady;
};

const getPricingSettings = async (env) => {
  await ensurePricingSettings(env);
  const { results } = await env.DB.prepare(
    'SELECT setting_key, setting_value FROM pricing_settings'
  ).all();
  const map = new Map((results || []).map((row) => [row.setting_key, row.setting_value]));
  const hourlyRate = Number.parseFloat(map.get('hourly_rate') || `${DEFAULT_HOURLY_RATE}`);
  const routePrice = Number.parseFloat(map.get('route_price') || `${DEFAULT_ROUTE_PRICE}`);
  const routePriceReturn = Number.parseFloat(
    map.get('route_price_return') || `${DEFAULT_RETURN_ROUTE_PRICE}`
  );
  return {
    hourlyRate: Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE,
    routePrice: Number.isFinite(routePrice) && routePrice > 0 ? routePrice : DEFAULT_ROUTE_PRICE,
    routePriceReturn:
      Number.isFinite(routePriceReturn) && routePriceReturn > 0
        ? routePriceReturn
        : DEFAULT_RETURN_ROUTE_PRICE
  };
};

const setPricingSetting = async (env, settingKey, value) => {
  await ensurePricingSettings(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO pricing_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at = excluded.updated_at`
  )
    .bind(settingKey, String(value), now)
    .run();
};

const calcHourlyTotalCents = (hoursValue, hourlyRate = DEFAULT_HOURLY_RATE) => {
  const hours = Number.parseFloat(hoursValue);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return Math.round(hourlyRate * hours * 100);
};

const toRad = (value) => (value * Math.PI) / 180;

const haversineMiles = (a, b) => {
  if (!a || !b) return 0;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value =
    sinLat * sinLat +
    sinLng * sinLng * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusMiles * Math.asin(Math.min(1, Math.sqrt(value)));
};

const normalizeRoutePoints = (points) =>
  Array.isArray(points)
    ? points
        .map((point) => ({
          name: String(point?.name || ''),
          label: String(point?.label || ''),
          value: String(point?.value || ''),
          lat: Number.parseFloat(point?.lat),
          lng: Number.parseFloat(point?.lng)
        }))
        .filter((point) => point.value && Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];

const calculateRouteEstimateHours = (points) => {
  const routePoints = normalizeRoutePoints(points);
  if (routePoints.length < 2) return null;

  let miles = 0;
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    miles += haversineMiles(routePoints[index], routePoints[index + 1]);
  }

  const stopCount = Math.max(0, routePoints.length - 2);
  const drivingMinutes = (miles / 28) * 60 * 1.28;
  const totalMinutes = drivingMinutes + 18 + stopCount * 8;
  return Math.max(0.25, totalMinutes / 60);
};

const base64UrlToBytes = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const decodeJwtPart = (part) => JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));

const getSupabaseJwks = async () => {
  if (!supabaseJwksPromise) {
    supabaseJwksPromise = fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`).then(
      async (response) => {
        if (!response.ok) {
          throw new Error('Unable to load Supabase JWKS');
        }
        return response.json();
      }
    );
  }
  return supabaseJwksPromise;
};

const verifySupabaseAccessToken = async (token) => {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  const jwks = await getSupabaseJwks();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signature = base64UrlToBytes(parts[2]);
  const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedContent);
  if (!ok) return null;

  return payload;
};

const createStripeCheckoutSession = async (env, params) => {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, error: 'Stripe is not configured yet.' };
  }

  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', params.successUrl);
  body.set('cancel_url', params.cancelUrl);
  body.set('client_reference_id', String(params.clientReferenceId));
  if (params.customerEmail) {
    body.set('customer_email', params.customerEmail);
  }
  body.set('line_items[0][quantity]', '1');
  body.set('line_items[0][price_data][currency]', 'usd');
  body.set('line_items[0][price_data][unit_amount]', String(params.amountCents));
  body.set(
    'line_items[0][price_data][product_data][name]',
    params.productName
  );
  body.set(
    'line_items[0][price_data][product_data][description]',
    params.description
  );

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      error: `Stripe request failed: ${errorText}`
    };
  }

  const data = await response.json();
  return {
    ok: true,
    id: data.id,
    url: data.url
  };
};

const parseStopsText = (stops) => {
  if (!stops) return '';
  if (Array.isArray(stops)) {
    return stops.filter(Boolean).join(', ');
  }

  if (typeof stops === 'string') {
    try {
      const parsed = JSON.parse(stops);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).join(', ');
      }
    } catch (error) {
      return stops;
    }
    return stops;
  }

  return String(stops);
};

const formatCurrency = (cents) => {
  const value = Number(cents || 0);
  return value ? `$${(value / 100).toFixed(2)}` : '—';
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

const customerKeyFromBooking = (booking) => {
  if (booking.customer_email) {
    return `email:${String(booking.customer_email).toLowerCase()}`;
  }
  const digits = normalizeDigits(booking.contact_number);
  if (digits) return `phone:${digits}`;
  return '';
};

const ensureCustomerProfile = async (env, booking) => {
  await ensureCrmTables(env);
  const customerKey = customerKeyFromBooking(booking);
  if (!customerKey) return;

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO customer_profiles (
      customer_key,
      customer_email,
      customer_user_id,
      full_name,
      phone,
      tags,
      notes,
      status,
      last_booking_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_key) DO UPDATE SET
      customer_email = excluded.customer_email,
      customer_user_id = excluded.customer_user_id,
      full_name = COALESCE(NULLIF(excluded.full_name, ''), customer_profiles.full_name),
      phone = COALESCE(NULLIF(excluded.phone, ''), customer_profiles.phone),
      last_booking_at = excluded.last_booking_at,
      updated_at = excluded.updated_at`
  )
    .bind(
      customerKey,
      booking.customer_email || '',
      booking.customer_user_id || '',
      booking.full_name || '',
      booking.contact_number || '',
      '',
      '',
      'active',
      booking.created_at || now,
      now,
      now
    )
    .run();
};

const buildCustomerCrm = (bookings, profiles) => {
  const profileMap = new Map();
  (profiles || []).forEach((profile) => {
    if (profile?.customer_key) {
      profileMap.set(profile.customer_key, profile);
    }
  });

  const customerMap = new Map();
  (bookings || []).forEach((booking) => {
    const key = customerKeyFromBooking(booking);
    if (!key) return;

    const existing = customerMap.get(key) || {
      customer_key: key,
      customer_email: booking.customer_email || '',
      customer_user_id: booking.customer_user_id || '',
      full_name: booking.full_name || '',
      phone: booking.contact_number || '',
      tags: '',
      notes: '',
      status: 'active',
      last_booking_at: booking.created_at || '',
      bookings_count: 0,
      revenue_cents: 0,
      recent_bookings: []
    };

    const profile = profileMap.get(key);
    if (profile) {
      existing.customer_email = profile.customer_email || existing.customer_email;
      existing.customer_user_id = profile.customer_user_id || existing.customer_user_id;
      existing.full_name = profile.full_name || existing.full_name;
      existing.phone = profile.phone || existing.phone;
      existing.tags = profile.tags || existing.tags;
      existing.notes = profile.notes || existing.notes;
      existing.status = profile.status || existing.status;
      existing.last_booking_at = profile.last_booking_at || existing.last_booking_at;
    }

    existing.bookings_count += 1;
    existing.revenue_cents += Number(booking.estimated_total_cents || 0);
    existing.last_booking_at = booking.created_at || existing.last_booking_at;
    existing.recent_bookings.push(booking);
    customerMap.set(key, existing);
  });

  return Array.from(customerMap.values())
    .sort((a, b) => String(b.last_booking_at).localeCompare(String(a.last_booking_at)));
};

const safeJson = (value) =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const renderCrmPage = (bookings, profiles) => {
  const customers = buildCustomerCrm(bookings, profiles);
  const stats = {
    customers: customers.length,
    bookings: bookings.length,
    repeat: customers.filter((customer) => customer.bookings_count > 1).length,
    revenue: customers.reduce((sum, customer) => sum + Number(customer.revenue_cents || 0), 0),
    active: customers.filter((customer) => String(customer.status || 'active').toLowerCase() !== 'inactive').length
  };
  const initialCustomer = customers[0] || null;

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luxtravco CRM</title>
  <style>
    :root {
      --bg: #070707;
      --panel: rgba(18, 16, 10, 0.92);
      --panel-2: rgba(255, 255, 255, 0.03);
      --line: rgba(240, 178, 71, 0.18);
      --line-strong: rgba(240, 178, 71, 0.38);
      --gold: #f0b247;
      --gold-soft: rgba(240, 178, 71, 0.15);
      --text: #f7f5f2;
      --muted: rgba(247, 245, 242, 0.62);
      --deep: #111;
      --success: #6bd18f;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: radial-gradient(circle at top, rgba(240,178,71,0.08), transparent 34%), var(--bg); color: var(--text); }
    .crm-shell { min-height: 100vh; }
    header { padding: 18px 28px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, rgba(8,8,8,0.98), rgba(8,8,8,0.88)); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(14px); }
    .topline { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.68rem; color: var(--gold); }
    h1 { margin: 6px 0 0; font-size: clamp(1.5rem, 2vw, 2.2rem); letter-spacing: 0.06em; text-transform: uppercase; }
    .subcopy { margin: 0; color: var(--muted); font-size: 0.92rem; max-width: 900px; }
    .header-links { display: flex; gap: 10px; flex-wrap: wrap; }
    .ghost-link, .primary-link, .danger-link, .ghost-btn { text-decoration: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 10px 14px; letter-spacing: 0.1em; text-transform: uppercase; font-size: 0.68rem; cursor: pointer; border: 1px solid var(--line); color: var(--text); background: rgba(255,255,255,0.02); }
    .primary-link { background: var(--gold); color: #140f06; border-color: var(--gold); }
    .danger-link { color: var(--gold); border-color: var(--line-strong); }
    main { padding: 22px 28px 32px; display: grid; gap: 18px; }
    .metric-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    .metric { padding: 16px; border-radius: 18px; background: linear-gradient(180deg, rgba(240,178,71,0.08), rgba(255,255,255,0.02)); border: 1px solid var(--line); box-shadow: 0 20px 40px rgba(0,0,0,0.22); }
    .metric span { display: block; font-size: 0.67rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
    .metric strong { display: block; margin-top: 8px; font-size: 1.3rem; color: var(--gold); }
    .crm-grid { display: grid; grid-template-columns: 1.35fr 0.85fr; gap: 18px; align-items: start; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.34); }
    .panel-head { padding: 18px 20px; border-bottom: 1px solid var(--line); display: flex; gap: 14px; justify-content: space-between; align-items: center; flex-wrap: wrap; background: rgba(255,255,255,0.015); }
    .panel-head h2 { margin: 0; font-size: 0.98rem; text-transform: uppercase; letter-spacing: 0.14em; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .toolbar input, .toolbar select, .detail-form input, .detail-form textarea, .detail-form select {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(240,178,71,0.18);
      color: var(--text);
      border-radius: 12px;
      padding: 11px 12px;
      outline: none;
      width: 100%;
    }
    .toolbar input { min-width: 240px; }
    .crm-list { display: grid; gap: 12px; padding: 18px; }
    .customer-card {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      background: rgba(255,255,255,0.025);
      cursor: pointer;
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }
    .customer-card:hover, .customer-card.active { transform: translateY(-1px); border-color: var(--line-strong); background: rgba(240,178,71,0.06); }
    .customer-card .row { display:flex; justify-content:space-between; gap: 12px; align-items: flex-start; }
    .customer-card strong { display:block; font-size: 1rem; color: var(--text); }
    .customer-card small { color: var(--muted); display:block; }
    .pill-row { display:flex; flex-wrap:wrap; gap:8px; margin-top: 10px; }
    .pill { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.12em; padding: 5px 8px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(240,178,71,0.16); color: var(--muted); }
    .pill.gold { color: var(--gold); background: rgba(240,178,71,0.08); border-color: rgba(240,178,71,0.28); }
    .detail { padding: 18px; display: grid; gap: 14px; }
    .detail-hero {
      padding: 18px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(240,178,71,0.08), rgba(255,255,255,0.03));
    }
    .detail-hero h3 { margin: 0 0 8px; font-size: 1.4rem; }
    .detail-meta { display:grid; gap: 6px; color: var(--muted); font-size: 0.92rem; }
    .detail-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .detail-box { padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(240,178,71,0.14); }
    .detail-box span { display:block; font-size: 0.66rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
    .detail-box strong { display:block; margin-top: 6px; color: var(--gold); font-size: 1rem; }
    .detail-form { display:grid; gap: 12px; }
    .detail-form label { display:grid; gap: 6px; color: var(--muted); font-size: 0.86rem; }
    .detail-form textarea { min-height: 120px; resize: vertical; }
    .detail-actions { display:flex; gap: 10px; flex-wrap: wrap; align-items:center; }
    .booking-feed { display:grid; gap: 10px; }
    .booking-chip { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(240,178,71,0.12); }
    .booking-chip strong { display:block; color: var(--text); }
    .booking-chip span { display:block; color: var(--muted); font-size: 0.84rem; line-height: 1.5; }
    .empty-state { padding: 24px; color: var(--muted); text-align:center; }
    @media (max-width: 1100px) {
      .metric-grid, .crm-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="crm-shell">
    <header>
      <div class="topline">
        <div>
          <span class="eyebrow">Customer CRM</span>
          <h1>Luxtravco client dashboard</h1>
          <p class="subcopy">Search customer records, manage notes and tags, review booking history, and export the ledger. This is separate from the public site and the booking admin page.</p>
        </div>
        <div class="header-links">
          <a class="ghost-link" href="/admin">Bookings Admin</a>
          <a class="ghost-link" href="/">Public Site</a>
          <a class="primary-link" href="/crm/export">Export CRM</a>
        </div>
      </div>
    </header>

    <main>
      <section class="metric-grid">
        <div class="metric"><span>Customers</span><strong>${escapeHtml(stats.customers)}</strong></div>
        <div class="metric"><span>Bookings</span><strong>${escapeHtml(stats.bookings)}</strong></div>
        <div class="metric"><span>Repeat Clients</span><strong>${escapeHtml(stats.repeat)}</strong></div>
        <div class="metric"><span>Active Profiles</span><strong>${escapeHtml(stats.active)}</strong></div>
        <div class="metric"><span>Revenue Estimate</span><strong>${formatCurrency(stats.revenue)}</strong></div>
      </section>

      <section class="crm-grid">
        <div class="panel">
          <div class="panel-head">
            <div>
              <h2>Customer Directory</h2>
              <div class="subcopy">Click a customer to load notes, tags, and their recent bookings.</div>
            </div>
            <div class="toolbar">
              <input id="crm-search" type="search" placeholder="Search name, email, phone, notes, tags" />
              <select id="crm-status-filter">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div class="crm-list" id="crm-list">
            ${
              customers.length
                ? customers
                    .map((customer, index) => {
                      const primaryTag = (customer.tags || '').split(',').map((item) => item.trim()).filter(Boolean)[0] || 'No tags';
                      return `
                        <article
                          class="customer-card${index === 0 ? ' active' : ''}"
                          data-customer-card
                          data-key="${escapeHtml(customer.customer_key)}"
                          data-status="${escapeHtml(customer.status || 'active').toLowerCase()}"
                          data-search="${escapeHtml(
                            [
                              customer.full_name,
                              customer.customer_email,
                              customer.phone,
                              customer.tags,
                              customer.notes,
                              customer.status
                            ]
                              .join(' ')
                              .toLowerCase()
                          )}"
                        >
                          <div class="row">
                            <div>
                              <strong>${escapeHtml(customer.full_name || 'Unnamed customer')}</strong>
                              <small>${escapeHtml(customer.customer_email || customer.phone || 'No contact info')}</small>
                            </div>
                            <div>
                              <span class="pill gold">${escapeHtml(customer.status || 'active')}</span>
                            </div>
                          </div>
                          <div class="pill-row">
                            <span class="pill">${escapeHtml(customer.bookings_count)} bookings</span>
                            <span class="pill">${formatCurrency(customer.revenue_cents)}</span>
                            <span class="pill">${escapeHtml(primaryTag)}</span>
                          </div>
                        </article>
                      `;
                    })
                    .join('')
                : '<div class="empty-state">No customer profiles yet. Bookings will populate this automatically.</div>'
            }
          </div>
        </div>

        <aside class="panel">
          <div class="panel-head">
            <div>
              <h2>Selected Customer</h2>
              <div class="subcopy">Edit notes, tags, and status without leaving the CRM.</div>
            </div>
          </div>
          <div class="detail">
            <div class="detail-hero" id="crm-detail-hero">
              <h3 id="crm-detail-name">${escapeHtml(initialCustomer?.full_name || 'Select a customer')}</h3>
              <div class="detail-meta" id="crm-detail-meta">
                <span>${escapeHtml(initialCustomer?.customer_email || initialCustomer?.phone || 'No contact details')}</span>
                <span>${escapeHtml(initialCustomer?.bookings_count || 0)} bookings • ${formatCurrency(initialCustomer?.revenue_cents || 0)}</span>
                <span>Last booking: ${escapeHtml(formatDateTime(initialCustomer?.last_booking_at || ''))}</span>
              </div>
            </div>

            <div class="detail-grid">
              <div class="detail-box"><span>Status</span><strong id="crm-detail-status">${escapeHtml(initialCustomer?.status || 'active')}</strong></div>
              <div class="detail-box"><span>Customer Key</span><strong id="crm-detail-key">${escapeHtml(initialCustomer?.customer_key || '—')}</strong></div>
              <div class="detail-box"><span>Email</span><strong id="crm-detail-email">${escapeHtml(initialCustomer?.customer_email || '—')}</strong></div>
              <div class="detail-box"><span>Phone</span><strong id="crm-detail-phone">${escapeHtml(initialCustomer?.phone || '—')}</strong></div>
            </div>

            <form class="detail-form" id="crm-detail-form">
              <input type="hidden" name="customer_key" id="crm-form-key" value="${escapeHtml(initialCustomer?.customer_key || '')}" />
              <label>
                Full Name
                <input type="text" name="full_name" id="crm-form-name" value="${escapeHtml(initialCustomer?.full_name || '')}" />
              </label>
              <label>
                Phone
                <input type="text" name="phone" id="crm-form-phone" value="${escapeHtml(initialCustomer?.phone || '')}" />
              </label>
              <label>
                Tags
                <input type="text" name="tags" id="crm-form-tags" value="${escapeHtml(initialCustomer?.tags || '')}" placeholder="VIP, airport, repeat" />
              </label>
              <label>
                Status
                <select name="status" id="crm-form-status">
                  <option value="active"${String(initialCustomer?.status || 'active').toLowerCase() === 'active' ? ' selected' : ''}>Active</option>
                  <option value="vip"${String(initialCustomer?.status || '').toLowerCase() === 'vip' ? ' selected' : ''}>VIP</option>
                  <option value="inactive"${String(initialCustomer?.status || '').toLowerCase() === 'inactive' ? ' selected' : ''}>Inactive</option>
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" id="crm-form-notes" placeholder="Special instructions, service notes, billing remarks...">${escapeHtml(initialCustomer?.notes || '')}</textarea>
              </label>
              <div class="detail-actions">
                <button class="primary-link" type="submit">Save Profile</button>
                <a class="danger-link" href="/crm/export">Download CSV</a>
              </div>
            </form>

            <div>
              <div class="panel-head" style="padding: 0 0 12px; border: 0;">
                <div>
                  <h2 style="margin:0;">Recent Bookings</h2>
                  <div class="subcopy">Most recent trips for the selected customer.</div>
                </div>
              </div>
              <div class="booking-feed" id="crm-booking-feed">
                ${
                  initialCustomer?.recent_bookings?.length
                    ? initialCustomer.recent_bookings.slice(0, 6).map((booking) => `
                        <div class="booking-chip">
                          <strong>${escapeHtml(booking.pickup_date || '—')} • ${escapeHtml(booking.pickup_location || '')} → ${escapeHtml(booking.dropoff_location || '')}</strong>
                          <span>${escapeHtml(booking.booking_mode || 'transfer')} • ${escapeHtml(booking.pickup_time || '—')} • ${escapeHtml(formatDateTime(booking.created_at || ''))}</span>
                          <span>${escapeHtml(booking.stops ? parseStopsText(booking.stops) : 'No stops')} • ${escapeHtml(booking.payment_status || 'inquiry')} • ${formatCurrency(booking.estimated_total_cents || 0)}</span>
                        </div>
                      `).join('')
                    : '<div class="empty-state">No recent bookings available for this profile.</div>'
                }
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  </div>

  <script>
    window.__LUX_CRM__ = ${safeJson({ customers })};
  </script>
  <script>
    const crmList = document.getElementById('crm-list');
    const crmSearch = document.getElementById('crm-search');
    const crmStatusFilter = document.getElementById('crm-status-filter');
    const detailForm = document.getElementById('crm-detail-form');
    const detailName = document.getElementById('crm-detail-name');
    const detailMeta = document.getElementById('crm-detail-meta');
    const detailStatus = document.getElementById('crm-detail-status');
    const detailKey = document.getElementById('crm-detail-key');
    const detailEmail = document.getElementById('crm-detail-email');
    const detailPhone = document.getElementById('crm-detail-phone');
    const formKey = document.getElementById('crm-form-key');
    const formName = document.getElementById('crm-form-name');
    const formPhone = document.getElementById('crm-form-phone');
    const formTags = document.getElementById('crm-form-tags');
    const formStatus = document.getElementById('crm-form-status');
    const formNotes = document.getElementById('crm-form-notes');
    const bookingFeed = document.getElementById('crm-booking-feed');
    const cards = Array.from(document.querySelectorAll('[data-customer-card]'));
    const customers = (window.__LUX_CRM__ && Array.isArray(window.__LUX_CRM__.customers))
      ? window.__LUX_CRM__.customers
      : [];

    let selectedKey = ${initialCustomer ? JSON.stringify(initialCustomer.customer_key) : 'null'};

    const formatMoney = (cents) => {
      const value = Number(cents || 0);
      return value ? '$' + (value / 100).toFixed(2) : '$0.00';
    };

    const formatDateTime = (value) => {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    };

    const parseStops = (value) => {
      if (!value) return 'No stops';
      if (Array.isArray(value)) return value.filter(Boolean).join(', ') || 'No stops';
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed.filter(Boolean).join(', ') || 'No stops';
        } catch (error) {
          return value;
        }
      }
      return String(value);
    };

    const escapeText = (value) => String(value ?? '');

    const renderBookingFeed = (bookings) => {
      if (!bookings || !bookings.length) {
        bookingFeed.innerHTML = '<div class="empty-state">No recent bookings available for this profile.</div>';
        return;
      }

      bookingFeed.innerHTML = bookings.slice(0, 6).map((booking) => {
        return \`
          <div class="booking-chip">
            <strong>\${escapeText(booking.pickup_date || '—')} • \${escapeText(booking.pickup_location || '')} → \${escapeText(booking.dropoff_location || '')}</strong>
            <span>\${escapeText(booking.booking_mode || 'transfer')} • \${escapeText(booking.pickup_time || '—')} • \${escapeText(formatDateTime(booking.created_at || ''))}</span>
            <span>\${escapeText(parseStops(booking.stops))} • \${escapeText(booking.payment_status || 'inquiry')} • \${formatMoney(booking.estimated_total_cents || 0)}</span>
          </div>
        \`;
      }).join('');
    };

    const applyFilter = () => {
      const search = (crmSearch?.value || '').trim().toLowerCase();
      const status = (crmStatusFilter?.value || 'all').toLowerCase();

      cards.forEach((card) => {
        const matchesSearch = !search || (card.dataset.search || '').includes(search);
        const matchesStatus = status === 'all' || (card.dataset.status || '') === status;
        card.style.display = matchesSearch && matchesStatus ? '' : 'none';
      });
    };

    const setActiveCard = (card) => {
      cards.forEach((item) => item.classList.remove('active'));
      card.classList.add('active');
      selectedKey = card.dataset.key || '';
      const customer = customers.find((item) => item.customer_key === selectedKey);
      if (!customer) return;

      detailName.textContent = customer.full_name || 'Unnamed customer';
      detailMeta.innerHTML = \`
        <span>\${escapeText(customer.customer_email || customer.phone || 'No contact details')}</span>
        <span>\${escapeText(customer.bookings_count || 0)} bookings • \${formatMoney(customer.revenue_cents || 0)}</span>
        <span>Last booking: \${escapeText(formatDateTime(customer.last_booking_at || ''))}</span>
      \`;
      detailStatus.textContent = customer.status || 'active';
      detailKey.textContent = customer.customer_key || '—';
      detailEmail.textContent = customer.customer_email || '—';
      detailPhone.textContent = customer.phone || '—';
      formKey.value = customer.customer_key || '';
      formName.value = customer.full_name || '';
      formPhone.value = customer.phone || '';
      formTags.value = customer.tags || '';
      formStatus.value = customer.status || 'active';
      formNotes.value = customer.notes || '';
      renderBookingFeed(customer.recent_bookings || []);
    };

    cards.forEach((card) => {
      card.addEventListener('click', () => setActiveCard(card));
    });

    crmSearch?.addEventListener('input', applyFilter);
    crmStatusFilter?.addEventListener('change', applyFilter);

    detailForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        customer_key: formKey.value.trim(),
        full_name: formName.value.trim(),
        phone: formPhone.value.trim(),
        tags: formTags.value.trim(),
        status: formStatus.value,
        notes: formNotes.value.trim()
      };

      if (!payload.customer_key) {
        alert('Select a customer first.');
        return;
      }

      const submitButton = detailForm.querySelector('button[type="submit"]');
      const originalText = submitButton?.textContent || 'Save Profile';
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';
      }

      try {
        const response = await fetch('/crm/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data?.error || 'Unable to save profile.');
        }

        if (data.customer) {
          const card = cards.find((item) => item.dataset.key === data.customer.customer_key);
          if (card) {
            card.dataset.status = data.customer.status || 'active';
            card.dataset.search = [
              data.customer.full_name,
              data.customer.customer_email,
              data.customer.phone,
              data.customer.tags,
              data.customer.notes,
              data.customer.status
            ].join(' ').toLowerCase();
            card.querySelector('strong') && (card.querySelector('strong').textContent = data.customer.full_name || 'Unnamed customer');
            const statusPill = card.querySelector('.pill.gold');
            if (statusPill) statusPill.textContent = data.customer.status || 'active';
          }
          detailStatus.textContent = data.customer.status || 'active';
        }

        alert('Customer profile saved.');
      } catch (error) {
        alert(error?.message || 'Unable to save profile.');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
      }
    });

    if (cards.length) {
      const active = cards.find((card) => card.classList.contains('active')) || cards[0];
      setActiveCard(active);
      applyFilter();
    }
  </script>
</body>
</html>
  `;
};

const renderAdminPage = (rows, pricing = {}) => {
  const hourlyRate = Number.isFinite(Number(pricing.hourlyRate))
    ? Number(pricing.hourlyRate)
    : DEFAULT_HOURLY_RATE;
  const routePrice = Number.isFinite(Number(pricing.routePrice))
    ? Number(pricing.routePrice)
    : DEFAULT_ROUTE_PRICE;
  const routePriceReturn = Number.isFinite(Number(pricing.routePriceReturn))
    ? Number(pricing.routePriceReturn)
    : DEFAULT_RETURN_ROUTE_PRICE;
  const tableRows = rows
    .map((row) => {
      const stopsText = parseStopsText(row.stops);
      const canApprove = String(row.payment_status || '').toLowerCase() === 'pending_review';
      return `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.full_name)}</td>
          <td>${escapeHtml(row.pickup_date)}</td>
          <td>${escapeHtml(row.pickup_time || '')}</td>
          <td>${escapeHtml(row.pickup_location)}</td>
          <td>${escapeHtml(row.dropoff_location)}</td>
          <td>${escapeHtml(stopsText)}</td>
          <td>${escapeHtml(row.booking_mode || '')}</td>
          <td>${escapeHtml(row.route_points || '')}</td>
          <td>${escapeHtml(row.estimated_hours || '')}</td>
          <td>$${escapeHtml(
            row.estimated_total_cents ? (Number(row.estimated_total_cents) / 100).toFixed(2) : ''
          )}</td>
          <td>${escapeHtml(row.payment_status || '')}</td>
          <td>${escapeHtml(row.travelers || '')}</td>
          <td>${escapeHtml(row.kids || '')}</td>
          <td>${escapeHtml(row.bags || '')}</td>
          <td>${escapeHtml(row.contact_number || '')}</td>
          <td>${escapeHtml(row.created_at)}</td>
          <td>
            ${
              canApprove
                ? `<button class="row-action approve" data-approve="${escapeHtml(row.id)}" type="button">Approve &amp; Email</button>
                   <button class="row-action reject" data-reject="${escapeHtml(row.id)}" type="button">Reject</button>`
                : `<span class="row-status">${escapeHtml(row.payment_status || '')}</span>`
            }
          </td>
        </tr>
      `;
    })
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
    .pricing-panel { margin: 20px 0 28px; padding: 20px; border: 1px solid rgba(240,178,71,0.18); border-radius: 18px; background: rgba(255,255,255,0.02); }
    .pricing-header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; margin-bottom: 14px; }
    .pricing-panel h2 { margin: 0; font-size: 1rem; letter-spacing: 0.1em; text-transform: uppercase; color: #f0b247; }
    .pricing-panel .subtle { color: rgba(247,245,242,0.65); font-size: 0.8rem; }
    .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 14px; }
    .pricing-card { border: 1px solid rgba(240,178,71,0.16); border-radius: 16px; padding: 14px; background: rgba(0,0,0,0.22); display: grid; gap: 10px; }
    .pricing-card strong { color: #f0b247; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.75rem; }
    .pricing-card input { width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(240,178,71,0.24); background: rgba(0,0,0,0.42); color: #f7f5f2; font-size: 0.95rem; }
    .pricing-card span { color: rgba(247,245,242,0.68); font-size: 0.82rem; line-height: 1.45; }
    .warning { color: rgba(240,178,71,0.8); font-size: 0.8rem; letter-spacing: 0.08em; }
    .danger { background: transparent; border: 1px solid rgba(240,178,71,0.4); color: #f0b247; padding: 8px 14px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; cursor: pointer; }
    .row-action { display: inline-flex; margin: 0 6px 6px 0; padding: 8px 10px; border-radius: 999px; border: 1px solid rgba(240,178,71,0.28); background: rgba(255,255,255,0.03); color: #f7f5f2; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.62rem; cursor: pointer; }
    .row-action.approve { border-color: rgba(107, 209, 143, 0.35); color: #8ef0b1; }
    .row-action.reject { border-color: rgba(240, 178, 71, 0.28); color: #f0b247; }
    .row-status { color: rgba(247,245,242,0.75); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.68rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 10px 12px; border-bottom: 1px solid rgba(240,178,71,0.15); text-align: left; vertical-align: top; }
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
      <a class="danger" href="/crm" style="text-decoration:none; display:inline-flex; align-items:center;">Open CRM</a>
      <button class="danger" id="clear-bookings" type="button">Clear Bookings</button>
      <span class="warning">Warning: this permanently deletes all bookings.</span>
    </div>
    <form class="pricing-panel" id="pricing-form">
      <div class="pricing-header">
        <h2>Pricing Controls</h2>
        <span class="subtle">These values update the public site and booking math.</span>
      </div>
      <div class="pricing-grid">
        <div class="pricing-card">
          <strong>Hourly Rate</strong>
          <span>Used for all route estimates and hourly pricing.</span>
          <input type="number" min="1" step="0.01" name="hourly_rate" value="${escapeHtml(hourlyRate)}" />
        </div>
        <div class="pricing-card">
          <strong>Orange County → LAX</strong>
          <span>Primary featured airport route on the public site.</span>
          <input type="number" min="1" step="0.01" name="route_price" value="${escapeHtml(routePrice)}" />
        </div>
        <div class="pricing-card">
          <strong>LAX → Orange County</strong>
          <span>Return route pricing shown on desktop and mobile.</span>
          <input type="number" min="1" step="0.01" name="route_price_return" value="${escapeHtml(routePriceReturn)}" />
        </div>
      </div>
      <button class="danger" type="submit">Save Pricing</button>
      <span class="warning" id="pricing-status">Current pricing is editable here.</span>
    </form>
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
          <th>Mode</th>
          <th>Route Points</th>
          <th>Hours</th>
          <th>Total</th>
          <th>Status</th>
          <th>Travelers</th>
          <th>Kids</th>
          <th>Bags</th>
          <th>Contact</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="18">No bookings yet.</td></tr>'}
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
      clearButton.addEventListener('click', () => {
        const ok = confirm('This will delete all bookings. Continue?');
        if (!ok) return;
        window.location.href = '/admin/clear?confirm=1';
      });
    }

    const pricingForm = document.getElementById('pricing-form');
    const pricingStatus = document.getElementById('pricing-status');
    if (pricingForm) {
      pricingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(pricingForm);
        const payload = {
          hourly_rate: formData.get('hourly_rate'),
          route_price: formData.get('route_price'),
          route_price_return: formData.get('route_price_return')
        };
        if (pricingStatus) pricingStatus.textContent = 'Saving...';
        const query = new URLSearchParams(payload);
        window.location.href = '/admin/pricing?' + query.toString();
      });
    }

    document.querySelectorAll('[data-approve]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.approve;
        if (!id) return;
        const ok = confirm('Approve this booking and email the payment link?');
        if (!ok) return;
        button.disabled = true;
        window.location.href = '/admin/approve?id=' + encodeURIComponent(id);
      });
    });

    document.querySelectorAll('[data-reject]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.reject;
        if (!id) return;
        const ok = confirm('Reject this booking?');
        if (!ok) return;
        button.disabled = true;
        window.location.href = '/admin/reject?id=' + encodeURIComponent(id);
      });
    });
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
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (
      url.hostname.startsWith('admin.') &&
      url.pathname === '/'
    ) {
      return Response.redirect(new URL('/admin', request.url).toString(), 302);
    }

    if (
      url.pathname === '/admin' ||
      url.pathname === '/admin/clear' ||
      url.pathname === '/admin/export' ||
      url.pathname === '/admin/pricing' ||
      url.pathname === '/admin/approve' ||
      url.pathname === '/admin/reject' ||
      url.pathname === '/crm' ||
      url.pathname === '/crm/export' ||
      url.pathname === '/crm/profile'
    ) {
      const auth = parseBasicAuth(request.headers.get('Authorization'));
      if (!auth || auth.user !== 'admin' || auth.pass !== env.ADMIN_PASSWORD) {
        return unauthorized();
      }
    }

    if (url.pathname === '/api/customer/history') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.replace('Bearer ', '').trim()
        : '';
      if (!token) {
        return jsonResponse({ ok: false, error: 'Missing access token' }, 401, origin);
      }

      try {
        const payload = await verifySupabaseAccessToken(token);
        if (!payload) {
          return jsonResponse({ ok: false, error: 'Invalid access token' }, 401, origin);
        }

        const email = String(payload.email || '').trim().toLowerCase();
        if (!email) {
          return jsonResponse({ ok: true, bookings: [] }, 200, origin);
        }
        const { results } = await env.DB.prepare(
          `SELECT *
           FROM bookings
           WHERE LOWER(customer_email) = ?
           ORDER BY created_at DESC
           LIMIT 100`
        )
          .bind(email)
          .all();

        return jsonResponse({ ok: true, bookings: results || [] }, 200, origin);
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error: `Unable to load customer bookings: ${error?.message || 'Unknown error'}`
          },
          500,
          origin
        );
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
        'booking_mode',
        'route_points',
        'estimated_hours',
        'estimated_total_cents',
        'payment_status',
        'payment_url',
        'customer_email',
        'customer_user_id',
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
            const safe = String(value).replace(/"/g, '""');
            return `"${safe}"`;
          })
          .join(',')
      );

      const csv = [header.join(','), ...rows].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="luxtravco-bookings.csv"'
        }
      });
    }

    if (url.pathname === '/crm/export') {
      await ensureCrmTables(env);
      const [bookingResult, profileResult] = await Promise.all([
        env.DB.prepare('SELECT * FROM bookings ORDER BY id DESC').all(),
        env.DB.prepare('SELECT * FROM customer_profiles ORDER BY last_booking_at DESC, updated_at DESC').all()
      ]);

      const customerRows = buildCustomerCrm(
        bookingResult.results || [],
        profileResult.results || []
      );

      const header = [
        'customer_key',
        'full_name',
        'customer_email',
        'customer_user_id',
        'phone',
        'status',
        'tags',
        'notes',
        'bookings_count',
        'revenue_cents',
        'last_booking_at'
      ];

      const rows = customerRows.map((row) =>
        header
          .map((key) => {
            const value = row[key] ?? '';
            const safe = String(value).replace(/"/g, '""');
            return `"${safe}"`;
          })
          .join(',')
      );

      const csv = [header.join(','), ...rows].join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="luxtravco-crm.csv"'
        }
      });
    }

    if (url.pathname === '/admin/clear') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return htmlResponse('Method not allowed', 405);
      }
      const confirmClear = request.method === 'POST' || url.searchParams.get('confirm') === '1';
      if (!confirmClear) {
        return jsonResponse({ ok: false, error: 'Missing confirmation' }, 400, origin);
      }
      await env.DB.prepare('DELETE FROM bookings').run();
      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (url.pathname === '/admin') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM bookings ORDER BY id DESC LIMIT 200'
      ).all();
      const pricing = await getPricingSettings(env);
      return htmlResponse(renderAdminPage(results || [], pricing));
    }

    if (url.pathname === '/crm') {
      const [bookingResult, profileResult] = await Promise.all([
        env.DB.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500').all(),
        env.DB.prepare('SELECT * FROM customer_profiles ORDER BY last_booking_at DESC, updated_at DESC').all()
      ]);
      return htmlResponse(
        renderCrmPage(bookingResult.results || [], profileResult.results || [])
      );
    }

    if (url.pathname === '/api/pricing') {
      const pricing = await getPricingSettings(env);
      return jsonResponse(
        {
          ok: true,
          pricing: {
            hourly_rate: pricing.hourlyRate,
            route_price: pricing.routePrice,
            route_price_return: pricing.routePriceReturn
          }
        },
        200,
        origin
      );
    }

    if (url.pathname === '/admin/pricing') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload = {
        hourly_rate: url.searchParams.get('hourly_rate'),
        route_price: url.searchParams.get('route_price')
      };

      if (request.method === 'POST') {
        try {
          payload = await request.json();
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      }

      const hourlyRate = Number.parseFloat(payload?.hourly_rate);
      const routePrice = Number.parseFloat(payload?.route_price);
      const routePriceReturn = Number.parseFloat(payload?.route_price_return);
      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid hourly rate' }, 400, origin);
      }
      if (!Number.isFinite(routePrice) || routePrice <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid route price' }, 400, origin);
      }
      if (!Number.isFinite(routePriceReturn) || routePriceReturn <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid return route price' }, 400, origin);
      }

      await setPricingSetting(env, 'hourly_rate', hourlyRate.toFixed(2));
      await setPricingSetting(env, 'route_price', routePrice.toFixed(2));
      await setPricingSetting(env, 'route_price_return', routePriceReturn.toFixed(2));

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }

      return jsonResponse(
        {
          ok: true,
          pricing: {
            hourly_rate: hourlyRate,
            route_price: routePrice,
            route_price_return: routePriceReturn
          }
        },
        200,
        origin
      );
    }

    if (url.pathname === '/crm/profile') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const customerKey = String(payload?.customer_key || '').trim();
      if (!customerKey) {
        return jsonResponse({ ok: false, error: 'Missing customer key' }, 400, origin);
      }

      await ensureCrmTables(env);
      const now = new Date().toISOString();
      const existing = await env.DB.prepare(
        'SELECT * FROM customer_profiles WHERE customer_key = ? LIMIT 1'
      )
        .bind(customerKey)
        .first();

      const profile = {
        customer_key: customerKey,
        customer_email: String(payload?.customer_email || existing?.customer_email || ''),
        customer_user_id: String(payload?.customer_user_id || existing?.customer_user_id || ''),
        full_name: String(payload?.full_name || existing?.full_name || ''),
        phone: String(payload?.phone || existing?.phone || ''),
        tags: String(payload?.tags || existing?.tags || ''),
        notes: String(payload?.notes || existing?.notes || ''),
        status: String(payload?.status || existing?.status || 'active').toLowerCase(),
        last_booking_at: existing?.last_booking_at || now,
        created_at: existing?.created_at || now,
        updated_at: now
      };

      await env.DB.prepare(
        `INSERT INTO customer_profiles (
          customer_key,
          customer_email,
          customer_user_id,
          full_name,
          phone,
          tags,
          notes,
          status,
          last_booking_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(customer_key) DO UPDATE SET
          customer_email = excluded.customer_email,
          customer_user_id = excluded.customer_user_id,
          full_name = excluded.full_name,
          phone = excluded.phone,
          tags = excluded.tags,
          notes = excluded.notes,
          status = excluded.status,
          last_booking_at = COALESCE(customer_profiles.last_booking_at, excluded.last_booking_at),
          updated_at = excluded.updated_at`
      )
        .bind(
          profile.customer_key,
          profile.customer_email,
          profile.customer_user_id,
          profile.full_name,
          profile.phone,
          profile.tags,
          profile.notes,
          profile.status,
          profile.last_booking_at,
          profile.created_at,
          profile.updated_at
        )
        .run();

      return jsonResponse({ ok: true, customer: profile }, 200, origin);
    }

    if (url.pathname === '/admin/approve') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload = {};
      if (request.method === 'POST') {
        try {
          payload = await request.json();
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      } else {
        payload = { id: url.searchParams.get('id') };
      }

      const bookingId = Number.parseInt(payload?.id, 10);
      if (!Number.isFinite(bookingId) || bookingId <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }

      const booking = await env.DB.prepare(
        'SELECT * FROM bookings WHERE id = ? LIMIT 1'
      )
        .bind(bookingId)
        .first();

      if (!booking) {
        return jsonResponse({ ok: false, error: 'Booking not found' }, 404, origin);
      }

      const totalCents = Number(booking.estimated_total_cents || 0);
      if (!Number.isFinite(totalCents) || totalCents <= 0) {
        return jsonResponse({ ok: false, error: 'Booking total is invalid' }, 400, origin);
      }

      const siteUrl = env.SITE_URL || 'https://luxtravco.com';
      const pricing = await getPricingSettings(env);
      const checkout = await createStripeCheckoutSession(env, {
        amountCents: totalCents,
        clientReferenceId: booking.id,
        customerEmail: booking.customer_email || '',
        productName:
          booking.booking_mode === 'hourly'
            ? 'Luxtravco hourly chauffeured service'
            : 'Luxtravco chauffeured transfer',
        description:
          booking.booking_mode === 'hourly'
            ? `Luxtravco estimated hourly service at $${pricing.hourlyRate}/hour`
            : `Luxtravco estimated transfer service at $${pricing.hourlyRate}/hour`,
        successUrl: `${siteUrl}/?payment=success&booking_id=${booking.id}`,
        cancelUrl: `${siteUrl}/?payment=cancelled&booking_id=${booking.id}`
      });

      if (!checkout.ok) {
        return jsonResponse({ ok: false, error: checkout.error }, 500, origin);
      }

      const emailResult = await sendApprovalEmail(env, booking, checkout.url);
      if (!emailResult.ok) {
        return jsonResponse({ ok: false, error: emailResult.error }, 500, origin);
      }

      await env.DB.prepare(
        `UPDATE bookings
         SET payment_status = ?, stripe_session_id = ?, payment_url = ?
         WHERE id = ?`
      )
        .bind('approved_email_sent', checkout.id || '', checkout.url || '', booking.id)
        .run();

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }
      return jsonResponse(
        { ok: true, payment_url: checkout.url, email: 'sent' },
        200,
        origin
      );
    }

    if (url.pathname === '/admin/reject') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload = {};
      if (request.method === 'POST') {
        try {
          payload = await request.json();
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      } else {
        payload = { id: url.searchParams.get('id') };
      }

      const bookingId = Number.parseInt(payload?.id, 10);
      if (!Number.isFinite(bookingId) || bookingId <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }

      await env.DB.prepare(
        `UPDATE bookings
         SET payment_status = ?
         WHERE id = ?`
      )
        .bind('rejected', bookingId)
        .run();

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }

      return jsonResponse({ ok: true }, 200, origin);
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
      booking_mode,
      route_points,
      stops,
      customer_email,
      customer_user_id,
      travelers,
      kids,
      bags,
      contact_number
    } = payload || {};

    if (!full_name || !pickup_date || !pickup_location || !dropoff_location) {
      return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, origin);
    }

    const mode = booking_mode === 'hourly' ? 'hourly' : 'transfer';
    const pricing = await getPricingSettings(env);
    const estimatedHours = calculateRouteEstimateHours(route_points);
    const totalCents =
      estimatedHours != null ? Math.round(estimatedHours * pricing.hourlyRate * 100) : null;

    if (!totalCents || totalCents <= 0) {
      return jsonResponse({ ok: false, error: 'Invalid route estimate' }, 400, origin);
    }

      const createdAt = new Date().toISOString();

    try {
      await ensureBookingColumns(env);

      const insertResult = await env.DB.prepare(
        `INSERT INTO bookings (
          full_name,
          pickup_date,
          pickup_time,
          pickup_location,
          dropoff_location,
          stops,
          booking_mode,
          route_points,
          estimated_hours,
          estimated_total_cents,
          payment_status,
          stripe_session_id,
          payment_url,
          customer_email,
          customer_user_id,
          travelers,
          kids,
          bags,
          contact_number,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          full_name,
          pickup_date,
          pickup_time || '',
          pickup_location,
          dropoff_location,
          stops ? JSON.stringify(stops) : '',
          mode,
          JSON.stringify(normalizeRoutePoints(route_points)),
          String(estimatedHours?.toFixed(2) || ''),
          String(totalCents),
          'pending_review',
          '',
          '',
          customer_email || '',
          customer_user_id || '',
          travelers || '',
          kids || '',
          bags || '',
          contact_number || '',
          createdAt
        )
        .run();

      await ensureCustomerProfile(env, {
        full_name: full_name || '',
        customer_email: customer_email || '',
        customer_user_id: customer_user_id || '',
        contact_number: contact_number || '',
        created_at: createdAt
      });

      const checkoutUrl = '';
      const paymentStatus = 'pending_review';
      const stripeSessionId = '';

      const stopsText = parseStopsText(stops);
      const slackMessage = [
        '<!channel> *New booking request pending review*',
        `Name: ${full_name}`,
        `Mode: ${mode}`,
        `Pickup date: ${pickup_date}`,
        `Pickup time: ${pickup_time || '—'}`,
        `Pickup: ${pickup_location}`,
        `Dropoff: ${dropoff_location}`,
        stopsText ? `Stops: ${stopsText}` : null,
        `Estimated time: ${estimatedHours?.toFixed(2)} hours`,
        `Total: $${(totalCents / 100).toFixed(2)}`,
        `Travelers: ${travelers || '—'}`,
        `Kids: ${kids || '—'}`,
        `Bags: ${bags || '—'}`,
        `Contact: ${contact_number || '—'}`
      ]
        .filter(Boolean)
        .join('\n');

      await sendSlack(env, slackMessage);

      return jsonResponse(
        { ok: true, checkout_url: checkoutUrl, payment_status: paymentStatus },
        200,
        origin
      );
    } catch (error) {
      return jsonResponse({ ok: false, error: 'Database error' }, 500, origin);
    }
  }
};
