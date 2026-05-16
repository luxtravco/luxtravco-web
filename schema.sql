CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  pickup_time TEXT,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  stops TEXT,
  booking_mode TEXT,
  estimated_hours TEXT,
  estimated_total_cents INTEGER,
  payment_status TEXT,
  stripe_session_id TEXT,
  payment_url TEXT,
  paid_at TEXT,
  paid_notification_sent_at TEXT,
  customer_email TEXT,
  customer_user_id TEXT,
  driver_status TEXT,
  travelers TEXT,
  kids TEXT,
  bags TEXT,
  contact_number TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_profiles (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_customer_key
ON customer_profiles(customer_key);

CREATE TABLE IF NOT EXISTS pricing_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_device_tokens (
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
);

CREATE TABLE IF NOT EXISTS booking_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  reminder_type TEXT NOT NULL,
  scheduled_local TEXT NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(booking_id, reminder_type)
);

CREATE TABLE IF NOT EXISTS inbound_emails (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_emails_resend_email_id
ON inbound_emails(resend_email_id);
