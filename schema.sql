CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  pickup_time TEXT,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  stops TEXT,
  booking_mode TEXT,
  route_points TEXT,
  estimated_hours TEXT,
  estimated_total_cents INTEGER,
  payment_status TEXT,
  stripe_session_id TEXT,
  payment_url TEXT,
  customer_email TEXT,
  customer_user_id TEXT,
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
