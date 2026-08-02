require('../../netlify/functions/chat-review.js').runChatReview({})
  .then(o => console.log('REVIEW:', JSON.stringify(o)))
  .catch(e => { console.error('ERR', e.message); process.exit(1); });
