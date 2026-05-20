exports.handler = async (event) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ ok: false }) };
  let data;
  try { data = JSON.parse(event.body); } catch(e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false }) }; }
  const { nom, email, tel, projet, budget, zone, message } = data;
  if (!nom || !email) return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: 'Champs requis manquants' }) };
  const FORMSPREE_ID = process.env.FORMSPREE_ID;
  if (FORMSPREE_ID) {
    try {
      const r = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ nom, email, tel, projet, budget, zone, message, _subject: `Demande SHADES — ${projet||'Projet'} — ${nom}`, _replyto: email }) });
      if (r.ok) return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    } catch(e) {}
  }
  const SLACK = process.env.SLACK_WEBHOOK_URL;
  if (SLACK) { try { await fetch(SLACK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `*Nouveau lead SHADES*\n*Nom:* ${nom}\n*Email:* ${email}\n*Tel:* ${tel||'-'}\n*Projet:* ${projet||'-'}\n*Budget:* ${budget||'-'}\n*Zone:* ${zone||'-'}\n*Message:* ${message||'-'}` }) }); } catch(e) {} }
  return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
};
