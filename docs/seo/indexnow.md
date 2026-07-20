# IndexNow — instant URL submission (Bing, Yandex, Seznam…)

IndexNow pushes "this URL changed, please recrawl" to participating search engines the
moment we publish. **It does not include Google** — Google discovers changes via normal
crawl + Search Console (there is no working Google ping; the old sitemap-ping endpoint was
retired in 2023).

## How it's set up here
- **Key (public verification token):** `site/<hex>.txt` — its filename is the key and its
  contents are the same key. Hosted at `https://tunedyota.com/<hex>.txt`; engines fetch it
  to confirm we own the host. Not a secret — it is committed on purpose.
- **Submitter:** `scripts/indexnow-submit.mjs` → POSTs to `https://api.indexnow.org/indexnow`
  (fans out to all participating engines). Auto-discovers the key file.

## Usage
```
# specific URLs (what changed):
npm run indexnow -- https://tunedyota.com/ott-tune https://tunedyota.com/

# everything in the sitemap (use sparingly — only submit URLs that actually changed):
npm run indexnow -- --sitemap
```
HTTP **200** = received, **202** = accepted (key validating). Anything else prints the error.

## When to run
- After publishing/updating pages, or adding redirects (submit the affected URLs).
- Not on every deploy for unchanged pages — IndexNow is for *changes*; re-submitting the
  whole sitemap repeatedly is discouraged.

## Rotate the key
Delete the old `site/<hex>.txt`, drop in a new one (`node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` → `site/<newhex>.txt` containing that hex), deploy. The script picks it up automatically.
