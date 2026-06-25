// netlify/functions/lib/airtable.js
const API = "https://api.airtable.com/v0";
function cfg(env = process.env) {
  return {
    token: env.AIRTABLE_TOKEN,
    baseId: env.AIRTABLE_BASE_ID,
    bookings: env.AIRTABLE_BOOKINGS_TABLE || "Bookings",
    priority: env.AIRTABLE_PRIORITY_TABLE || "Priority List",
  };
}
async function listRecords({ fetchImpl = fetch, token, baseId, table, filterByFormula, fields }) {
  const params = new URLSearchParams();
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  (fields || []).forEach((f) => params.append("fields[]", f));
  const url = `${API}/${baseId}/${encodeURIComponent(table)}?${params.toString()}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`airtable list ${res.status}`);
  return (await res.json()).records || [];
}
async function createRecord({ fetchImpl = fetch, token, baseId, table, fields }) {
  const url = `${API}/${baseId}/${encodeURIComponent(table)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`airtable create ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}
async function updateRecord({ fetchImpl = fetch, token, baseId, table, id, fields }) {
  const url = `${API}/${baseId}/${encodeURIComponent(table)}/${id}`;
  const res = await fetchImpl(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`airtable update ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}
module.exports = { cfg, listRecords, createRecord, updateRecord };
