require('../../netlify/functions/chat-harvest.js').runHarvest({})
  .then(o => console.log('HARVEST:', JSON.stringify(o)))
  .catch(e => { console.error('ERR', e.message); process.exit(1); });
