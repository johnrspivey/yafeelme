const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  let body;
  try { body = JSON.parse(event.body); } catch(e) { return { statusCode: 400, headers: CORS, body: 'Invalid JSON' }; }
  const { text } = body;
  if (!text || !text.trim()) return { statusCode: 400, headers: CORS, body: 'No text provided' };
  const sentences = text.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g) || [text];
  const cleaned = sentences.map(s => s.trim()).filter(s => s.length > 1);
  const prompt = cleaned.map((s, i) => (i+1) + '. ' + s).join('\n');
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: 'Return ONLY a raw JSON array. No markdown, no backticks, no explanation. Format: [{"sentence":"exact sentence text","tone":"tone_word"},...] Tone must be exactly one of: happy excited flirty hopeful chill sad melancholy sarcastic angry frustrated passive neutral',
    messages: [{ role: 'user', content: 'Score each sentence for emotional tone:\n' + prompt }]
  });
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: json.error.message || JSON.stringify(json.error) }) });
            return;
          }
          const raw = json.content && json.content[0] ? json.content[0].text : '';
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch(e) {}
          if (!parsed) { const m = raw.match(/\[[\s\S]*\]/); if (m) try { parsed = JSON.parse(m[0]); } catch(e) {} }
          if (!parsed || !parsed.length) {
            resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Parse failed', raw: raw.slice(0, 300), fullResponse: JSON.stringify(json).slice(0, 300) }) });
            return;
          }
          resolve({ statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ sentences: parsed }) });
        } catch(e) {
          resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message, raw: data.slice(0, 300) }) });
        }
      });
    });
    req.on('error', (e) => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
    req.write(payload);
    req.end();
  });
};
