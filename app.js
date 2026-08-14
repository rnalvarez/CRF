const state={devices:{},occupied:[]}; // occupied: [{freq, powerMw, digital, source}]

const $=id=>document.getElementById(id);
const fmt=f=>Number(f).toFixed(3);
const REF_POWER_MW=50;

function powerFactor(mw){
  if(!mw||!Number.isFinite(mw)||mw<=0)return 1;
  return Math.max(0.5,Math.min(2,Math.sqrt(mw/REF_POWER_MW)));
}
function selectivityFactor(d){
  if(!d||!d.selectivityDb)return 1;
  return Math.max(0.7,Math.min(1,1-(d.selectivityDb-50)/200));
}

async function init(){
  state.devices=await fetch("data/devices.json").then(r=>r.json());
  const sel=$("deviceSelect");
  for(const [id,d] of Object.entries(state.devices)){
    const o=document.createElement("option"); o.value=id; o.textContent=d.name; sel.appendChild(o);
  }
  sel.addEventListener("change",renderDeviceInfo);
  renderDeviceInfo();
  $("addFreq").onclick=addOccupied;
  $("occupiedFreq").addEventListener("keydown",e=>{if(e.key==="Enter")addOccupied()});
  $("clearAll").onclick=()=>{state.occupied=[];renderOccupied();calculate()};
  $("loadExample").onclick=()=>{
    state.occupied=[
      {freq:566.200,powerMw:30,digital:false,source:"manual"},
      {freq:574.200,powerMw:30,digital:false,source:"manual"},
      {freq:559.990,powerMw:null,digital:false,source:"manual"},
      {freq:584.180,powerMw:null,digital:false,source:"manual"}
    ];
    renderOccupied();calculate();
  };
  $("calculate").onclick=calculate;
  $("importScan").onclick=importScan;
  $("findSet").onclick=calculateSet;
}

function addOccupied(){
  const v=parseFloat($("occupiedFreq").value);
  if(!Number.isFinite(v))return;
  const pw=parseFloat($("occupiedPower").value);
  const dig=$("occupiedDigital").checked;
  if(!state.occupied.some(x=>Math.abs(x.freq-v)<0.0001)){
    state.occupied.push({freq:v,powerMw:Number.isFinite(pw)&&pw>0?pw:null,digital:!!dig,source:"manual"});
  }
  state.occupied.sort((a,b)=>a.freq-b.freq);
  $("occupiedFreq").value="";$("occupiedPower").value="";$("occupiedDigital").checked=false;
  renderOccupied(); calculate();
}
/* ¿El propio set de ocupadas genera fantasmas IM que caen sobre OTRA ocupada del
   mismo set? A diferencia de intermods()+scoreCandidate() (que evalúan candidatos
   nuevos contra lo ya ocupado), esto compara lo ocupado contra sí mismo. Reusa
   exactamente la misma ponderación (orden, potencia, descuento digital, selectividad,
   modo estricto) que scoreCandidate para que el criterio de "qué tan grave" sea
   consistente en toda la app. */
function analyzeSelfConflicts(occupied,opts,device){
  if(occupied.length<2)return [];
  const allIm=intermods(occupied,5);
  const selFactor=selectivityFactor(device);
  const threshold=opts.imThreshold*selFactor;
  const hits=[];
  for(const p of allIm){
    for(let i=0;i<occupied.length;i++){
      if(p.coeffs[i]!==0)continue; // esta ocupada ya es generadora de este producto, no es una víctima distinta
      const o=occupied[i];
      const dist=Math.abs(p.freq-o.freq);
      if(dist<=threshold){
        const severity=(threshold-dist)/Math.max(threshold,1e-9);
        const orderWeight=p.order===3?1.6:p.order===2?1.2:(p.order===4?0.8:0.5);
        const digitalDiscount=p.allDigital?0.5:1;
        const risk=severity*orderWeight*(opts.strict?1.6:1)*digitalDiscount*p.powerWeight;
        const generators=p.coeffs.map((c,j)=>c!==0?{freq:occupied[j].freq,coef:c}:null).filter(Boolean);
        hits.push({victim:o,order:p.order,dist,risk,generators});
      }
    }
  }
  hits.sort((a,b)=>b.risk-a.risk);
  return hits;
}

