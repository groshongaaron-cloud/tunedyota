// scripts/amsoil/lib/firecrawl-fetch.mjs
// Fetch amsoil.com pages through the Firecrawl API instead of local Playwright.
// Cloudflare started hard-blocking headless Chromium from this host (2026-08-02:
// "Just a moment…" challenge headless, "Attention Required!" via the chrome
// channel) — Firecrawl's managed browsers absorb the anti-bot problem, so
// scheduled runs no longer depend on winning a fingerprint arms race locally.
// Key: FIRECRAWL_API_KEY env var (user-level, mirrors the MCP server's key).
import { isBlocked } from "./browser-fetch.mjs";

const API = "https://api.firecrawl.dev/v2/scrape";

/**
 * Scrape one URL, returning { status, html, title, blocked, error? } — the
 * same shape fetchProductHtml produced, so callers swap in without changes.
 * maxAge: 0 forces a fresh fetch (Firecrawl's default serves a 2-day cache,
 * which would defeat a price monitor).
 */
export async function fetchProductHtmlViaFirecrawl(url, { timeoutMs = 90000 } = {}) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { status: 0, html: "", title: "", blocked: true, error: "FIRECRAWL_API_KEY not set" };
  let res, body;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false, maxAge: 0, timeout: timeoutMs }),
      signal: AbortSignal.timeout(timeoutMs + 30000),
    });
    body = await res.json();
  } catch (e) {
    return { status: 0, html: "", title: "", blocked: true, error: String(e.message || e) };
  }
  if (!res.ok || !body?.success) {
    return { status: res.status, html: "", title: "", blocked: true, error: body?.error || `HTTP ${res.status}` };
  }
  const html = body.data?.rawHtml || "";
  const title = body.data?.metadata?.title || "";
  const status = body.data?.metadata?.statusCode || 200;
  return { status, html, title, blocked: isBlocked(status, html, title) };
}
