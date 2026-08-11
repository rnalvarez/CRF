const state={devices:{},occupied:[]};

const $=id=>document.getElementById(id);
const fmt=f=>Number(f).toFixed(3);

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
  $("loadExample").onclick=()=>{state.occupied=[566.200,574.200,559.990,584.180];renderOccupied();calculate()};
  $("calculate").onclick=calculate;
}
function addOccupied(){
  const v=parseFloat($("occupiedFreq").value);
  if(!Number.isFinite(v))return;
  if(!state.occupied.some(x=>Math.abs(x-v)<0.0001))state.occupied.push(v);
  state.occupied.sort((a,b)=>a-b); $("occupiedFreq").value=""; renderOccupied(); calculate();
}
function renderOccupied(){
  $("occupiedList").innerHTML=state.occupied.map((f,i)=>`<span class="chip">${fmt(f)} MHz <button title="Eliminar" onclick="removeFreq(${i})">×</button></span>`).join("");
  $("status").textContent=state.occupied.length?`${state.occupied.length} frecuencia(s) ocupada(s).`:"Agregá al menos una frecuencia ocupada.";
}
function removeFreq(i){state.occupied.splice(i,1);renderOccupied();calculate()}

function renderDeviceInfo(){
  const d=state.devices[$("deviceSelect").value];
  let html=`<strong>${d.name}</strong><br><span>${d.kind}</span><br>`;
  if(d.candidateModel==="channels"){
    html+=d.banks.map(b=>`Banco ${b.name}: ${fmt(b.start)}–${fmt(b.start+b.step*(b.channels-1))} MHz · ${b.channels} canales · paso ${fmt(b.step)} MHz`).join("<br>");
  }else if(d.candidateModel==="continuous"){
    html+=`Capacidad declarada: ${fmt(d.min)}–${fmt(d.max)} MHz · paso ${fmt(d.step)} MHz`;
    if(d.bandwidth)html+=` · ancho RF ${fmt(d.bandwidth)} MHz · spacing ${fmt(d.channelSpacing)} MHz`;
    if(d.powerOptionsMw?.length)html+=`<br>Potencias: ${d.powerOptionsMw.join(" / ")} mW`;
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
   not a full RF front-end simulation. */
function intermods(freqs,maxOrder=5){
  const products=[];
  const uniq=new Set();
  const n=freqs.length;
  // For each number of participating carrier terms, enumerate coefficients
  // in [-order,order], requiring sum(abs(coeffs)) <= order and at least 2 terms.
  for(let order=2;order<=maxOrder;order++){
    function rec(i,coeffs,sumAbs){
      if(i===n){
        if(sumAbs<2||sumAbs>order)return;
        const nonzero=coeffs.filter(c=>c!==0).length;
        if(nonzero<2)return;
        let value=0; for(let j=0;j<n;j++)value+=coeffs[j]*freqs[j];
        if(value<=0||value>2000)return;
        const key=value.toFixed(6)+":"+order;
        if(!uniq.has(key)){uniq.add(key);products.push({freq:value,order,coeffs:[...coeffs]});}
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

function powerPenalty(){
  // V1 hook: power is stored per profile but not yet used as a physical
  // propagation/IP3 model. Kept for future weighting.
  return 0;
}

function scoreCandidate(cand,occupied,rangeMin,rangeMax,opts,allIm){
  const pairDistances=occupied.map(f=>Math.abs(cand.freq-f));
  const minSep=Math.min(...pairDistances);
  let score=100;
  let reasons=[];
  if(minSep<opts.minSep){
    score-=45*(1-minSep/opts.minSep);
    reasons.push(`separación mínima ${fmt(minSep)} MHz`);
  }else score+=Math.min(10,minSep);
  let nearestIM=Infinity, nearestIMOrder=null;
  for(const p of allIm){
    const d=Math.abs(cand.freq-p.freq);
    if(d<nearestIM){nearestIM=d;nearestIMOrder=p.order}
    if(d<opts.imThreshold){
      const severity=(opts.imThreshold-d)/opts.imThreshold;
      const orderWeight=p.order===3?1.6:p.order===2?1.2:(p.order===4?0.8:0.5);
      score-=35*severity*orderWeight*(opts.strict?1.6:1);
    }
  }
  if(nearestIM<opts.imThreshold)reasons.push(`IM${nearestIMOrder} a ${fmt(nearestIM)} MHz`);
  const edge=Math.min(cand.freq-rangeMin,rangeMax-cand.freq);
  if(edge<0.5)score-=5;
  score+=powerPenalty();
  score=Math.max(0,Math.min(100,score));
  let cls=score>=75?"good":score>=50?"warn":"bad";
  let label=score>=75?"RECOMENDADA":score>=50?"CONDICIONAL":"EVITAR";
  return {cand,score,cls,label,minSep,nearestIM,nearestIMOrder,reasons};
}

function calculate(){
  const min=parseFloat($("rangeMin").value),max=parseFloat($("rangeMax").value);
  const opts={minSep:parseFloat($("minSeparation").value),imThreshold:parseFloat($("imThreshold").value),strict:$("strict").checked};
  if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min){$("results").innerHTML="<p class='bad-text'>Rango inválido.</p>";return}
  if(!state.occupied.length){$("results").innerHTML="<p class='hint'>Cargá al menos una frecuencia ocupada para generar recomendaciones.</p>";return}
  const d=state.devices[$("deviceSelect").value];
  let candidates=generateCandidates(d,min,max).filter(c=>!state.occupied.some(f=>Math.abs(f-c.freq)<1e-6));
  const allIm=intermods(state.occupied,5);
  const results=candidates.map(c=>scoreCandidate(c,state.occupied,min,max,opts,allIm)).sort((a,b)=>b.score-a.score).slice(0,parseInt($("resultCount").value)||20);
  $("results").innerHTML=results.length?results.map((r,i)=>`
    <div class="result ${r.cls}">
      <div class="result-top"><div><span class="freq">${fmt(r.cand.freq)} MHz</span><div class="meta">${r.cand.label}</div></div><div class="score">${Math.round(r.score)}/100<br><small>${r.label}</small></div></div>
      <div class="bar"><span style="width:${r.score}%"></span></div>
      <div class="small-grid">
        <div class="metric"><b>${fmt(r.minSep)} MHz</b>Separación mínima</div>
        <div class="metric"><b>${r.nearestIM===Infinity?"—":fmt(r.nearestIM)+" MHz"}</b>IM más cercano</div>
        <div class="metric"><b>${r.nearestIMOrder?`IM${r.nearestIMOrder}`:"—"}</b>Orden</div>
      </div>
      ${r.reasons.length?`<div class="meta">${r.reasons.join(" · ")}</div>`:"<div class='meta'>Sin conflicto matemático relevante detectado por el modelo V1.</div>"}
    </div>`).join(""):"<p class='bad-text'>No hay candidatos dentro del rango y las capacidades del dispositivo.</p>";
}
init();
