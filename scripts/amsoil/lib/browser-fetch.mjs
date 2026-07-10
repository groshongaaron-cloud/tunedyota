// scripts/amsoil/lib/browser-fetch.mjs
// Headless-browser helpers for fetching amsoil.com pages behind Cloudflare.
import { chromium } from "playwright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Pure guard: returns true when the response looks like a Cloudflare challenge /
 * block page rather than a real product page.
 * Checks (in order): HTTP 403, empty/missing html, size < 20 KB (challenge pages
 * are tiny; real product pages are hundreds of KB), or a block-related title.
 */
export function isBlocked(status, html, title) {
  if (status === 403) return true;
  if (!html || html.length < 20000) return true;
  if (/just a moment|attention required|access denied|sorry, you have been blocked|cf-chl/i.test(title || "")) return true;
  return false;
}

/**
 * Launches a headless Chromium instance with a realistic desktop UA, calls
 * `fn(page)`, then ALWAYS closes the browser (even on error). Returns whatever
 * `fn` returns.
 */
export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: UA,
      locale: "en-US",
    });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

/**
 * Navigates `page` to `url`, waits `waitMs` for any JS challenge to resolve,
 * then returns `{ status, html, title, blocked, error? }`.
 *
 * - Attaches a one-shot response listener to capture the top-level HTTP status.
 * - On navigation error: returns `{ status: 0, html: "", title: "", blocked: true, error }`.
 */
export async function fetchProductHtml(page, url, waitMs = 3500) {
  let status = 0;
  const onResponse = (response) => {
    if (response.url() === url || response.url().startsWith(url.split("?")[0])) {
      status = response.status();
      page.off("response", onResponse);
    }
  };
  page.on("response", onResponse);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    page.off("response", onResponse);
    return { status: 0, html: "", title: "", blocked: true, error: e.message };
  }

  await page.waitForTimeout(waitMs);

  const html = await page.content();
  const title = await page.title();
  const blocked = isBlocked(status, html, title);
  return { status, html, title, blocked };
}
