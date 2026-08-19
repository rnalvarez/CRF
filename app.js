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
function getRangeMargin(){
  const v=parseFloat($("rangeMargin")?.value);
  return Number.isFinite(v)&&v>=0?v:2;
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
  const criticalFloor=Number.isFinite(opts.criticalFloor)?opts.criticalFloor:0.010;
  const hits=[];
  for(const p of allIm){
    for(let i=0;i<occupied.length;i++){
      if(p.coeffs[i]!==0)continue; // esta ocupada ya es generadora de este producto, no es una víctima distinta
      const o=occupied[i];
      const dist=Math.abs(p.freq-o.freq);
      if(dist<=threshold){
        const {tier,riskScore}=classifyConflict(dist,p.order,threshold,opts.strict,criticalFloor);
        if(tier==="recomendado")continue;
        const digitalDiscount=p.allDigital?0.5:1;
        const risk=riskScore*digitalDiscount*p.powerWeight;
        const generators=p.coeffs.map((c,j)=>c!==0?{freq:occupied[j].freq,coef:c}:null).filter(Boolean);
        hits.push({victim:o,order:p.order,dist,risk,tier,generators});
      }
    }
  }
  hits.sort((a,b)=>TIER_RANK[b.tier]-TIER_RANK[a.tier]||b.risk-a.risk);
  return hits;
}

