# RaktSetu — Full-Stack Emergency Response Platform

RaktSetu connects blood donors, pharmacies and ambulance operators to patients during
emergencies. It uses a **hybrid dispatch model**: every request first checks nearby
**pre-stocked warehouses** (Blinkit-style dark stores) for instant fulfillment, and only
falls back to matching the live donor/pharmacy/ambulance network if warehouse stock isn't
available. This is a **real, working full-stack app** — not a mock/simulation:
- `backend/` — Node.js + Express API, using Node's **built-in SQLite** (`node:sqlite` —
  no native compilation or build tools required, unlike `better-sqlite3`), with
  haversine-distance matching and warehouse-first stock checks
- `frontend/` — React (Vite) app with **two experiences**, switchable via a tab at the top:
  - **🛒 Shop (MedXpress)** — a Blinkit-style storefront: browse Blood/Oxygen/Medicine
    products, see live prices and stock, add to cart, and check out — with **OTP login**
    and **verification gating** for regulated items (blood needs a hospital reference,
    oxygen needs ID proof, prescription medicines need a prescription reference)
  - **🚨 Emergency Request Demo** — the original warehouse-vs-network dispatch demo

> **Node version:** requires Node **22.5+** (ideally 24.x, which is what this was built
> and tested against). Windows users especially benefit from this — no Visual Studio
> Build Tools needed at all.

---

## 1. Run it locally first

**Backend**
```bash
cd backend
npm install
npm run seed      # loads sample donors/pharmacies/ambulances across Ranchi
npm start         # runs on http://localhost:5000
```

**Frontend** (in a second terminal)
```bash
cd frontend
npm install
npm run dev        # runs on http://localhost:5173, talks to localhost:5000 by default
```

Open the printed `localhost:5173` URL, raise a test request, and you should see it flow
through Searching → Matched → On the way → Delivered, backed by the real database.

---

## 2. Deploy it live (free tiers, ~10 minutes)

You'll deploy the backend and frontend separately, then point the frontend at the backend's URL.

### Step A — Push this project to GitHub
```bash
git init
git add .
git commit -m "RaktSetu full-stack app"
```
Create a new repo on GitHub and push it (`git remote add origin <your-repo-url>`, then `git push -u origin main`).

### Step B — Deploy the backend (Render.com — free tier)
1. Go to [render.com](https://render.com) → sign up/log in with GitHub.
2. **New +** → **Web Service** → connect your RaktSetu repo.
3. Set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run seed`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Deploy. Render gives you a URL like `https://raktsetu-backend.onrender.com`.

> ⚠️ **Note on the database:** Render's free tier has an *ephemeral* filesystem — the
> SQLite file resets on every redeploy or restart. This is fine for demos and judging.
> For a permanent production database later, either add a Render **persistent disk**
> (paid) or swap `better-sqlite3` for a hosted database like
> [Supabase](https://supabase.com) or [MongoDB Atlas](https://www.mongodb.com/atlas)
> (both have generous free tiers).

### Step C — Deploy the frontend (Vercel — free tier)
1. Go to [vercel.com](https://vercel.com) → sign up/log in with GitHub.
2. **Add New** → **Project** → import your RaktSetu repo.
3. Set:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
4. Under **Environment Variables**, add:
   - `VITE_API_URL` = the Render backend URL from Step B (e.g. `https://raktsetu-backend.onrender.com`)
5. Deploy. Vercel gives you a live link like `https://raktsetu.vercel.app`.

That live link is what you share with judges — it's a real deployed app, not a local file.

---

## 3. API reference (for your own testing or extending)

| Method | Endpoint                        | Description                              |
|--------|----------------------------------|-------------------------------------------|
| GET    | `/api/stats`                     | Live counts for the stats strip           |
| GET    | `/api/requests?limit=10`         | Recent requests (live feed)               |
| POST   | `/api/requests`                  | Raise a request — checks warehouse stock first, falls back to network matching |
| PATCH  | `/api/requests/:id/status`       | Move status forward (`On the way`, `Delivered`) |
| GET    | `/api/responders?type=Blood`     | List donors/pharmacies/ambulances         |
| POST   | `/api/responders`                | Register a new responder                  |
| GET    | `/api/warehouses`                | List warehouses with current stock levels |
| POST   | `/api/auth/request-otp`          | Generate a login OTP (demo mode — returned in the response, not SMS'd) |
| POST   | `/api/auth/verify-otp`           | Verify OTP, returns a session token       |
| GET    | `/api/auth/me`                   | Current logged-in user (needs `Authorization: Bearer <token>`) |
| GET    | `/api/products?category=Blood`   | Storefront product catalog                |
| GET    | `/api/cart`                      | Current user's cart (needs auth)          |
| POST   | `/api/cart`                      | Add/set an item in the cart               |
| PATCH  | `/api/cart/:productId`           | Update quantity (0 removes it)            |
| DELETE | `/api/cart/:productId`           | Remove an item from the cart              |
| POST   | `/api/orders`                    | Checkout — blocked if a regulated item's `verification_note` is missing |
| GET    | `/api/orders`                    | Current user's order history              |
| PATCH  | `/api/orders/:id/status`         | Move an order forward (`Verified` → `Dispatched` → `Delivered`) |

### Storefront verification model

Every product has a `verification_type`:
- `null` — OTC items (e.g. paracetamol), no verification needed
- `prescription` — Schedule H medicines; checkout requires a prescription reference
- `hospital_reference` — blood units; checkout requires a hospital/patient reference
  (blood is never sold — the `price` field on Blood products is a processing + delivery
  fee, in line with India's Drugs & Cosmetics Act, not a price for the blood itself)
- `id_proof` — oxygen cylinders; checkout requires an ID reference (prevents hoarding)

Checkout (`POST /api/orders`) rejects the order with a 400 if any cart item needs
verification and no `verification_note` was supplied. In production, replace the free-text
`verification_note` with a real document upload reviewed by a pharmacist/warehouse
staff account before the order is marked `Verified`.

Example request body for `POST /api/requests`:
```json
{
  "type": "Blood",
  "blood_group": "O+",
  "urgency": "Critical",
  "location_label": "Kanke Road, Ranchi",
  "lat": 23.3745,
  "lng": 85.3346
}
```

---

## 4. What's simplified for the prototype (and how to extend it)

- **Location input** uses a dropdown of real Ranchi coordinates instead of live geocoding
  (geocoding needs a paid Google/Mapbox API key) — swap in a geocoding call in
  `frontend/src/App.jsx` when ready.
- **Matching** ranks by straight-line (haversine) distance — a production version would
  factor in live traffic/route time.
- **OTP login has no real SMS gateway** — the OTP is returned directly in the API response
  and shown on screen (clearly labeled "demo mode"). Wire up a provider like MSG91 or
  Twilio before launch, and stop returning `demo_otp` in the response.
- **Verification is a free-text reference field**, not a real document upload/OCR check —
  replace with actual file upload + pharmacist/warehouse-staff review before launch.
- **SQLite** is used for simplicity — fine through Ideathon judging and early pilots;
  migrate to Postgres/MySQL for real scale.

---

Built by **Varun Kumar Chaturvedi** (Solo Innovator) · Ideathon 2026 · Sarala Birla University, Ranchi
