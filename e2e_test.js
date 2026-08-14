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

  const appSrc = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  dom.window.eval(appSrc);

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
