// transcribe.js — Transcription audio (OpenAI) pour l'assistant d'équilibrage.
// Le client envoie l'audio en base64, par tranches, pour tenir dans la limite
// de taille de corps d'une fonction Netlify.
//
// Variable d'environnement requise : OPENAI_API_KEY
//
// Corps attendu (JSON) :
//   { audio: "<base64>", mime: "audio/wav", nom: "part1.wav",
//     prompt: "vocabulaire à privilégier", modele: "gpt-4o-mini-transcribe" }
// Réponse : { texte: "..." }

const MODELES = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'];
const MIMES = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a'
};
const MAX_OCTETS = 20 * 1024 * 1024;   // garde-fou avant l'envoi à OpenAI (limite 25 Mo)

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  const ko = (code, msg) => ({ statusCode: code, headers: cors, body: JSON.stringify({ error: msg }) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return ko(405, 'Méthode non autorisée');

  const AK = process.env.OPENAI_API_KEY;
  if (!AK) return ko(500, 'OPENAI_API_KEY non configurée dans les variables Netlify');

  let body;
  try { body = JSON.parse(event.body); }
  catch (e) { return ko(400, 'JSON invalide'); }

  if (!body.audio) return ko(400, 'Aucun audio reçu');

  let buf;
  try { buf = Buffer.from(body.audio, 'base64'); }
  catch (e) { return ko(400, 'Audio illisible (base64 attendu)'); }
  if (!buf.length) return ko(400, 'Audio vide');
  if (buf.length > MAX_OCTETS) return ko(413, 'Tranche audio trop lourde (' + Math.round(buf.length / 1048576) + ' Mo)');

  const mime = MIMES[body.mime] ? body.mime : 'audio/wav';
  const ext = MIMES[mime];
  const modele = MODELES.includes(body.modele) ? body.modele : MODELES[0];

  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), (body.nom || 'audio') + '.' + ext);
  fd.append('model', modele);
  fd.append('language', 'fr');
  fd.append('response_format', 'text');
  // Le prompt oriente la reconnaissance vers le vocabulaire du métier : c'est ce qui
  // évite « vanne stade » au lieu de STAD. whisper-1 le limite à 224 jetons.
  if (body.prompt) fd.append('prompt', String(body.prompt).slice(0, modele === 'whisper-1' ? 800 : 4000));

  try {
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + AK },
      body: fd,
      signal: AbortSignal.timeout(50000)
    });
    const texte = await resp.text();
    if (!resp.ok) {
      console.error('Transcription erreur ' + resp.status + ' : ' + texte.slice(0, 400));
      let msg = texte.slice(0, 300);
      try { const j = JSON.parse(texte); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
      return ko(resp.status, msg);
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ texte: texte.trim() }) };
  } catch (e) {
    console.error('Transcription proxy erreur : ' + e.message);
    return ko(502, 'Erreur de transcription : ' + e.message);
  }
};
