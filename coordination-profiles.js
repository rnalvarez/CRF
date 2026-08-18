/* Coordination profiles: turn CRF from a purely mathematical screen into a
   field-oriented solution finder. The existing engine remains the scoring core;
   profiles change which IM products reach it and how much channel guard is used. */
(function(){
  const PROFILE_DEFS={
    robust:{label:"Robust (Seguro)",description:"Lógica conservadora actual: órdenes 2–5, incluidos IM3/IM5, con el margen de guarda completo.",maxOrder:5,filterProduct:null,guardFactor:1},
    standard:{label:"Standard (Rodaje)",description:"Perfil por defecto: solo IM3. Reduce el margen de guarda de canales un 30%.",maxOrder:3,filterProduct:p=>p.order===3,guardFactor:0.70},
    dense:{label:"More Frequencies (Alta Densidad)",description:"Solo IM3 de 2 TX (2A−B). Ignora IM5 e IM3 complejos de 3 TX. Guarda mínima basada en el ancho de banda del receptor.",maxOrder:3,filterProduct:p=>p.order===3 && countContributors(p.coeffs||p.contributors)<=2,guardFactor:null}
  };
  function countContributors(value){if(!Array.isArray(value))return 0;return value.filter(x=>typeof x==="number"?x!==0:x&&x.coef!==0).length;}
  window.CRF_COORDINATION_PROFILES=PROFILE_DEFS;
  window.CRF_COORDINATION_STATE={profile:"standard",baseMinSeparation:null,applying:false};
  function profile(){return PROFILE_DEFS[window.CRF_COORDINATION_STATE.profile]||PROFILE_DEFS.standard;}
  let deviceData=null;
  const deviceDataReady=fetch("data/devices.json").then(r=>r.ok?r.json():{}).then(data=>{deviceData=data;return data;}).catch(()=>({}));
  function currentDevice(){const select=document.getElementById("deviceSelect");return deviceData&&select?deviceData[select.value]:null;}
  function effectiveGuard(){
    const input=document.getElementById("minSeparation"),base=window.CRF_COORDINATION_STATE.baseMinSeparation,p=profile();
    if(!Number.isFinite(base))return Number.parseFloat(input?.value)||0;
    if(p.guardFactor!==null)return base*p.guardFactor;
    const d=currentDevice();
    if(Number.isFinite(d?.bandwidth)&&d.bandwidth>0)return d.bandwidth;
    if(Number.isFinite(d?.channelSpacing)&&d.channelSpacing>0)return d.channelSpacing;
    return base*0.5;
  }
  function applyGuard(){const input=document.getElementById("minSeparation");if(!input)return;window.CRF_COORDINATION_STATE.applying=true;input.value=effectiveGuard().toFixed(3);window.CRF_COORDINATION_STATE.applying=false;}
  function filterProducts(products){const p=profile();return p.filterProduct?products.filter(p.filterProduct):products;}
  function filterDangerZones(zones){
    const p=profile();if(!p.filterProduct)return zones;
    return zones.filter(z=>{if(z.order!==3)return false;if(window.CRF_COORDINATION_STATE.profile!=="dense")return true;return Array.isArray(z.contributors)&&z.contributors.length===1;});
  }
  const originalIntermods=window.intermods;
  const originalDangerZones=window.precomputeDangerZones;
  window.intermods=function(occupied,maxOrder,relevantRange){const p=profile();return filterProducts(originalIntermods(occupied,Math.min(maxOrder||p.maxOrder,p.maxOrder),relevantRange));};
  window.precomputeDangerZones=function(occupied,maxOrder,relevantRange){const p=profile();return filterDangerZones(originalDangerZones(occupied,Math.min(maxOrder||p.maxOrder,p.maxOrder),relevantRange));};
  function updateProfileDescription(){const el=document.getElementById("coordinationProfileDescription"),badge=document.getElementById("coordinationProfileBadge"),p=profile();if(el)el.textContent=p.description;if(badge)badge.textContent=p.label;}
  function recalculate(){applyGuard();if(typeof window.calculate==="function")window.calculate();}

  /* UX: collapse the long mathematical IM details inside candidate cards. */
  function collapseCandidateDetails(){
    const results=document.getElementById("results");if(!results)return;
    results.querySelectorAll(".result").forEach(card=>{
      if(card.querySelector(":scope > details.im-details"))return;
      const table=card.querySelector(":scope > .im-table");
      const reasonNodes=[...card.children].filter(el=>el.classList.contains("meta"));
      const items=[];if(table)items.push(table);reasonNodes.forEach(el=>items.push(el));
      const details=document.createElement("details");details.className="im-details";
      const summary=document.createElement("summary");
      summary.textContent=table?`📊 Ver detalle de cálculos (${table.querySelectorAll("tbody tr").length} advertencias)`:"✅ Ver cálculos (Limpio)";
      details.appendChild(summary);
      const content=document.createElement("div");content.className="im-details-content";items.forEach(el=>content.appendChild(el));details.appendChild(content);
      card.appendChild(details);
    });
  }
  function installAccordionWrapper(){
    if(typeof window.calculate!=="function"||window.__crfAccordionWrapped)return;
    const originalCalculate=window.calculate;
    window.calculate=function(){const result=originalCalculate.apply(this,arguments);requestAnimationFrame(collapseCandidateDetails);return result;};
    window.__crfAccordionWrapped=true;
    const button=document.getElementById("calculate");if(button)button.onclick=window.calculate;
  }

  async function bind(){
    const select=document.getElementById("coordinationProfile"),minInput=document.getElementById("minSeparation");
    if(!select||!minInput)return;
    window.CRF_COORDINATION_STATE.baseMinSeparation=Number.parseFloat(minInput.value)||0.8;
    select.value=window.CRF_COORDINATION_STATE.profile;
    select.addEventListener("change",function(){window.CRF_COORDINATION_STATE.profile=select.value;updateProfileDescription();recalculate();});
    minInput.addEventListener("input",function(){if(!window.CRF_COORDINATION_STATE.applying){const v=Number.parseFloat(minInput.value);if(Number.isFinite(v)&&v>0)window.CRF_COORDINATION_STATE.baseMinSeparation=v;}});
    const deviceSelect=document.getElementById("deviceSelect");
    if(deviceSelect)deviceSelect.addEventListener("change",async function(){await deviceDataReady;if(window.CRF_COORDINATION_STATE.profile==="dense")recalculate();});
    const originalCalculate=window.calculate;
    if(typeof originalCalculate==="function"){
      window.calculate=function(){applyGuard();const result=originalCalculate.apply(this,arguments);requestAnimationFrame(collapseCandidateDetails);return result;};
      window.__crfAccordionWrapped=true;
      document.getElementById("calculate").onclick=window.calculate;
    }
    await deviceDataReady;applyGuard();updateProfileDescription();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{bind();},{once:true});else setTimeout(()=>{bind();},0);
})();
