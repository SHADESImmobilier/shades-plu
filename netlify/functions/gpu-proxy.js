// Proxy Netlify → APIs IGN (apicarto + WFS data.geopf.fr)
const https = require("https");
const url_mod = require("url");

function get(apiUrl) {
  return new Promise(function(resolve, reject) {
    var opts = url_mod.parse(apiUrl);
    opts.headers = { "Accept": "application/json,text/html", "User-Agent": "SHADES-PLU/1.0" };
    https.get(opts, function(res) {
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() { resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }); });
    }).on("error", reject);
  });
}

exports.handler = async function(event) {
  var CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  var p = event.queryStringParameters || {};
  var action = p.action;

  try {
    /* ── STRATÉGIE B : zones PLU par commune + bbox ──────────────────────────
       1. On récupère toutes les zones PLU de la commune dans un rayon de 150m
       2. On obtient PLUSIEURS zones : Zone Ah (voirie) ET Zone UE (bâtiments)
       3. On filtre : on exclut la zone où tombent les coords BAN (la voirie)
       4. On retourne la zone de bâtiment = la bonne
    ─────────────────────────────────────────────────────────────────────────── */
    if (action === "zones-commune") {
      var lon = parseFloat(p.lon), lat = parseFloat(p.lat);
      var insee = p.insee || "";
      var zoneAEviter = p.zoneAEviter || ""; // zone retournée par le point exact (Ah)

      // Étape 1 : récupère l'id_doc du PLU de la commune
      var docRes = await get("https://apicarto.ign.fr/api/gpu/document?codeInsee=" + insee);
      var docD = JSON.parse(docRes.body);
      var idDoc = "";
      if (docD.features && docD.features.length) {
        idDoc = docD.features[0].properties.id_doc || "";
      }
      if (!idDoc) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: "PLU non trouvé pour " + insee }) };

      // Étape 2 : WFS — toutes les zones du PLU dans un rayon de 150m
      var d = 0.0015; // ~150m
      var bbox = (lon-d) + "," + (lat-d) + "," + (lon+d) + "," + (lat+d);
      var wfsUrl = "https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
        + "&TYPENAMES=gpu:zone_urba"
        + "&outputFormat=application/json"
        + "&CQL_FILTER=id_doc%3D'" + idDoc + "'"
        + "&BBOX=" + bbox + ",EPSG:4326"
        + "&COUNT=30";

      var wfsRes = await get(wfsUrl);
      if (wfsRes.status !== 200) {
        return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: "WFS erreur " + wfsRes.status }) };
      }
      var wfsD = JSON.parse(wfsRes.body);
      var features = wfsD.features || [];

      // Étape 3 : filtrer les zones
      // - exclure la zone exacte des coords BAN (la voirie)
      // - préférer les zones de type U (urbain)
      // - en cas d'égalité, prendre la plus grande surface (zone bâtie > voirie)
      var candidates = features.filter(function(f) {
        var code = f.properties.libelle || "";
        return code !== zoneAEviter;
      });

      // Trier : U d'abord, puis par surface décroissante
      candidates.sort(function(a, b) {
        var ta = a.properties.typezone || "", tb = b.properties.typezone || "";
        if (ta === "U" && tb !== "U") return -1;
        if (tb === "U" && ta !== "U") return 1;
        // Même type : prendre la plus grande surface (approximée par bbox)
        return 0;
      });

      if (!candidates.length) {
        return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: "Aucune zone alternative trouvée" }) };
      }

      var best = candidates[0].properties;
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          zone: {
            code: best.libelle || "?",
            libelle: best.libelong || "",
            type: best.typezone || "",
            date: best.datappro || "",
            urlDoc: best.urlfic || "",
            partition: best.partition || "",
            idurba: best.idurba || ""
          },
          total: features.length,
          candidats: candidates.length
        })
      };
    }

    /* ── FICHE DÉTAILLÉE (HTML statique Géoportail) ── */
    if (action === "fiche") {
      var ficheUrl = p.url || "";
      if (!ficheUrl) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "url manquante" }) };
      var ficheRes = await get(ficheUrl);
      var html = ficheRes.body;
      var mSurf = html.match(/Contenance\s*:\s*([\d\s]+)\s*m/i);
      var surface = mSurf ? parseInt(mSurf[1].replace(/\s/g, "")) : null;
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ surface }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "action invalide: " + action }) };

  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
