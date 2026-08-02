# UNBOUND — Deployment Checklist

Follow this in order. Each section assumes the previous one is done.
Nothing here is optional for a real launch — skipping the security or
Paystack-live-mode steps specifically will cost you money or data.

---

## 0. Before you start

- [ ] You have a GitHub account
- [ ] You have a Render account (backend + database)
- [ ] You have a Netlify account (frontend hosting)
- [ ] You have a Paystack account, verified and ready to accept live payments
- [ ] (Optional but recommended) A Sentry account for error tracking

---

## 1. Push both repos to GitHub

You have two separate projects — keep them as two separate GitHub repos
(simpler permissions: you can hand the frontend repo to a designer
without giving them backend/database access).

```bash
# Frontend
cd unbound
git remote add origin https://github.com/<you>/unbound-site.git
git push -u origin main

# Backend
cd unbound-server
git remote add origin https://github.com/<you>/unbound-server.git
git push -u origin main
```

- [ ] Both repos pushed
- [ ] Confirm `.env` is NOT in either repo: `git ls-files | grep .env` should return nothing in `unbound-server`

---

## 2. Deploy the backend (Render)

1. Render Dashboard → **New → Blueprint** → connect the `unbound-server` repo.
   Render reads `render.yaml` and provisions the web service + Postgres together.
   (No blueprint support? New → Web Service, build `npm install`, start `npm start`, then New → PostgreSQL separately and copy the connection string in manually.)
2. Once created, go to the web service's **Environment** tab and fill in every variable NOT already set by the blueprint:
   - [ ] `PAYSTACK_SECRET_KEY` — start with `sk_test_...` for now, switch to `sk_live_...` in step 7
   - [ ] `PAYSTACK_PUBLIC_KEY` — matching `pk_test_...` / `pk_live_...`
   - [ ] `ADMIN_API_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - [ ] `DEV_API_KEY` — generate the same way, **must be different** from `ADMIN_API_KEY`
   - [ ] `FRONTEND_URL` — leave as a placeholder for now, you'll come back and set this after step 3
   - [ ] `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` — optional, leave blank to skip
3. Deploy. Watch the logs — you should see `Database schema ready.` and `UNBOUND server listening on port...`.
4. Note your backend URL: `https://<your-service-name>.onrender.com`

- [ ] `curl https://<your-backend>.onrender.com/health` returns `{"ok":true}`

---

## 3. Deploy the frontend (Netlify)

1. Edit `unbound/config.js` — set `UB_API_BASE` to your real Render URL from step 2.4.
2. Commit and push that change.
3. Netlify Dashboard → **Add new site → Import an existing project** → connect the `unbound-site` repo.
4. Build settings: no build command needed (static files), publish directory `.` (or `unbound` if your repo root differs).
5. Deploy. Netlify picks up `netlify.toml` automatically for headers/caching.
6. Note your frontend URL: `https://<your-site-name>.netlify.app` (or your custom domain once attached).

- [ ] Frontend loads and Home page renders correctly
- [ ] Browser console has no CSP violation errors (check `netlify.toml`'s `connect-src` includes your backend's domain if you used something other than `https:` wildcard)

---

## 4. Connect the two

1. Back in Render → your web service → Environment → set `FRONTEND_URL` to your real Netlify URL from step 3.6.
2. Redeploy the backend (Render does this automatically on env var change, or trigger manually).

- [ ] From the live frontend, open Shop, add an item to cart, and confirm the cart drawer works (tests `localStorage` + basic JS wiring)
- [ ] Open browser devtools → Network tab → confirm `fetch` calls to `/api/...` succeed (no CORS errors)

---

## 5. Configure the Paystack webhook

1. Paystack Dashboard → Settings → API Keys & Webhooks → **Webhook URL**:
   `https://<your-backend>.onrender.com/api/webhooks/paystack`
2. Save.

- [ ] Webhook URL saved in Paystack dashboard

---

## 6. Test the full payment flow (test mode)

With `sk_test_...` / `pk_test_...` still active:

- [ ] Shop → add a tee to cart → Checkout
- [ ] Fill in delivery details, check delivery fee (shipping.js) — confirm a zone gets detected
- [ ] Select **Card**, place order, get redirected to Paystack's hosted page
- [ ] Pay with test card `4084 0840 8408 4081`, exp any future date, CVV `408`
- [ ] Redirected back to `success.html`, order shows PAID with correct items/total
- [ ] Check `admin.html` → Orders tab → the order appears with `PAID` status
- [ ] Check `dev.html` → Webhooks tab → a `charge.success` entry with `signature_valid: true`
- [ ] Try a **declined** test card (see Paystack's test card docs) → confirm the order stays unpaid and the UI shows a clear failure, not a false success
- [ ] Test **Bank Transfer** path too → confirm an order is created with your real account details shown, and it appears in `admin.html` as `PENDING`

If any of these fail, fix it before going anywhere near live keys.

---

## 7. Go live

1. In Paystack Dashboard, complete their business verification (required before live keys work).
2. Get your live keys: Settings → API Keys & Webhooks.
3. Render → Environment → replace `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` with `sk_live_...` / `pk_live_...`.
4. Set `NODE_ENV=production` if it isn't already (the blueprint sets this by default).
5. Redeploy.

- [ ] `dev.html` → Security & Env tab → "Live/test key matches environment" check shows **pass**
- [ ] Do ONE real, small, real-money transaction yourself end-to-end before announcing the store is live
- [ ] Refund yourself via Paystack's dashboard directly (refund automation isn't built yet — see backend README)

---

## 8. Lock down access

- [ ] Bookmark `admin.html` and `dev.html` privately — they are not linked from any page's navigation, by design
- [ ] Share `ADMIN_API_KEY` only with whoever manages orders/inventory
- [ ] Share `DEV_API_KEY` only with whoever handles engineering — never both keys to the same non-technical person unless that's genuinely you wearing both hats
- [ ] Confirm neither key is written down anywhere outside a password manager

---

## 9. Ongoing

- [ ] Check `dev.html` → System tab weekly for DB size / low stock as the store grows
- [ ] Check your Postgres host's dashboard (Render) for their backup retention window — this app does not run its own backups (see backend README, "Backup Status")
- [ ] If you enabled Sentry, check it after each deploy for new error spikes
- [ ] Revisit `src/data/products.js` and `src/data/shipping.js` whenever prices change — these are the ONLY files that should ever need editing for a price update

---

## Rollback plan

If something breaks after a deploy:

- **Frontend**: Netlify keeps every previous deploy — Netlify Dashboard → Deploys → pick a previous one → **Publish deploy**. Instant, no rebuild needed.
- **Backend**: Render Dashboard → your service → Events/Deploys → roll back to the previous successful deploy.
- **Database**: schema changes in `db.js` use `CREATE TABLE IF NOT EXISTS` and are additive-only by design — rolling back the backend code does not undo any database schema changes, so a bad deploy that changed the schema needs a manual fix, not just a code rollback. Keep this in mind before ever writing a destructive migration.
