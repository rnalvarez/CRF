/* Coordination profiles: turn CRF from a purely mathematical screen into a
   field-oriented solution finder. The existing engine remains the scoring core;
   profiles change which IM products reach it and how much channel guard is used. */
(function(){
  const PROFILE_DEFS={
    robust:{
      label:"Robust (Seguro)",
      description:"Lógica conservadora actual: órdenes 2–5, incluidos IM3/IM5, con el margen de guarda completo.",
      maxOrder:5,
      filterProduct:null,
      guardFactor:1
    },
    standard:{
      label:"Standard (Rodaje)",
      description:"Perfil por defecto: solo IM3. Reduce el margen de guarda de canales un 30%.",
      maxOrder:3,
      filterProduct:p=>p.order===3,
      guardFactor:0.70
    },
    dense:{
      label:"More Frequencies (Alta Densidad)",
      description:"Solo IM3 de 2 TX (2A−B). Ignora IM5 e IM3 complejos de 3 TX. Guarda mínima basada en el ancho de banda del receptor.",
      maxOrder:3,
      filterProduct:p=>p.order===3 && countContributors(p.coeffs||p.contributors)<=2,
      guardFactor:null
    }
  };

  function countContributors(value){
    if(!Array.isArray(value))return 0;
    return value.filter(x=>{
      if(typeof x==='number')return x!==0;
      return x && x.coef!==0;
    }).length;
  }

  window.CRF_COORDINATION_PROFILES=PROFILE_DEFS;
  window.CRF_COORDINATION_STATE={profile:'standard',baseMinSeparation:null,applying:false};

  function profile(){
    return PROFILE_DEFS[window.CRF_COORDINATION_STATE.profile]||PROFILE_DEFS.standard;
  }

  let deviceData=null;
  const deviceDataReady=fetch('data/devices.json')
    .then(r=>r.ok?r.json():{})
    .then(data=>{deviceData=data;return data;})
    .catch(()=>({}));

  function currentDevice(){
    const select=document.getElementById('deviceSelect');
    return deviceData&&select?deviceData[select.value]:null;
  }

  function effectiveGuard(){
    const input=document.getElementById('minSeparation');
    const base=window.CRF_COORDINATION_STATE.baseMinSeparation;
    const p=profile();
    if(!Number.isFinite(base))return Number.parseFloat(input?.value)||0;
    if(p.guardFactor!==null)return base*p.guardFactor;

    const d=currentDevice();
    // For high-density coordination the receiver RF bandwidth is the physical
    // minimum. If the profile has no published bandwidth, use channel spacing;
    // if neither is published, retain a conservative fallback.
    if(Number.isFinite(d?.bandwidth)&&d.bandwidth>0)return d.bandwidth;
    if(Number.isFinite(d?.channelSpacing)&&d.channelSpacing>0)return d.channelSpacing;
    return base*0.5;
  }

  function applyGuard(){
    const input=document.getElementById('minSeparation');
    if(!input)return;
    window.CRF_COORDINATION_STATE.applying=true;
    input.value=effectiveGuard().toFixed(3);
    window.CRF_COORDINATION_STATE.applying=false;
  }

  function filterProducts(products){
    const p=profile();
    if(!p.filterProduct)return products;
    return products.filter(p.filterProduct);
  }

  function filterDangerZones(zones){
    const p=profile();
    if(!p.filterProduct)return zones;
    return zones.filter(z=>{
      if(z.order!==3)return false;
      if(window.CRF_COORDINATION_STATE.profile!=='dense')return true;
      // z.contributors contains the already-occupied transmitters. The candidate
      // itself is the second transmitter, so one occupied contributor = 2TX IM3.
      return Array.isArray(z.contributors)&&z.contributors.length===1;
    });
  }

  // Keep references to the mathematical generators and put the profile between
  // them and scoreCandidate(). This means the existing engine does not need a
  // second scoring implementation and every caller gets the same profile rules.
  const originalIntermods=window.intermods;
  const originalDangerZones=window.precomputeDangerZones;

  window.intermods=function(occupied,maxOrder,relevantRange){
    const p=profile();
    const products=originalIntermods(occupied,Math.min(maxOrder||p.maxOrder,p.maxOrder),relevantRange);
    return filterProducts(products);
  };

  window.precomputeDangerZones=function(occupied,maxOrder,relevantRange){
    const p=profile();
    const zones=originalDangerZones(occupied,Math.min(maxOrder||p.maxOrder,p.maxOrder),relevantRange);
    return filterDangerZones(zones);
  };

  function updateProfileDescription(){
    const el=document.getElementById('coordinationProfileDescription');
    const badge=document.getElementById('coordinationProfileBadge');
    const p=profile();
    if(el)el.textContent=p.description;
    if(badge)badge.textContent=p.label;
  }

  function recalculate(){
    applyGuard();
    if(typeof window.calculate==='function')window.calculate();
  }

  async function bind(){
    const select=document.getElementById('coordinationProfile');
    const minInput=document.getElementById('minSeparation');
    if(!select||!minInput)return;

    window.CRF_COORDINATION_STATE.baseMinSeparation=Number.parseFloat(minInput.value)||0.8;
    select.value=window.CRF_COORDINATION_STATE.profile;

    select.addEventListener('change',function(){
      window.CRF_COORDINATION_STATE.profile=select.value;
      updateProfileDescription();
      recalculate();
    });

    minInput.addEventListener('input',function(){
      if(!window.CRF_COORDINATION_STATE.applying){
        const v=Number.parseFloat(minInput.value);
        if(Number.isFinite(v)&&v>0)window.CRF_COORDINATION_STATE.baseMinSeparation=v;
      }
    });

    const deviceSelect=document.getElementById('deviceSelect');
    if(deviceSelect)deviceSelect.addEventListener('change',async function(){
      await deviceDataReady;
      if(window.CRF_COORDINATION_STATE.profile==='dense')recalculate();
    });

    const originalCalculate=window.calculate;
    if(typeof originalCalculate==='function'){
      window.calculate=function(){
        applyGuard();
        return originalCalculate.apply(this,arguments);
      };
      document.getElementById('calculate').onclick=window.calculate;
    }

    await deviceDataReady;
    applyGuard();
    updateProfileDescription();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();},{once:true});
  else setTimeout(()=>{bind();},0);
})();
