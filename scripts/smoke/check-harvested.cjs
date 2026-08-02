const { cfg, listAllRecords } = require('../../netlify/functions/lib/airtable.js');
(async () => {
  const c = cfg(process.env);
  const recs = await listAllRecords({ token: c.token, baseId: c.baseId, table: c.priority });
  const got = recs.filter(r => /^chat-harvest:/.test(r.fields.Source || ''));
  for (const r of got) {
    const f = r.fields;
    console.log(`${r.id} | ${f.Channel} | ${f.Name} | sess=${f['Chat Session'] || '-'} | phone=${f.Phone || '-'} | notes=${String(f['Client Notes'] || '').replace(/\n/g, ' // ').slice(0, 160)}`);
  }
  console.log('TOTAL:', got.length);
})().catch(e => { console.error(e.message); process.exit(1); });
