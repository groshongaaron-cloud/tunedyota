// Playwright tests for the site-wide chat widget (site/chat.js + site/chat.css).
// Reuses the same static-server / browser harness pattern as book-page.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch {}
let server, base, browser, browserOk = false;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    const f = path.join(SITE, p);
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const ext = path.extname(f);
    const ct = ext === ".js" ? "text/javascript"
      : ext === ".html" ? "text/html"
      : ext === ".css" ? "text/css"
      : ext === ".json" ? "application/json"
      : "text/plain";
    res.writeHead(200, { "Content-Type": ct });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  if (chromium) { try { browser = await chromium.launch(); browserOk = true; } catch {} }
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });

test("index.html chat button has OTT label", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const page = await (await browser.newContext()).newPage();
  await page.goto(base + "/index.html");
  await page.waitForSelector("#ty-chat-btn");
  const txt = await page.textContent("#ty-chat-btn");
  assert.ok(txt.includes("Chat with an OTT installer NOW"), `got: ${txt}`);
  await page.close();
});

test("amsoil page chat button has AMSOIL Fluid Specialist label", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const page = await (await browser.newContext()).newPage();
  await page.goto(base + "/amsoil-toyota-tundra.html");
  await page.waitForSelector("#ty-chat-btn");
  const txt = await page.textContent("#ty-chat-btn");
  assert.ok(txt.includes("AMSOIL Fluid Specialist"), `got: ${txt}`);
  await page.close();
});

test("clicking button opens panel with greeting", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const page = await (await browser.newContext()).newPage();
  await page.goto(base + "/index.html");
  await page.waitForSelector("#ty-chat-btn");
  await page.click("#ty-chat-btn");
  await page.waitForSelector("#ty-chat-panel");
  const msgs = await page.$$(".ty-msg.ai");
  assert.ok(msgs.length > 0, "at least one .ty-msg.ai");
  const firstMsg = await msgs[0].textContent();
  assert.ok(firstMsg.startsWith("Thank you for using Tuned Yota's chat agent."), `got: ${firstMsg}`);
  await page.close();
});

test("stubbed send shows user message and stub reply", async (t) => {
  if (!browserOk) return t.skip("no browser");
  const page = await (await browser.newContext()).newPage();
  await page.goto(base + "/index.html");
  // Stub the chat endpoint BEFORE clicking send
  await page.route("**/.netlify/functions/chat", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reply: "stub reply", escalated: false }),
    });
  });
  await page.waitForSelector("#ty-chat-btn");
  await page.click("#ty-chat-btn");
  await page.waitForSelector("#ty-chat-panel");
  await page.fill("#ty-chat-input", "hello test");
  await page.click("#ty-chat-send");
  // Wait for user message to appear
  await page.waitForSelector(".ty-msg.user");
  const userMsgs = await page.$$(".ty-msg.user");
  const userText = await userMsgs[0].textContent();
  assert.equal(userText, "hello test");
  // Wait for stub reply
  await page.waitForFunction(() => {
    const aiMsgs = document.querySelectorAll(".ty-msg.ai");
    return Array.from(aiMsgs).some((m) => m.textContent === "stub reply");
  });
  const aiMsgs = await page.$$(".ty-msg.ai");
  const aiTexts = await Promise.all(aiMsgs.map((m) => m.textContent()));
  assert.ok(aiTexts.some((t) => t === "stub reply"), `ai messages: ${JSON.stringify(aiTexts)}`);
  await page.close();
});
