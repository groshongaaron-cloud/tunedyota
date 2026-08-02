require('../../netlify/functions/funnel-report.js').runFunnelReport({})
  .then(o => console.log('FUNNEL:', JSON.stringify(o)))
  .catch(e => { console.error('ERR', e.message); process.exit(1); });
