# UNBOUND — Streetwear E-Commerce Site

A multi-page streetwear storefront for **Unbound** (Lagos teen streetwear). Static HTML/CSS/JS — no build step, no framework. Animation is powered by [GSAP](https://gsap.com/) + ScrollTrigger (loaded via CDN), with full CSS/vanilla-JS fallbacks if the CDN ever fails to load.

## Structure

```
unbound/
├── index.html        Home — hero entrance sequence, featured drop, new drop section
├── shop.html          Product grid + cart
├── checkout.html       Cart summary, payment method, Paystack + bank transfer
├── success.html         Post-payment confirmation (server-verified)
├── about.html            Brand story (graffiti-treated, no founder name/photo)
├── contact.html           Phone contact
├── models.html             Lookbook — real photos + illustrated concept art
├── admin.html               Business dashboard (separate credential)
├── dev.html                  Developer/ops dashboard (separate credential)
├── style.css                  Shared design system (colors, type, motion tokens, components)
├── cart.js                     Shared engine: cart state, page transitions, nav, scroll reveals, GSAP
├── shipping.js                  Delivery zone detection (address autocomplete + geolocation)
├── config.js                     UB_API_BASE — set this to your deployed backend URL
├── netlify.toml                   Netlify caching + security headers
├── DEPLOYMENT.md                   Full step-by-step deploy checklist
└── assets/                         Logo, product photography, model photos
```

## Tech notes

- **Cart persistence**: `localStorage`, with an in-memory fallback if storage is blocked (e.g. private browsing).
- **Animation**: GSAP + ScrollTrigger via CDN (`cdnjs.cloudflare.com`). If the CDN fails to load, `cart.js` detects this (`UB_HAS_GSAP`) and falls back to plain CSS transitions — the site never breaks, it just loses the fancier easing/sequencing.
- **Motion tokens**: centralized in `style.css` under `:root` (`--dur-*`, `--ease-*`) so timing stays consistent and is easy to retune globally.
- **No payment gateway is wired up yet.** Checkout supports Bank Transfer (real account details) and a Card option that's UI-only — connecting Paystack/Flutterwave requires a backend + live API keys, which isn't something a static site can do safely.

## Open items (flagged in the site itself)

- Shipping fees/timeframe — placeholder on checkout
- Real lookbook photography for Models page
- Email + social links for Contact page
- Live payment gateway integration (needs backend)

## Running locally

No build step — just open `index.html` in a browser. For page-to-page navigation and cart persistence to work properly, serve it over a local server rather than `file://` (some browsers restrict `localStorage` on `file://`):

```bash
cd unbound
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Pushing to GitHub

```bash
cd unbound
git init                     # if not already a repo
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

## Deploying with GitHub Pages (free hosting)

1. Push the repo to GitHub (above).
2. On GitHub: **Settings → Pages**.
3. Under "Build and deployment", set **Source** to `Deploy from a branch`.
4. Choose branch `main`, folder `/ (root)`, then **Save**.
5. Your site will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

Since there's no build step, GitHub Pages can serve this repo directly — no CI/CD config needed.
