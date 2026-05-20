// claude-proxy.js — Proxy sécurisé pour l'API Claude (SHADES Immobilier)
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Méthode non autorisée' }) };

  const AK = process.env.ANTHROPIC_API_KEY;
  if (!AK) return {
    statusCode: 500, headers: cors,
    body: JSON.stringify({ error: 'ANTHROPIC_API_KEY non configurée dans les variables Netlify' })
  };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  // Construire le payload sécurisé — passer tous les champs nécessaires
  const safe = {};
  ['model','max_tokens','system','messages','tools','tool_choice','betas'].forEach(k => {
    if (body[k] !== undefined) safe[k] = body[k];
  });

  // Forcer le modèle
  safe.model = 'claude-sonnet-4-5';

  // Limiter max_tokens (max 4000 pour économiser)
  if (!safe.max_tokens || safe.max_tokens > 4000) safe.max_tokens = 1500;

  // Headers Anthropic — inclure betas si tools web_search présents
  const apiHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': AK,
    'anthropic-version': '2023-06-01'
  };

  // Si web_search tool présent, pas besoin de beta header (disponible en GA)
  // Mais on passe quand même pour compatibilité
  const hasWebSearch = safe.tools && safe.tools.some(t => t.type && t.type.includes('web_search'));
  if (hasWebSearch) {
    // web_search_20250305 ne nécessite pas de beta header sur claude-sonnet-4-5
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(safe),
      signal: AbortSignal.timeout(58000)
    });

    const responseText = await resp.text();

    // Log erreur API pour debug
    if (!resp.ok) {
      console.error(`API Anthropic erreur ${resp.status}:`, responseText.slice(0, 500));
    }

    return {
      statusCode: resp.status,
      headers: cors,
      body: responseText
    };
  } catch(e) {
    console.error('Proxy erreur:', e.message);
    return {
      statusCode: 502,
      headers: cors,
      body: JSON.stringify({ error: 'Erreur proxy: ' + e.message })
    };
  }
};
