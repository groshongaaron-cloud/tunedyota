// Ad-hoc Merchant API client for GMC account 5336800267.
// Usage: node scripts/magnuson/gmc-api.mjs <GET|POST|DELETE> <url> [base64JsonBody]
// (body is base64-encoded JSON — Windows PowerShell mangles inline quotes)
// Auth: gsc-reader service-account key (Downloads), content scope.
import { GoogleAuth } from "google-auth-library";

const [method, url, body] = process.argv.slice(2);
const auth = new GoogleAuth({
  keyFile: "C:/Users/grosh/Downloads/tunedyota-fa3fb6aeac63.json",
  scopes: ["https://www.googleapis.com/auth/content"],
});
const client = await auth.getClient();
try {
  const res = await client.request({
    url,
    method: method || "GET",
    ...(body ? { data: JSON.parse(Buffer.from(body, "base64").toString("utf8")), headers: { "Content-Type": "application/json" } } : {}),
  });
  console.log(JSON.stringify(res.data, null, 2));
} catch (e) {
  const r = e.response;
  console.log("ERROR", r ? r.status : "", JSON.stringify(r ? r.data : String(e)));
  process.exitCode = 1;
}
