# FlatMMO AI Prototype — GitHub → Cloudflare setup

This prototype is deployed from **`v2-online`**. The public GitHub Pages front end calls the Cloudflare Worker directly; players do **not** need an API key, Worker URL, or shared password.

## Public request path

```text
Player browser
→ GitHub Pages (`ai-prototype.html`)
→ Cloudflare Worker
→ Workers AI
→ deterministic FlatMMO tools/data
```

The browser creates a random anonymous client ID in localStorage. It is used only as a rate-limit key. A second, looser IP rate limit is a backstop against clients that continually replace their browser ID.

The current limits are configured in `cloudflare-worker/wrangler.jsonc`:

- 12 public requests per minute per anonymous browser ID
- 120 public requests per minute per source IP as an aggregate safety cap

These are abuse controls, not billing/accounting quotas, and can be tuned later.

## Deployment

GitHub Actions deploys `cloudflare-worker/` when Worker files change on `v2-online`. `wrangler.jsonc` supplies the Worker name, Workers AI binding, model, data URL, and rate-limit bindings.

The public page is:

```text
https://etherealaporia-alt.github.io/FlatMMO-Companion/ai-prototype.html
```

The Worker is:

```text
https://flatmmo-ai-prototype.etherealaporia.workers.dev
```

## Optional admin token

`PROTOTYPE_TOKEN` is no longer required for ordinary public use. If the existing Cloudflare runtime secret remains configured, it acts as an **admin/debug bypass**:

- requests with the correct Bearer token bypass public rate limiting
- `debug: true` returns tool traces only for an authenticated admin request
- the token must remain only in Cloudflare runtime secrets; never put it in GitHub or front-end code

The public site does not read, store, or send this token. It also clears the old private-prototype token/Worker/debug localStorage entries when loaded.

## Browser-origin boundary

Normal public POSTs are accepted from:

- `https://etherealaporia-alt.github.io`
- `http://localhost...` / `http://127.0.0.1...` for local development

The Origin check is not treated as authentication; non-browser clients can forge Origin headers. Rate limiting remains the actual public abuse-control layer.

## Health check

Opening the Worker URL returns JSON including `publicAccess`, `rateLimited`, `adminAccess`, and `ready`. Public readiness depends on the AI and rate-limit bindings, not on `PROTOTYPE_TOKEN`.

## Future hardening

If public abuse becomes material, add Cloudflare Turnstile with server-side Siteverify validation. The public Turnstile sitekey may live in the front end; the Turnstile secret must remain Worker-side.
