CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  pickup_time TEXT,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT NOT NULL,
  stops TEXT,
  travelers TEXT,
  kids TEXT,
  bags TEXT,
  contact_number TEXT,
  created_at TEXT NOT NULL
);
