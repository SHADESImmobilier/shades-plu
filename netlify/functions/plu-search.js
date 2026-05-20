// Netlify Function v3.2 — données seulement, analyse IA dans le browser
const https = require("https");
const url_mod = require("url");

function get(apiUrl, binary, redirectCount) {
  redirectCount = redirectCount || 0;
  return new Promise(function(resolve, reject) {
    var opts = url_mod.parse(apiUrl);
    opts.headers = {
      "Accept": "application/json,text/html,application/pdf,*/*",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.geoportail-urbanisme.gouv.fr/map/"
    };
    opts.timeout = 8000;
    var req = https.get(opts, function(res) {
      if ([301,302,303,307,308].indexOf(res.statusCode) >= 0 && res.headers.location && redirectCount < 5) {
        res.resume();
        var loc = res.headers.location;
        if (loc.startsWith("/")) { var p = url_mod.parse(apiUrl); loc = p.protocol+"//"+p.host+loc; }
        get(loc, binary, redirectCount+1).then(resolve).catch(reject);
        return;
      }
      var chunks = [];
      res.on("data", function(c) { chunks.push(c); });
      res.on("end", function() {
        var buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, body: binary ? buf : buf.toString(), buffer: buf, contentType: res.headers["content-type"]||"" });
      });
    });
    req.on("error", reject);
    req.on("timeout", function() { req.destroy(); reject(new Error("timeout")); });
  });
}

exports.handler = async function(event) {
  var CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  var p = event.queryStringParameters || {};
  var adresse = p.adresse || "";
  if (!adresse) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "adresse manquante" }) };

  try {
    // 1. Géocodage
    var geoRes = await get("https://data.geopf.fr/geocodage/search?q="+encodeURIComponent(adresse)+"&limit=1");
    if (geoRes.status !== 200) throw new Error("Geocodeur "+geoRes.status);
    var geoD = JSON.parse(geoRes.body);
    if (!geoD.features || !geoD.features.length) throw new Error("Adresse non trouvée.");
    var feat = geoD.features[0];
    var lon = feat.geometry.coordinates[0], lat = feat.geometry.coordinates[1];
    var pp = feat.properties;
    var geo = { adresse: pp.label||adresse, commune: pp.city||pp.municipality||"", cp: pp.postcode||"", insee: pp.citycode||"" };
    var gpuUrl = "https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon="+lon+"&lat="+lat+"&zoom=18&mlon="+lon+"&mlat="+lat;

    // 2. Parcelle WFS
    var section="", numero="", surface=null, codeDep="", codeCom="";
    try {
      var wfsRes = await get("https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&typename=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&outputFormat=application%2Fjson&srsName=CRS:84&count=10000&cql_filter=INTERSECTS(geom,POINT+("+lat+"+"+lon+"))");
      if (wfsRes.status === 200) {
        var wfsD = JSON.parse(wfsRes.body);
        if (wfsD.features && wfsD.features.length) {
          var pp0 = wfsD.features[0].properties;
          section=pp0.section||""; numero=pp0.numero||""; surface=pp0.contenance||pp0.surfc||null;
          codeDep=pp0.dep||(geo.insee?geo.insee.slice(0,2):""); codeCom=pp0.com||(geo.insee?geo.insee.slice(2):"");
        }
      }
    } catch(e) {}

    // 3. Zone PLU
    var zone=null, docId="";
    try {
      var fiRes = await get("https://www.geoportail-urbanisme.gouv.fr/api/feature-info/du?lon="+lon+"&lat="+lat+"&zoom=18");
      if (fiRes.status === 200) {
        var fiD = JSON.parse(fiRes.body);
        (fiD.features||[]).forEach(function(f) {
          if (f.id && f.id.indexOf('zone_urba')===0) {
            var zp=f.properties;
            zone={code:zp.libelle||"?",libelle:zp.libelong||"",type:zp.typezone||"U",date:zp.datvalid||zp.datappro||"",urlDoc:zp.urlfic||"",partition:zp.partition||"",idurba:zp.idurba||""};
          }
          if (f.id && f.id.indexOf('document.fid')===0 && f.properties && f.properties.id) docId=f.properties.id;
        });
      }
    } catch(e) {}

    if (!zone) throw new Error("Zone PLU non disponible.");

    // 4. Surface fiche
    try {
      if (section && numero && codeDep && codeCom) {
        var ficheRes = await get("https://geoportail-urbanisme.gouv.fr/map/parcel-info/"+codeDep.padStart(2,"0")+"_"+codeCom.padStart(3,"0")+"_000_000_"+section+"_"+numero.padStart(4,"0")+"/");
        if (ficheRes.status===200) { var mS=ficheRes.body.match(/Contenance\s*:\s*([\d\s]+)\s*m/i); if(mS) surface=parseInt(mS[1].replace(/\s/g,"")); }
      }
    } catch(e) {}

    // 5. Fichiers PLU — liste noms via /files
    var pluFiles=[], reglementUrl="", reglementNom="";
    if (docId) {
      try {
        var filesRes = await get("https://www.geoportail-urbanisme.gouv.fr/api/document/"+docId+"/files");
        if (filesRes.status===200) {
          var filesD=JSON.parse(filesRes.body);
          var noms=[];
          if (Array.isArray(filesD)) {
            filesD.forEach(function(f){
              if (typeof f==="string") noms.push(f);
              else if (f.name) noms.push(f.name);
              else if (f.filename) noms.push(f.filename);
            });
          }
          pluFiles=noms.filter(function(n){return n.toLowerCase().indexOf(".pdf")>=0;}).map(function(nom){
            return {nom:nom, url:"https://www.geoportail-urbanisme.gouv.fr/api/document/"+docId+"/files/"+nom};
          });
          // Trouver règlement écrit
          for (var pi=0; pi<pluFiles.length; pi++) {
            var fn=(pluFiles[pi].nom||"").toLowerCase();
            if ((fn.indexOf("reglement")>=0||fn.indexOf("règlement")>=0) && fn.indexOf("graphique")<0) {
              reglementUrl=pluFiles[pi].url; reglementNom=pluFiles[pi].nom; break;
            }
          }
        }
      } catch(e) {}
    }
    if (!reglementUrl && zone.urlDoc) reglementUrl=zone.urlDoc;

    // 6. Télécharger le PDF du règlement
    var reglementBase64=null;
    if (reglementUrl) {
      try {
        var pdfRes = await get(reglementUrl, true);
        var buf=pdfRes.buffer;
        var isPdf=buf.length>4 && buf[0]===0x25 && buf[1]===0x50 && buf[2]===0x44 && buf[3]===0x46;
        if (pdfRes.status===200 && isPdf && buf.length < 10*1024*1024) {
          reglementBase64=buf.toString("base64");
        }
      } catch(e) {}
    }

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        version:"3.2", geo,
        parcelle:{section,numero,surface,codeDep,codeCom},
        zone, pluFiles, docId, gpuUrl,
        coords:{lon,lat}, reglementUrl, reglementNom, reglementBase64
      })
    };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
