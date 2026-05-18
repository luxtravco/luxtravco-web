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

const ordinalWord = (value) => {
  const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  return words[value - 1] || `${value}th`;
};

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

const sendLuxEmail = async (env, { to, subject, text, html, headers }) => {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'Resend API key is not configured.' };
  }

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [String(to || '').trim()].filter(Boolean);
  if (!recipients.length) {
    return { ok: false, error: 'Email recipient is missing.' };
  }

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
        to: recipients,
        subject,
        text,
        html,
        headers
      })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: result?.message || 'Failed to send email.' };
    }
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to send email.' };
  }
};

const luxEmailShell = ({ eyebrow = 'LUXTRAVCO', title, intro = '', body = '', ctaLabel = '', ctaUrl = '' }) => `
  <div style="margin:0;padding:0;background:#080807;color:#f7f2e8;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">
      ${escapeHtml(intro || title || 'Luxtravco booking update')}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#080807;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:34px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:680px;background:#11100f;border:1px solid #2b2419;border-radius:22px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,0.38);">
            <tr>
              <td style="padding:0;background:linear-gradient(135deg,#181512 0%,#0d0c0b 58%,#20180c 100%);border-bottom:1px solid #2b2419;">
                <div style="padding:28px 28px 24px;">
                  <div style="display:inline-block;padding:7px 11px;border:1px solid rgba(240,178,71,0.42);border-radius:999px;color:#f0b247;font-size:11px;letter-spacing:2.4px;font-weight:700;">
                    ${escapeHtml(eyebrow)}
                  </div>
                  <h1 style="margin:18px 0 0;color:#fff7e8;font-size:30px;line-height:1.12;letter-spacing:0;font-weight:700;">
                    ${escapeHtml(title)}
                  </h1>
                  ${intro ? `<p style="margin:13px 0 0;color:#d8cdbb;font-size:15px;line-height:1.65;">${escapeHtml(intro)}</p>` : ''}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 8px;color:#f7f2e8;font-size:15px;line-height:1.65;">
                ${body}
                ${
                  ctaLabel && ctaUrl
                    ? `<div style="padding:18px 0 8px;">
                        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#f0b247;color:#11100f;text-decoration:none;font-weight:800;letter-spacing:0.4px;">
                          ${escapeHtml(ctaLabel)}
                        </a>
                      </div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;">
                <div style="height:1px;background:#2b2419;margin-bottom:16px;"></div>
                <p style="margin:0;color:#a99d8b;font-size:12px;line-height:1.6;">
                  Luxtravco<br>
                  Premium chauffeured service<br>
                  <a href="mailto:info@luxtravco.com" style="color:#f0b247;text-decoration:none;">info@luxtravco.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
`;

const luxInfoGrid = (items) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;margin:18px 0;border:1px solid #2b2419;border-radius:16px;overflow:hidden;background:#151311;">
    ${items
      .map(
        ([label, value]) => `
          <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #2b2419;color:#b6aa99;width:38%;font-size:12px;text-transform:uppercase;letter-spacing:1.4px;font-weight:700;">
              ${escapeHtml(label)}
            </td>
            <td style="padding:12px 14px;border-bottom:1px solid #2b2419;color:#fff7e8;font-size:14px;line-height:1.45;">
              ${escapeHtml(value || '—')}
            </td>
          </tr>
        `
      )
      .join('')}
  </table>
`;

const sendApprovalEmail = async (env, booking, checkoutUrl) => {
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

  return sendLuxEmail(env, {
    to,
    subject: 'Your Luxtravco booking is approved for payment',
    text: lines.join('\n'),
    html: luxEmailShell({
      eyebrow: 'PAYMENT REQUEST',
      title: 'Booking approved',
      intro: 'Your reservation has been reviewed. Secure payment is required to confirm the trip.',
      ctaLabel: 'Pay securely',
      ctaUrl: checkoutUrl,
      body: `
        <p style="margin:0 0 12px;color:#f7f2e8;">Hello ${escapeHtml(booking.full_name || 'there')},</p>
        <p style="margin:0;color:#d8cdbb;">Your booking has been approved for payment.</p>
        ${luxInfoGrid([
          ['Route', `${booking.pickup_location || '—'} -> ${booking.dropoff_location || '—'}`],
          ['Pickup date', booking.pickup_date || '—'],
          ['Pickup time', booking.pickup_time || '—'],
          ['Service total', total]
        ])}
      `
    })
  });
};

const bookingDetailsLines = (booking) => [
  `Booking ID: #${booking.id || '—'}`,
  `Customer: ${booking.full_name || '—'}`,
  `Customer email: ${booking.customer_email || '—'}`,
  `Contact number: ${booking.contact_number || '—'}`,
  `Pickup date: ${booking.pickup_date || '—'}`,
  `Pickup time: ${booking.pickup_time || '—'}`,
  `Pickup: ${booking.pickup_location || '—'}`,
  `Drop off: ${booking.dropoff_location || '—'}`,
  `Stops: ${parseStopsText(booking.stops || '') || 'None'}`,
  `Service type: ${booking.service_type || '—'}`,
  `Booking mode: ${booking.booking_mode || '—'}`,
  `Estimated hours: ${booking.estimated_hours || '—'}`,
  `Total paid: ${formatCurrency(booking.estimated_total_cents || 0)}`,
  `Travelers: ${booking.travelers || '—'}`,
  `Kids: ${booking.kids || '—'}`,
  `Bags: ${booking.bags || '—'}`,
  `Paid at: ${booking.paid_at || '—'}`,
  `Created at: ${booking.created_at || '—'}`
];

const bookingDetailsHtmlRows = (booking) =>
  bookingDetailsLines(booking)
    .map((line) => {
      const [label, ...rest] = line.split(': ');
      return `
        <tr>
          <td style="padding:11px 13px;border-bottom:1px solid #2b2419;color:#b6aa99;width:190px;font-size:12px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">${escapeHtml(label)}</td>
          <td style="padding:11px 13px;border-bottom:1px solid #2b2419;color:#fff7e8;font-size:14px;line-height:1.45;">${escapeHtml(rest.join(': ') || '—')}</td>
        </tr>
      `;
    })
    .join('');

const sendBookingMadeAdminEmail = async (env, booking) => {
  const subject = `New Luxtravco booking request #${booking.id || ''} - ${booking.full_name || 'Customer'}`;
  return sendLuxEmail(env, {
    to: PAID_BOOKING_NOTIFY_EMAIL,
    subject,
    text: ['A new Luxtravco booking request was submitted.', '', ...bookingDetailsLines(booking)].join('\n'),
    html: luxEmailShell({
      eyebrow: 'NEW REQUEST',
      title: 'New booking request',
      intro: `Booking #${booking.id || '—'} is pending review.`,
      body: `
        <table role="presentation" style="border-collapse:collapse;width:100%;border:1px solid #2b2419;border-radius:16px;overflow:hidden;background:#151311;">
          ${bookingDetailsHtmlRows(booking)}
        </table>
      `
    })
  });
};

const sendPaidBookingNotificationEmail = async (env, booking) => {
  const to = PAID_BOOKING_NOTIFY_EMAIL;
  const total = formatCurrency(booking.estimated_total_cents || 0);
  const subject = `Paid Luxtravco booking #${booking.id || ''} - ${booking.full_name || 'Customer'}`;
  const lines = [
    'A Luxtravco booking was paid.',
    '',
    ...bookingDetailsLines(booking)
  ];
  const detailRows = bookingDetailsHtmlRows(booking);

  return sendLuxEmail(env, {
    to,
    subject,
    text: lines.join('\n'),
    html: luxEmailShell({
      eyebrow: 'PAYMENT RECEIVED',
      title: 'Paid booking',
      intro: `${total} was paid for booking #${booking.id || '—'}.`,
      body: `
        <table role="presentation" style="border-collapse:collapse;width:100%;border:1px solid #2b2419;border-radius:16px;overflow:hidden;background:#151311;">
          ${detailRows}
        </table>
      `
    })
  });
};

const sendPaymentApprovedCustomerEmail = async (env, booking) => {
  const to = String(booking.customer_email || '').trim();
  if (!to) {
    return { ok: false, error: 'Customer email is missing.' };
  }

  const total = formatCurrency(booking.estimated_total_cents || 0);
  const subject = `Payment approved - Luxtravco booking #${booking.id || ''}`;
  const route = `${booking.pickup_location || '—'} → ${booking.dropoff_location || '—'}`;
  const lines = [
    `Hello ${booking.full_name || 'there'},`,
    '',
    `Your payment is approved and Luxtravco booking #${booking.id || '—'} is confirmed.`,
    `Total paid: ${total}`,
    `Pickup date: ${booking.pickup_date || '—'}`,
    `Pickup time: ${booking.pickup_time || '—'}`,
    `Route: ${route}`,
    `Stops: ${parseStopsText(booking.stops || '') || 'None'}`,
    `Vehicle: ${booking.service_type || '—'}`,
    '',
    'Your driver will use these booking details for the trip.',
    'If you have any questions, reply to this email or contact info@luxtravco.com.',
    '',
    'Luxtravco'
  ];

  return sendLuxEmail(env, {
    to,
    subject,
    text: lines.join('\n'),
    html: luxEmailShell({
      eyebrow: 'PAID',
      title: 'Payment approved',
      intro: `Your payment is approved and booking #${booking.id || '—'} is confirmed.`,
      body: `
        <p style="margin:0 0 12px;color:#f7f2e8;">Hello ${escapeHtml(booking.full_name || 'there')},</p>
        <p style="margin:0;color:#d8cdbb;">Your driver will use these booking details for the trip.</p>
        ${luxInfoGrid([
          ['Total paid', total],
          ['Pickup date', booking.pickup_date || '—'],
          ['Pickup time', booking.pickup_time || '—'],
          ['Route', route],
          ['Stops', parseStopsText(booking.stops || '') || 'None'],
          ['Vehicle', booking.service_type || '—']
        ])}
      `
    })
  });
};

const sendPaymentReceivedCustomerEmail = sendPaymentApprovedCustomerEmail;

const sendBookingCancelledEmails = async (env, booking, policy) => {
  const customerEmail = String(booking.customer_email || '').trim();
  const refundPercent = Number(policy?.refundPercent ?? booking.cancellation_refund_percent ?? 0);
  const refundMessage = policy?.message || `Refund eligibility: ${refundPercent}%`;
  const customerLines = [
    `Hello ${booking.full_name || 'there'},`,
    '',
    `Your Luxtravco booking #${booking.id || '—'} has been cancelled.`,
    `Refund eligibility: ${refundPercent}%`,
    refundMessage,
    '',
    `Pickup date: ${booking.pickup_date || '—'}`,
    `Pickup time: ${booking.pickup_time || '—'}`,
    `Pickup: ${booking.pickup_location || '—'}`,
    `Drop off: ${booking.dropoff_location || '—'}`,
    '',
    'If you have questions, reply to this email or contact info@luxtravco.com.',
    '',
    'Luxtravco'
  ];
  const adminLines = [
    'A Luxtravco booking was cancelled.',
    `Refund eligibility: ${refundPercent}%`,
    '',
    ...bookingDetailsLines(booking)
  ];
  const sends = [
    sendLuxEmail(env, {
      to: PAID_BOOKING_NOTIFY_EMAIL,
      subject: `Luxtravco booking cancelled #${booking.id || ''} - ${booking.full_name || 'Customer'}`,
      text: adminLines.join('\n'),
      html: luxEmailShell({
        eyebrow: 'CANCELLATION',
        title: 'Booking cancelled',
        intro: `Booking #${booking.id || '—'} was cancelled. Refund eligibility: ${refundPercent}%.`,
        body: `
          <table role="presentation" style="border-collapse:collapse;width:100%;border:1px solid #2b2419;border-radius:16px;overflow:hidden;background:#151311;">
            ${bookingDetailsHtmlRows(booking)}
          </table>
        `
      })
    })
  ];

  if (customerEmail) {
    sends.push(
      sendLuxEmail(env, {
        to: customerEmail,
        subject: `Luxtravco booking #${booking.id || ''} cancelled`,
        text: customerLines.join('\n'),
        html: luxEmailShell({
          eyebrow: 'CANCELLATION',
          title: 'Booking cancelled',
          intro: `Your Luxtravco booking #${booking.id || '—'} has been cancelled.`,
          body: `
            <p style="margin:0 0 12px;color:#f7f2e8;">Hello ${escapeHtml(booking.full_name || 'there')},</p>
            <div style="margin:16px 0;padding:16px;border:1px solid rgba(240,178,71,0.36);border-radius:16px;background:#1b160f;">
              <div style="color:#f0b247;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Refund eligibility</div>
              <div style="margin-top:5px;color:#fff7e8;font-size:26px;font-weight:800;">${escapeHtml(refundPercent)}%</div>
              <p style="margin:8px 0 0;color:#d8cdbb;font-size:14px;">${escapeHtml(refundMessage)}</p>
            </div>
            ${luxInfoGrid([
              ['Pickup date', booking.pickup_date || '—'],
              ['Pickup time', booking.pickup_time || '—'],
              ['Pickup', booking.pickup_location || '—'],
              ['Drop off', booking.dropoff_location || '—']
            ])}
          `
        })
      })
    );
  }

  const results = await Promise.all(sends);
  const failed = results.find((result) => !result.ok);
  return failed || { ok: true, results };
};

const approveBookingAndEmail = async (env, booking) => {
  const totalCents = Number(booking.estimated_total_cents || 0);
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return { ok: false, error: 'Booking total is invalid' };
  }

  const siteUrl = env.SITE_URL || 'https://luxtravco.com';
  const bookingApiUrl = env.BOOKING_API_URL || 'https://luxtravco-booking.luxtravco1.workers.dev';
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
        ? `Luxtravco mileage-based chauffeured service`
        : `Luxtravco mileage-based transfer service`,
    successUrl: `${bookingApiUrl}/payment/success?booking_id=${booking.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${siteUrl}/?payment=cancelled&booking_id=${booking.id}`
  });

  if (!checkout.ok) {
    return { ok: false, error: checkout.error };
  }

  const emailResult = await sendApprovalEmail(env, booking, checkout.url);
  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error };
  }

  await env.DB.prepare(
    `UPDATE bookings
     SET payment_status = ?, stripe_session_id = ?, payment_url = ?
     WHERE id = ?`
  )
    .bind('approved_email_sent', checkout.id || '', checkout.url || '', booking.id)
    .run();

  return { ok: true, checkoutUrl: checkout.url };
};

const SUPABASE_URL = 'https://vmphayezatepxjauxhcd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_TwCvQ_u0VglyXCy6Sgciwg_3XulTaU1';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEFAULT_HOURLY_RATE = 79;
const DEFAULT_ROUTE_PRICE = 149;
const DEFAULT_ADMIN_EMAILS = 'info@luxtravco.com,emounier@icloud.com';
const PAID_BOOKING_NOTIFY_EMAIL = 'emounier@icloud.com';
const DEFAULT_SERVICE_TYPES = ['Executive Black SUV', 'Black Luxury Sedan'];
const DEFAULT_SERVICE_TYPE = DEFAULT_SERVICE_TYPES[0];
const DEFAULT_SERVICE_MILE_RATES = {
  'Executive Black SUV': 4,
  'Black SUV': 4,
  'Executive Black Sedan': 3,
  'Black Luxury Sedan': 3,
  'Black Sedan': 3
};
const DEFAULT_FEATURED_ROUTES = [
  { key: 'route_1', label: 'LGB → Disneyland', price: 98 },
  { key: 'route_2', label: 'ONT → Palm Springs', price: 399 },
  { key: 'route_3', label: 'LAX → Palm Springs', price: 599 },
  { key: 'route_4', label: 'OC → Vegas', price: 1199 }
];
const LEGACY_FEATURED_ROUTES = [
  { key: 'route_1', label: 'LGB → Disneyland', price: 99 },
  { key: 'route_2', label: 'ONT → Palm Springs', price: 400 },
  { key: 'route_3', label: 'LAX → Palm Springs', price: 600 },
  { key: 'route_4', label: 'OC → Vegas', price: 1200 }
];
const routeKeyForIndex = (index) => `route_${index + 1}`;
const normalizeServiceTypes = (value) => {
  const parts = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\n,]/g)
        .map((entry) => entry.trim());
  const unique = [];
  for (const part of parts) {
    if (!part) continue;
    if (!unique.includes(part)) unique.push(part);
  }
  return unique.length ? unique : [...DEFAULT_SERVICE_TYPES];
};
let bookingColumnsReady;
let pricingSettingsReady;
let supabaseJwksPromise;
let adminUsersReady;
let reminderTablesReady;

const normalizeAdminEmails = (value) => {
  const seen = new Set();
  return String(value || '')
    .split(/[\n,;]/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email && email.includes('@') && !seen.has(email) && seen.add(email));
};

const verifyTurnstileToken = async (env, token, remoteip = '') => {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { ok: false, error: 'Turnstile secret is not configured.' };
  }

  const trimmedToken = String(token || '').trim();
  if (!trimmedToken) {
    return { ok: false, error: 'Please complete the security check.' };
  }

  try {
    const body = new URLSearchParams();
    body.set('secret', env.TURNSTILE_SECRET_KEY);
    body.set('response', trimmedToken);
    if (remoteip) body.set('remoteip', remoteip);

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      const codes = Array.isArray(result?.['error-codes']) ? result['error-codes'].join(', ') : '';
      return { ok: false, error: codes || 'Security check failed. Please try again.' };
    }

    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error?.message || 'Security check failed.' };
  }
};

