// scripts/youtube/auth.mjs
// One-time YouTube OAuth for the @tunedyota channel (Week0 §5).
// Finds client_secret*.json in TunedYota-Production, runs the desktop-app
// loopback flow (browser opens; the channel owner approves once), then saves
// the refresh token to ~/.tunedyota/youtube-token.json — the credential every
// future automated upload/retitle/caption call uses. Secrets never enter the
// repo: client secret stays in TunedYota-Production, token in ~/.tunedyota.
// Scopes: youtube (retitles/playlists/branding) + youtube.upload (videos) +
// youtube.force-ssl (captions — the .srt uploads require it).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execSync } from "node:child_process";
import { OAuth2Client } from "google-auth-library";

const SECRET_DIR = "C:\\Users\\grosh\\TunedYota-Production";
const TOKEN_PATH = path.join(os.homedir(), ".tunedyota", "youtube-token.json");
const EXPECTED_CHANNEL = "UC22wrm3CklMH7Y2zCJKLDcA"; // @tunedyota
const SCOPES = [
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

function findClientSecret() {
  const hit = fs.readdirSync(SECRET_DIR).find((f) => /^client_secret.*\.json$/i.test(f));
  if (!hit) throw new Error(`No client_secret*.json in ${SECRET_DIR} — download it from the OAuth client page first.`);
  return path.join(SECRET_DIR, hit);
}

async function main() {
  const secretFile = findClientSecret();
  const raw = JSON.parse(fs.readFileSync(secretFile, "utf8"));
  const conf = raw.installed || raw.web;
  if (!conf) throw new Error(`${secretFile} has neither "installed" nor "web" — re-download as a Desktop-app client.`);

  // Loopback receiver: Google redirects the browser here with ?code=...
  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const redirectUri = `http://127.0.0.1:${server.address().port}`;

  const client = new OAuth2Client({ clientId: conf.client_id, clientSecret: conf.client_secret, redirectUri });
  const authUrl = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

  console.log("Opening browser for one-time approval (sign in as the @tunedyota channel owner)…");
  // The URL rides in cmd double quotes, where & is literal — no escaping.
  try { execSync(`cmd /c start "" "${authUrl}"`); }
  catch { console.log(`Browser didn't open — paste this URL manually:\n${authUrl}`); }

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out after 5 minutes waiting for browser approval.")), 300000);
    server.on("request", (req, res) => {
      const u = new URL(req.url, redirectUri);
      if (!u.searchParams.has("code") && !u.searchParams.has("error")) { res.end(); return; }
      clearTimeout(timer);
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h2>Tuned Yota — YouTube connected. You can close this tab.</h2>");
      server.close();
      u.searchParams.has("code") ? resolve(u.searchParams.get("code")) : reject(new Error(`OAuth denied: ${u.searchParams.get("error")}`));
    });
  });

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("No refresh_token returned — remove the app's access at myaccount.google.com/permissions and re-run.");
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ client_id: conf.client_id, client_secret: conf.client_secret, ...tokens }, null, 2));

  // Verify we landed on the right channel before declaring victory.
  client.setCredentials(tokens);
  const { token } = await client.getAccessToken();
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const ch = body.items?.[0];
  if (!ch) throw new Error(`Token works but no channel returned: ${JSON.stringify(body).slice(0, 300)}`);
  const ok = ch.id === EXPECTED_CHANNEL;
  console.log(`\nConnected channel: ${ch.snippet.title} (${ch.id}) — ${ch.statistics.subscriberCount} subs, ${ch.statistics.videoCount} videos`);
  console.log(ok ? `✅ Matches @tunedyota. Token saved to ${TOKEN_PATH}` : `⚠️ NOT the expected @tunedyota channel (${EXPECTED_CHANNEL}) — signed into the wrong Google account? Re-run and pick the channel owner.`);
  if (!ok) process.exit(2);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
