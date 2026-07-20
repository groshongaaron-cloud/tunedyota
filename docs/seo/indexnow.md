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

## Verify / track submissions in Bing Webmaster Tools
Sign in at https://www.bing.com/webmasters (Microsoft account for the `tunedyota.com`
property; if it's not added, import it from Google Search Console in one click).

- **See the submitted URLs:** site picker → **tunedyota.com** → left sidebar **IndexNow** →
  the URL list with date/time + status (status = *received/accepted*, not yet crawled).
- **Confirm the key is registered:** same **IndexNow** page → **API key** area shows
  `<hex>` and that `https://tunedyota.com/<hex>.txt` is verified (auto-detected).
- **Check a specific URL's crawl/index state:** left sidebar **URL Inspection** → paste a
  URL → **Inspect** (shows known/indexed + last crawl; **Request Indexing** to push one).
- **Redirect check (Bing side):** URL Inspection on
  `https://tunedyota.com/blog/categories/drivability-problems` → should show the 301 →
  `/ott-tune`. This is the Bing equivalent of Google's GSC "Validate Fix".
- **Sitemap:** left sidebar **Sitemaps** → confirm `sitemap.xml` is processed (usually
  auto-picked from `robots.txt`).

**Expectation:** submissions appear in the IndexNow list immediately, but crawl/index can
take hours–days. HTTP 200 "accepted" ≠ instant indexing. If a URL still shows as not-known
after a few days, use URL Inspection → Request Indexing on it directly.

## Rotate the key
Delete the old `site/<hex>.txt`, drop in a new one (`node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` → `site/<newhex>.txt` containing that hex), deploy. The script picks it up automatically.