const ensureBookingColumns = async (env) => {
  if (bookingColumnsReady) return bookingColumnsReady;

  bookingColumnsReady = (async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(bookings)').all();
    const columns = new Set((results || []).map((row) => row.name));
    const additions = [
      ['booking_mode', 'TEXT'],
      ['service_type', 'TEXT'],
      ['estimated_hours', 'TEXT'],
      ['estimated_total_cents', 'INTEGER'],
      ['payment_status', 'TEXT'],
      ['stripe_session_id', 'TEXT'],
      ['payment_url', 'TEXT'],
      ['paid_at', 'TEXT'],
      ['paid_notification_sent_at', 'TEXT'],
      ['payment_receipt_sent_at', 'TEXT'],
      ['customer_email', 'TEXT'],
      ['customer_user_id', 'TEXT'],
      ['driver_status', 'TEXT'],
      ['cancelled_at', 'TEXT'],
      ['cancellation_refund_percent', 'INTEGER']
    ];

    for (const [name, type] of additions) {
      if (!columns.has(name)) {
        await env.DB.prepare(`ALTER TABLE bookings ADD COLUMN ${name} ${type}`).run();
      }
    }
  })();

  return bookingColumnsReady;
};


let inboxColumnsReady;
const ensureInboxTables = async (env) => {
  if (inboxColumnsReady) return inboxColumnsReady;

  inboxColumnsReady = (async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS inbound_emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resend_email_id TEXT NOT NULL,
        message_id TEXT,
        from_name TEXT,
        from_email TEXT,
        to_addresses TEXT,
        cc_addresses TEXT,
        bcc_addresses TEXT,
        subject TEXT,
        text_body TEXT,
        html_body TEXT,
        attachments_json TEXT,
        received_at TEXT,
        is_read INTEGER DEFAULT 0,
        replied_at TEXT,
        reply_message_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run();

    await env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_emails_resend_email_id ON inbound_emails(resend_email_id)'
    ).run();
  })();

  return inboxColumnsReady;
};

let supportTablesReady;
const ensureSupportTables = async (env) => {
  if (supportTablesReady) return supportTablesReady;

  supportTablesReady = (async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS support_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER,
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        issue_type TEXT,
        priority TEXT,
        status TEXT DEFAULT 'open',
        details TEXT,
        resolution TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      )`
    ).run();

    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_support_cases_status ON support_cases(status, updated_at DESC)'
    ).run();

    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_support_cases_booking_id ON support_cases(booking_id)'
    ).run();
  })();

  return supportTablesReady;
};

let crmColumnsReady;
let adminPushTablesReady;
let cachedApnsBearerToken;
let cachedApnsBearerTokenExpiresAt = 0;
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
      ['admin_emails', String(env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS)],
      ['driver_emails', String(env.DRIVER_EMAILS || '')],
      ['service_types', JSON.stringify(DEFAULT_SERVICE_TYPES)],
      ['default_service_type', DEFAULT_SERVICE_TYPE],
      ['route_count', String(DEFAULT_FEATURED_ROUTES.length)],
      ...DEFAULT_FEATURED_ROUTES.flatMap((route) => [
        [`${route.key}_label`, route.label],
        [`${route.key}_price`, String(route.price)]
      ])
    ];

    for (const [settingKey, settingValue] of defaults) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO pricing_settings (setting_key, setting_value, updated_at)
         VALUES (?, ?, ?)`
      )
        .bind(settingKey, settingValue, now)
        .run();
    }

    // Migrate the original seeded route prices down by $1 without overwriting user edits.
    for (const route of DEFAULT_FEATURED_ROUTES) {
      const legacy = LEGACY_FEATURED_ROUTES.find((candidate) => candidate.key === route.key);
      if (!legacy) continue;
      const { results } = await env.DB.prepare(
        'SELECT setting_value FROM pricing_settings WHERE setting_key = ?'
      )
        .bind(`${route.key}_price`)
        .all();
      const currentValue = String(results?.[0]?.setting_value || '').trim();
      if (currentValue === String(legacy.price)) {
        await env.DB.prepare(
          `UPDATE pricing_settings
           SET setting_value = ?, updated_at = ?
           WHERE setting_key = ?`
        )
          .bind(route.price.toFixed(2), now, `${route.key}_price`)
          .run();
      }
    }

    await syncAdminUsersFromEmails(env, env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS);
  })();

  return pricingSettingsReady;
};

const ensureAdminUsersTable = async (env) => {
  if (adminUsersReady) return adminUsersReady;

  adminUsersReady = (async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS admin_users (
        email TEXT PRIMARY KEY,
        role TEXT NOT NULL DEFAULT 'admin',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run();
  })();

  return adminUsersReady;
};

const ensureAdminPushTables = async (env) => {
  if (adminPushTablesReady) return adminPushTablesReady;

  adminPushTablesReady = (async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS admin_device_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        email TEXT,
        platform TEXT NOT NULL DEFAULT 'ios',
        bundle_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_registered_at TEXT NOT NULL,
        last_notified_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run();
  })();

  return adminPushTablesReady;
};

const syncAdminUsersFromEmails = async (env, emails) => {
  await ensureAdminUsersTable(env);
  const normalized = normalizeAdminEmails(Array.isArray(emails) ? emails.join(',') : emails);
  const now = new Date().toISOString();

  await env.DB.prepare('DELETE FROM admin_users').run();
  for (const email of normalized) {
    await env.DB.prepare(
      `INSERT INTO admin_users (email, role, is_active, created_at, updated_at)
       VALUES (?, 'admin', 1, ?, ?)`
    )
      .bind(email, now, now)
      .run();
  }

  return normalized;
};

const ensureReminderTables = async (env) => {
  if (reminderTablesReady) return reminderTablesReady;

  reminderTablesReady = (async () => {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS booking_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        reminder_type TEXT NOT NULL,
        scheduled_local TEXT NOT NULL,
        time_zone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
        sent_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(booking_id, reminder_type)
      )`
    ).run();
  })();

  return reminderTablesReady;
};

const toBase64Url = (value) =>
  btoa(typeof value === 'string' ? value : String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const pemToArrayBuffer = (pem) => {
  const normalized = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
};

const derToJoseSignature = (signature, size = 64) => {
  const bytes = new Uint8Array(signature);
  if (bytes.length === size) return bytes;
  if (bytes[0] !== 0x30) {
    throw new Error('Unsupported ECDSA signature format');
  }

  let offset = 1;
  let sequenceLength = bytes[offset++];
  if (sequenceLength & 0x80) {
    const lengthBytes = sequenceLength & 0x7f;
    sequenceLength = 0;
    for (let i = 0; i < lengthBytes; i += 1) {
      sequenceLength = (sequenceLength << 8) | bytes[offset++];
    }
  }

  if (bytes[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
  let rLength = bytes[offset++];
  while (rLength > 0 && bytes[offset] === 0x00) {
    offset += 1;
    rLength -= 1;
  }
  const r = bytes.slice(offset, offset + rLength);
  offset += rLength;

  if (bytes[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
  let sLength = bytes[offset++];
  while (sLength > 0 && bytes[offset] === 0x00) {
    offset += 1;
    sLength -= 1;
  }
  const s = bytes.slice(offset, offset + sLength);

  const output = new Uint8Array(size);
  const half = size / 2;
  output.set(r.slice(-half), half - Math.min(r.length, half));
  output.set(s.slice(-half), size - Math.min(s.length, half));
  return output;
};

const joseToDerSignature = (signature, size = 64) => {
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature);
  if (bytes.length !== size) {
    throw new Error('Invalid JOSE ECDSA signature length');
  }

  const half = size / 2;
  const trim = (segment) => {
    let start = 0;
    while (start < segment.length - 1 && segment[start] === 0) {
      start += 1;
    }
    let value = segment.slice(start);
    if (value[0] & 0x80) {
      const withLeadingZero = new Uint8Array(value.length + 1);
      withLeadingZero.set(value, 1);
      value = withLeadingZero;
    }
    return value;
  };

  const r = trim(bytes.slice(0, half));
  const s = trim(bytes.slice(half));
  const payloadLength = 2 + r.length + 2 + s.length;
  const header = payloadLength < 128
    ? Uint8Array.from([0x30, payloadLength])
    : Uint8Array.from([0x30, 0x81, payloadLength]);

  const output = new Uint8Array(header.length + 2 + r.length + 2 + s.length);
  let offset = 0;
  output.set(header, offset);
  offset += header.length;
  output[offset++] = 0x02;
  output[offset++] = r.length;
  output.set(r, offset);
  offset += r.length;
  output[offset++] = 0x02;
  output[offset++] = s.length;
  output.set(s, offset);
  return output.buffer;
};

const getApnsBearerToken = async (env) => {
  const keyId = String(env.APNS_KEY_ID || '').trim();
  const teamId = String(env.APNS_TEAM_ID || '').trim();
  const privateKey = String(env.APNS_PRIVATE_KEY || '').trim();
  if (!keyId || !teamId || !privateKey) {
    return '';
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedApnsBearerToken && nowSeconds < cachedApnsBearerTokenExpiresAt) {
    return cachedApnsBearerToken;
  }

  const header = toBase64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = toBase64Url(JSON.stringify({ iss: teamId, iat: nowSeconds }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const derSignature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  const joseSignature = derToJoseSignature(derSignature, 64);

  cachedApnsBearerToken = `${signingInput}.${toBase64Url(joseSignature)}`;
  cachedApnsBearerTokenExpiresAt = nowSeconds + 50 * 60;
  return cachedApnsBearerToken;
};

const upsertAdminPushToken = async (env, { token, userId, email, platform, bundleId }) => {
  await ensureAdminPushTables(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO admin_device_tokens (
      token,
      user_id,
      email,
      platform,
      bundle_id,
      is_active,
      last_registered_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      user_id = excluded.user_id,
      email = excluded.email,
      platform = excluded.platform,
      bundle_id = excluded.bundle_id,
      is_active = 1,
      last_registered_at = excluded.last_registered_at,
      updated_at = excluded.updated_at`
  )
    .bind(token, userId, email, platform, bundleId, now, now, now)
    .run();
};

const deactivateAdminPushToken = async (env, token) => {
  await ensureAdminPushTables(env);
  await env.DB.prepare(
    'UPDATE admin_device_tokens SET is_active = 0, updated_at = ? WHERE token = ?'
  )
    .bind(new Date().toISOString(), token)
    .run();
};

const sendAdminPushNotification = async (env, { title, body, kind = 'admin_alert', data = {} }) => {
  const topic = String(env.APNS_TOPIC_ADMIN || 'com.luxtravco.admin').trim();
  const bearerToken = await getApnsBearerToken(env);
  if (!topic || !bearerToken) {
    return { ok: false, skipped: true, error: 'APNs is not configured' };
  }

  await ensureAdminPushTables(env);
  const { results } = await env.DB.prepare(
    `SELECT token
     FROM admin_device_tokens
     WHERE is_active = 1
       AND LOWER(platform) = 'ios'
       AND bundle_id = ?`
  )
    .bind(topic)
    .all();

  if (!results?.length) {
    return { ok: true, delivered: 0 };
  }

  const host = String(env.APNS_USE_SANDBOX || '').trim() === '1'
    ? 'api.sandbox.push.apple.com'
    : 'api.push.apple.com';
  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: 'default'
    },
    kind,
    ...data
  });
  const now = new Date().toISOString();
  let delivered = 0;

  for (const row of results) {
    const token = String(row.token || '').trim();
    if (!token) continue;
    try {
      const response = await fetch(`https://${host}/3/device/${token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${bearerToken}`,
          'apns-topic': topic,
          'apns-push-type': 'alert',
          'apns-priority': '10'
        },
        body: payload
      });

      if (response.ok) {
        delivered += 1;
        await env.DB.prepare(
          'UPDATE admin_device_tokens SET last_notified_at = ?, updated_at = ? WHERE token = ?'
        )
          .bind(now, now, token)
          .run();
        continue;
      }

      let reason = '';
      try {
        const json = await response.json();
        reason = String(json?.reason || '').trim();
      } catch (error) {
        reason = '';
      }
      if (response.status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken') {
        await deactivateAdminPushToken(env, token);
      }
    } catch (error) {
      // Ignore individual push failures so bookings and inbox continue to work.
    }
  }

  return { ok: true, delivered };
};

const getPricingSettings = async (env) => {
  await ensurePricingSettings(env);
  const { results } = await env.DB.prepare(
    'SELECT setting_key, setting_value FROM pricing_settings'
  ).all();
  const map = new Map((results || []).map((row) => [row.setting_key, row.setting_value]));
  const hourlyRate = Number.parseFloat(map.get('hourly_rate') || `${DEFAULT_HOURLY_RATE}`);
  const serviceTypes = normalizeServiceTypes(
    (() => {
      const raw = map.get('service_types');
      if (!raw) return DEFAULT_SERVICE_TYPES;
      try {
        return JSON.parse(raw);
      } catch (error) {
        return raw;
      }
    })()
  );
  const defaultServiceType = String(map.get('default_service_type') || serviceTypes[0] || DEFAULT_SERVICE_TYPE).trim();
  const storedRouteCount = Number.parseInt(map.get('route_count') || `${DEFAULT_FEATURED_ROUTES.length}`, 10);
  const routeCount = Number.isFinite(storedRouteCount) && storedRouteCount > 0
    ? storedRouteCount
    : DEFAULT_FEATURED_ROUTES.length;
  const featuredRoutes = Array.from({ length: routeCount }, (_, index) => {
    const route = DEFAULT_FEATURED_ROUTES[index] || {
      key: routeKeyForIndex(index),
      label: `Route ${index + 1}`,
      price: DEFAULT_ROUTE_PRICE
    };
    const label = String(map.get(`${route.key}_label`) || route.label).trim();
    const price = Number.parseFloat(map.get(`${route.key}_price`) || `${route.price}`);
    return {
      key: route.key,
      label: label || route.label,
      price: Number.isFinite(price) && price > 0 ? price : route.price
    };
  });
  const adminEmails = normalizeAdminEmails(
    map.get('admin_emails') || env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS
  );
  const driverEmails = normalizeAdminEmails(
    map.get('driver_emails') || env.DRIVER_EMAILS || ''
  );
  return {
    hourlyRate: Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : DEFAULT_HOURLY_RATE,
    serviceTypes,
    defaultServiceType: serviceTypes.includes(defaultServiceType) ? defaultServiceType : serviceTypes[0],
    featuredRoutes,
    adminEmails,
    driverEmails
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

const serviceMileRate = (serviceType) => {
  const normalized = String(serviceType || '').trim();
  if (DEFAULT_SERVICE_MILE_RATES[normalized]) {
    return DEFAULT_SERVICE_MILE_RATES[normalized];
  }
  const lower = normalized.toLowerCase();
  if (lower.includes('sedan')) return 3;
  if (lower.includes('suv')) return 4;
  if (lower.includes('sprinter') || lower.includes('van')) return 5;
  return 4;
};

const calcTimeAndMileageTotalCents = (hoursValue, milesValue, hourlyRate, serviceType) => {
  const hours = Number.parseFloat(hoursValue);
  const miles = Number.parseFloat(milesValue);
  const rate = Number.parseFloat(hourlyRate);
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isFinite(miles) || miles <= 0) return null;
  return Math.round((hours * rate + miles * serviceMileRate(serviceType)) * 100);
};

const losAngelesFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

const getLosAngelesNowStrings = (date = new Date()) => {
  const parts = Object.fromEntries(
    losAngelesFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const datePart = `${parts.year}-${parts.month}-${parts.day}`;
  const timePart = `${parts.hour}:${parts.minute}`;
  return {
    date: datePart,
    time: timePart,
    dateTime: `${datePart}T${timePart}`
  };
};

const formatNaiveDateTime = (date, time) =>
  `${String(date || '').trim()}T${String(time || '00:00').trim().slice(0, 5).padEnd(5, '0')}`;

const subtractMinutesFromLocal = (date, time, minutes) => {
  const [year, month, day] = String(date || '')
    .split('-')
    .map((value) => Number.parseInt(value, 10));
  const [hour, minute] = String(time || '00:00')
    .split(':')
    .map((value) => Number.parseInt(value, 10));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  const localDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  localDate.setUTCMinutes(localDate.getUTCMinutes() - minutes);
  const yyyy = String(localDate.getUTCFullYear());
  const mm = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(localDate.getUTCDate()).padStart(2, '0');
  const hh = String(localDate.getUTCHours()).padStart(2, '0');
  const min = String(localDate.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const localDateTimeToMs = (date, time) => {
  const [year, month, day] = String(date || '')
    .split('-')
    .map((value) => Number.parseInt(value, 10));
  const [hour, minute] = String(time || '00:00')
    .slice(0, 5)
    .split(':')
    .map((value) => Number.parseInt(value, 10));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  return Date.UTC(year, month - 1, day, hour, minute, 0);
};

const cancellationPolicyForBooking = (booking, now = new Date()) => {
  const pickupMs = localDateTimeToMs(booking?.pickup_date, booking?.pickup_time || '00:00');
  const nowLocal = getLosAngelesNowStrings(now);
  const nowMs = localDateTimeToMs(nowLocal.date, nowLocal.time);
  if (!Number.isFinite(pickupMs) || !Number.isFinite(nowMs)) {
    return {
      refundPercent: 0,
      message: 'Cancellation received. Refund eligibility could not be calculated automatically.'
    };
  }

  const hoursUntilPickup = (pickupMs - nowMs) / (60 * 60 * 1000);
  if (hoursUntilPickup > 48) {
    return {
      refundPercent: 100,
      message: 'Cancelled more than 48 hours before pickup. Refund eligibility: 100%.'
    };
  }
  if (hoursUntilPickup >= 24) {
    return {
      refundPercent: 50,
      message: 'Cancelled 24-48 hours before pickup. Refund eligibility: 50%.'
    };
  }
  return {
    refundPercent: 0,
    message: 'Cancelled within 24 hours of pickup. Refund eligibility: 0%.'
  };
};

const stripPhoneForDial = (value) => String(value || '').replace(/[^\d+]/g, '');

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

const normalizeProvidedRouteEstimate = (payload) => {
  const miles = Number.parseFloat(payload?.route_miles);
  const seconds = Number.parseFloat(payload?.route_seconds);
  if (!Number.isFinite(miles) || miles <= 0 || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return {
    miles: Math.round(miles * 10) / 10,
    hours: Math.max(0.25, seconds / 3600)
  };
};

const calculateRouteEstimate = (points, payload = null) => {
  const providedEstimate = normalizeProvidedRouteEstimate(payload);
  if (providedEstimate) return providedEstimate;

  const routePoints = normalizeRoutePoints(points);
  if (routePoints.length < 2) return null;

  let miles = 0;
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    miles += haversineMiles(routePoints[index], routePoints[index + 1]);
  }

  const stopCount = Math.max(0, routePoints.length - 2);
  const drivingMinutes = (miles / 28) * 60 * 1.28;
  const totalMinutes = drivingMinutes + 18 + stopCount * 8;
  return {
    miles: Math.round(miles * 10) / 10,
    hours: Math.max(0.25, totalMinutes / 60)
  };
};

const calculateRouteEstimateHours = (points) => calculateRouteEstimate(points)?.hours ?? null;

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

const loadSupabaseUserFromToken = async (token) => {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    return null;
  }
  const user = await response.json().catch(() => null);
  if (!user || !user.id) {
    return null;
  }
  return {
    sub: user.id,
    email: user.email || '',
    phone: user.phone || '',
    user_metadata: user.user_metadata || {},
    app_metadata: user.app_metadata || {}
  };
};

const verifySupabaseAccessToken = async (token) => {
  const parts = String(token || '').split('.');
  if (parts.length === 3) {
    try {
      const header = decodeJwtPart(parts[0]);
      const payload = decodeJwtPart(parts[1]);
      const jwks = await getSupabaseJwks();
      const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);

      if (jwk) {
        const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
        let algorithm;
        let verifyAlgorithm;
        let signature = base64UrlToBytes(parts[2]);

        if (jwk.kty === 'RSA') {
          algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
          verifyAlgorithm = 'RSASSA-PKCS1-v1_5';
        } else if (jwk.kty === 'EC') {
          algorithm = { name: 'ECDSA', namedCurve: jwk.crv || 'P-256' };
          verifyAlgorithm = { name: 'ECDSA', hash: 'SHA-256' };
          signature = joseToDerSignature(signature, jwk.crv === 'P-384' ? 96 : 64);
        }

        if (algorithm && verifyAlgorithm) {
          const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
          const ok = await crypto.subtle.verify(verifyAlgorithm, key, signature, signedContent);
          if (ok) {
            return payload;
          }
        }
      }
    } catch (error) {
    }
  }

  return loadSupabaseUserFromToken(token);
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

const fetchStripeCheckoutSession = async (env, sessionId) => {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, error: 'Stripe is not configured yet.' };
  }
  const cleanId = String(sessionId || '').trim();
  if (!cleanId) {
    return { ok: false, error: 'Missing Stripe session id.' };
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(cleanId)}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: data?.error?.message || data?.message || 'Unable to load Stripe session.' };
  }
  return { ok: true, session: data };
};