function renderSelfConflicts(){
  const box=$("selfConflicts");
  if(!box)return;
  if(state.occupied.length<2){box.innerHTML="";return}
  const opts={imThreshold:parseFloat($("imThreshold").value)||0.5,strict:$("strict").checked,criticalFloor:parseFloat($("criticalFloor")?.value)||0.010};
  const device=state.devices[$("deviceSelect").value];
  const hits=analyzeSelfConflicts(state.occupied,opts,device);
  if(!hits.length){
    box.innerHTML=`<p class="conflict-ok">✓ Sin conflictos de IM detectados entre las frecuencias ocupadas (orden 2–5, dentro de ${fmt(opts.imThreshold)} MHz).</p>`;
    return;
  }
  box.innerHTML=`<p class="conflict-warn-title">⚠ ${hits.length} conflicto(s) de IM dentro del propio set de ocupadas:</p>` +
    hits.map(h=>{
      const gens=h.generators.map(g=>`${g.coef>0?"+":""}${g.coef}×${fmt(g.freq)}`).join(" ");
      return `<div class="conflict-item"><b>${TIER_LABEL[h.tier]}</b> · <b>${fmt(h.victim.freq)} MHz</b> tiene un fantasma IM${h.order} a ${fmt(h.dist)} MHz, generado por ${gens} MHz.</div>`;
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
function intermods(occupied,maxOrder=5,relevantRange){
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
          const inRange=!relevantRange||(value>=relevantRange.min&&value<=relevantRange.max);
          products.push({freq:value,order,coeffs:[...coeffs],allDigital,powerWeight:geoMeanPow,inRange});
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

/* Un candidato puede no caer cerca de ningún fantasma de los YA ocupados, y aun así,
   una vez agregado, combinarse con 2+ de esas ocupadas para generar un fantasma NUEVO
   que caiga sobre OTRA ocupada distinta (el caso "561.220 se agrega limpio, pero crea
   un IM5 sobre 574.200/584.180" reportado en el chat). scoreCandidate() no lo veía
   porque allIm se calcula ANTES de agregar el candidato.
   Precomputar esto una vez por corrida (no una vez por candidato) evita reintroducir
   el mismo problema de performance que se corrigió al mover intermods() fuera del loop
   de candidatos: para cada ocupada-víctima, se enumeran combinaciones de coeficientes
   sobre las OTRAS ocupadas dejando lugar para un coeficiente futuro del candidato, y de
   ahí se despeja qué frecuencia de candidato completaría ese fantasma exacto. El resultado
   es una lista chica de "zonas peligrosas" (centro + orden) contra la que cada candidato
   se compara con una resta, no con un intermods() entero. */
function precomputeDangerZones(occupied,maxOrder=5,relevantRange){
  const zones=[];
  for(let vi=0;vi<occupied.length;vi++){
    const victim=occupied[vi];
    const others=occupied.filter((_,i)=>i!==vi);
    const m=others.length;
    function rec(i,coeffs,sumAbs){
      if(i===m){
        if(sumAbs===0)return; // sin al menos 1 ocupada "otra" participando, es solo la armónica propia del candidato, no intermodulación
        const partial=others.reduce((s,o,j)=>s+coeffs[j]*o.freq,0);
        const contributors=coeffs.map((c,j)=>c!==0?{freq:others[j].freq,coef:c}:null).filter(Boolean);
        for(let mc=-maxOrder;mc<=maxOrder;mc++){
          if(mc===0)continue;
          const totalOrder=sumAbs+Math.abs(mc);
          if(totalOrder<2||totalOrder>maxOrder)continue;
          const center=(victim.freq-partial)/mc;
          if(!Number.isFinite(center)||center<=0)continue;
          const inRange=!relevantRange||(center>=relevantRange.min&&center<=relevantRange.max);
          zones.push({center,mcAbs:Math.abs(mc),order:totalOrder,victimFreq:victim.freq,contributors,inRange});
        }
        return;
      }
      for(let c=-maxOrder;c<=maxOrder;c++){
        const s=sumAbs+Math.abs(c);
        if(s<maxOrder)rec(i+1,coeffs.concat(c),s);
      }
    }
    rec(0,[],0);
  }
  zones.sort((a,b)=>a.center-b.center); // ordenado para poder acotar la búsqueda por candidato con binary search
  return zones;
}

function lowerBound(sortedZones,target){
  let lo=0,hi=sortedZones.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(sortedZones[mid].center<target)lo=mid+1;else hi=mid;
  }
  return lo;
}

const TIER_RANK={recomendado:0,fuera_de_rango:1,revisar:2,advertencia:3,critico:4};
const TIER_LABEL={recomendado:"🟢 RECOMENDADO",fuera_de_rango:"ℹ️ FUERA DE RANGO",revisar:"🟡 REVISAR",advertencia:"🟠 ALTO / NO RECOMENDADO",critico:"🔴 CRÍTICO"};
const ORDER_WEIGHT={2:1.2,3:1.6,4:0.8,5:0.5}; // IM3 prioridad muy alta, IM2 alta, IM4 menor que IM3, IM5 solo pesa fuerte si está muy cerca
const OUT_OF_RANGE_WEIGHT=0.15; // aporte mínimo al score de un producto fuera de rango — nunca determina el tier

/* Clasificación de un producto IM en 4 niveles de riesgo + 1 informativo, no un simple sí/no.

   inRange se decide PRIMERO y separa dos ramas completamente distintas — no es un descuento
   aplicado después sobre un tier ya calculado:

   - Fuera del rango operativo relevante: el producto existe matemáticamente y se sigue
     mostrando (nunca se descarta del análisis), pero el resultado es SIEMPRE "fuera_de_rango"
     (informativo), sin importar orden ni distancia. Puede aportar un poco al score
     (OUT_OF_RANGE_WEIGHT), pero nunca decide el peor tier del candidato: fuera_de_rango
     rankea apenas por encima de "recomendado" y por debajo de "revisar" (TIER_RANK), así que
     cualquier hit real dentro de rango siempre gana la comparación de "peor tier".

   - Dentro del rango: clasificación normal por severidad y orden, sin cambios respecto de
     antes. El piso crítico (distancia absoluta bajo la cual algo es crítico sin importar el
     resto) se escala al cuadrado del peso relativo del orden — un IM3 casi exacto es crítico
     incluso a la distancia "base" del piso, un IM5 necesita estar mucho más cerca — porque con
     5-6+ transmisores el volumen de productos IM4/IM5 (cientos a miles) hacía que un piso parejo
     marcara crítico por pura densidad combinatoria, no por gravedad real de ese punto puntual. */
function classifyConflict(distanceMHz,order,effImThreshold,strict,criticalFloorMHz,inRange){
  if(distanceMHz>=effImThreshold)return {tier:"recomendado",riskScore:0};
  const orderWeight=ORDER_WEIGHT[order]||0.5;
  const severity=(effImThreshold-distanceMHz)/effImThreshold;

  if(inRange===false){
    // Rama aparte a propósito: nunca puede devolver crítico/advertencia/revisar, sin importar
    // qué tan cerca o de qué orden sea. Es "información técnica", no un nivel de riesgo real.
    const riskScore=severity*orderWeight*(strict?1.6:1)*OUT_OF_RANGE_WEIGHT;
    return {tier:"fuera_de_rango",riskScore};
  }

  const riskScore=severity*orderWeight*(strict?1.6:1);
  const scaledFloor=criticalFloorMHz*Math.pow(orderWeight/ORDER_WEIGHT[3],2);
  if(distanceMHz<=scaledFloor||riskScore>=1.0)return {tier:"critico",riskScore};
  if(riskScore>=0.35)return {tier:"advertencia",riskScore};
  return {tier:"revisar",riskScore};
}

function scoreCandidate(cand,occupied,rangeMin,rangeMax,opts,allIm,device,dangerZones){
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

  const criticalFloor=Number.isFinite(opts.criticalFloor)?opts.criticalFloor:0.010;
  const hits=[]; // {victim, order, product, dist, source:'existente'|'nuevo', tier, riskScore}

  let nearestIM=Infinity, nearestIMOrder=null;
  for(const p of allIm){
    const dist=Math.abs(cand.freq-p.freq);
    if(dist<nearestIM){nearestIM=dist;nearestIMOrder=p.order}
    if(dist<effImThreshold){
      const {tier,riskScore}=classifyConflict(dist,p.order,effImThreshold,opts.strict,criticalFloor,p.inRange);
      if(tier==="recomendado")continue;
      const digitalDiscount=p.allDigital?0.5:1;
      const weighted=riskScore*digitalDiscount*p.powerWeight;
      hits.push({victim:cand.freq,order:p.order,product:p.freq,dist,source:"existente",tier,riskScore:weighted,inRange:p.inRange!==false});
    }
  }
  if(nearestIM<effImThreshold)reasons.push(`IM${nearestIMOrder} a ${fmt(nearestIM)} MHz`);

  // ¿Agregar ESTE candidato formaría un fantasma IM nuevo sobre OTRA ocupada?
  // (allIm de arriba solo mira los fantasmas que YA existen antes de agregarlo)
  let worstZone=null, worstZoneDist=Infinity;
  if(dangerZones&&dangerZones.length){
    // mcAbs>=1 siempre, así que ningún threshold de zona puede superar effImThreshold (mcAbs=1 es el caso más ancho):
    // acotamos la búsqueda a esa ventana con binary search en vez de recorrer las decenas de miles de zonas posibles.
    const lo=lowerBound(dangerZones,cand.freq-effImThreshold);
    for(let zi=lo;zi<dangerZones.length;zi++){
      const z=dangerZones[zi];
      if(z.center>cand.freq+effImThreshold)break; // zones está ordenado por center: ya no hay más candidatas posibles
      const zoneThreshold=effImThreshold/z.mcAbs;
      const dist=Math.abs(cand.freq-z.center); // distancia en espacio candidato (para el binary search y el bar de arriba)
      const productDist=dist*z.mcAbs; // distancia REAL del producto IM a la víctima, en MHz — la que hay que clasificar
      if(dist<zoneThreshold){
        // severidad: matemáticamente (zoneThreshold-dist)/zoneThreshold === (effImThreshold-productDist)/effImThreshold,
        // así que se puede pasar cualquiera de los dos pares consistentes; el piso crítico en cambio SÍ necesita
        // la distancia real del producto (no la del candidato sin escalar), o con mcAbs>=2 se subestima a la mitad o menos.
        const {tier,riskScore}=classifyConflict(productDist,z.order,effImThreshold,opts.strict,criticalFloor,z.inRange);
        if(tier==="recomendado")continue;
        if(dist<worstZoneDist){worstZoneDist=dist;worstZone=z}
        hits.push({victim:z.victimFreq,order:z.order,product:cand.freq /* aprox: el candidato ES uno de los generadores */,dist:productDist,source:"nuevo",tier,riskScore,inRange:z.inRange!==false});
      }
    }
  }
  if(worstZone)reasons.push(`si se agrega, IM${worstZone.order} nuevo sobre ${fmt(worstZone.victimFreq)} MHz`);

  // Score dominado por el PEOR hit, no por la suma de todos — la cantidad de productos
  // no debe ser el criterio principal (un candidato con muchos IM5 lejanos puede ser mejor
  // que uno con un único IM5 muy cerca). Cada hit adicional más allá del peor suma un empujón
  // chico y acotado, no proporcional a cuántos haya.
  const relevantHitsForScore=hits.filter(h=>h.tier!=="recomendado");
  const worstRisk=relevantHitsForScore.length?Math.max(...relevantHitsForScore.map(h=>h.riskScore)):0;
  score-=40*worstRisk+3*Math.min(Math.max(relevantHitsForScore.length-1,0),5);

  // Nivel general del candidato: el peor tier entre todos los hits relevantes.
  let overallTier="recomendado";
  for(const h of hits)if(TIER_RANK[h.tier]>TIER_RANK[overallTier])overallTier=h.tier;
  const orderCounts={2:0,3:0,4:0,5:0};
  hits.forEach(h=>{if(h.tier!=="recomendado"&&orderCounts[h.order]!==undefined)orderCounts[h.order]++});

  // La separación mínima es un problema aparte de la clasificación IM, pero si es grave
  // también debe empujar el nivel general — no tiene sentido "RECOMENDADO" pegado al vecino.
  const sepTier=worstRatio>=0.6?"critico":worstRatio>=0.2?"advertencia":worstRatio>0?"revisar":"recomendado";
  if(TIER_RANK[sepTier]>TIER_RANK[overallTier])overallTier=sepTier;

  const edge=Math.min(cand.freq-rangeMin,rangeMax-cand.freq);
  if(edge<0.5)score-=5;
  score=Math.max(0,Math.min(100,score));
  // cls/label quedan por compatibilidad con el HTML existente, pero ahora se derivan del
  // tier (la clasificación de 4 niveles), no directamente de rangos del score numérico.
  const tierToClsLabel={
    recomendado:{cls:"good",label:"RECOMENDADA"},
    fuera_de_rango:{cls:"info",label:"FUERA DE RANGO"},
    revisar:{cls:"warn",label:"REVISAR"},
    advertencia:{cls:"warn",label:"ADVERTENCIA"},
    critico:{cls:"bad",label:"CRÍTICO"}
  };
  const {cls,label}=tierToClsLabel[overallTier];
  return {cand,score,cls,label,tier:overallTier,tierLabel:TIER_LABEL[overallTier],hits,orderCounts,minSep:worstSep,nearestIM,nearestIMOrder,reasons};
}

function calculate(){
  const min=parseFloat($("rangeMin").value),max=parseFloat($("rangeMax").value);
  const opts={minSep:parseFloat($("minSeparation").value),imThreshold:parseFloat($("imThreshold").value),strict:$("strict").checked,criticalFloor:parseFloat($("criticalFloor")?.value)||0.010};
  renderSelfConflicts();
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min){$("results").innerHTML="<p class='bad-text'>Rango inválido.</p>";return}
  if(!state.occupied.length){$("results").innerHTML="<p class='hint'>Cargá al menos una frecuencia ocupada para generar recomendaciones.</p>";return}
  const d=state.devices[$("deviceSelect").value];
  if(d.candidateModel!=="channels"&&d.candidateModel!=="continuous"){
    $("results").innerHTML="<p class='bad-text'>Este perfil todavía no tiene un modelo de candidatos configurado (ver nota arriba). Elegí otro dispositivo o cargá los datos del fabricante.</p>";
    return;
  }
  let candidates=generateCandidates(d,min,max).filter(c=>!state.occupied.some(f=>Math.abs(f.freq-c.freq)<1e-6));
  const relevantRange={min:min-getRangeMargin(),max:max+getRangeMargin()}; // rango de trabajo + margen: productos IM fuera de esto informan pero pesan poco
  const allIm=intermods(state.occupied,5,relevantRange);
  const dangerZones=precomputeDangerZones(state.occupied,5,relevantRange);
  const results=candidates.map(c=>scoreCandidate(c,state.occupied,min,max,opts,allIm,d,dangerZones))
    .sort((a,b)=>TIER_RANK[a.tier]-TIER_RANK[b.tier]||b.score-a.score)
    .slice(0,parseInt($("resultCount").value)||20);
  $("results").innerHTML=renderCandidateResults(results); // renderCandidateResults vive en render-accordion.js (se carga después de este script)
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
  const opts={minSep:parseFloat($("minSeparation").value),imThreshold:parseFloat($("imThreshold").value),strict:$("strict").checked,criticalFloor:parseFloat($("criticalFloor")?.value)||0.010};
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
  // maxOrder=4 acá (no 5): precomputeDangerZones explota combinatoriamente con el orden más alto
  // (~65% de las zonas a m=5 son solo de orden 5, que además es el de menor peso/prioridad) y este
  // loop se corre ~3n veces con un set que va creciendo — mantenerlo en 5 volvía "buscar conjunto"
  // notablemente lento en dispositivos de barrido continuo. calculate() (un candidato por vez) sí
  // usa 5 completo, porque ahí el costo es una sola vez por click, no ~15 veces.
  function scorePool(pool,working){
    const relevantRange={min:min-getRangeMargin(),max:max+getRangeMargin()};
    const allIm=intermods(working,5,relevantRange);
    const dangerZones=precomputeDangerZones(working,4,relevantRange);
    return pool.map(c=>scoreCandidate(c,working,min,max,opts,allIm,d,dangerZones));
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
    const relevantRange={min:min-getRangeMargin(),max:max+getRangeMargin()};
    return scoreCandidate(p,others,min,max,opts,intermods(others,5,relevantRange),d,precomputeDangerZones(others,4,relevantRange));
  });
  const worst=Math.min(...finalScored.map(r=>r.score));
  const mutualSeps=picks.flatMap((p,i)=>picks.filter((_,j)=>j!==i).map(q=>Math.abs(p.freq-q.freq)));
  const minMutual=mutualSeps.length?Math.min(...mutualSeps):null;

  $("setResults").innerHTML=`
    <p class="meta">Conjunto de ${picks.length} frecuencia(s)${minMutual!==null?` · separación mínima interna ${fmt(minMutual)} MHz`:""} · peor score individual ${Math.round(worst)}/100</p>
    ${finalScored.map(r=>`
    <div class="result ${r.cls}">
      <div class="result-top"><div><span class="freq">${fmt(r.cand.freq)} MHz</span><div class="meta">${r.cand.label}</div></div><div class="score">${r.tierLabel}<br><small>${Math.round(r.score)}/100</small></div></div>
      <div class="bar"><span style="width:${r.score}%"></span></div>
    </div>`).join("")}`;
}

init();