function renderSelfConflicts(){
  const box=$("selfConflicts");
  if(!box)return;
  if(state.occupied.length<2){box.innerHTML="";return}
  const opts={imThreshold:parseFloat($("imThreshold").value)||0.5,strict:$("strict").checked};
  const device=state.devices[$("deviceSelect").value];
  const hits=analyzeSelfConflicts(state.occupied,opts,device);
  if(!hits.length){
    box.innerHTML=`<p class="conflict-ok">✓ Sin conflictos de IM detectados entre las frecuencias ocupadas (orden 2–5, dentro de ${fmt(opts.imThreshold)} MHz).</p>`;
    return;
  }
  box.innerHTML=`<p class="conflict-warn-title">⚠ ${hits.length} conflicto(s) de IM dentro del propio set de ocupadas:</p>` +
    hits.map(h=>{
      const gens=h.generators.map(g=>`${g.coef>0?"+":""}${g.coef}×${fmt(g.freq)}`).join(" ");
      return `<div class="conflict-item"><b>${fmt(h.victim.freq)} MHz</b> tiene un fantasma IM${h.order} a ${fmt(h.dist)} MHz, generado por ${gens} MHz.</div>`;
    }).join("");
}

function renderOccupied(){
  $("occupiedList").innerHTML=state.occupied.map((o,i)=>{
    const tags=[o.powerMw?`${o.powerMw}mW`:null,o.digital?"digital":null,o.source==="scan"?"scan":null].filter(Boolean).join(" · ");
    return `<span class="chip${o.source==="scan"?" chip-scan":""}">${fmt(o.freq)} MHz${tags?` <small>(${tags})</small>`:""} <button title="Eliminar" onclick="removeFreq(${i})">×</button></span>`;
  }).join("");
  $("status").textContent=state.occupied.length?`${state.occupied.length} frecuencia(s) ocupada(s).`:"Agregá al menos una frecuencia ocupada.";
  renderSelfConflicts();
}
function removeFreq(i){state.occupied.splice(i,1);renderOccupied();calculate()}

function renderDeviceInfo(){
  const d=state.devices[$("deviceSelect").value];
  let html=`<strong>${d.name}</strong><br><span>${d.kind}</span>`;
  if(d.confidence&&d.confidence!=="verified"){
    const txt=d.confidence==="pending"
      ? "⚠ sin datos RF publicados todavía — este perfil no genera candidatos hasta cargar specs reales."
      : "⚠ datos estimados / dependientes de la variante del equipo — confirmá contra tu unidad real antes de coordinar un rodaje.";
    html+=`<br><span class="confidence-flag">${txt}</span>`;
  }
  html+="<br>";
  if(d.candidateModel==="channels"){
    html+=d.banks.map(b=>`Banco ${b.name}: ${fmt(b.start)}–${fmt(b.start+b.step*(b.channels-1))} MHz · ${b.channels} canales · paso ${fmt(b.step)} MHz`).join("<br>");
  }else if(d.candidateModel==="continuous"){
    html+=`Capacidad declarada: ${fmt(d.min)}–${fmt(d.max)} MHz · paso ${fmt(d.step)} MHz`;
    if(d.bandwidth)html+=` · ancho RF ${fmt(d.bandwidth)} MHz · spacing ${fmt(d.channelSpacing)} MHz`;
    if(d.selectivityDb)html+=` · selectividad canal adyacente ${d.selectivityDb} dB`;
    if(d.powerOptionsMw?.length)html+=`<br>Potencias: ${d.powerOptionsMw.join(" / ")} mW`;
  }else{
    html+="Sin modelo de candidatos configurado todavía para este perfil.";
  }
  html+=`<br><small>${d.notes||""}</small>`;
  $("deviceInfo").innerHTML=html;
}

function generateCandidates(d,min,max){
  const out=[];
  if(d.candidateModel==="channels"){
    for(const b of d.banks)for(let ch=1;ch<=b.channels;ch++){
      const f=b.start+b.step*(ch-1);
      if(f>=min-1e-9&&f<=max+1e-9)out.push({freq:f,label:`Banco ${b.name} · CH ${String(ch).padStart(2,"0")}`,bank:b.name,channel:ch});
    }
  }else if(d.candidateModel==="continuous"){
    const start=Math.ceil((min-d.min-1e-9)/d.step)*d.step+d.min;
    for(let i=0;;i++){
      const f=+(start+i*d.step).toFixed(6);
      if(f>max+1e-9||f>d.max+1e-9)break;
      if(f>=d.min-1e-9)out.push({freq:f,label:"Frecuencia sintonizable"});
      if(i>20000)break;
    }
  }
  return out;
}

