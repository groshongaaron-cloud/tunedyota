// Read-only: dump every customer-side turn from all chat sessions for
// question-mining analysis. Output stays local (PII) — only aggregated
// themes get committed.
const { cfg, listAllRecords } = require('../../netlify/functions/lib/airtable.js');
(async () => {
  const c = cfg(process.env);
  const recs = await listAllRecords({ token: c.token, baseId: c.baseId, table: process.env.AIRTABLE_CHAT_TABLE || 'Chat Sessions' });
  let n = 0;
  for (const r of recs) {
    const f = r.fields || {};
    let turns = [];
    try { turns = JSON.parse(f.Transcript || '[]'); } catch {}
    const user = turns.filter(t => t && t.role === 'user' && String(t.text || '').trim());
    if (!user.length) continue;
    n++;
    const tag = `${String(f['Session ID'] || '').split(':')[0] || 'web'}|${f.Status || 'ai'}`;
    for (const t of user) console.log(`${tag}> ${String(t.text).replace(/\s+/g, ' ').slice(0, 300)}`);
    console.log('---');
  }
  console.error('SESSIONS WITH USER TURNS:', n, 'of', recs.length);
})().catch(e => { console.error(e.message); process.exit(1); });
