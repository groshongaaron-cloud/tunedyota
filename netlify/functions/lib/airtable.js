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
// Create a record, tolerating an Airtable base that hasn't added an optional
// column yet (e.g. "Modifications" before the owner creates it). On an
// unknown-field error that names one of `optionalKeys`, drop only that field
// and retry once — so a write is never lost to a missing optional column, while
// a genuinely unexpected field error still surfaces. `createFn` is injected so
// callers can route through their own (stubbable) create dependency.
async function createTolerant(createFn, args, optionalKeys = []) {
  try {
    return await createFn(args);
  } catch (e) {
    if (!/unknown[_ ]field/i.test(e.message)) throw e;
    const offending = optionalKeys.filter((k) => args.fields && k in args.fields && new RegExp(`\\b${k}\\b`, "i").test(e.message));
    if (!offending.length) throw e;
    const fields = { ...args.fields };
    for (const k of offending) delete fields[k];
    return await createFn({ ...args, fields });
  }
}
async function listAllRecords({ fetchImpl = fetch, token, baseId, table, pageSize = 100 }) {
  const out = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (offset) params.set("offset", offset);
    const url = `${API}/${baseId}/${encodeURIComponent(table)}?${params.toString()}`;
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`airtable listAll ${res.status}`);
    const j = await res.json();
    out.push(...(j.records || []));
    offset = j.offset;
  } while (offset);
  return out;
}
module.exports = { cfg, listRecords, createRecord, createTolerant, updateRecord, listAllRecords };