/* Generate signed intermodulation products up to order N.
   This is deliberately conservative: it is a mathematical screening model,
   not a full RF front-end simulation. occupied is [{freq,powerMw,digital},...];
   each returned product carries which occupied entries contributed (allDigital)
   and a combined power weight, used later to modulate the score penalty. */
function intermods(occupied,maxOrder=5){
  const freqs=occupied.map(o=>o.freq);
  const products=[];
  const uniq=new Set();
  const n=freqs.length;
  for(let order=2;order<=maxOrder;order++){
    function rec(i,coeffs,sumAbs){
      if(i===n){
        if(sumAbs<2||sumAbs>order)return;
        const nonzero=coeffs.filter(c=>c!==0).length;
        if(nonzero<2)return;
        let value=0; for(let j=0;j<n;j++)value+=coeffs[j]*freqs[j];
        if(value<=0||value>2000)return;
        const key=value.toFixed(6)+":"+order;
        if(!uniq.has(key)){
          uniq.add(key);
          const contributors=coeffs.map((c,j)=>c!==0?j:-1).filter(j=>j>=0);
          const allDigital=contributors.length>0&&contributors.every(j=>!!occupied[j].digital);
          const powFactors=contributors.map(j=>powerFactor(occupied[j].powerMw));
          const geoMeanPow=powFactors.length?Math.pow(powFactors.reduce((a,b)=>a*b,1),1/powFactors.length):1;
          products.push({freq:value,order,coeffs:[...coeffs],allDigital,powerWeight:geoMeanPow});
        }
        return;
      }
      for(let c=-order;c<=order;c++){
        const s=sumAbs+Math.abs(c);
        if(s<=order)rec(i+1,coeffs.concat(c),s);
      }
    }
    rec(0,[],0);
  }
  return products;
}

function scoreCandidate(cand,occupied,rangeMin,rangeMax,opts,allIm,device){
  const selFactor=selectivityFactor(device);
  const effMinSep=opts.minSep*selFactor;
  const effImThreshold=opts.imThreshold*selFactor;
  let score=100;
  let reasons=[];

  // Separación a cada vecino ocupado, exigiendo más distancia cuanto más potente
  // esté declarado ese vecino (heurística: requeridoMHz = minSep_efectivo * powerFactor).
  let worstRatio=0, worstSep=Infinity;
  for(const o of occupied){
    const dist=Math.abs(cand.freq-o.freq);
    if(dist<worstSep)worstSep=dist;
    const required=effMinSep*powerFactor(o.powerMw);
    const deficit=Math.max(0,required-dist);
    const ratio=required>0?deficit/required:0;
    if(ratio>worstRatio)worstRatio=ratio;
  }
  if(worstRatio>0){
    score-=45*worstRatio;
    reasons.push(`separación mínima ${fmt(worstSep)} MHz`);
  }else score+=Math.min(10,worstSep);

  let nearestIM=Infinity, nearestIMOrder=null;
  for(const p of allIm){
    const dist=Math.abs(cand.freq-p.freq);
    if(dist<nearestIM){nearestIM=dist;nearestIMOrder=p.order}
    if(dist<effImThreshold){
      const severity=(effImThreshold-dist)/effImThreshold;
      const orderWeight=p.order===3?1.6:p.order===2?1.2:(p.order===4?0.8:0.5);
      const digitalDiscount=p.allDigital?0.5:1; // sistemas digitales de espectro angosto: penalización reducida, no anulada
      score-=35*severity*orderWeight*(opts.strict?1.6:1)*digitalDiscount*p.powerWeight;
    }
  }
  if(nearestIM<effImThreshold)reasons.push(`IM${nearestIMOrder} a ${fmt(nearestIM)} MHz`);
  const edge=Math.min(cand.freq-rangeMin,rangeMax-cand.freq);
  if(edge<0.5)score-=5;
  score=Math.max(0,Math.min(100,score));
  let cls=score>=75?"good":score>=50?"warn":"bad";
  let label=score>=75?"RECOMENDADA":score>=50?"CONDICIONAL":"EVITAR";
  return {cand,score,cls,label,minSep:worstSep,nearestIM,nearestIMOrder,reasons};
}

