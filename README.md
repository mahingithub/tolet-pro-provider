# TO-LET PRO — Provider App (সেবা প্রদানকারী)

The third frontend. Sibling to `tolet-pro-frontend` (tenants/landlords) and
`tolet-pro-admin` (internal console). Its own origin and its own deploy, sharing
the one backend.

```
project/
  tolet-pro-backend     one API for all three
  tolet-pro-frontend    public app        :5173
  tolet-pro-admin       admin console     :5174
  tolet-pro-provider    ← you are here    :5175
```

## Who it is for

A গ্যাস সাপ্লায়ার, a মুদি দোকানদার, a গৃহকর্মী, an ইলেকট্রিশিয়ান. People who
serve one neighbourhood, have never had a website, and are not app-native.

That audience drives nearly every decision here, and the decisions are not
stylistic — reversing them breaks the product:

- **Bangla by default, no first-run toggle.** English is opt-in and lives in
  Profile. An English first run is a wall before the first tap.
- **52px minimum tap targets, larger base font** than the other two apps. Older
  eyes, cheap screens, daylight.
- **Orders is the home screen.** There is no dashboard and there are no charts
  on it.
- **No tutorial, no onboarding carousel, no tooltips.** The measure of success
  is that a shopkeeper accepts his first order without anyone showing him how.
  If a screen needs explaining, the screen is wrong.
- **Four tabs, and adding a fifth requires an argument.**

## Running it

```bash
npm install
npm run dev          # :5175
```

The backend must allow-list this origin or every call fails CORS:

```
PROVIDER_CORS_ORIGINS=http://localhost:5175
```

That is read by `tolet-pro-backend/config/env.js` and merged into the allow-list
in `server.js`, alongside `CORS_ORIGINS` and `ADMIN_CORS_ORIGINS`. Three env
vars so each surface can be locked down and rotated independently.

Point the app at the API with `VITE_API_BASE_URL` in `.env.local`
(gitignored — see the checked-in default there).

## Auth

A provider is **a User carrying the `provider` role**, not a separate account
type. So this app signs in through the ordinary `/api/auth/*` surface and
inherits OTP signup, refresh, session revocation, push and in-app calling.

The consequence that matters: an existing tenant or landlord signs in here with
the **same credentials** and simply gains the role (`ensureProviderRole()`).
Nobody is ever asked to create a second account — a shopkeeper told to
"register" when he already has an account will make a duplicate under a
different number and then lose access to both.

Sessions are namespaced `toletpro_provider:` in localStorage so they can never
collide with a tenant session belonging to the same human.

## State of play

**Working:** app shell, routing, guards, auth plumbing, session handling,
single-flight token refresh, language layer, UI primitives, Orders screen,
Earnings screen.

**Stubbed, and honestly labelled as such in the UI:**

| Screen | Blocked on |
|---|---|
| `Onboarding` | the 7-step registration — see the file header for the full spec |
| `Listing` | renders from `providerFields`; needs `GET /api/services/categories` |

**Backend routes that do not exist yet.** Every path in
`src/services/providerService.js` 404s today. The models are written
(`Provider`, `ServiceRequest`, `ContactEvent`, `config/serviceCategories.js`);
the routes are not. The services are written out anyway, in the shape those
models already imply, so the screens are built against a real contract rather
than an invented one.

Screens show an honest "not live yet" message instead of mock data. Keep it
that way — fake data in a scaffold is how a missing endpoint stays missing.

## Traps

- **GeoJSON is `[lng, lat]`** — the opposite of everywhere else in this
  codebase. Use `Provider.setPoint(lat, lng)`. Getting it backwards throws
  nothing and silently moves a Dhaka shop to Somalia.
- **Blank price row ≠ 0.** Blank means "I don't stock this" and must be
  omitted. Saving 0 renders on the tenant card as "free".
- **Only price edits stamp `pricesUpdatedAt`.** Editing `hours` must not, or an
  unrelated save would launder a stale price as fresh.
- **Verification is a badge, not a gate.** An unverified provider is listed,
  callable and clearly marked অযাচাইকৃত, ranked below verified peers.
- **An honest decline costs a provider nothing.** Only silence (`expired`) and
  cancelling after accepting count against him. Do not build UI that makes
  declining feel punitive — it teaches providers to accept everything and
  cancel later, which is strictly worse for the tenant.