const parseStopsText = (stops) => {
  const formatStop = (stop, index) => {
    if (!stop) return '';
    if (typeof stop === 'string') return stop;
    if (typeof stop !== 'object') return String(stop);
    const pickupLabel = stop.pickup ? `${ordinalWord(index + 2)} pickup: ${stop.pickup}` : '';
    const dropoffLabel = stop.dropoff ? `${ordinalWord(index + 2)} drop off: ${stop.dropoff}` : '';
    const pickupWhen = [stop.pickup_date, stop.pickup_time].filter(Boolean).join(' ');
    const dropoffWhen = [stop.dropoff_date, stop.dropoff_time].filter(Boolean).join(' ');
    return [pickupLabel && pickupWhen ? `${pickupLabel} (${pickupWhen})` : pickupLabel, dropoffLabel && dropoffWhen ? `${dropoffLabel} (${dropoffWhen})` : dropoffLabel]
      .filter(Boolean)
      .join(' • ');
  };

  if (!stops) return '';
  if (Array.isArray(stops)) {
    return stops.map(formatStop).filter(Boolean).join(', ');
  }

  if (typeof stops === 'string') {
    try {
      const parsed = JSON.parse(stops);
      if (Array.isArray(parsed)) {
        return parsed.map(formatStop).filter(Boolean).join(', ');
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

const fetchReceivedEmailContent = async (env, resendEmailId) => {
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(resendEmailId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'luxtravco-booking/1.0'
    }
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.message || 'Unable to fetch inbound email content.');
  }

  const record = result?.email || result?.data || result || {};
  const from = record.from || {};
  return {
    resend_email_id: resendEmailId,
    message_id: record.message_id || record.headers?.['message-id'] || '',
    from_name: from.name || record.from_name || '',
    from_email: from.email || record.from_email || '',
    to_addresses: JSON.stringify(record.to || record.to_addresses || []),
    cc_addresses: JSON.stringify(record.cc || record.cc_addresses || []),
    bcc_addresses: JSON.stringify(record.bcc || record.bcc_addresses || []),
    subject: record.subject || '',
    text_body: record.text || record.text_body || '',
    html_body: record.html || record.html_body || '',
    attachments_json: JSON.stringify(record.attachments || []),
    received_at: record.created_at || record.received_at || new Date().toISOString()
  };
};

const storeInboundEmail = async (env, emailRecord) => {
  await ensureInboxTables(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO inbound_emails (
      resend_email_id,
      message_id,
      from_name,
      from_email,
      to_addresses,
      cc_addresses,
      bcc_addresses,
      subject,
      text_body,
      html_body,
      attachments_json,
      received_at,
      is_read,
      replied_at,
      reply_message_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)
    ON CONFLICT(resend_email_id) DO UPDATE SET
      message_id = excluded.message_id,
      from_name = excluded.from_name,
      from_email = excluded.from_email,
      to_addresses = excluded.to_addresses,
      cc_addresses = excluded.cc_addresses,
      bcc_addresses = excluded.bcc_addresses,
      subject = excluded.subject,
      text_body = excluded.text_body,
      html_body = excluded.html_body,
      attachments_json = excluded.attachments_json,
      received_at = excluded.received_at,
      updated_at = excluded.updated_at`
  )
    .bind(
      emailRecord.resend_email_id,
      emailRecord.message_id || '',
      emailRecord.from_name || '',
      emailRecord.from_email || '',
      emailRecord.to_addresses || '[]',
      emailRecord.cc_addresses || '[]',
      emailRecord.bcc_addresses || '[]',
      emailRecord.subject || '',
      emailRecord.text_body || '',
      emailRecord.html_body || '',
      emailRecord.attachments_json || '[]',
      emailRecord.received_at || now,
      now,
      now
    )
    .run();
};

const sendInboxReply = async (env, emailRow, replyBody) => {
  const to = String(emailRow?.from_email || '').trim();
  if (!to) {
    return { ok: false, error: 'Sender email is missing.' };
  }

  const subjectBase = String(emailRow?.subject || '').trim() || 'Luxtravco message';
  const subject = /^re:/i.test(subjectBase) ? subjectBase : `Re: ${subjectBase}`;

  return sendLuxEmail(env, {
    to,
    subject,
    text: replyBody,
    headers: emailRow?.message_id ? { 'In-Reply-To': emailRow.message_id, References: emailRow.message_id } : undefined,
    html: luxEmailShell({
      eyebrow: 'SUPPORT',
      title: 'Message from Luxtravco',
      intro: 'Our team replied to your message.',
      body: `
        <div style="white-space:pre-wrap;margin:0;padding:16px;border:1px solid #2b2419;border-radius:16px;background:#151311;color:#f7f2e8;font-size:15px;line-height:1.7;">${escapeHtml(replyBody)}</div>
      `
    })
  });
};

const renderInboxPage = (rows, selectedEmail, statusMessage = '') => {
  const activeId = Number(selectedEmail?.id || rows?.[0]?.id || 0);
  const emailItems = (rows || [])
    .map((row) => {
      const isActive = Number(row.id || 0) === activeId;
      const unread = Number(row.is_read || 0) === 0;
      const sender = row.from_name || row.from_email || 'Unknown sender';
      const subject = row.subject || '(No subject)';
      const preview = String(row.text_body || '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'No preview available.';
      return `
        <a class="message-item${isActive ? ' active' : ''}" href="/admin/inbox?id=${encodeURIComponent(row.id)}">
          <div class="message-topline">
            <strong>${escapeHtml(sender)}</strong>
            <span>${escapeHtml(formatDateTime(row.received_at))}</span>
          </div>
          <div class="message-subject">${escapeHtml(subject)}</div>
          <div class="message-preview">${escapeHtml(preview)}</div>
          ${unread ? '<span class="pill">Unread</span>' : '<span class="pill muted">Read</span>'}
        </a>
      `;
    })
    .join('');

  const detail = selectedEmail || rows?.[0] || null;
  const detailSender = detail ? detail.from_name || detail.from_email || 'Unknown sender' : 'Select a message';
  const detailSubject = detail?.subject || 'No subject';
  const detailBody = detail?.text_body || detail?.html_body || '';

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luxtravco Inbox</title>
  <style>
    :root {
      --bg: #070707;
      --panel: rgba(18,16,10,0.92);
      --line: rgba(240,178,71,0.18);
      --line-strong: rgba(240,178,71,0.38);
      --gold: #f0b247;
      --text: #f7f5f2;
      --muted: rgba(247,245,242,0.62);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: radial-gradient(circle at top, rgba(240,178,71,0.08), transparent 34%), var(--bg); color: var(--text); }
    header { padding: 18px 28px; border-bottom: 1px solid var(--line); background: rgba(8,8,8,0.95); position: sticky; top: 0; z-index: 10; }
    .topline { display:flex; justify-content:space-between; gap:16px; align-items:center; flex-wrap:wrap; }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.68rem; color: var(--gold); }
    h1 { margin: 6px 0 0; font-size: clamp(1.5rem, 2vw, 2.2rem); letter-spacing: 0.06em; text-transform: uppercase; }
    .subcopy { margin: 0; color: var(--muted); font-size: 0.92rem; max-width: 880px; }
    .header-links { display:flex; gap:10px; flex-wrap:wrap; }
    .ghost-link, .primary-link { text-decoration:none; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:10px 14px; letter-spacing:0.1em; text-transform:uppercase; font-size:0.68rem; border:1px solid var(--line); color:var(--text); background:rgba(255,255,255,0.02); }
    .primary-link { background: var(--gold); color: #140f06; border-color: var(--gold); }
    main { padding: 22px 28px 32px; display:grid; gap:18px; }
    .status-banner { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: rgba(240,178,71,0.08); color: var(--gold); }
    .inbox-grid { display:grid; grid-template-columns: 360px 1fr; gap: 18px; align-items:start; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 24px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.34); }
    .panel-head { padding: 18px 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,0.015); }
    .panel-head h2 { margin:0; font-size:0.98rem; text-transform:uppercase; letter-spacing:0.14em; }
    .message-list { display:grid; gap: 10px; padding: 18px; }
    .message-item { display:grid; gap: 8px; text-decoration:none; color: var(--text); padding: 14px; border-radius: 18px; border: 1px solid var(--line); background: rgba(255,255,255,0.025); }
    .message-item.active { border-color: var(--line-strong); background: rgba(240,178,71,0.06); }
    .message-topline { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
    .message-topline span { color: var(--muted); font-size: 0.78rem; }
    .message-subject { color: var(--gold); font-size: 0.9rem; }
    .message-preview { color: var(--muted); font-size: 0.84rem; line-height: 1.5; }
    .pill { display:inline-flex; width:max-content; padding:4px 8px; border-radius:999px; text-transform:uppercase; letter-spacing:0.12em; font-size:0.64rem; border:1px solid var(--line-strong); color: var(--gold); background: rgba(240,178,71,0.08); }
    .pill.muted { color: var(--muted); border-color: var(--line); background: rgba(255,255,255,0.03); }
    .detail { padding: 18px; display:grid; gap:14px; }
    .detail-hero { padding: 18px; border-radius: 18px; border: 1px solid var(--line); background: linear-gradient(180deg, rgba(240,178,71,0.08), rgba(255,255,255,0.03)); }
    .detail-hero h3 { margin: 0 0 8px; font-size: 1.4rem; }
    .detail-meta { display:grid; gap:6px; color: var(--muted); font-size: 0.92rem; }
    .message-body { min-height: 260px; white-space: pre-wrap; line-height: 1.6; color: var(--text); background: rgba(255,255,255,0.03); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    .reply-form { display:grid; gap: 10px; }
    .reply-form textarea { min-height: 180px; resize: vertical; width: 100%; padding: 14px; border-radius: 16px; border: 1px solid rgba(240,178,71,0.18); background: rgba(255,255,255,0.05); color: var(--text); }
    @media (max-width: 980px) { .inbox-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div class="topline">
      <div>
        <span class="eyebrow">Admin Inbox</span>
        <h1>Luxtravco messages</h1>
        <p class="subcopy">Review inbound messages and reply from info@luxtravco.com.</p>
      </div>
      <div class="header-links">
        <a class="ghost-link" href="/admin">Bookings Admin</a>
        <a class="ghost-link" href="/crm">CRM</a>
        <a class="primary-link" href="/">Public Site</a>
      </div>
    </div>
  </header>
  <main>
    ${statusMessage ? `<div class="status-banner">${escapeHtml(statusMessage)}</div>` : ''}
    <section class="inbox-grid">
      <div class="panel">
        <div class="panel-head">
          <h2>Messages</h2>
        </div>
        <div class="message-list">
          ${emailItems || '<div class="message-preview">No messages yet.</div>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>Selected Message</h2>
        </div>
        <div class="detail">
          <div class="detail-hero">
            <h3>${escapeHtml(detailSubject)}</h3>
            <div class="detail-meta">
              <span>${escapeHtml(detailSender)}</span>
              <span>${escapeHtml(detail?.from_email || '')}</span>
              <span>${escapeHtml(formatDateTime(detail?.received_at || ''))}</span>
            </div>
          </div>
          <div class="message-body">${escapeHtml(detailBody || 'Select a message from the list.')}</div>
          ${
            detail
              ? `<form class="reply-form" method="POST" action="/admin/inbox/reply">
                  <input type="hidden" name="id" value="${escapeHtml(detail.id)}" />
                  <textarea name="reply_body" placeholder="Write your reply here..."></textarea>
                  <button class="primary-link" type="submit">Send Reply</button>
                </form>`
              : ''
          }
        </div>
      </div>
    </section>
  </main>
</body>
</html>
  `;
};

const supportCaseTitle = (row) =>
  row?.booking_id ? `Booking #${row.booking_id}` : 'General support';

const supportCaseStatusPill = (status) => {
  const normalized = String(status || 'open').toLowerCase();
  return `<span class="pill${normalized === 'resolved' ? ' muted' : ''}">${escapeHtml(normalized)}</span>`;
};

const renderSupportPage = (cases, bookings, statusMessage = '') => {
  const bookingOptions = [
    '<option value="">No booking / general support</option>',
    ...(bookings || []).map((booking) => {
      const label = `#${booking.id} ${booking.full_name || 'Booking'} - ${booking.pickup_date || ''} ${booking.pickup_time || ''} - ${booking.pickup_location || ''}`;
      return `<option value="${escapeHtml(booking.id)}">${escapeHtml(label)}</option>`;
    })
  ].join('');

  const caseRows = (cases || [])
    .map((row) => `
      <a class="case-row" href="/admin/support/case?id=${encodeURIComponent(row.id)}">
        <div>
          <strong>${escapeHtml(supportCaseTitle(row))}</strong>
          <span>${escapeHtml(row.customer_name || 'No customer name')} • ${escapeHtml(row.issue_type || 'Support')}</span>
        </div>
        <div>
          ${supportCaseStatusPill(row.status)}
          <span>${escapeHtml(formatDateTime(row.updated_at || row.created_at || ''))}</span>
        </div>
      </a>
    `)
    .join('');

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Luxtravco Support</title>
  <style>
    :root {
      --bg:#070707; --panel:rgba(18,16,10,0.92); --line:rgba(240,178,71,0.18);
      --line-strong:rgba(240,178,71,0.38); --gold:#f0b247; --text:#f7f5f2; --muted:rgba(247,245,242,0.62);
    }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial,sans-serif; background:radial-gradient(circle at top, rgba(240,178,71,0.08), transparent 34%), var(--bg); color:var(--text); }
    header { padding:18px 28px; border-bottom:1px solid var(--line); background:rgba(8,8,8,0.95); position:sticky; top:0; z-index:10; }
    .topline { display:flex; justify-content:space-between; gap:16px; align-items:center; flex-wrap:wrap; }
    .eyebrow { text-transform:uppercase; letter-spacing:0.22em; font-size:0.68rem; color:var(--gold); }
    h1 { margin:6px 0 0; font-size:clamp(1.5rem,2vw,2.2rem); letter-spacing:0.06em; text-transform:uppercase; }
    h2 { margin:0; font-size:0.98rem; text-transform:uppercase; letter-spacing:0.14em; }
    .subcopy { margin:0; color:var(--muted); font-size:0.92rem; max-width:880px; line-height:1.5; }
    .header-links { display:flex; gap:10px; flex-wrap:wrap; }
    .ghost-link,.primary-link,button { text-decoration:none; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:10px 14px; letter-spacing:0.1em; text-transform:uppercase; font-size:0.68rem; border:1px solid var(--line); color:var(--text); background:rgba(255,255,255,0.02); cursor:pointer; }
    .primary-link,button { background:var(--gold); color:#140f06; border-color:var(--gold); }
    main { padding:22px 28px 32px; display:grid; gap:18px; }
    .status-banner { padding:12px 14px; border-radius:14px; border:1px solid var(--line); background:rgba(240,178,71,0.08); color:var(--gold); }
    .support-grid { display:grid; grid-template-columns:minmax(300px, 440px) 1fr; gap:18px; align-items:start; }
    .panel { background:var(--panel); border:1px solid var(--line); border-radius:24px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.34); }
    .panel-head { padding:18px 20px; border-bottom:1px solid var(--line); background:rgba(255,255,255,0.015); }
    form { display:grid; gap:12px; padding:18px; }
    label { display:grid; gap:7px; color:var(--muted); font-size:0.82rem; }
    input,select,textarea { width:100%; padding:12px 13px; border-radius:14px; border:1px solid var(--line); background:rgba(255,255,255,0.05); color:var(--text); font-size:0.94rem; }
    textarea { min-height:170px; resize:vertical; line-height:1.5; }
    .case-list { display:grid; gap:10px; padding:18px; }
    .case-row { text-decoration:none; color:var(--text); display:flex; justify-content:space-between; gap:12px; padding:14px; border-radius:18px; border:1px solid var(--line); background:rgba(255,255,255,0.025); }
    .case-row:hover { border-color:var(--line-strong); background:rgba(240,178,71,0.06); }
    .case-row div { display:grid; gap:6px; }
    .case-row span { color:var(--muted); font-size:0.82rem; }
    .pill { display:inline-flex; width:max-content; padding:4px 8px; border-radius:999px; text-transform:uppercase; letter-spacing:0.12em; font-size:0.64rem; border:1px solid var(--line-strong); color:var(--gold); background:rgba(240,178,71,0.08); }
    .pill.muted { color:var(--muted); border-color:var(--line); background:rgba(255,255,255,0.03); }
    @media (max-width:980px) { .support-grid { grid-template-columns:1fr; } .case-row { flex-direction:column; } }
  </style>
</head>
<body>
  <header>
    <div class="topline">
      <div>
        <span class="eyebrow">Admin Support</span>
        <h1>Support cases</h1>
        <p class="subcopy">Create a support case with all customer details. Select a booking when the problem belongs to that ride, or leave booking empty for a separate general support page.</p>
      </div>
      <div class="header-links">
        <a class="ghost-link" href="/admin">Bookings Admin</a>
        <a class="ghost-link" href="/crm">CRM</a>
        <a class="primary-link" href="/">Public Site</a>
      </div>
    </div>
  </header>
  <main>
    ${statusMessage ? `<div class="status-banner">${escapeHtml(statusMessage)}</div>` : ''}
    <section class="support-grid">
      <div class="panel">
        <div class="panel-head"><h2>New Support Case</h2></div>
        <form method="POST" action="/admin/support/create">
          <label>Booking
            <select name="booking_id">${bookingOptions}</select>
          </label>
          <label>Customer name
            <input name="customer_name" placeholder="Customer name" />
          </label>
          <label>Email
            <input name="customer_email" type="email" placeholder="customer@email.com" />
          </label>
          <label>Phone
            <input name="customer_phone" placeholder="+1 909 235 0670" />
          </label>
          <label>Issue type
            <select name="issue_type">
              <option>Booking issue</option>
              <option>Payment issue</option>
              <option>Driver issue</option>
              <option>Route or pickup issue</option>
              <option>Account issue</option>
              <option>General support</option>
            </select>
          </label>
          <label>Priority
            <select name="priority">
              <option>Normal</option>
              <option>Urgent</option>
              <option>Low</option>
            </select>
          </label>
          <label>Details
            <textarea name="details" placeholder="Put all details here: what happened, what needs fixing, requested outcome, and any notes."></textarea>
          </label>
          <button type="submit">Create Case</button>
        </form>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Open + Recent Cases</h2></div>
        <div class="case-list">
          ${caseRows || '<div class="subcopy">No support cases yet.</div>'}
        </div>
      </div>
    </section>
  </main>
</body>
</html>
  `;
};

const renderSupportCasePage = (supportCase, booking, statusMessage = '') => {
  if (!supportCase) {
    return `<!doctype html><html><body style="font-family:Arial;background:#070707;color:#f7f5f2;padding:28px;"><h1>Support case not found</h1><a style="color:#f0b247" href="/admin/support">Back to Support</a></body></html>`;
  }

  const bookingBlock = booking
    ? `
      <div class="info-card">
        <strong>Attached Booking</strong>
        <span>#${escapeHtml(booking.id)} • ${escapeHtml(booking.full_name || '')}</span>
        <span>${escapeHtml(booking.pickup_date || '')} ${escapeHtml(booking.pickup_time || '')}</span>
        <span>${escapeHtml(booking.pickup_location || '')}</span>
        <span>${escapeHtml(booking.dropoff_location || '')}</span>
        <span>${escapeHtml(booking.payment_status || '')} • ${escapeHtml(booking.booking_mode || '')}</span>
      </div>
    `
    : `
      <div class="info-card">
        <strong>General Support</strong>
        <span>This case is separate from a booking.</span>
      </div>
    `;

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Support Case #${escapeHtml(supportCase.id)}</title>
  <style>
    :root { --bg:#070707; --panel:rgba(18,16,10,0.92); --line:rgba(240,178,71,0.18); --gold:#f0b247; --text:#f7f5f2; --muted:rgba(247,245,242,0.62); }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial,sans-serif; background:radial-gradient(circle at top, rgba(240,178,71,0.08), transparent 34%), var(--bg); color:var(--text); }
    header { padding:18px 28px; border-bottom:1px solid var(--line); background:rgba(8,8,8,0.95); }
    main { padding:22px 28px 32px; display:grid; gap:18px; max-width:1040px; margin:0 auto; }
    h1 { margin:6px 0 0; font-size:clamp(1.5rem,2vw,2.2rem); letter-spacing:0.06em; text-transform:uppercase; }
    h2 { margin:0; font-size:0.98rem; text-transform:uppercase; letter-spacing:0.14em; }
    .eyebrow { text-transform:uppercase; letter-spacing:0.22em; font-size:0.68rem; color:var(--gold); }
    .subcopy, span { color:var(--muted); font-size:0.92rem; line-height:1.5; }
    .links { margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; }
    a,button { text-decoration:none; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; padding:10px 14px; letter-spacing:0.1em; text-transform:uppercase; font-size:0.68rem; border:1px solid var(--line); color:var(--text); background:rgba(255,255,255,0.02); cursor:pointer; }
    button { background:var(--gold); color:#140f06; border-color:var(--gold); }
    .status-banner { padding:12px 14px; border-radius:14px; border:1px solid var(--line); background:rgba(240,178,71,0.08); color:var(--gold); }
    .grid { display:grid; grid-template-columns:1fr 360px; gap:18px; align-items:start; }
    .panel,.info-card { background:var(--panel); border:1px solid var(--line); border-radius:24px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.34); }
    .panel-head { padding:18px 20px; border-bottom:1px solid var(--line); background:rgba(255,255,255,0.015); }
    .content { padding:18px; display:grid; gap:14px; }
    .info-card { padding:16px; display:grid; gap:8px; }
    .details { white-space:pre-wrap; line-height:1.6; padding:16px; border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,0.03); }
    form { display:grid; gap:10px; }
    textarea { width:100%; min-height:150px; resize:vertical; padding:14px; border-radius:16px; border:1px solid var(--line); background:rgba(255,255,255,0.05); color:var(--text); }
    .meta { display:grid; gap:8px; }
    @media (max-width:900px) { .grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header>
    <span class="eyebrow">Support case</span>
    <h1>#${escapeHtml(supportCase.id)} ${escapeHtml(supportCase.issue_type || 'Support')}</h1>
    <p class="subcopy">${escapeHtml(supportCase.customer_name || 'No customer name')} • ${escapeHtml(supportCase.status || 'open')} • ${escapeHtml(supportCase.priority || 'Normal')}</p>
    <div class="links">
      <a href="/admin/support">Back to Support</a>
      <a href="/admin">Bookings Admin</a>
      <a href="/crm">CRM</a>
    </div>
  </header>
  <main>
    ${statusMessage ? `<div class="status-banner">${escapeHtml(statusMessage)}</div>` : ''}
    <section class="grid">
      <div class="panel">
        <div class="panel-head"><h2>Problem Details</h2></div>
        <div class="content">
          <div class="meta">
            <span>Email: ${escapeHtml(supportCase.customer_email || '')}</span>
            <span>Phone: ${escapeHtml(supportCase.customer_phone || '')}</span>
            <span>Created: ${escapeHtml(formatDateTime(supportCase.created_at || ''))}</span>
            <span>Updated: ${escapeHtml(formatDateTime(supportCase.updated_at || ''))}</span>
          </div>
          <div class="details">${escapeHtml(supportCase.details || 'No details provided.')}</div>
          ${
            supportCase.resolution
              ? `<div class="details">${escapeHtml(supportCase.resolution)}</div>`
              : `<form method="POST" action="/admin/support/resolve">
                  <input type="hidden" name="id" value="${escapeHtml(supportCase.id)}" />
                  <textarea name="resolution" placeholder="Write exactly how this was resolved..."></textarea>
                  <button type="submit">Resolve Case</button>
                </form>`
          }
        </div>
      </div>
      ${bookingBlock}
    </section>
  </main>
</body>
</html>
  `;
};

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

const getAllowedAdminEmails = async (env) => {
  await ensureAdminUsersTable(env);
  const { results } = await env.DB.prepare(
    'SELECT email FROM admin_users WHERE is_active = 1 ORDER BY email ASC'
  ).all();
  const tableEmails = (results || [])
    .map((row) => String(row.email || '').trim().toLowerCase())
    .filter(Boolean);
  const pricing = await getPricingSettings(env);
  return new Set([
    ...normalizeAdminEmails(DEFAULT_ADMIN_EMAILS),
    ...normalizeAdminEmails(env.ADMIN_EMAILS || ''),
    ...normalizeAdminEmails(pricing.adminEmails || []),
    ...tableEmails
  ]);
};

const getAllowedDriverEmails = async (env) => {
  const pricing = await getPricingSettings(env);
  const adminsCanDrive = normalizeAdminEmails(env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS);
  return new Set([
    ...normalizeAdminEmails(env.DRIVER_EMAILS || ''),
    ...normalizeAdminEmails(pricing.driverEmails || []),
    ...adminsCanDrive
  ]);
};

const sendBookingReminderEmail = async (env, booking, reminderType) => {
  const to = String(booking.customer_email || '').trim();
  if (!to) {
    return { ok: false, error: 'Customer email is missing.' };
  }

  const pickupDate = booking.pickup_date || '—';
  const pickupTime = booking.pickup_time || '—';
  const route = `${booking.pickup_location || '—'} → ${booking.dropoff_location || '—'}`;
  const subject =
    reminderType === 'day_of'
      ? 'Luxtravco reminder for today'
      : reminderType === 'ninety_minutes'
        ? 'Luxtravco pickup reminder'
        : 'Luxtravco trip reminder';
  const intro =
    reminderType === 'day_of'
      ? 'This is your day-of reminder for today’s Luxtravco booking.'
      : reminderType === 'ninety_minutes'
        ? 'Your Luxtravco pickup is about 90 minutes away.'
        : 'Your Luxtravco trip is coming up soon.';

  const lines = [
    `Hello ${booking.full_name || 'there'},`,
    '',
    intro,
    `Pickup date: ${pickupDate}`,
    `Pickup time: ${pickupTime}`,
    `Route: ${route}`,
    '',
    'If anything changes, reply to this email or contact info@luxtravco.com.',
    '',
    'Luxtravco'
  ];

  return sendLuxEmail(env, {
    to,
    subject,
    text: lines.join('\n'),
    html: luxEmailShell({
      eyebrow: 'TRIP REMINDER',
      title: subject,
      intro,
      body: `
        <p style="margin:0 0 12px;color:#f7f2e8;">Hello ${escapeHtml(booking.full_name || 'there')},</p>
        ${luxInfoGrid([
          ['Pickup date', pickupDate],
          ['Pickup time', pickupTime],
          ['Route', route]
        ])}
      `
    })
  });
};

const scheduleBookingReminders = async (env, booking) => {
  await ensureReminderTables(env);
  const createdAt = new Date().toISOString();
  const entries = [
    {
      type: 'day_of',
      scheduledLocal: formatNaiveDateTime(booking.pickup_date, '08:00')
    }
  ];
  if (booking.pickup_time) {
    const finalReminder = subtractMinutesFromLocal(booking.pickup_date, booking.pickup_time, 90);
    if (finalReminder) {
      entries.push({
        type: 'ninety_minutes',
        scheduledLocal: finalReminder
      });
    }
  }

  for (const entry of entries) {
    await env.DB.prepare(
      `INSERT INTO booking_reminders (booking_id, reminder_type, scheduled_local, time_zone, sent_at, created_at, updated_at)
       VALUES (?, ?, ?, 'America/Los_Angeles', NULL, ?, ?)
       ON CONFLICT(booking_id, reminder_type) DO UPDATE SET
         scheduled_local = excluded.scheduled_local,
         time_zone = excluded.time_zone,
         updated_at = excluded.updated_at`
    )
      .bind(booking.id, entry.type, entry.scheduledLocal, createdAt, createdAt)
      .run();
  }
};

const sendDueBookingReminders = async (env) => {
  await ensureReminderTables(env);
  const now = new Date().toISOString();
  const nowLocal = getLosAngelesNowStrings().dateTime;
  const { results } = await env.DB.prepare(
    `SELECT
       r.id AS reminder_id,
       r.reminder_type,
       b.*
     FROM booking_reminders r
     JOIN bookings b ON b.id = r.booking_id
     WHERE r.sent_at IS NULL
       AND r.scheduled_local <= ?
       AND LOWER(COALESCE(b.payment_status, '')) = 'paid'
     ORDER BY r.scheduled_local ASC
     LIMIT 100`
  )
    .bind(nowLocal)
    .all();

  for (const row of results || []) {
    const sent = await sendBookingReminderEmail(env, row, row.reminder_type);
    if (!sent.ok) continue;
    await env.DB.prepare(
      'UPDATE booking_reminders SET sent_at = ?, updated_at = ? WHERE id = ?'
    )
      .bind(now, now, row.reminder_id)
      .run();
  }
};

const verifyStripeWebhookSignature = async (bodyText, signatureHeader, secret) => {
  if (!secret) return true;
  if (!signatureHeader) return false;
  const timestampMatch = signatureHeader.match(/(?:^|,)t=(\d+)/);
  const signatures = [...signatureHeader.matchAll(/(?:^|,)v1=([0-9a-f]+)/g)].map((match) => match[1]);
  if (!timestampMatch || !signatures.length) return false;
  const signedPayload = `${timestampMatch[1]}.${bodyText}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return signatures.includes(expected);
};

const finalizePaidBooking = async (env, booking, session = {}, ctx = null) => {
  const paidAt = new Date().toISOString();
  const sessionCustomerEmail = String(
    session?.customer_details?.email || session?.customer_email || ''
  ).trim();
  await ensureBookingColumns(env);
  await env.DB.prepare(
    `UPDATE bookings
     SET payment_status = ?,
         paid_at = COALESCE(paid_at, ?),
         customer_email = COALESCE(NULLIF(customer_email, ''), ?)
     WHERE id = ?`
  )
    .bind('paid', paidAt, sessionCustomerEmail, booking.id)
    .run();

  const paidBooking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1')
    .bind(booking.id)
    .first();
  const emailBooking = {
    ...booking,
    ...(paidBooking || {}),
    payment_status: 'paid',
    paid_at: paidBooking?.paid_at || paidAt,
    customer_email: paidBooking?.customer_email || booking.customer_email || sessionCustomerEmail
  };

  await scheduleBookingReminders(env, emailBooking);

  if (!paidBooking?.payment_receipt_sent_at) {
    const receipt = await sendPaymentReceivedCustomerEmail(env, emailBooking);
    if (!receipt.ok) {
      return { ok: false, error: receipt.error || 'Customer payment receipt email failed' };
    }
    await env.DB.prepare(
      `UPDATE bookings
       SET payment_receipt_sent_at = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), booking.id)
      .run();
  }

  if (ctx) {
    const paidTotalCents = Number(emailBooking.estimated_total_cents || 0);
    ctx.waitUntil(
      sendAdminPushNotification(env, {
        title: 'Payment received',
        body: `#${booking.id} ${emailBooking.full_name || 'Customer'} paid $${(paidTotalCents / 100).toFixed(2)}`,
        kind: 'payment',
        data: {
          booking_id: booking.id,
          payment_status: 'paid'
        }
      })
    );
  }

  if (!paidBooking?.paid_notification_sent_at) {
    const notification = await sendPaidBookingNotificationEmail(env, emailBooking);
    if (!notification.ok) {
      return { ok: false, error: notification.error || 'Paid booking notification email failed' };
    }
    await env.DB.prepare(
      `UPDATE bookings
       SET paid_notification_sent_at = ?
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), booking.id)
      .run();
  }

  return { ok: true, booking: emailBooking };
};

const handleStripeWebhook = async (request, env, origin, ctx) => {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
  }

  await ensureBookingColumns(env);
  const bodyText = await request.text();
  const signatureHeader = request.headers.get('stripe-signature') || '';
  const verified = await verifyStripeWebhookSignature(bodyText, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    return jsonResponse({ ok: false, error: 'Invalid webhook signature' }, 401, origin);
  }

  let event;
  try {
    event = JSON.parse(bodyText);
  } catch (error) {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
  }

  const eventType = String(event?.type || '');
  const session = event?.data?.object || {};
  const stripeSessionId = String(session?.id || '').trim();
  if (!stripeSessionId) {
    return jsonResponse({ ok: true }, 200, origin);
  }

  const booking = await env.DB.prepare(
    'SELECT * FROM bookings WHERE stripe_session_id = ? LIMIT 1'
  )
    .bind(stripeSessionId)
    .first();
  if (!booking) {
    return jsonResponse({ ok: true }, 200, origin);
  }

  if (eventType === 'checkout.session.completed') {
    const finalized = await finalizePaidBooking(env, booking, session, ctx);
    if (!finalized.ok) {
      return jsonResponse({ ok: false, error: finalized.error }, 500, origin);
    }
  } else if (eventType === 'checkout.session.expired') {
    await env.DB.prepare(
      `UPDATE bookings
       SET payment_status = ?
       WHERE id = ?`
    )
      .bind('payment_expired', booking.id)
      .run();
  }

  return jsonResponse({ ok: true }, 200, origin);
};

const handleStripeSuccessReturn = async (request, env, origin, ctx) => {
  if (request.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
  }

  await ensureBookingColumns(env);
  const url = new URL(request.url);
  const bookingId = Number.parseInt(String(url.searchParams.get('booking_id') || ''), 10);
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  const siteUrl = env.SITE_URL || 'https://luxtravco.com';

  const redirect = (status, extra = '') =>
    Response.redirect(
      `${siteUrl}/?payment=${encodeURIComponent(status)}${Number.isFinite(bookingId) ? `&booking_id=${bookingId}` : ''}${extra}`,
      302
    );

  if (!Number.isFinite(bookingId) || bookingId <= 0 || !sessionId) {
    return redirect('error');
  }

  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1')
    .bind(bookingId)
    .first();
  if (!booking || String(booking.stripe_session_id || '') !== sessionId) {
    return redirect('error');
  }

  const loaded = await fetchStripeCheckoutSession(env, sessionId);
  if (!loaded.ok) {
    return redirect('error');
  }

  const session = loaded.session || {};
  const paid = String(session.payment_status || '').toLowerCase() === 'paid' ||
    String(session.status || '').toLowerCase() === 'complete';
  if (!paid) {
    return redirect('pending');
  }

  const finalized = await finalizePaidBooking(env, booking, session, ctx);
  if (!finalized.ok) {
    return redirect('email_error', `&message=${encodeURIComponent(finalized.error || '')}`);
  }

  return redirect('success', '&confirmed=1');
};

const humanizeStatus = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Pending';
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const resolveBookingStatus = (booking) => {
  const driverStatus = String(booking?.driver_status || '').trim();
  if (driverStatus) return driverStatus;
  return String(booking?.payment_status || '').trim();
};

const serializeAdminBooking = (booking) => ({
  id: Number(booking.id || 0),
  full_name: booking.full_name || '',
  pickup_date: booking.pickup_date || '',
  pickup_time: booking.pickup_time || '',
  pickup_location: booking.pickup_location || '',
  dropoff_location: booking.dropoff_location || '',
  stops: parseStopsText(booking.stops || ''),
  booking_mode: booking.booking_mode || '',
  service_type: booking.service_type || DEFAULT_SERVICE_TYPE,
  estimated_hours: booking.estimated_hours || '',
  estimated_total_cents: Number(booking.estimated_total_cents || 0),
  payment_status: booking.payment_status || '',
  driver_status: booking.driver_status || '',
  display_status: humanizeStatus(resolveBookingStatus(booking)),
  travelers: booking.travelers || '',
  kids: booking.kids || '',
  bags: booking.bags || '',
  contact_number: booking.contact_number || '',
  customer_email: booking.customer_email || '',
  created_at: booking.created_at || ''
});

const serializeDriverTrip = (booking) => ({
  id: Number(booking.id || 0),
  riderName: booking.full_name || 'Unknown rider',
  pickupTime: [booking.pickup_date || '', booking.pickup_time || ''].filter(Boolean).join(' • '),
  pickupAddress: booking.pickup_location || '',
  dropoffAddress: booking.dropoff_location || '',
  serviceType: booking.service_type || DEFAULT_SERVICE_TYPE,
  status: humanizeStatus(resolveBookingStatus(booking)),
  phone: booking.contact_number || '',
  total: formatCurrency(booking.estimated_total_cents || 0),
  note: parseStopsText(booking.stops || '') || (booking.booking_mode === 'hourly' ? 'Hourly booking' : 'Transfer booking')
});

const serializeInboxMessage = (row) => ({
  id: Number(row.id || 0),
  sender: row.from_name || row.from_email || 'Unknown sender',
  from_email: row.from_email || '',
  subject: row.subject || '(No subject)',
  preview: String(row.text_body || '').replace(/\s+/g, ' ').trim().slice(0, 140),
  receivedAt: formatDateTime(row.received_at),
  unread: Number(row.is_read || 0) === 0,
  text_body: row.text_body || ''
});

const serializeCustomerCard = (customer, index) => ({
  id: index + 1,
  name: customer.full_name || customer.customer_email || customer.phone || 'Unknown customer',
  phone: customer.phone || '',
  email: customer.customer_email || '',
  status: customer.status || 'active',
  notes: customer.notes || '',
  trips: Number(customer.bookings_count || 0)
});

const serializeSupportCase = (row) => ({
  id: Number(row.id || 0),
  booking_id: row.booking_id ? Number(row.booking_id) : null,
  customer_name: row.customer_name || '',
  customer_email: row.customer_email || '',
  customer_phone: row.customer_phone || '',
  issue_type: row.issue_type || 'General support',
  priority: row.priority || 'Normal',
  status: row.status || 'open',
  details: row.details || '',
  resolution: row.resolution || '',
  created_at: row.created_at || '',
  updated_at: row.updated_at || '',
  resolved_at: row.resolved_at || ''
});

const requireAdminApiAuth = async (request, env, origin) => {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : '';
  if (!token) {
    return { response: jsonResponse({ ok: false, error: 'Missing access token' }, 401, origin) };
  }

  try {
    const payload = await verifySupabaseAccessToken(token);
    if (!payload) {
      return { response: jsonResponse({ ok: false, error: 'Invalid access token' }, 401, origin) };
    }
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) {
      return { response: jsonResponse({ ok: false, error: 'Admin access denied' }, 403, origin) };
    }
    return { payload, email };
  } catch (error) {
    return {
      response: jsonResponse(
        { ok: false, error: error?.message || 'Unable to verify access token' },
        500,
        origin
      )
    };
  }
};

const requireDriverApiAuth = async (request, env, origin) => {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : '';
  if (!token) {
    return { response: jsonResponse({ ok: false, error: 'Missing access token' }, 401, origin) };
  }

  try {
    const payload = await verifySupabaseAccessToken(token);
    if (!payload) {
      return { response: jsonResponse({ ok: false, error: 'Invalid access token' }, 401, origin) };
    }
    const email = String(payload.email || '').trim().toLowerCase();
    const allowed = await getAllowedDriverEmails(env);
    if (!email || !allowed.has(email)) {
      return { response: jsonResponse({ ok: false, error: 'Driver access denied' }, 403, origin) };
    }
    return { payload, email };
  } catch (error) {
    return {
      response: jsonResponse(
        { ok: false, error: error?.message || 'Unable to verify access token' },
        500,
        origin
      )
    };
  }
};

const renderAdminPage = (rows, pricing = {}) => {
  const adminEmailsValue = Array.isArray(pricing.adminEmails) ? pricing.adminEmails.join(', ') : DEFAULT_ADMIN_EMAILS;
  const driverEmailsValue = Array.isArray(pricing.driverEmails) ? pricing.driverEmails.join(', ') : '';
  const hourlyRate = Number.isFinite(Number(pricing.hourlyRate))
    ? Number(pricing.hourlyRate)
    : DEFAULT_HOURLY_RATE;
  const serviceTypes = normalizeServiceTypes(pricing.serviceTypes);
  const defaultServiceType = serviceTypes.includes(pricing.defaultServiceType)
    ? pricing.defaultServiceType
    : serviceTypes[0];
  const featuredRoutes =
    Array.isArray(pricing.featuredRoutes) && pricing.featuredRoutes.length
      ? pricing.featuredRoutes
      : DEFAULT_FEATURED_ROUTES;
  const pricingCards = featuredRoutes
    .map(
      (route, index) => `
        <div class="pricing-card" data-route-card>
          <strong>Route ${index + 1}</strong>
          <span>Shown on the website and both apps.</span>
          <div class="pricing-card-order">
            <button class="mini-action" type="button" data-move-route="up">Move Up</button>
            <button class="mini-action" type="button" data-move-route="down">Move Down</button>
          </div>
          <input type="text" data-route-label value="${escapeHtml(route.label)}" />
          <input type="number" min="1" step="0.01" data-route-price value="${escapeHtml(route.price)}" />
        </div>
      `
    )
    .join('');
  const serviceTypeOptions = serviceTypes
    .map(
      (serviceType) =>
        `<option value="${escapeHtml(serviceType)}" ${serviceType === defaultServiceType ? 'selected' : ''}>${escapeHtml(serviceType)}</option>`
    )
    .join('');
  const tableRows = rows
    .map((row) => {
      const stopsText = parseStopsText(row.stops);
      const canApprove = String(row.payment_status || '').toLowerCase() === 'pending_review';
      const canEditPrice = canApprove;
      const totalDollars = row.estimated_total_cents
        ? (Number(row.estimated_total_cents) / 100).toFixed(2)
        : '';
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
          <td>${escapeHtml(row.service_type || DEFAULT_SERVICE_TYPE)}</td>
          <td>${escapeHtml(row.estimated_hours || '')}</td>
          <td>
            <form class="inline-price-form" data-price-form>
              <input type="hidden" name="id" value="${escapeHtml(row.id)}" />
              <span>$</span>
              <input
                class="inline-price-input"
                type="number"
                min="1"
                step="0.01"
                name="estimated_total"
                value="${escapeHtml(totalDollars)}"
                ${canEditPrice ? '' : 'disabled'}
              />
              ${
                canEditPrice
                  ? '<button class="row-action" type="submit">Save</button>'
                  : '<span class="row-status">Locked</span>'
              }
            </form>
          </td>
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
    .pricing-card-order { display: flex; gap: 8px; flex-wrap: wrap; }
    .pricing-panel-actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .warning { color: rgba(240,178,71,0.8); font-size: 0.8rem; letter-spacing: 0.08em; }
    .danger { background: transparent; border: 1px solid rgba(240,178,71,0.4); color: #f0b247; padding: 8px 14px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; cursor: pointer; }
    .mini-action { background: rgba(255,255,255,0.03); border: 1px solid rgba(240,178,71,0.24); color: #f7f5f2; padding: 7px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.6rem; cursor: pointer; }
    .row-action { display: inline-flex; margin: 0 6px 6px 0; padding: 8px 10px; border-radius: 999px; border: 1px solid rgba(240,178,71,0.28); background: rgba(255,255,255,0.03); color: #f7f5f2; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.62rem; cursor: pointer; }
    .row-action.approve { border-color: rgba(107, 209, 143, 0.35); color: #8ef0b1; }
    .row-action.reject { border-color: rgba(240, 178, 71, 0.28); color: #f0b247; }
    .row-status { color: rgba(247,245,242,0.75); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.68rem; }
    .inline-price-form { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .inline-price-form span { color: #f0b247; font-size: 0.82rem; }
    .inline-price-input { width: 94px; padding: 8px 10px; border-radius: 999px; border: 1px solid rgba(240,178,71,0.24); background: rgba(0,0,0,0.4); color: #f7f5f2; }
    .inline-price-input:disabled { opacity: 0.55; cursor: not-allowed; }
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
      <a class="danger" href="/admin/support" style="text-decoration:none; display:inline-flex; align-items:center;">Support</a>
      <button class="danger" id="clear-bookings" type="button">Clear Bookings</button>
      <span class="warning">Warning: this permanently deletes all bookings.</span>
    </div>
    <form class="pricing-panel" id="pricing-form">
      <div class="pricing-header">
        <h2>Pricing Controls</h2>
        <span class="subtle">These booking settings update the website, iOS app, Android app, and pricing math.</span>
      </div>
      <input type="hidden" name="route_count" value="${escapeHtml(featuredRoutes.length)}" />
      <div class="pricing-grid">
        <div class="pricing-card">
          <strong>Vehicle Options</strong>
          <span>One value per line. The default option appears first in the booking forms.</span>
          <textarea name="service_types" rows="4" style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid rgba(240,178,71,0.24); background:rgba(0,0,0,0.42); color:#f7f5f2; font-size:0.95rem; resize:vertical;">${escapeHtml(serviceTypes.join('\n'))}</textarea>
        </div>
        <div class="pricing-card">
          <strong>Default Vehicle</strong>
          <span>Used when a customer has not chosen a vehicle yet.</span>
          <select name="default_service_type" style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid rgba(240,178,71,0.24); background:rgba(0,0,0,0.42); color:#f7f5f2; font-size:0.95rem;">${serviceTypeOptions}</select>
        </div>
        <div class="pricing-card">
          <strong>Hourly Rate</strong>
          <span>Used for all route estimates and hourly pricing.</span>
          <input type="number" min="1" step="0.01" name="hourly_rate" value="${escapeHtml(hourlyRate)}" />
        </div>
        ${pricingCards}
      </div>
      <div class="pricing-panel-actions">
        <button class="danger" id="add-route" type="button">Add Route</button>
        <button class="danger" type="submit">Save Pricing</button>
        <span class="warning" id="pricing-status">Current flat rates are editable here.</span>
      </div>
    </form>
    <form class="pricing-panel" id="admin-emails-form">
      <div class="pricing-header">
        <h2>Admin Emails</h2>
        <span class="subtle">These emails can sign in to the admin and driver apps with Supabase auth.</span>
      </div>
      <div class="pricing-grid">
        <div class="pricing-card" style="grid-column: 1 / -1;">
          <strong>Allowed Emails</strong>
          <span>Separate addresses with commas or new lines.</span>
          <textarea name="admin_emails" rows="4" style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid rgba(240,178,71,0.24); background:rgba(0,0,0,0.42); color:#f7f5f2; font-size:0.95rem; resize:vertical;">${escapeHtml(adminEmailsValue)}</textarea>
        </div>
      </div>
      <button class="danger" type="submit">Save Admin Emails</button>
      <span class="warning" id="admin-emails-status">Current admin email allowlist is editable here.</span>
    </form>
    <form class="pricing-panel" id="driver-accounts-form">
      <div class="pricing-header">
        <h2>Driver Accounts</h2>
        <span class="subtle">These emails can sign in to the driver app only. Create the user in Supabase Auth first.</span>
      </div>
      <div class="pricing-grid">
        <div class="pricing-card" style="grid-column: 1 / -1;">
          <strong>Driver Emails</strong>
          <span>Separate addresses with commas or new lines.</span>
          <textarea name="driver_emails" rows="4" style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid rgba(240,178,71,0.24); background:rgba(0,0,0,0.42); color:#f7f5f2; font-size:0.95rem; resize:vertical;">${escapeHtml(driverEmailsValue)}</textarea>
        </div>
      </div>
      <button class="danger" type="submit">Save Driver Accounts</button>
      <span class="warning" id="driver-accounts-status">Current driver allowlist is editable here.</span>
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
          <th>Vehicle</th>
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
    const addRouteButton = document.getElementById('add-route');
    const renumberRouteCards = () => {
      const cards = Array.from(document.querySelectorAll('[data-route-card]'));
      cards.forEach((card, index) => {
        const title = card.querySelector('strong');
        if (title) title.textContent = 'Route ' + (index + 1);
      });
      const routeCountInput = pricingForm ? pricingForm.querySelector('input[name="route_count"]') : null;
      if (routeCountInput) routeCountInput.value = String(cards.length);
    };
    if (addRouteButton && pricingForm) {
      addRouteButton.addEventListener('click', () => {
        const routeCountInput = pricingForm.querySelector('input[name="route_count"]');
        const pricingGrid = pricingForm.querySelector('.pricing-grid');
        if (!routeCountInput || !pricingGrid) return;
        const nextIndex = Number(routeCountInput.value || '0') + 1;
        routeCountInput.value = String(nextIndex);
        const wrapper = document.createElement('div');
        wrapper.className = 'pricing-card';
        wrapper.dataset.routeCard = 'true';
        wrapper.innerHTML =
          '<strong>Route ' + nextIndex + '</strong>' +
          '<span>Shown on the website and both apps.</span>' +
          '<div class="pricing-card-order">' +
          '<button class="mini-action" type="button" data-move-route="up">Move Up</button>' +
          '<button class="mini-action" type="button" data-move-route="down">Move Down</button>' +
          '</div>' +
          '<input type="text" data-route-label value="" />' +
          '<input type="number" min="1" step="0.01" data-route-price value="" />';
        pricingGrid.appendChild(wrapper);
        renumberRouteCards();
      });
    }
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-move-route]');
      if (!button || !pricingForm) return;
      const card = button.closest('[data-route-card]');
      const pricingGrid = pricingForm.querySelector('.pricing-grid');
      if (!card || !pricingGrid) return;
      if (button.dataset.moveRoute === 'up' && card.previousElementSibling && card.previousElementSibling.hasAttribute('data-route-card')) {
        pricingGrid.insertBefore(card, card.previousElementSibling);
      }
      if (button.dataset.moveRoute === 'down' && card.nextElementSibling && card.nextElementSibling.hasAttribute('data-route-card')) {
        pricingGrid.insertBefore(card.nextElementSibling, card);
      }
      renumberRouteCards();
    });
    if (pricingForm) {
      pricingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {};
        const routeCountInput = pricingForm.querySelector('input[name="route_count"]');
        payload.hourly_rate = pricingForm.querySelector('input[name="hourly_rate"]')?.value || '';
        payload.service_types = pricingForm.querySelector('textarea[name="service_types"]')?.value || '';
        payload.default_service_type = pricingForm.querySelector('select[name="default_service_type"]')?.value || '';
        const routeCards = Array.from(pricingForm.querySelectorAll('[data-route-card]'));
        payload.route_count = String(routeCards.length);
        routeCards.forEach((card, index) => {
          payload['route_' + (index + 1) + '_label'] = card.querySelector('[data-route-label]')?.value || '';
          payload['route_' + (index + 1) + '_price'] = card.querySelector('[data-route-price]')?.value || '';
        });
        if (routeCountInput) routeCountInput.value = payload.route_count;
        if (pricingStatus) pricingStatus.textContent = 'Saving...';
        const query = new URLSearchParams(payload);
        window.location.href = '/admin/pricing?' + query.toString();
      });
    }

    const adminEmailsForm = document.getElementById('admin-emails-form');
    const adminEmailsStatus = document.getElementById('admin-emails-status');
    if (adminEmailsForm) {
      adminEmailsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(adminEmailsForm);
        const query = new URLSearchParams({ admin_emails: formData.get('admin_emails') || '' });
        if (adminEmailsStatus) adminEmailsStatus.textContent = 'Saving...';
        window.location.href = '/admin/admin-emails?' + query.toString();
      });
    }

    const driverAccountsForm = document.getElementById('driver-accounts-form');
    const driverAccountsStatus = document.getElementById('driver-accounts-status');
    if (driverAccountsForm) {
      driverAccountsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(driverAccountsForm);
        const query = new URLSearchParams({ driver_emails: formData.get('driver_emails') || '' });
        if (driverAccountsStatus) driverAccountsStatus.textContent = 'Saving...';
        window.location.href = '/admin/driver-accounts?' + query.toString();
      });
    }

    document.querySelectorAll('[data-price-form]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const id = formData.get('id');
        const amount = formData.get('estimated_total');
        const input = form.querySelector('.inline-price-input');
        if (input && input.disabled) return;
        if (!id || !amount) return;
        window.location.href = '/admin/booking-price?id=' + encodeURIComponent(id) + '&amount=' + encodeURIComponent(amount);
      });
    });

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
  async fetch(request, env, ctx) {
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
      url.pathname === '/admin/admin-emails' ||
      url.pathname === '/admin/driver-accounts' ||
      url.pathname === '/admin/booking-price' ||
      url.pathname === '/admin/approve' ||
      url.pathname === '/admin/reject' ||
      url.pathname === '/admin/support' ||
      url.pathname === '/admin/support/create' ||
      url.pathname === '/admin/support/case' ||
      url.pathname === '/admin/support/resolve' ||
      url.pathname === '/admin/inbox' ||
      url.pathname === '/admin/inbox/reply' ||
      url.pathname === '/crm' ||
      url.pathname === '/crm/export' ||
      url.pathname === '/crm/profile'
    ) {
      const auth = parseBasicAuth(request.headers.get('Authorization'));
      if (!auth || auth.user !== 'admin' || auth.pass !== env.ADMIN_PASSWORD) {
        return unauthorized();
      }
    }

    if (url.pathname === '/api/turnstile/verify') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const verification = await verifyTurnstileToken(
        env,
        payload?.token || payload?.turnstile_token || '',
        request.headers.get('CF-Connecting-IP') || ''
      );
      if (!verification.ok) {
        return jsonResponse({ ok: false, error: verification.error }, 400, origin);
      }

      return jsonResponse({ ok: true }, 200, origin);
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

    if (url.pathname === '/api/customer/cancel-booking') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.replace('Bearer ', '').trim()
        : '';
      if (!token) {
        return jsonResponse({ ok: false, error: 'Missing access token' }, 401, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const bookingId = Number.parseInt(payload?.id, 10);
      if (!Number.isFinite(bookingId) || bookingId <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }

      try {
        const authPayload = await verifySupabaseAccessToken(token);
        if (!authPayload) {
          return jsonResponse({ ok: false, error: 'Invalid access token' }, 401, origin);
        }

        const email = String(authPayload.email || '').trim().toLowerCase();
        const userId = String(authPayload.sub || authPayload.user_id || '').trim();
        await ensureBookingColumns(env);
        const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1')
          .bind(bookingId)
          .first();
        if (!booking) {
          return jsonResponse({ ok: false, error: 'Booking not found' }, 404, origin);
        }

        const bookingEmail = String(booking.customer_email || '').trim().toLowerCase();
        const bookingUserId = String(booking.customer_user_id || '').trim();
        const ownsBooking = (email && bookingEmail === email) || (userId && bookingUserId === userId);
        if (!ownsBooking) {
          return jsonResponse({ ok: false, error: 'Booking not found' }, 404, origin);
        }

        const currentStatus = String(booking.payment_status || '').trim().toLowerCase();
        if (['cancelled', 'rejected', 'completed'].includes(currentStatus)) {
          return jsonResponse({ ok: false, error: 'This booking cannot be cancelled.' }, 400, origin);
        }

        const policy = cancellationPolicyForBooking(booking);
        const cancelledAt = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE bookings
           SET payment_status = ?,
               cancelled_at = ?,
               cancellation_refund_percent = ?
           WHERE id = ?`
        )
          .bind('cancelled', cancelledAt, policy.refundPercent, bookingId)
          .run();

        await sendSlack(
          env,
          [
            '*Booking cancelled by customer*',
            `Booking: #${bookingId}`,
            `Name: ${booking.full_name || '—'}`,
            `Pickup: ${booking.pickup_date || '—'} ${booking.pickup_time || ''}`,
            `Refund eligibility: ${policy.refundPercent}%`
          ].join('\n')
        );
        if (ctx) {
          ctx.waitUntil(
            sendBookingCancelledEmails(env, {
              ...booking,
              payment_status: 'cancelled',
              cancelled_at: cancelledAt,
              cancellation_refund_percent: policy.refundPercent
            }, policy)
          );
        } else {
          await sendBookingCancelledEmails(env, {
            ...booking,
            payment_status: 'cancelled',
            cancelled_at: cancelledAt,
            cancellation_refund_percent: policy.refundPercent
          }, policy);
        }
        if (ctx) {
          ctx.waitUntil(
            sendAdminPushNotification(env, {
              title: 'Booking cancelled',
              body: `#${bookingId} ${booking.full_name || 'Customer'} • ${policy.refundPercent}% refund eligible`,
              kind: 'booking_cancelled',
              data: {
                booking_id: bookingId,
                refund_percent: policy.refundPercent,
                payment_status: 'cancelled'
              }
            })
          );
        }

        return jsonResponse(
          {
            ok: true,
            payment_status: 'cancelled',
            refund_percent: policy.refundPercent,
            refund_message: policy.message
          },
          200,
          origin
        );
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error: `Unable to cancel booking: ${error?.message || 'Unknown error'}`
          },
          500,
          origin
        );
      }
    }

    if (url.pathname === '/api/customer/support') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.replace('Bearer ', '').trim()
        : '';
      if (!token) {
        return jsonResponse({ ok: false, error: 'Missing access token' }, 401, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      try {
        const authPayload = await verifySupabaseAccessToken(token);
        if (!authPayload) {
          return jsonResponse({ ok: false, error: 'Invalid access token' }, 401, origin);
        }

        const email = String(authPayload.email || '').trim().toLowerCase();
        const userId = String(authPayload.sub || authPayload.user_id || '').trim();
        const bookingId = Number.parseInt(String(payload?.booking_id || ''), 10);
        const details = String(payload?.details || '').trim();
        const issueType = String(payload?.issue_type || 'General support').trim() || 'General support';
        if (!details) {
          return jsonResponse({ ok: false, error: 'Add support details first.' }, 400, origin);
        }

        await ensureSupportTables(env);
        await ensureBookingColumns(env);

        let booking = null;
        if (Number.isFinite(bookingId) && bookingId > 0) {
          booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1')
            .bind(bookingId)
            .first();
          const bookingEmail = String(booking?.customer_email || '').trim().toLowerCase();
          const bookingUserId = String(booking?.customer_user_id || '').trim();
          const ownsBooking = booking && ((email && bookingEmail === email) || (userId && bookingUserId === userId));
          if (!ownsBooking) {
            return jsonResponse({ ok: false, error: 'Booking not found' }, 404, origin);
          }
        }

        const now = new Date().toISOString();
        const insert = await env.DB.prepare(
          `INSERT INTO support_cases (
            booking_id,
            customer_name,
            customer_email,
            customer_phone,
            issue_type,
            priority,
            status,
            details,
            resolution,
            created_at,
            updated_at,
            resolved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            booking ? booking.id : null,
            String(payload?.customer_name || booking?.full_name || '').trim(),
            String(payload?.customer_email || booking?.customer_email || email || '').trim(),
            String(payload?.customer_phone || booking?.contact_number || '').trim(),
            issueType,
            'Normal',
            'open',
            details,
            '',
            now,
            now,
            ''
          )
          .run();

        const caseId = insert?.meta?.last_row_id || null;
        await sendSlack(
          env,
          [
            '*New app help request*',
            `Case: #${caseId || 'new'}`,
            booking ? `Booking: #${booking.id}` : 'Booking: General support',
            `Customer: ${payload?.customer_name || booking?.full_name || email || '—'}`,
            `Issue: ${issueType}`,
            `Details: ${details}`
          ].join('\n')
        );
        if (ctx) {
          ctx.waitUntil(
            sendAdminPushNotification(env, {
              title: 'New support ticket',
              body: `#${caseId || 'new'} ${issueType} • ${payload?.customer_name || booking?.full_name || email || 'Customer'}`,
              kind: 'support_ticket',
              data: {
                case_id: caseId,
                booking_id: booking ? booking.id : null
              }
            })
          );
        }

        return jsonResponse({ ok: true, id: caseId }, 200, origin);
      } catch (error) {
        return jsonResponse(
          { ok: false, error: `Unable to send help request: ${error?.message || 'Unknown error'}` },
          500,
          origin
        );
      }
    }

    if (url.pathname === '/webhooks/resend-inbound') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const bodyText = await request.text();
      let payload;
      try {
        payload = JSON.parse(bodyText || '{}');
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const verified = await verifyWebhookSignature(request, env, bodyText);
      if (!verified) {
        return jsonResponse({ ok: false, error: 'Invalid webhook signature' }, 401, origin);
      }

      const eventType = String(payload?.type || '').trim();
      if (eventType !== 'email.received') {
        return jsonResponse({ ok: true, ignored: true }, 200, origin);
      }

      if (!env.RESEND_API_KEY) {
        return jsonResponse({ ok: false, error: 'Resend API key is not configured.' }, 500, origin);
      }

      const resendEmailId = String(
        payload?.data?.email_id || payload?.data?.id || payload?.email_id || payload?.id || ''
      ).trim();
      if (!resendEmailId) {
        return jsonResponse({ ok: false, error: 'Missing inbound email id' }, 400, origin);
      }

      try {
        const emailRecord = await fetchReceivedEmailContent(env, resendEmailId);
        await storeInboundEmail(env, emailRecord);
        if (ctx) {
          ctx.waitUntil(
            sendAdminPushNotification(env, {
              title: 'New inbox message',
              body: `${emailRecord.from?.email || 'Unknown sender'} sent ${emailRecord.subject || 'a message'}`,
              kind: 'inbox',
              data: { inbox: true }
            })
          );
        }
        return jsonResponse({ ok: true }, 200, origin);
      } catch (error) {
        return jsonResponse(
          { ok: false, error: error?.message || 'Failed to process inbound email' },
          500,
          origin
        );
      }
    }

    if (url.pathname === '/admin/inbox') {
      return Response.redirect(new URL('/admin/support', request.url).toString(), 302);
    }

    if (url.pathname === '/admin/inbox/reply') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let id = '';
      let replyBody = '';
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          const payload = await request.json();
          id = String(payload?.id || '');
          replyBody = String(payload?.reply_body || payload?.reply || '');
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      } else {
        const form = await request.formData();
        id = String(form.get('id') || '');
        replyBody = String(form.get('reply_body') || '');
      }

      const emailId = Number.parseInt(id, 10);
      if (!Number.isFinite(emailId) || emailId <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid email id' }, 400, origin);
      }
      if (!replyBody.trim()) {
        return jsonResponse({ ok: false, error: 'Reply cannot be empty' }, 400, origin);
      }

      await ensureInboxTables(env);
      const emailRow = await env.DB.prepare('SELECT * FROM inbound_emails WHERE id = ? LIMIT 1')
        .bind(emailId)
        .first();

      if (!emailRow) {
        return jsonResponse({ ok: false, error: 'Email not found' }, 404, origin);
      }

      const result = await sendInboxReply(env, emailRow, replyBody.trim());
      if (!result.ok) {
        if (contentType.includes('application/json')) {
          return jsonResponse({ ok: false, error: result.error }, 500, origin);
        }
        return Response.redirect(new URL(`/admin/inbox?id=${emailId}&status=${encodeURIComponent(result.error)}`, request.url).toString(), 302);
      }

      await env.DB.prepare(
        'UPDATE inbound_emails SET replied_at = ?, reply_message_id = ?, updated_at = ? WHERE id = ?'
      )
        .bind(
          new Date().toISOString(),
          String(result.result?.id || ''),
          new Date().toISOString(),
          emailId
        )
        .run();

      if (contentType.includes('application/json')) {
        return jsonResponse({ ok: true, id: result.result?.id || '' }, 200, origin);
      }
      return Response.redirect(new URL(`/admin/inbox?id=${emailId}&status=Reply%20sent`, request.url).toString(), 302);
    }

    if (url.pathname === '/admin/support') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      await ensureSupportTables(env);
      await ensureBookingColumns(env);
      const [caseResult, bookingResult] = await Promise.all([
        env.DB.prepare(`SELECT * FROM support_cases ORDER BY CASE WHEN status = 'resolved' THEN 1 ELSE 0 END, updated_at DESC, id DESC LIMIT 200`).all(),
        env.DB.prepare('SELECT * FROM bookings ORDER BY created_at DESC, id DESC LIMIT 250').all()
      ]);

      return htmlResponse(
        renderSupportPage(caseResult.results || [], bookingResult.results || [], url.searchParams.get('status') || '')
      );
    }

    if (url.pathname === '/admin/support/create') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const form = await request.formData();
      const bookingId = Number.parseInt(String(form.get('booking_id') || ''), 10);
      const customerName = String(form.get('customer_name') || '').trim();
      const customerEmail = String(form.get('customer_email') || '').trim();
      const customerPhone = String(form.get('customer_phone') || '').trim();
      const issueType = String(form.get('issue_type') || 'General support').trim();
      const priority = String(form.get('priority') || 'Normal').trim();
      const details = String(form.get('details') || '').trim();

      if (!details) {
        return Response.redirect(new URL('/admin/support?status=Add%20support%20details%20first', request.url).toString(), 302);
      }

      await ensureSupportTables(env);
      await ensureBookingColumns(env);
      let booking = null;
      if (Number.isFinite(bookingId) && bookingId > 0) {
        booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(bookingId).first();
      }

      const now = new Date().toISOString();
      const insert = await env.DB.prepare(
        `INSERT INTO support_cases (
          booking_id,
          customer_name,
          customer_email,
          customer_phone,
          issue_type,
          priority,
          status,
          details,
          resolution,
          created_at,
          updated_at,
          resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          booking ? booking.id : null,
          customerName || booking?.full_name || '',
          customerEmail || booking?.customer_email || '',
          customerPhone || booking?.contact_number || '',
          issueType,
          priority,
          'open',
          details,
          '',
          now,
          now,
          ''
        )
        .run();

      const caseId = insert?.meta?.last_row_id;
      await sendSlack(
        env,
        [
          '*New support case*',
          `Case: #${caseId || 'new'}`,
          booking ? `Booking: #${booking.id}` : 'Booking: General support',
          `Customer: ${customerName || booking?.full_name || '—'}`,
          `Issue: ${issueType}`,
          `Priority: ${priority}`,
          `Details: ${details}`
        ].join('\n')
      );
      if (ctx) {
        ctx.waitUntil(
          sendAdminPushNotification(env, {
            title: 'New support case',
            body: `#${caseId || 'new'} ${issueType} • ${customerName || booking?.full_name || 'Customer'}`,
            kind: 'support_case',
            data: {
              case_id: caseId || null,
              booking_id: booking ? booking.id : null
            }
          })
        );
      }

      return Response.redirect(
        new URL(`/admin/support/case?id=${encodeURIComponent(caseId || '')}&status=Support%20case%20created`, request.url).toString(),
        302
      );
    }

    if (url.pathname === '/admin/support/case') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const caseId = Number.parseInt(String(url.searchParams.get('id') || ''), 10);
      if (!Number.isFinite(caseId) || caseId <= 0) {
        return htmlResponse(renderSupportCasePage(null, null, 'Invalid support case'));
      }

      await ensureSupportTables(env);
      await ensureBookingColumns(env);
      const supportCase = await env.DB.prepare('SELECT * FROM support_cases WHERE id = ? LIMIT 1').bind(caseId).first();
      const booking = supportCase?.booking_id
        ? await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(supportCase.booking_id).first()
        : null;

      return htmlResponse(renderSupportCasePage(supportCase, booking, url.searchParams.get('status') || ''));
    }

    if (url.pathname === '/admin/support/resolve') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const form = await request.formData();
      const caseId = Number.parseInt(String(form.get('id') || ''), 10);
      const resolution = String(form.get('resolution') || '').trim();
      if (!Number.isFinite(caseId) || caseId <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid support case id' }, 400, origin);
      }
      if (!resolution) {
        return Response.redirect(new URL(`/admin/support/case?id=${caseId}&status=Add%20a%20resolution%20first`, request.url).toString(), 302);
      }

      await ensureSupportTables(env);
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE support_cases
         SET status = ?,
             resolution = ?,
             resolved_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind('resolved', resolution, now, now, caseId)
        .run();
      if (ctx) {
        ctx.waitUntil(
          sendAdminPushNotification(env, {
            title: 'Support case resolved',
            body: `Case #${caseId} was marked resolved`,
            kind: 'support_resolved',
            data: { case_id: caseId }
          })
        );
      }

      return Response.redirect(new URL(`/admin/support/case?id=${caseId}&status=Case%20resolved`, request.url).toString(), 302);
    }

    if (url.pathname.startsWith('/api/admin/')) {
      const auth = await requireAdminApiAuth(request, env, origin);
      if (auth.response) return auth.response;
    }

    if (url.pathname.startsWith('/api/driver/')) {
      const auth = await requireDriverApiAuth(request, env, origin);
      if (auth.response) return auth.response;
    }

    if (url.pathname === '/api/driver/me') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      const auth = await requireDriverApiAuth(request, env, origin);
      if (auth.response) return auth.response;
      return jsonResponse({ ok: true, email: auth.email }, 200, origin);
    }

    if (url.pathname === '/api/driver/bookings') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      await ensureBookingColumns(env);
      const { results } = await env.DB.prepare(
        `SELECT * FROM bookings
         WHERE LOWER(COALESCE(payment_status, '')) IN ('paid', 'approved_email_sent')
           AND LOWER(COALESCE(driver_status, '')) != 'completed'
         ORDER BY pickup_date ASC, pickup_time ASC, created_at DESC
         LIMIT 300`
      ).all();
      return jsonResponse({ ok: true, bookings: (results || []).map(serializeAdminBooking) }, 200, origin);
    }

    if (url.pathname === '/api/driver/bookings/status') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const id = Number.parseInt(String(payload?.id || ''), 10);
      const status = String(payload?.status || '').trim().toLowerCase().replace(/\s+/g, '_');
      const allowedStatuses = new Set(['assigned', 'on_the_way', 'arrived', 'picked_up', 'completed', '']);
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }
      if (!allowedStatuses.has(status)) {
        return jsonResponse({ ok: false, error: 'Invalid driver status' }, 400, origin);
      }

      await ensureBookingColumns(env);
      await env.DB.prepare('UPDATE bookings SET driver_status = ? WHERE id = ?').bind(status, id).run();
      const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(id).first();
      return jsonResponse({ ok: true, booking: booking ? serializeAdminBooking(booking) : null }, 200, origin);
    }

    if (url.pathname === '/api/admin/dashboard') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      await ensureCrmTables(env);
      await ensureInboxTables(env);
      const [bookingResult, inboxResult] = await Promise.all([
        env.DB.prepare('SELECT * FROM bookings ORDER BY pickup_date ASC, pickup_time ASC, created_at DESC LIMIT 200').all(),
        env.DB.prepare('SELECT * FROM inbound_emails ORDER BY received_at DESC, id DESC LIMIT 50').all()
      ]);

      const bookings = (bookingResult.results || []).filter(
        (row) => String(row.payment_status || '').toLowerCase() !== 'rejected'
      );
      const activeBookings = bookings.filter(
        (row) => String(row.driver_status || '').toLowerCase() !== 'completed'
      );
      const currentTrip = activeBookings[0] ? serializeDriverTrip(activeBookings[0]) : null;
      const nextTrips = activeBookings.slice(currentTrip ? 1 : 0, currentTrip ? 5 : 4).map(serializeDriverTrip);
      const inboxRows = inboxResult.results || [];
      const unreadCount = inboxRows.filter((row) => Number(row.is_read || 0) === 0).length;
      const today = getLosAngelesNowStrings().date;
      const todayCount = bookings.filter((row) => String(row.pickup_date || '').slice(0, 10) === today).length;
      const metrics = [
        { title: 'Pending', value: String(bookings.filter((row) => String(row.payment_status || '').toLowerCase() === 'pending_review').length) },
        { title: 'Today', value: `${todayCount} rides` },
        { title: 'Unread', value: String(unreadCount) },
        { title: 'Revenue', value: formatCurrency(bookings.reduce((sum, row) => sum + Number(row.estimated_total_cents || 0), 0)) }
      ];

      return jsonResponse({ ok: true, current_trip: currentTrip, next_trips: nextTrips, metrics }, 200, origin);
    }

    if (url.pathname === '/api/admin/bookings') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const { results } = await env.DB.prepare(
        'SELECT * FROM bookings ORDER BY pickup_date ASC, pickup_time ASC, created_at DESC LIMIT 300'
      ).all();
      return jsonResponse({ ok: true, bookings: (results || []).map(serializeAdminBooking) }, 200, origin);
    }

    if (url.pathname === '/api/admin/bookings/status') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const id = Number.parseInt(String(payload?.id || ''), 10);
      const status = String(payload?.status || '').trim().toLowerCase().replace(/\s+/g, '_');
      const allowedStatuses = new Set(['assigned', 'on_the_way', 'arrived', 'picked_up', 'completed', '']);
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }
      if (!allowedStatuses.has(status)) {
        return jsonResponse({ ok: false, error: 'Invalid driver status' }, 400, origin);
      }

      await ensureBookingColumns(env);
      await env.DB.prepare('UPDATE bookings SET driver_status = ? WHERE id = ?').bind(status, id).run();
      const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(id).first();
      return jsonResponse({ ok: true, booking: booking ? serializeAdminBooking(booking) : null }, 200, origin);
    }

    if (url.pathname === '/api/admin/bookings/approve') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const id = Number.parseInt(String(payload?.id || ''), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }

      const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(id).first();
      if (!booking) {
        return jsonResponse({ ok: false, error: 'Booking not found' }, 404, origin);
      }
      if (String(booking.payment_status || '').toLowerCase() !== 'pending_review') {
        return jsonResponse({ ok: false, error: 'Only pending bookings can be approved' }, 400, origin);
      }

      const result = await approveBookingAndEmail(env, booking);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 500, origin);
      }

      const refreshed = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(id).first();
      return jsonResponse({ ok: true, booking: refreshed ? serializeAdminBooking(refreshed) : null }, 200, origin);
    }

    if (url.pathname === '/api/admin/bookings/reject') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const id = Number.parseInt(String(payload?.id || ''), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }

      await env.DB.prepare('UPDATE bookings SET payment_status = ? WHERE id = ?').bind('rejected', id).run();
      const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(id).first();
      return jsonResponse({ ok: true, booking: booking ? serializeAdminBooking(booking) : null }, 200, origin);
    }

    if (url.pathname === '/api/admin/bookings/remind-now') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const id = Number.parseInt(String(payload?.id || ''), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }

      const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(id).first();
      if (!booking) {
        return jsonResponse({ ok: false, error: 'Booking not found' }, 404, origin);
      }
      if (String(booking.payment_status || '').toLowerCase() !== 'paid') {
        return jsonResponse({ ok: false, error: 'Booking must be paid before sending reminders' }, 400, origin);
      }

      const sent = await sendBookingReminderEmail(env, booking, 'manual');
      if (!sent.ok) {
        return jsonResponse({ ok: false, error: sent.error }, 500, origin);
      }
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (url.pathname === '/api/admin/push/register') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      const auth = await requireAdminApiAuth(request, env, origin);
      if (auth.response) return auth.response;

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const token = String(payload?.token || '').trim().toLowerCase();
      const platform = String(payload?.platform || 'ios').trim().toLowerCase();
      const bundleId = String(payload?.bundle_id || env.APNS_TOPIC_ADMIN || 'com.luxtravco.admin').trim();

      if (!/^[a-f0-9]{64,}$/i.test(token)) {
        return jsonResponse({ ok: false, error: 'Invalid device token' }, 400, origin);
      }

      await upsertAdminPushToken(env, {
        token,
        userId: String(auth.payload?.sub || '').trim(),
        email: String(auth.email || '').trim().toLowerCase(),
        platform,
        bundleId
      });

      return jsonResponse({ ok: true }, 200, origin);
    }

    if (url.pathname === '/api/admin/inbox') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      await ensureInboxTables(env);
      const { results } = await env.DB.prepare('SELECT * FROM inbound_emails ORDER BY received_at DESC, id DESC LIMIT 200').all();
      return jsonResponse({ ok: true, inbox: (results || []).map(serializeInboxMessage) }, 200, origin);
    }

    if (url.pathname === '/api/admin/inbox/read') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }
      const id = Number.parseInt(String(payload?.id || ''), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid email id' }, 400, origin);
      }
      await ensureInboxTables(env);
      await env.DB.prepare('UPDATE inbound_emails SET is_read = 1, updated_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), id)
        .run();
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (url.pathname === '/api/admin/inbox/reply') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }
      const emailId = Number.parseInt(String(payload?.id || ''), 10);
      const replyBody = String(payload?.reply_body || payload?.reply || '').trim();
      if (!Number.isFinite(emailId) || emailId <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid email id' }, 400, origin);
      }
      if (!replyBody) {
        return jsonResponse({ ok: false, error: 'Reply cannot be empty' }, 400, origin);
      }
      await ensureInboxTables(env);
      const emailRow = await env.DB.prepare('SELECT * FROM inbound_emails WHERE id = ? LIMIT 1').bind(emailId).first();
      if (!emailRow) {
        return jsonResponse({ ok: false, error: 'Email not found' }, 404, origin);
      }
      const result = await sendInboxReply(env, emailRow, replyBody);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 500, origin);
      }
      const now = new Date().toISOString();
      await env.DB.prepare('UPDATE inbound_emails SET replied_at = ?, reply_message_id = ?, updated_at = ?, is_read = 1 WHERE id = ?')
        .bind(now, String(result.result?.id || ''), now, emailId)
        .run();
      return jsonResponse({ ok: true, reply_id: String(result.result?.id || '') }, 200, origin);
    }

    if (url.pathname === '/api/admin/customers') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      await ensureCrmTables(env);
      const [bookingResult, profileResult] = await Promise.all([
        env.DB.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500').all(),
        env.DB.prepare('SELECT * FROM customer_profiles ORDER BY last_booking_at DESC, updated_at DESC').all()
      ]);
      const customers = buildCustomerCrm(bookingResult.results || [], profileResult.results || []).map(serializeCustomerCard);
      return jsonResponse({ ok: true, customers }, 200, origin);
    }

    if (url.pathname === '/api/admin/support') {
      if (request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      await ensureSupportTables(env);
      await ensureBookingColumns(env);
      const [caseResult, bookingResult] = await Promise.all([
        env.DB.prepare(
          `SELECT * FROM support_cases
           ORDER BY CASE WHEN status = 'resolved' THEN 1 ELSE 0 END, updated_at DESC, id DESC
           LIMIT 200`
        ).all(),
        env.DB.prepare('SELECT * FROM bookings ORDER BY created_at DESC, id DESC LIMIT 250').all()
      ]);
      return jsonResponse(
        {
          ok: true,
          cases: (caseResult.results || []).map(serializeSupportCase),
          bookings: (bookingResult.results || []).map(serializeAdminBooking)
        },
        200,
        origin
      );
    }

    if (url.pathname === '/api/admin/support/create') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const bookingId = Number.parseInt(String(payload?.booking_id || ''), 10);
      const details = String(payload?.details || '').trim();
      if (!details) {
        return jsonResponse({ ok: false, error: 'Add support details first' }, 400, origin);
      }

      await ensureSupportTables(env);
      await ensureBookingColumns(env);
      let booking = null;
      if (Number.isFinite(bookingId) && bookingId > 0) {
        booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(bookingId).first();
      }

      const now = new Date().toISOString();
      const insert = await env.DB.prepare(
        `INSERT INTO support_cases (
          booking_id,
          customer_name,
          customer_email,
          customer_phone,
          issue_type,
          priority,
          status,
          details,
          resolution,
          created_at,
          updated_at,
          resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          booking ? booking.id : null,
          String(payload?.customer_name || booking?.full_name || '').trim(),
          String(payload?.customer_email || booking?.customer_email || '').trim(),
          String(payload?.customer_phone || booking?.contact_number || '').trim(),
          String(payload?.issue_type || 'General support').trim() || 'General support',
          String(payload?.priority || 'Normal').trim() || 'Normal',
          'open',
          details,
          '',
          now,
          now,
          ''
        )
        .run();

      const caseId = insert?.meta?.last_row_id || null;
      const supportCase = caseId
        ? await env.DB.prepare('SELECT * FROM support_cases WHERE id = ? LIMIT 1').bind(caseId).first()
        : null;
      if (ctx) {
        ctx.waitUntil(
          sendAdminPushNotification(env, {
            title: 'New support case',
            body: `#${caseId || 'new'} ${supportCase?.issue_type || 'General support'} • ${supportCase?.customer_name || 'Customer'}`,
            kind: 'support_case',
            data: {
              case_id: caseId,
              booking_id: supportCase?.booking_id || null
            }
          })
        );
      }
      return jsonResponse(
        { ok: true, case: supportCase ? serializeSupportCase(supportCase) : null },
        200,
        origin
      );
    }

    if (url.pathname === '/api/admin/support/resolve') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }
      const caseId = Number.parseInt(String(payload?.id || ''), 10);
      const resolution = String(payload?.resolution || '').trim();
      if (!Number.isFinite(caseId) || caseId <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid support case id' }, 400, origin);
      }
      if (!resolution) {
        return jsonResponse({ ok: false, error: 'Add a resolution first' }, 400, origin);
      }

      await ensureSupportTables(env);
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE support_cases
         SET status = ?,
             resolution = ?,
             resolved_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind('resolved', resolution, now, now, caseId)
        .run();
      const supportCase = await env.DB.prepare('SELECT * FROM support_cases WHERE id = ? LIMIT 1').bind(caseId).first();
      if (ctx) {
        ctx.waitUntil(
          sendAdminPushNotification(env, {
            title: 'Support case resolved',
            body: `#${caseId} ${supportCase?.issue_type || 'Case'} was marked resolved`,
            kind: 'support_resolved',
            data: {
              case_id: caseId,
              booking_id: supportCase?.booking_id || null
            }
          })
        );
      }
      return jsonResponse(
        { ok: true, case: supportCase ? serializeSupportCase(supportCase) : null },
        200,
        origin
      );
    }

    if (url.pathname === '/api/admin/pricing') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const hourlyRate = Number.parseFloat(payload?.hourly_rate);
      const serviceTypes = normalizeServiceTypes(payload?.service_types || '');
      const defaultServiceType = String(payload?.default_service_type || serviceTypes[0] || DEFAULT_SERVICE_TYPE).trim();
      const requestedRouteCount = Number.parseInt(payload?.route_count || `${DEFAULT_FEATURED_ROUTES.length}`, 10);
      const routeCount = Number.isFinite(requestedRouteCount) && requestedRouteCount > 0
        ? requestedRouteCount
        : DEFAULT_FEATURED_ROUTES.length;
      const featuredRoutes = Array.from({ length: routeCount }, (_, index) => {
        const route = DEFAULT_FEATURED_ROUTES[index] || {
          key: routeKeyForIndex(index),
          label: `Route ${index + 1}`,
          price: DEFAULT_ROUTE_PRICE
        };
        return {
          key: route.key,
          label: String(payload?.[`${route.key}_label`] || '').trim(),
          price: Number.parseFloat(payload?.[`${route.key}_price`])
        };
      });

      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid hourly rate' }, 400, origin);
      }
      if (!serviceTypes.length) {
        return jsonResponse({ ok: false, error: 'Add at least one vehicle option' }, 400, origin);
      }
      if (!serviceTypes.includes(defaultServiceType)) {
        return jsonResponse({ ok: false, error: 'Default vehicle must match one of the vehicle options' }, 400, origin);
      }
      if (featuredRoutes.some((route) => !route.label || !Number.isFinite(route.price) || route.price <= 0)) {
        return jsonResponse({ ok: false, error: 'Every route needs a label and price' }, 400, origin);
      }

      await setPricingSetting(env, 'hourly_rate', hourlyRate.toFixed(2));
      await setPricingSetting(env, 'service_types', JSON.stringify(serviceTypes));
      await setPricingSetting(env, 'default_service_type', defaultServiceType);
      await setPricingSetting(env, 'route_count', String(featuredRoutes.length));
      for (const route of featuredRoutes) {
        await setPricingSetting(env, `${route.key}_label`, route.label);
        await setPricingSetting(env, `${route.key}_price`, route.price.toFixed(2));
      }
      const pricing = await getPricingSettings(env);
      return jsonResponse(
        {
          ok: true,
          pricing: {
            hourly_rate: hourlyRate,
            service_types: serviceTypes,
            default_service_type: defaultServiceType,
            featured_routes: featuredRoutes,
            admin_emails: pricing.adminEmails
          }
        },
        200,
        origin
      );
    }

    if (url.pathname === '/api/admin/admin-emails') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }
      const normalized = normalizeAdminEmails(payload?.admin_emails || '');
      if (!normalized.length) {
        return jsonResponse({ ok: false, error: 'Add at least one valid admin email' }, 400, origin);
      }
      await setPricingSetting(env, 'admin_emails', normalized.join(','));
      await syncAdminUsersFromEmails(env, normalized);
      return jsonResponse({ ok: true, admin_emails: normalized }, 200, origin);
    }

    if (url.pathname === '/api/admin/driver-accounts') {
      if (request.method === 'GET') {
        const pricing = await getPricingSettings(env);
        return jsonResponse({ ok: true, driver_emails: pricing.driverEmails }, 200, origin);
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
      const normalized = normalizeAdminEmails(payload?.driver_emails || '');
      await setPricingSetting(env, 'driver_emails', normalized.join(','));
      return jsonResponse({ ok: true, driver_emails: normalized }, 200, origin);
    }

    if (url.pathname === '/api/admin/bookings/price') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }
      const id = Number.parseInt(String(payload?.id || ''), 10);
      const dollars = Number.parseFloat(String(payload?.amount || ''));
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking amount' }, 400, origin);
      }
      await env.DB.prepare('UPDATE bookings SET estimated_total_cents = ? WHERE id = ?')
        .bind(Math.round(dollars * 100), id)
        .run();
      const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').bind(id).first();
      return jsonResponse({ ok: true, booking: booking ? serializeAdminBooking(booking) : null }, 200, origin);
    }

    if (url.pathname === '/api/admin/clear') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }
      if (payload?.confirm !== true) {
        return jsonResponse({ ok: false, error: 'Missing confirmation' }, 400, origin);
      }
      await env.DB.prepare('DELETE FROM bookings').run();
      return jsonResponse({ ok: true }, 200, origin);
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
            service_types: pricing.serviceTypes,
            default_service_type: pricing.defaultServiceType,
            featured_routes: pricing.featuredRoutes,
            admin_emails: pricing.adminEmails
          }
        },
        200,
        origin
      );
    }

    if (url.pathname === '/api/estimate') {
      if (request.method !== 'POST') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload;
      try {
        payload = await request.json();
      } catch (error) {
        return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
      }

      const pricing = await getPricingSettings(env);
      const normalizedServiceType = pricing.serviceTypes.includes(String(payload?.service_type || '').trim())
        ? String(payload?.service_type || '').trim()
        : pricing.defaultServiceType;
      const routeEstimate = calculateRouteEstimate(payload?.route_points, payload);
      if (!routeEstimate) {
        return jsonResponse({ ok: false, error: 'Select valid pickup and drop off locations' }, 400, origin);
      }

      const mileRate = serviceMileRate(normalizedServiceType);
      const totalCents = calcTimeAndMileageTotalCents(
        routeEstimate.hours,
        routeEstimate.miles,
        pricing.hourlyRate,
        normalizedServiceType
      );
      return jsonResponse(
        {
          ok: true,
          estimate: {
            hours: Math.round(routeEstimate.hours * 100) / 100,
            minutes: Math.round(routeEstimate.hours * 60),
            miles: routeEstimate.miles,
            total_cents: totalCents,
            total: totalCents / 100,
            hourly_rate: pricing.hourlyRate,
            mile_rate: mileRate,
            service_type: normalizedServiceType,
            source: 'route_mileage'
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

      let payload = Object.fromEntries(url.searchParams.entries());

      if (request.method === 'POST') {
        try {
          payload = await request.json();
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      }

      const hourlyRate = Number.parseFloat(payload?.hourly_rate);
      const serviceTypes = normalizeServiceTypes(payload?.service_types || '');
      const defaultServiceType = String(payload?.default_service_type || serviceTypes[0] || DEFAULT_SERVICE_TYPE).trim();
      const requestedRouteCount = Number.parseInt(payload?.route_count || `${DEFAULT_FEATURED_ROUTES.length}`, 10);
      const routeCount = Number.isFinite(requestedRouteCount) && requestedRouteCount > 0
        ? requestedRouteCount
        : DEFAULT_FEATURED_ROUTES.length;
      const featuredRoutes = Array.from({ length: routeCount }, (_, index) => {
        const route = DEFAULT_FEATURED_ROUTES[index] || {
          key: routeKeyForIndex(index),
          label: `Route ${index + 1}`,
          price: DEFAULT_ROUTE_PRICE
        };
        const label = String(payload?.[`${route.key}_label`] || '').trim();
        const price = Number.parseFloat(payload?.[`${route.key}_price`]);
        return {
          key: route.key,
          label,
          price
        };
      });
      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid hourly rate' }, 400, origin);
      }
      if (!serviceTypes.length) {
        return jsonResponse({ ok: false, error: 'Add at least one vehicle option' }, 400, origin);
      }
      if (!serviceTypes.includes(defaultServiceType)) {
        return jsonResponse({ ok: false, error: 'Default vehicle must match one of the vehicle options' }, 400, origin);
      }
      if (
        featuredRoutes.some(
          (route) => !route.label || !Number.isFinite(route.price) || route.price <= 0
        )
      ) {
        return jsonResponse({ ok: false, error: 'Every route needs a label and price' }, 400, origin);
      }

      await setPricingSetting(env, 'hourly_rate', hourlyRate.toFixed(2));
      await setPricingSetting(env, 'service_types', JSON.stringify(serviceTypes));
      await setPricingSetting(env, 'default_service_type', defaultServiceType);
      await setPricingSetting(env, 'route_count', String(featuredRoutes.length));
      for (const route of featuredRoutes) {
        await setPricingSetting(env, `${route.key}_label`, route.label);
        await setPricingSetting(env, `${route.key}_price`, route.price.toFixed(2));
      }

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }

      return jsonResponse(
        {
          ok: true,
          pricing: {
            hourly_rate: hourlyRate,
            service_types: serviceTypes,
            default_service_type: defaultServiceType,
            featured_routes: featuredRoutes
          }
        },
        200,
        origin
      );
    }

    if (url.pathname === '/admin/admin-emails') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload = Object.fromEntries(url.searchParams.entries());
      if (request.method === 'POST') {
        try {
          payload = await request.json();
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      }

      const normalized = normalizeAdminEmails(payload?.admin_emails || '');
      if (!normalized.length) {
        return jsonResponse({ ok: false, error: 'Add at least one valid admin email' }, 400, origin);
      }

      await setPricingSetting(env, 'admin_emails', normalized.join(','));
      await syncAdminUsersFromEmails(env, normalized);

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }

      return jsonResponse({ ok: true, admin_emails: normalized }, 200, origin);
    }

    if (url.pathname === '/admin/driver-accounts') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let payload = Object.fromEntries(url.searchParams.entries());
      if (request.method === 'POST') {
        try {
          payload = await request.json();
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      }

      const normalized = normalizeAdminEmails(payload?.driver_emails || '');
      await setPricingSetting(env, 'driver_emails', normalized.join(','));

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }

      return jsonResponse({ ok: true, driver_emails: normalized }, 200, origin);
    }

    if (url.pathname === '/admin/booking-price') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
      }

      let bookingId = url.searchParams.get('id');
      let amount = url.searchParams.get('amount');

      if (request.method === 'POST') {
        try {
          const payload = await request.json();
          bookingId = payload?.id ?? bookingId;
          amount = payload?.amount ?? amount;
        } catch (error) {
          return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400, origin);
        }
      }

      const id = Number.parseInt(String(bookingId || ''), 10);
      const dollars = Number.parseFloat(String(amount || ''));
      if (!Number.isFinite(id) || id <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking id' }, 400, origin);
      }
      if (!Number.isFinite(dollars) || dollars <= 0) {
        return jsonResponse({ ok: false, error: 'Invalid booking amount' }, 400, origin);
      }

      const booking = await env.DB.prepare(
        'SELECT payment_status FROM bookings WHERE id = ? LIMIT 1'
      )
        .bind(id)
        .first();

      if (!booking) {
        return jsonResponse({ ok: false, error: 'Booking not found' }, 404, origin);
      }

      if (String(booking.payment_status || '').toLowerCase() !== 'pending_review') {
        return jsonResponse(
          { ok: false, error: 'Price can only be edited before approval or rejection' },
          400,
          origin
        );
      }

      await env.DB.prepare(
        'UPDATE bookings SET estimated_total_cents = ? WHERE id = ?'
      )
        .bind(Math.round(dollars * 100), id)
        .run();

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }
      return jsonResponse({ ok: true }, 200, origin);
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

      const result = await approveBookingAndEmail(env, booking);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 500, origin);
      }

      if (request.method === 'GET') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }
      return jsonResponse(
        { ok: true, payment_url: result.checkoutUrl || '', email: 'sent' },
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

    if (
      url.pathname === '/webhooks/stripe' ||
      url.pathname === '/webhook/stripe' ||
      url.pathname === '/stripe/webhook' ||
      url.pathname === '/stripe-webhook'
    ) {
      return handleStripeWebhook(request, env, origin, ctx);
    }

    if (url.pathname === '/payment/success') {
      return handleStripeSuccessReturn(request, env, origin, ctx);
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
      service_type,
      route_points,
      route_miles,
      route_seconds,
      stops,
      customer_email,
      customer_user_id,
      travelers,
      kids,
      bags,
      contact_number,
      turnstile_token
    } = payload || {};

    const authHeader = request.headers.get('Authorization') || '';
    const clientHeader = String(request.headers.get('X-Lux-Client') || '').trim().toLowerCase();
    const isNativeAppClient = clientHeader === 'app' || clientHeader === 'app-ios' || clientHeader === 'app-android';
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '').trim()
      : '';

    let authenticatedCustomer = null;
    if (accessToken) {
      try {
        authenticatedCustomer = await verifySupabaseAccessToken(accessToken);
      } catch (error) {
        authenticatedCustomer = null;
      }
    }

    if (!authenticatedCustomer && !isNativeAppClient) {
      const turnstileVerification = await verifyTurnstileToken(
        env,
        turnstile_token,
        request.headers.get('CF-Connecting-IP') || ''
      );
      if (!turnstileVerification.ok) {
        return jsonResponse({ ok: false, error: turnstileVerification.error }, 400, origin);
      }
    }

    if (!full_name || !pickup_date || !pickup_location || !dropoff_location) {
      return jsonResponse({ ok: false, error: 'Missing required fields' }, 400, origin);
    }

    const today = getLosAngelesNowStrings().date;
    if (String(pickup_date || '').trim() < today) {
      return jsonResponse({ ok: false, error: 'Pickup date cannot be before today' }, 400, origin);
    }
    const invalidStopDate = Array.isArray(stops)
      ? stops.find((stop) => String(stop?.pickup_date || '').trim() && String(stop.pickup_date).trim() < today)
      : null;
    if (invalidStopDate) {
      return jsonResponse({ ok: false, error: 'Stop pickup dates cannot be before today' }, 400, origin);
    }

    const mode = booking_mode === 'hourly' ? 'hourly' : 'transfer';
    const pricing = await getPricingSettings(env);
    const normalizedServiceType = pricing.serviceTypes.includes(String(service_type || '').trim())
      ? String(service_type || '').trim()
      : pricing.defaultServiceType;
    const routeEstimate = calculateRouteEstimate(route_points, { route_miles, route_seconds });
    const estimatedHours = routeEstimate?.hours ?? null;
    const totalCents = routeEstimate
      ? calcTimeAndMileageTotalCents(
          routeEstimate.hours,
          routeEstimate.miles,
          pricing.hourlyRate,
          normalizedServiceType
        )
      : null;

    if (!totalCents || totalCents <= 0) {
      return jsonResponse({ ok: false, error: 'Invalid route estimate' }, 400, origin);
    }

    const resolvedCustomerEmail = String(customer_email || authenticatedCustomer?.email || '').trim();
    const resolvedCustomerUserId = String(customer_user_id || authenticatedCustomer?.sub || authenticatedCustomer?.user_id || '').trim();
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
          service_type,
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
          normalizedServiceType,
          String(estimatedHours?.toFixed(2) || ''),
          String(totalCents),
          'pending_review',
          '',
          '',
          resolvedCustomerEmail,
          resolvedCustomerUserId,
          travelers || '',
          kids || '',
          bags || '',
          contact_number || '',
          createdAt
        )
        .run();

      await ensureCustomerProfile(env, {
        full_name: full_name || '',
        customer_email: resolvedCustomerEmail,
        customer_user_id: resolvedCustomerUserId,
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
        `Vehicle: ${normalizedServiceType}`,
        `Pickup date: ${pickup_date}`,
        `Pickup time: ${pickup_time || '—'}`,
        `Pickup: ${pickup_location}`,
        `Dropoff: ${dropoff_location}`,
        stopsText ? `Stops: ${stopsText}` : null,
        routeEstimate?.miles ? `Mileage: ${routeEstimate.miles.toFixed(1)} mi` : null,
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
      if (ctx) {
        ctx.waitUntil(
          sendBookingMadeAdminEmail(env, {
            id: insertResult?.meta?.last_row_id || '',
            full_name: full_name || '',
            customer_email: resolvedCustomerEmail,
            customer_user_id: resolvedCustomerUserId,
            contact_number: contact_number || '',
            pickup_date,
            pickup_time: pickup_time || '',
            pickup_location,
            dropoff_location,
            stops: stops ? JSON.stringify(stops) : '',
            booking_mode: mode,
            service_type: normalizedServiceType,
            estimated_hours: String(estimatedHours?.toFixed(2) || ''),
            estimated_total_cents: totalCents,
            travelers: travelers || '',
            kids: kids || '',
            bags: bags || '',
            payment_status: paymentStatus,
            created_at: createdAt
          })
        );
      }
      if (ctx) {
        ctx.waitUntil(
          sendAdminPushNotification(env, {
            title: 'New booking request',
            body: `${full_name} • ${pickup_date}${pickup_time ? ` ${pickup_time}` : ''}`,
            kind: 'booking',
            data: {
              booking_id: insertResult?.meta?.last_row_id || null,
              booking_mode: mode,
              service_type: normalizedServiceType
            }
          })
        );
      }

      return jsonResponse(
        { ok: true, checkout_url: checkoutUrl, payment_status: paymentStatus },
        200,
        origin
      );
    } catch (error) {
      return jsonResponse({ ok: false, error: 'Database error' }, 500, origin);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDueBookingReminders(env));
  }
};