function calculate(){
  const min=parseFloat($("rangeMin").value),max=parseFloat($("rangeMax").value);
  const opts={minSep:parseFloat($("minSeparation").value),imThreshold:parseFloat($("imThreshold").value),strict:$("strict").checked};
  renderSelfConflicts();
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min){$("results").innerHTML="<p class='bad-text'>Rango inválido.</p>";return}
  if(!state.occupied.length){$("results").innerHTML="<p class='hint'>Cargá al menos una frecuencia ocupada para generar recomendaciones.</p>";return}
  const d=state.devices[$("deviceSelect").value];
  if(d.candidateModel!=="channels"&&d.candidateModel!=="continuous"){
    $("results").innerHTML="<p class='bad-text'>Este perfil todavía no tiene un modelo de candidatos configurado (ver nota arriba). Elegí otro dispositivo o cargá los datos del fabricante.</p>";
    return;
  }
  let candidates=generateCandidates(d,min,max).filter(c=>!state.occupied.some(f=>Math.abs(f.freq-c.freq)<1e-6));
  const allIm=intermods(state.occupied,5);
  const results=candidates.map(c=>scoreCandidate(c,state.occupied,min,max,opts,allIm,d)).sort((a,b)=>b.score-a.score).slice(0,parseInt($("resultCount").value)||20);
  $("results").innerHTML=results.length?results.map((r,i)=>`
    <div class="result ${r.cls}">
      <div class="result-top"><div><span class="freq">${fmt(r.cand.freq)} MHz</span><div class="meta">${r.cand.label}</div></div><div class="score">${Math.round(r.score)}/100<br><small>${r.label}</small></div></div>
      <div class="bar"><span style="width:${r.score}%"></span></div>
      <div class="small-grid">
        <div class="metric"><b>${fmt(r.minSep)} MHz</b>Separación mínima</div>
        <div class="metric"><b>${r.nearestIM===Infinity?"—":fmt(r.nearestIM)+" MHz"}</b>IM más cercano</div>
        <div class="metric"><b>${r.nearestIMOrder?`IM${r.nearestIMOrder}`:"—"}</b>Orden</div>
      </div>
      ${r.reasons.length?`<div class="meta">${r.reasons.join(" · ")}</div>`:"<div class='meta'>Sin conflicto matemático relevante detectado por el modelo.</div>"}
    </div>`).join(""):"<p class='bad-text'>No hay candidatos dentro del rango y las capacidades del dispositivo.</p>";
}

/* ---- Etapa 5: importar resultados de scan pegados como texto ---- */
function parseScanText(text){
  const out=[];
  for(const raw of text.split("\n")){
    const line=raw.trim();
    if(!line||line.startsWith("#")||line.startsWith("//"))continue;
    const nums=line.match(/-?\d+(\.\d+)?/g);
    if(!nums||nums.length<2)continue;
    const freq=parseFloat(nums[0]), level=parseFloat(nums[1]);
    if(!Number.isFinite(freq)||!Number.isFinite(level))continue;
    if(freq<20||freq>3000)continue; // filtro de cordura: no todo par de números es freq+nivel
    out.push({freq,level});
  }
  return out;
}
function importScan(){
  const text=$("scanText").value;
  const thRaw=parseFloat($("scanThreshold").value);
  const th=Number.isFinite(thRaw)?thRaw:-55;
  const parsed=parseScanText(text);
  if(!parsed.length){$("scanStatus").textContent="No se reconocieron líneas con frecuencia + nivel.";return}
  const hits=parsed.filter(p=>p.level>=th);
  let added=0,already=0;
  for(const h of hits){
    if(state.occupied.some(o=>Math.abs(o.freq-h.freq)<0.0001)){already++;continue}
    state.occupied.push({freq:h.freq,powerMw:null,digital:false,source:"scan"});
    added++;
  }
  state.occupied.sort((a,b)=>a.freq-b.freq);
  renderOccupied();
  calculate();
  $("scanStatus").textContent=`${parsed.length} línea(s) leídas · ${hits.length} sobre el umbral (${th} dBm) · ${added} agregada(s) · ${already} ya estaban en la lista.`;
}

