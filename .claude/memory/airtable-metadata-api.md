---
name: airtable-metadata-api
description: "The Airtable metadata/schema API IS usable — create tables/fields programmatically with a schema-scoped PAT (corrects the old \"unusable\" claims)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 243af81c-910b-41d5-b689-e96648fcaec0
---

The Airtable **metadata/schema API works** — the long-standing "metadata API unusable" notes (in [[monthly-ott-calibration-report]] + [[certificate-v2-dashboard-program]]) were a **token-scope gap, not an API limitation**. Diagnosed 2026-07-13: the production `AIRTABLE_TOKEN` PAT only has data scopes (`data.records:read/write`), so schema calls returned `403 INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`. The schema endpoints additionally need **`schema.bases:read`** + **`schema.bases:write`**.

**How to create tables/fields myself (no more manual UI adds):**
1. Ask the owner to make a one-purpose PAT at `airtable.com/create/tokens` with scopes `schema.bases:read` + `schema.bases:write` + access to the Tuned Yota base (`app…`), copy it to clipboard. Owner prefers a **dedicated ephemeral token used locally, NOT stored in Netlify** (production keeps its narrow data-only token). Read it via PowerShell `Get-Clipboard`, use for the schema calls, then **clear the clipboard** (`Set-Clipboard`). NEVER store the schema token in memory or env.
2. Endpoints (base id from `netlify env:get AIRTABLE_BASE_ID`):
   - `GET  https://api.airtable.com/v0/meta/bases/{baseId}/tables` — read schema (find a table's id + existing field names)
   - `POST https://api.airtable.com/v0/meta/bases/{baseId}/tables` — create a table `{name, fields:[{name,type,options?}]}`
   - `POST https://api.airtable.com/v0/meta/bases/{baseId}/tables/{tableId}/fields` — add a field
3. Field types used 2026-07-13: `singleLineText`, `multilineText` (no options); `date` needs `options:{dateFormat:{name:"iso"}}`; `checkbox` needs `options:{icon:"check",color:"greenBright"}`. Duplicate name → 422 (treat as already-exists).
4. **Always follow with a data-token write-test** (create+delete a probe record) to confirm the app's production `AIRTABLE_TOKEN` can actually read/write the new field names — the real end-to-end check.

Verified end-to-end on 2026-07-13: created the `Web Push Subs` table + 4 `Bookings` columns (`Customer Signature`, `Client Key`, `AMSOIL Email Sent`, `AMSOIL Opt-Out`) via the schema API, both write-tested 200. See [[prefer-automation-over-handoffs]].
