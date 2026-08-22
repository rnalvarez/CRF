const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

async function main() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/index.html",
    runScripts: "outside-only",
    resources: "usable"
  });
  const { window } = dom;

  // jsdom no trae fetch por defecto; lo shimeamos para que lea devices.json del disco
  window.fetch = async (url) => {
    const p = path.join(__dirname, url);
    const text = fs.readFileSync(p, "utf8");
    return { json: async () => JSON.parse(text) };
  };

  // calculate() (en app.js) delega el render de cada resultado en renderCandidateResults(),
  // definida en render-accordion.js. En el browser real ambos <script> comparten el mismo
  // scope léxico top-level (const/función), pero jsdom trata cada dom.window.eval() como un
  // Script de vm aparte y no comparte los `const` top-level entre llamadas — por eso se
  // concatenan y se evalúan juntos, replicando el comportamiento real de los <script> en serie.
  const appSrc = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const accordionSrc = fs.readFileSync(path.join(__dirname, "render-accordion.js"), "utf8");
  dom.window.eval(appSrc + "\n" + accordionSrc);

  // init() es async (hace fetch); esperamos a que termine
  await new Promise((r) => setTimeout(r, 200));

  const doc = window.document;
  const results = [];
  const check = (name, cond) => results.push({ name, ok: !!cond });

  check("select de dispositivo poblado (27 perfiles)", doc.getElementById("deviceSelect").options.length === 27);
  check("deviceInfo tiene contenido tras init()", doc.getElementById("deviceInfo").innerHTML.length > 0);

  // Cargar ejemplo (2 G4 + 2 BOYA) y calcular
  doc.getElementById("loadExample").onclick();
  check("cargar ejemplo pobló 4 chips", doc.getElementById("occupiedList").querySelectorAll(".chip").length === 4);

  doc.getElementById("deviceSelect").value = "deity_theos";
  doc.getElementById("calculate").onclick();
  const resultsHtml = doc.getElementById("results").innerHTML;
  check("calcular con THEOS produjo resultados", doc.getElementById("results").querySelectorAll(".result").length > 0);

  // La lista de IM de cada card de resultado debe venir en un <details> desplegable,
  // no como tabla siempre visible (ver render-accordion.js).
  const resultCards = [...doc.getElementById("results").querySelectorAll(".result")];
  check("todas las cards de resultado tienen su detalle IM en un <details>", resultCards.every(c => c.querySelector(":scope > details.im-details")));
  check("ninguna card dejó la tabla de IM suelta fuera del <details>", resultCards.every(c => !c.querySelector(":scope > table.im-table")));
  const summaries = resultCards.map(c => c.querySelector("summary")?.textContent || "");
  check("el summary informa advertencias o marca limpio", summaries.every(s => /advertencias\)$/.test(s) || s.includes("Limpio")));

  // Agregar una frecuencia manual con potencia + digital
  doc.getElementById("occupiedFreq").value = "590.100";
  doc.getElementById("occupiedPower").value = "100";
  doc.getElementById("occupiedDigital").checked = true;
  doc.getElementById("addFreq").onclick();
  check("agregar con potencia/digital sumó un 5to chip", doc.getElementById("occupiedList").querySelectorAll(".chip").length === 5);
  check("el chip muestra la potencia", doc.getElementById("occupiedList").innerHTML.includes("100mW"));

  // Sacar una frecuencia
  window.removeFreq(0);
  check("quitar una frecuencia bajó a 4 chips", doc.getElementById("occupiedList").querySelectorAll(".chip").length === 4);

  // Importar scan
  doc.getElementById("scanText").value = "601.200, -40\n602.500  -60\n# comentario";
  doc.getElementById("scanThreshold").value = "-55";
  doc.getElementById("importScan").onclick();
  check("importScan agregó solo la que supera el umbral (5 chips)", doc.getElementById("occupiedList").querySelectorAll(".chip").length === 5);
  check("scanStatus tiene texto", doc.getElementById("scanStatus").textContent.length > 0);
  console.log("   scanStatus:", doc.getElementById("scanStatus").textContent);

  // Cambiar a un perfil "pending" (RØDELink II) y confirmar que calcular no rompe, avisa
  doc.getElementById("deviceSelect").value = "rodelink_ii";
  doc.getElementById("deviceSelect").dispatchEvent(new window.Event("change"));
  check("deviceInfo muestra el flag de perfil pendiente", doc.getElementById("deviceInfo").innerHTML.includes("confidence-flag"));
  doc.getElementById("calculate").onclick();
  check("calcular con perfil pendiente no rompe y avisa", doc.getElementById("results").innerHTML.includes("modelo de candidatos"));

  // Volver a THEOS y probar la búsqueda de conjunto (n=5)
  doc.getElementById("deviceSelect").value = "deity_theos";
  doc.getElementById("setCount").value = "5";
  const t0 = Date.now();
  doc.getElementById("findSet").onclick();
  const t1 = Date.now();
  const setResultsHtml = doc.getElementById("setResults").innerHTML;
  check("buscar conjunto de 5 produjo 5 resultados", doc.getElementById("setResults").querySelectorAll(".result").length === 5);
  console.log("   tiempo búsqueda de conjunto (n=5):", (t1 - t0) + "ms");

  // Diagnóstico de auto-conflicto: 4 canales BOYA en progresión aritmética
  // (cada uno a 4 pasos del siguiente) generan fantasmas IM3/IM4/IM5 exactos
  // sobre sí mismos. Caso real reportado y verificado en el chat con RAM.
  doc.getElementById("clearAll").onclick();
  doc.getElementById("deviceSelect").value = "boya_wm8_pro_k2";
  for (const f of [556.710, 558.350, 559.990, 561.630]) {
    doc.getElementById("occupiedFreq").value = String(f);
    doc.getElementById("addFreq").onclick();
  }
  check("4 mics en progresión aritmética disparan el diagnóstico de auto-conflicto", doc.getElementById("selfConflicts").innerHTML.includes("conflicto"));
  check("detecta las 9 coincidencias no-degeneradas (IM3+IM4+IM5 sobre las 4)", doc.querySelectorAll(".conflict-item").length === 9);
  doc.getElementById("clearAll").onclick();
  doc.getElementById("loadExample").onclick();
  check("el set por defecto (sin progresión aritmética) no genera falsos positivos", doc.getElementById("selfConflicts").innerHTML.includes("conflict-ok"));

  // Caso reportado en un documento formal: candidato "sin conflictos" que al agregarse
  // genera 2 fantasmas IM5 a 20kHz reales. Debe clasificar ADVERTENCIA (no CRÍTICO por
  // el bug de unidades candidato-espacio-vs-producto-espacio que hubo, ni RECOMENDADO
  // por el gap original que motivó dangerZones).
  doc.getElementById("clearAll").onclick();
  doc.getElementById("deviceSelect").value = "boya_wm8_pro_k2";
  for (const f of [566.200, 574.200, 559.990, 584.180]) {
    doc.getElementById("occupiedFreq").value = String(f);
    doc.getElementById("addFreq").onclick();
  }
  doc.getElementById("calculate").onclick();
  const preHtml = doc.getElementById("selfConflicts").innerHTML;
  check("las 4 originales (2 G4 + 2 BOYA) siguen sin auto-conflicto", preHtml.includes("conflict-ok"));
  doc.getElementById("occupiedFreq").value = "561.220";
  doc.getElementById("addFreq").onclick();
  const postHtml = doc.getElementById("selfConflicts").innerHTML;
  check("agregar 561.220 dispara el diagnóstico (2 fantasmas IM5 reales)", postHtml.includes("IM5") && (postHtml.match(/conflict-item/g) || []).length === 2);
  check("el texto del diagnóstico no dice CRÍTICO para este caso (20kHz reales = advertencia/alto)", postHtml.includes("ALTO") && !postHtml.includes("CRÍTICO"));

  check("el label del candidato con 4 métricas incluye IM2", doc.getElementById("results").innerHTML.includes("Productos IM2"));

  const w = window;

  // --- Botón "usar esta frecuencia": agregar a ocupadas sin volver al formulario de arriba ---
  check("cada card de resultado tiene el botón usar-esta-frecuencia", [...doc.getElementById("results").querySelectorAll(".result")].every(c => c.querySelector(".use-btn")));
  const occupiedBefore = doc.getElementById("occupiedList").querySelectorAll(".chip").length;
  w.addCandidateAsOccupied(599.999);
  check("usar-esta-frecuencia agrega un chip nuevo a ocupadas", doc.getElementById("occupiedList").querySelectorAll(".chip").length === occupiedBefore + 1);
  check("usar-esta-frecuencia muestra el toast de confirmación", doc.getElementById("toast").classList.contains("show") && doc.getElementById("toast").innerHTML.includes("599.999"));

  // --- Dispositivo personalizado: antes de cargar datos no genera candidatos; al completar
  // mínimo/máximo/paso se promueve en caliente a candidateModel "continuous" (mismo motor
  // que cualquier perfil continuo real) y calcular empieza a funcionar. ---
  doc.getElementById("deviceSelect").value = "custom";
  doc.getElementById("deviceSelect").dispatchEvent(new window.Event("change"));
  check("al elegir personalizado se muestra el formulario de rango", !doc.getElementById("customDevice").classList.contains("hidden"));
  doc.getElementById("calculate").onclick();
  check("personalizado sin completar no genera candidatos y avisa", doc.getElementById("results").innerHTML.includes("rango operativo del dispositivo personalizado"));
  doc.getElementById("customName").value = "Shure ULXD de prueba";
  doc.getElementById("customMin").value = "470";
  doc.getElementById("customMax").value = "608";
  doc.getElementById("customStep").value = "0.025";
  w.syncCustomDevice();
  check("completar mín/máx/paso promueve el perfil a candidateModel continuous", doc.getElementById("deviceInfo").innerHTML.includes("Capacidad declarada"));
  doc.getElementById("calculate").onclick();
  check("personalizado completo genera candidatos al calcular", doc.getElementById("results").querySelectorAll(".result").length > 0);

  // --- Los 5 casos pedidos para inRange/fuera_de_rango, contra las funciones reales (no una copia) ---
  {
    const min=560,max=570,rr={min:min-2,max:max+2};
    const occ=[{freq:300,powerMw:null,digital:false},{freq:280,powerMw:null,digital:false},{freq:250,powerMw:null,digital:false}];
    const allIm=w.intermods(occ,5,rr);
    const dz=w.precomputeDangerZones(occ,5,rr);
    const opts={minSep:0.1,imThreshold:12,strict:false,criticalFloor:0.010};

    const im4Fuera=allIm.filter(p=>p.order===4&&p.inRange===false&&(Math.abs(p.freq-max)<15||Math.abs(p.freq-min)<15)).sort((a,b)=>Math.min(Math.abs(a.freq-max),Math.abs(a.freq-min))-Math.min(Math.abs(b.freq-max),Math.abs(b.freq-min)))[0];
    if(im4Fuera){
      const r=w.scoreCandidate({freq:im4Fuera.freq>max?max:min,label:"t"},occ,min,max,opts,allIm,{},dz);
      check("IM4 fuera de rango, único hit -> candidato NO crítico", r.tier!=="critico");
    }
    const im3Fuera=allIm.filter(p=>p.order===3&&p.inRange===false&&(Math.abs(p.freq-max)<15||Math.abs(p.freq-min)<15)).sort((a,b)=>Math.min(Math.abs(a.freq-max),Math.abs(a.freq-min))-Math.min(Math.abs(b.freq-max),Math.abs(b.freq-min)))[0];
    if(im3Fuera){
      const r=w.scoreCandidate({freq:im3Fuera.freq>max?max:min,label:"t"},occ,min,max,opts,allIm,{},dz);
      check("IM3 fuera de rango, único hit -> candidato NO crítico", r.tier!=="critico");
    }
  }
  {
    const min=556.71,max=595.98,rr={min:min-2,max:max+2};
    const occ=[{freq:556.710,powerMw:null,digital:false},{freq:558.350,powerMw:null,digital:false},{freq:559.990,powerMw:null,digital:false}];
    const allIm=w.intermods(occ,5,rr), dz=w.precomputeDangerZones(occ,5,rr);
    const r=w.scoreCandidate({freq:561.630,label:"t"},occ,min,max,{minSep:0.1,imThreshold:0.5,strict:false,criticalFloor:0.010},allIm,{},dz);
    check("IM3 dentro de rango y exacto -> sigue CRÍTICO", r.tier==="critico");
  }
  {
    const min=556.71,max=595.98,rr={min:min-2,max:max+2};
    const occ=[{freq:566.200,powerMw:30,digital:false},{freq:574.200,powerMw:30,digital:false},{freq:559.990,powerMw:null,digital:false},{freq:584.180,powerMw:null,digital:false}];
    const allIm=w.intermods(occ,5,rr), dz=w.precomputeDangerZones(occ,5,rr);
    const r=w.scoreCandidate({freq:561.220,label:"t"},occ,min,max,{minSep:0.8,imThreshold:0.5,strict:false,criticalFloor:0.010},allIm,{},dz);
    check("IM5 dentro de rango y cerca (561.220) -> sigue ADVERTENCIA", r.tier==="advertencia");
  }
  {
    const min=560,max=570,rr={min:min-2,max:max+2};
    const occ=[{freq:300,powerMw:null,digital:false},{freq:280,powerMw:null,digital:false},{freq:250,powerMw:null,digital:false},{freq:560.05,powerMw:null,digital:false}];
    const allIm=w.intermods(occ,5,rr), dz=w.precomputeDangerZones(occ,5,rr);
    const opts={minSep:0.1,imThreshold:12,strict:false,criticalFloor:0.010};
    const r=w.scoreCandidate({freq:560,label:"t"},occ,min,max,opts,allIm,{},dz);
    const rank={recomendado:0,fuera_de_rango:1,revisar:2,advertencia:3,critico:4};
    const peorDentro=r.hits.filter(h=>h.inRange!==false&&h.tier!=="recomendado").sort((a,b)=>rank[b.tier]-rank[a.tier])[0];
    check("mezcla fuera+dentro de rango -> el tier final lo determina el de DENTRO", peorDentro&&r.tier===peorDentro.tier);
  }

  console.log("\n=== RESULTADOS E2E ===");
  let allOk = true;
  for (const r of results) {
    console.log((r.ok ? "OK  " : "FAIL") + " - " + r.name);
    if (!r.ok) allOk = false;
  }
  console.log(allOk ? "\nTODO OK" : "\nHAY FALLAS");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR FATAL EN E2E:", e);
  process.exit(1);
});
