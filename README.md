<div align="center">

# 🕌 SALAT

**Prayer times, done thoughtfully.** A bilingual (Arabic / English) prayer-times
app with an iqama countdown, a cache-first data layer, and a warm "paper and
gold" theme.

[![Live Demo](https://img.shields.io/badge/live%20demo-online-1E9E6A?style=for-the-badge)](https://salat.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-A97E12?style=for-the-badge)](LICENSE)
[![Angular](https://img.shields.io/badge/Angular-22-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.dev)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)

</div>

---

## ✨ Features

| | |
|---|---|
| **🕰️ Next-prayer countdown** | Live 1-second ticker with tabular numerals, plus an iqama countdown in pulsing green when the athan window is open |
| **🌍 28 countries / 112 cities** | Served from the API, not duplicated in the client |
| **📿 12 calculation methods** | Auto-selection by country, or override manually |
| **⚖️ Asr madhhab** | Shafi'i / Hanafi |
| **⏱️ Per-prayer iqama offsets** | 0–60 minutes, stored locally and synced to your account |
| **🌙 Hijri + Gregorian dates** | Rendered in Western digits for both locales |
| **🔁 Offline-tolerant** | Cache-first reads; the UI keeps working if the upstream API is down |
| **🌐 Full AR / EN** | RTL ↔ LTR, and prayer names switch language too — not just chrome |
| **📍 Geolocation** | Optional "use my location" lookup by coordinates |

---

## 🏗️ Architecture

One Node service serves **both** the API and the compiled Angular client, so the
browser talks to a single origin and `baseUrl = '/api'` stays relative.

```text
Browser ──► same origin ──┬──► /api/*          Express 5 routers
                          └──► /*              Angular static bundle (CDN)
                                    │
                                    ▼
                            aladhanService.js
                              │            │
                    PrayerCache (24h TTL)   Aladhan REST API
                              │
                              ▼
                       MongoDB Atlas (M0)
```

**Cache-first with graceful degradation.** A request builds the key
`city_country_method_school_YYYY-MM-DD`, reads `PrayerCache`, and only calls
Aladhan on a miss. Results are stored with a 24-hour TTL index, so Mongo
evicts them itself. If Mongo is unreachable the cache is skipped; if Aladhan is
unreachable too, a local snapshot keeps the app responsive.

**Serverless-safe.** `server/config/db.js` caches the Mongoose connection on
`globalThis`, so warm Vercel invocations reuse one socket instead of opening a
new one per request.

---

## 🗂️ Layout

```text
SALAT/
├── api/index.js              # Vercel serverless entry (exports the Express app)
├── vercel.json               # build / output / rewrites for the deployment
├── client/                   # Angular 22 — standalone components, signals
│   └── src/app/
│       ├── app.ts            # component logic: signals + countdown state machine
│       ├── app.html
│       ├── app.css
│       └── core/
│           ├── models/prayer.model.ts
│           └── services/{prayer,settings,i18n}.service.ts
├── server/                   # Express 5 + Mongoose 9
│   ├── server.js             # app wiring, security middleware, SPA fallback
│   ├── config/db.js
│   ├── models/{User,UserSettings,PrayerCache}.js
│   ├── controllers/{auth,prayer,settings,location}Controller.js
│   ├── services/aladhanService.js
│   ├── middleware/{auth,errorHandler}.js
│   ├── routes/{auth,prayer,settings,location}.js
│   └── utils/constants.js
└── docs/
    ├── PLAN_A.md             # architecture plan this project was built from
    └── REVIEW_PLAN.md        # full code review + findings
```

---

## 🚀 Run locally

```bash
# 1 — API  (http://localhost:3000)
cd server
npm install
cp .env.example .env        # then fill in MONGO_URI and JWT_SECRET
npm run dev

# 2 — Client  (http://localhost:4200)
cd client
npm install
npm start
```

The client dev server proxies nothing — `baseUrl` is `/api`, so during local
development either run the API on the same origin or point `baseUrl` at
`http://localhost:3000/api`.

### Production build

```bash
npm run build               # builds the Angular bundle into client/dist
NODE_ENV=production npm start
```

`server.js` serves `client/dist/client/browser` and falls back to
`index.html` for client-side routes.

---

## 🔌 API

Base URL: `/api`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Liveness + database status |
| `GET` | `/api/prayer/times` | — | Times by `city`, `country`, `method`, `school` |
| `GET` | `/api/prayer/times-by-coords` | — | Times by `latitude` / `longitude` |
| `GET` | `/api/prayer/times/today` | 🔒 | Times from the signed-in user's settings |
| `GET` | `/api/locations/countries` | — | 28 countries + their cities (`?lang=ar|en`) |
| `GET` | `/api/locations/methods` | — | Calculation methods |
| `POST` | `/api/auth/register` | — | Create account (bcrypt cost 12) |
| `POST` | `/api/auth/login` | — | Returns a JWT |
| `GET` | `/api/auth/me` | 🔒 | Current user |
| `GET` | `/api/settings` | 🔒 | Read preferences |
| `PUT` | `/api/settings` | 🔒 | Update preferences |

Responses are `{ success, data }` on success and `{ success, code, message }`
on failure.

---

## ⚙️ Environment variables

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | for DB features | `mongodb+srv://…`. Omit to run database-less (Aladhan only). |
| `JWT_SECRET` | for auth | **≥ 32 random bytes.** Never commit. |
| `JWT_EXPIRES_IN` | no | Default `7d`. |
| `CLIENT_ORIGIN` | in production | Comma-separated allowed origins, e.g. `https://salat.vercel.app`. |
| `NODE_ENV` | yes | Set to `production` to enable the static/SPA block. |
| `PORT` | no | Defaults to `3000`. |

See [`server/.env.example`](server/.env.example) for a template.

---

## 🛡️ Security notes

- Passwords hashed with **bcrypt (cost 12)**; the field is `select: false` and
  stripped again in `toJSON`.
- **No IDOR** — the owner is always derived from the verified JWT, never from
  the request body or query string.
- **No mass assignment** — `PUT /api/settings` runs against a field allowlist.
- **helmet** headers, a JSON-only 404 for unknown `/api/*` paths, and a
  stricter rate limit on `/api/auth/*` than on the rest of the API.
- CORS is **whitelist-driven in production** via `CLIENT_ORIGIN`; it stays
  permissive in development only.

> `contentSecurityPolicy` is currently disabled in `server.js` to accommodate
> Angular's inline component styles. Turning it back on with a tuned
> `style-src` is a known follow-up.

---

## 📄 License

[MIT](LICENSE) © 2026 Waleed Hammad

Prayer times are sourced from the [Aladhan API](https://aladhan.com).
Always verify against your local mosque.
