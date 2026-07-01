# Luxtravco Test Environment

Use this environment for backend testing without touching production bookings or pricing data.

## URLs

- Test Worker: `https://luxtravco-booking-test.luxtravco1.workers.dev`
- Production Worker: `https://luxtravco-booking.luxtravco1.workers.dev`

## Cloudflare Resources

- Test Worker name: `luxtravco-booking-test`
- Test D1 database: `luxtravco_bookings_test`
- Test D1 id: `80370d21-3142-46fe-a806-86ed5be87829`
- Test cron: disabled

## Commands

Deploy test Worker:

```bash
npx wrangler deploy --env test
```

Deploy production Worker:

```bash
npx wrangler deploy
```

Check test pricing:

```bash
curl https://luxtravco-booking-test.luxtravco1.workers.dev/api/pricing
```

Inspect test database tables:

```bash
npx wrangler d1 execute luxtravco_bookings_test --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

## App Testing

To point a local app build at test, set `BookingAPIURL` to:

```text
https://luxtravco-booking-test.luxtravco1.workers.dev
```

Do not use the test Worker for customer-facing production builds.
