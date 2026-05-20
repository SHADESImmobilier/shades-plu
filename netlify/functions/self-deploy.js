// Netlify function : auto-déploiement via l'API Netlify
const https = require("https");
const url_mod = require("url");

const SITE_ID  = "bf8a5eb3-feae-47f2-ae65-c62434fd99ad";
const SECRET   = "shades-deploy-2025";
const NK_TOKEN = process.env.NETLIFY_TOKEN || "nfp_iTij5ZaBwXgzJLphjPfi8xNM3uX5K1Xk0e9b";

exports.handler = async function(event) {
  var CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: '{"error":"POST only"}' };

  // Vérifier le secret
  var body = {};
  try { body = JSON.parse(event.body || "{}"); } catch(e) {}
  if (body.secret !== SECRET) return { statusCode: 403, headers: CORS, body: '{"error":"forbidden"}' };

  // Recevoir le zip en base64
  var zipB64 = body.zip;
  if (!zipB64) return { statusCode: 400, headers: CORS, body: '{"error":"zip manquant"}' };

  var zipBuf = Buffer.from(zipB64, "base64");
  console.log("ZIP reçu:", zipBuf.length, "bytes");

  // Déployer sur Netlify via API
  return new Promise(function(resolve) {
    var opts = url_mod.parse("https://api.netlify.com/api/v1/sites/" + SITE_ID + "/deploys");
    opts.method = "POST";
    opts.headers = {
      "Authorization": "Bearer " + NK_TOKEN,
      "Content-Type": "application/zip",
      "Content-Length": zipBuf.length
    };
    opts.timeout = 55000;

    var req = https.request(opts, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() {
        var txt = Buffer.concat(chunks).toString();
        var d = {};
        try { d = JSON.parse(txt); } catch(e) {}
        resolve({
          statusCode: 200, headers: CORS,
          body: JSON.stringify({ ok: true, deployId: d.id, state: d.state, url: d.deploy_ssl_url })
        });
      });
    });
    req.on("error", function(e) {
      resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message }) });
    });
    req.write(zipBuf);
    req.end();
  });
};