/* ---- Etapa 6: buscar un conjunto de N frecuencias mutuamente compatibles ----
   No es top-N independiente: cada elección nueva se suma al set de trabajo
   antes de elegir la siguiente, y al final se hace una pasada de mejora local
   (swap) para no quedar atado a una trampa del algoritmo voraz. */
function calculateSet(){
  const min=parseFloat($("rangeMin").value),max=parseFloat($("rangeMax").value);
  const opts={minSep:parseFloat($("minSeparation").value),imThreshold:parseFloat($("imThreshold").value),strict:$("strict").checked};
  const n=Math.max(1,Math.min(24,parseInt($("setCount").value)||4));
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min){$("setResults").innerHTML="<p class='bad-text'>Rango inválido.</p>";return}
  const d=state.devices[$("deviceSelect").value];
  if(d.candidateModel!=="channels"&&d.candidateModel!=="continuous"){
    $("setResults").innerHTML="<p class='bad-text'>Este perfil todavía no tiene un modelo de candidatos configurado.</p>";
    return;
  }
  const basePool=generateCandidates(d,min,max).filter(c=>!state.occupied.some(f=>Math.abs(f.freq-c.freq)<1e-6));
  if(basePool.length<n){$("setResults").innerHTML="<p class='bad-text'>No hay suficientes candidatos en el rango para armar un conjunto de ese tamaño.</p>";return}

  const asOccupied=f=>({freq:f,powerMw:null,digital:false,source:"set"});
  function scorePool(pool,working){
    const allIm=intermods(working,5);
    return pool.map(c=>scoreCandidate(c,working,min,max,opts,allIm,d));
  }

  // Paso 1: selección voraz secuencial (cada pick se suma al set antes del siguiente)
  let pool=[...basePool], working=[...state.occupied], picks=[];
  for(let k=0;k<n;k++){
    const best=scorePool(pool,working).sort((a,b)=>b.score-a.score)[0];
    picks.push(best.cand);
    working=[...working,asOccupied(best.cand.freq)];
    pool=pool.filter(c=>c.freq!==best.cand.freq);
  }

  // Paso 2: una pasada de mejora local — para cada pick, ¿hay una alternativa
  // claramente mejor evaluada contra el resto del conjunto ya elegido?
  for(let k=0;k<picks.length;k++){
    const rest=working.filter(o=>o.freq!==picks[k].freq);
    const scored=scorePool([...pool,picks[k]],rest).sort((a,b)=>b.score-a.score);
    const best=scored[0];
    const current=scored.find(s=>s.cand.freq===picks[k].freq);
    if(best.cand.freq!==picks[k].freq&&current&&best.score>current.score+2){
      pool=pool.filter(c=>c.freq!==best.cand.freq).concat([picks[k]]);
      picks[k]=best.cand;
      working=[...rest,asOccupied(best.cand.freq)];
    }
  }

  const finalWorking=[...state.occupied,...picks.map(p=>asOccupied(p.freq))];
  const finalScored=picks.map(p=>{
    const others=finalWorking.filter(o=>o.freq!==p.freq);
    return scoreCandidate(p,others,min,max,opts,intermods(others,5),d);
  });
  const worst=Math.min(...finalScored.map(r=>r.score));
  const mutualSeps=picks.flatMap((p,i)=>picks.filter((_,j)=>j!==i).map(q=>Math.abs(p.freq-q.freq)));
  const minMutual=mutualSeps.length?Math.min(...mutualSeps):null;

  $("setResults").innerHTML=`
    <p class="meta">Conjunto de ${picks.length} frecuencia(s)${minMutual!==null?` · separación mínima interna ${fmt(minMutual)} MHz`:""} · peor score individual ${Math.round(worst)}/100</p>
    ${finalScored.map(r=>`
    <div class="result ${r.cls}">
      <div class="result-top"><div><span class="freq">${fmt(r.cand.freq)} MHz</span><div class="meta">${r.cand.label}</div></div><div class="score">${Math.round(r.score)}/100<br><small>${r.label}</small></div></div>
      <div class="bar"><span style="width:${r.score}%"></span></div>
    </div>`).join("")}`;
}

init();
