/* CRF - workflow de produccion. Capa de proyecto sobre el motor RF existente. */
(function(){
  const STORE="crf.rfProject.v3";
  const LEGACY_STORE="crf.rfProject.v2";
  const OLD_STORE="crf.rfProject.v1";
  const q=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const fmt=f=>Number(f).toFixed(3);
  const near=(a,b)=>Math.abs(Number(a)-Number(b))<0.0001;
  const clone=x=>JSON.parse(JSON.stringify(x));
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const today=()=>new Date().toISOString().slice(0,10);
  const normalizeBackup=x=>{
    if(x===null||x===undefined||x==="")return null;
    const n=Number(x);
    return Number.isFinite(n)?n:null;
  };

  let W={version:2,project:{name:"Mi rodaje",production:"",date:today(),notes:""},selectedDeviceId:"",locations:[],activeLocationId:null};
  let backupTarget=null,editingId=null;
  let coreAddOccupied=null,coreAddCandidate=null,coreAddSet=null,coreRemoveFreq=null;

  const currentLocation=()=>W.locations.find(x=>x.id===W.activeLocationId)||W.locations[0];
  const currentDevice=()=>state.devices?.[q("deviceSelect")?.value]||null;
  const deviceName=id=>state.devices?.[id]?.name||id||"Dispositivo";
  const nextChannelLabel=()=>{
    const used=(currentLocation()?.channels||[]).map(x=>String(x.channel||""));
    let n=1;while(used.some(x=>x.toUpperCase()===("CH "+String(n).padStart(2,"0"))))n++;
    return "CH "+String(n).padStart(2,"0");
  };

  function freshLocation(name){
    return {id:uid(),name:name||("Locación "+(W.locations.length+1)),location:"",
      rangeMin:Number(q("rangeMin")?.value)||550,rangeMax:Number(q("rangeMax")?.value)||600,
      rangeMargin:Number.isFinite(Number(q("rangeMargin")?.value))?Number(q("rangeMargin").value):2,occupied:[],channels:[],scan:{threshold:-55,guard:0.25,points:[]}};
  }

  function normalizeChannel(a){
    const frequency=Number(a.frequency);if(!Number.isFinite(frequency))return null;
    const dId=a.deviceId||"";
    let rawBackups=null;
    if(Array.isArray(a.backups))rawBackups=a.backups;
    else if(a.backups&&typeof a.backups==="object")rawBackups=[a.backups[0]??a.backups.bkp1??a.backups.backup1??null,a.backups[1]??a.backups.bkp2??a.backups.backup2??null];
    else if(Array.isArray(a.backupFrequencies))rawBackups=a.backupFrequencies;
    else rawBackups=[a.backup1??a.backup_1??null,a.backup2??a.backup_2??null];
    const backups=[normalizeBackup(rawBackups[0]),normalizeBackup(rawBackups[1])];
    return {id:a.id||uid(),channel:a.channel||"CH 01",role:a.role||"",deviceId:dId,
      deviceName:a.deviceName||deviceName(dId),frequency,powerMw:Number.isFinite(Number(a.powerMw))&&Number(a.powerMw)>0?Number(a.powerMw):null,
      digital:!!a.digital,backups,notes:a.notes||""};
  }

  function normalizeLocation(r){
    const occupied=Array.isArray(r?.occupied)?r.occupied.map(o=>({freq:Number(o.freq),powerMw:Number.isFinite(Number(o.powerMw))&&Number(o.powerMw)>0?Number(o.powerMw):null,digital:!!o.digital,source:o.source||"manual"})).filter(o=>Number.isFinite(o.freq)):[];
    const rawChannels=Array.isArray(r?.channels)?r.channels:(Array.isArray(r?.assignments)?r.assignments:[]);
    const channels=rawChannels.map(normalizeChannel).filter(Boolean).filter(a=>occupied.some(o=>near(o.freq,a.frequency)));
    const s=r?.scan||{};
    return {id:r?.id||uid(),name:r?.name||"Locación",location:r?.location||"",rangeMin:Number.isFinite(Number(r?.rangeMin))?Number(r.rangeMin):550,
      rangeMax:Number.isFinite(Number(r?.rangeMax))?Number(r.rangeMax):600,rangeMargin:Number.isFinite(Number(r?.rangeMargin))?Number(r.rangeMargin):2,occupied,channels,
      scan:{threshold:Number.isFinite(Number(s.threshold))?Number(s.threshold):-55,guard:Number.isFinite(Number(s.guard))&&Number(s.guard)>=0?Number(s.guard):0.25,
        points:Array.isArray(s.points)?s.points.map(p=>({freq:Number(p.freq),level:Number(p.level)})).filter(p=>Number.isFinite(p.freq)&&Number.isFinite(p.level)):[]}};
  }
  function normalizeProject(p){
    const project=p?.project||{};
    W.project={name:project.name||"Mi rodaje",production:project.production||"",date:project.date||today(),notes:project.notes||""};
    W.selectedDeviceId=p?.selectedDeviceId||p?.selectedDevice||"";
    W.locations=(Array.isArray(p?.locations)?p.locations:(Array.isArray(p?.regions)?p.regions:[])).map(normalizeLocation);
    if(!W.locations.length)W.locations=[freshLocation("Locación 01")];
    W.activeLocationId=p?.activeLocationId||p?.activeRegionId;
    if(!W.locations.some(x=>x.id===W.activeLocationId))W.activeLocationId=W.locations[0].id;
  }

  function capture(){
    const r=currentLocation();if(!r)return;
    W.project.name=q("wfProjectName")?.value.trim()||"Mi rodaje";
    W.project.production=q("wfProduction")?.value.trim()||"";
    W.project.date=q("wfProjectDate")?.value||today();
    W.project.notes=q("wfProjectNotes")?.value.trim()||"";
    r.name=q("wfRegionName")?.value.trim()||"Locación";r.location=q("wfRegionLocation")?.value.trim()||"";
    r.rangeMin=Number(q("rangeMin")?.value)||r.rangeMin;r.rangeMax=Number(q("rangeMax")?.value)||r.rangeMax;
    r.rangeMargin=Number.isFinite(Number(q("rangeMargin")?.value))?Number(q("rangeMargin").value):r.rangeMargin;
    r.occupied=clone(state.occupied||[]);
    r.scan=r.scan||{threshold:-55,guard:0.25,points:[]};const sg=Number(q("scanGuard")?.value),st=Number(q("scanThreshold")?.value);if(Number.isFinite(sg)&&sg>=0)r.scan.guard=sg;if(Number.isFinite(st))r.scan.threshold=st;
    r.channels=r.channels.filter(a=>r.occupied.some(o=>near(o.freq,a.frequency)));
    for(const a of r.channels){
      const b=Array.isArray(a.backups)?a.backups.slice(0,2):[null,null];
      while(b.length<2)b.push(null);
      a.backups=b.map(normalizeBackup);
      a.deviceName=deviceName(a.deviceId);
    }
    W.selectedDeviceId=q("deviceSelect")?.value||W.selectedDeviceId;
  }

  function payload(){capture();const analysis={coordinationProfile:q("coordinationProfile")?.value||"standard",minSeparation:Number(q("minSeparation")?.value),imThreshold:Number(q("imThreshold")?.value),resultCount:Number(q("resultCount")?.value),criticalFloor:Number(q("criticalFloor")?.value),strict:!!q("strict")?.checked};return {version:3,savedAt:new Date().toISOString(),project:clone(W.project),selectedDeviceId:W.selectedDeviceId,activeLocationId:W.activeLocationId,analysis,locations:clone(W.locations)}}

  function setStatus(text){if(q("wfSaveStatus"))q("wfSaveStatus").textContent=text;if(q("wfSaveStatusTop"))q("wfSaveStatusTop").textContent=text}
  function persist(){try{localStorage.setItem(STORE,JSON.stringify(payload()));setStatus("Guardado local")}catch(e){setStatus("No se pudo guardar")}}
  let timer=null;function schedule(){clearTimeout(timer);setStatus("Cambios pendientes…");timer=setTimeout(persist,300)}
  function toast(msg){if(typeof showToast==="function"){showToast(msg);return}const el=q("toast");if(!el)return;el.innerHTML=msg;el.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove("show"),2400)}

  function renderRegionSelect(){const sel=q("wfRegionSelect");if(!sel)return;sel.innerHTML=W.locations.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join("");sel.value=W.activeLocationId}
  function renderProjectMeta(){const r=currentLocation();if(!r)return;q("wfProjectName").value=W.project.name;q("wfProduction").value=W.project.production;q("wfProjectDate").value=W.project.date;q("wfProjectNotes").value=W.project.notes;q("wfRegionName").value=r.name;q("wfRegionLocation").value=r.location;renderRegionSelect()}

  function scanAssessment(freq){
    const r=currentLocation(),g=Math.max(0,Number(r?.scan?.guard)||0),threshold=Number(r?.scan?.threshold);const pts=(r?.scan?.points||[]).filter(p=>!Number.isFinite(threshold)||p.level>=threshold);let nearest=null;
    for(const p of pts){const d=Math.abs(Number(freq)-p.freq);if(!nearest||d<nearest.distance)nearest={freq:p.freq,level:p.level,distance:d}}
    return {blocked:!!nearest&&nearest.distance<=g+1e-9,nearest,guard:g};
  }
  function renderScanAvailability(){
    const b=q("scanAvailability");if(!b)return;const r=currentLocation(),d=currentDevice();
    const activePoints=(r?.scan?.points||[]).filter(p=>p.level>=Number(r?.scan?.threshold));
    if(!r||!d||!activePoints.length){b.innerHTML="";return}
    if(d.candidateModel!=="channels"&&d.candidateModel!=="continuous"){b.innerHTML='<div class="scan-box-info">Hay señales cargadas. Elegí un dispositivo para calcular su disponibilidad.</div>';return}
    const min=Number(q("rangeMin").value),max=Number(q("rangeMax").value),cs=generateCandidates(d,min,max);let exact=0,blocked=0;
    cs.forEach(c=>{if((state.occupied||[]).some(o=>near(o.freq,c.freq))){exact++;return}if(scanAssessment(c.freq).blocked)blocked++});
    const free=Math.max(0,cs.length-exact-blocked);
    b.innerHTML='<div class="scan-box-title">DISPONIBILIDAD SEGÚN SCAN</div><div class="scan-box-stats"><span><b>'+activePoints.length+'</b> señales</span><span><b>'+exact+'</b> ocupadas</span><span><b>'+blocked+'</b> afectadas por scan</span><span><b>'+free+'</b> libres del entorno</span></div><div class="scan-box-note">"Libre del scan" no significa libre de IM: las Recomendaciones siguen haciendo la coordinación RF.</div>';
  }
  function analysisOptions(){return {minSep:Number(q("minSeparation")?.value)||0,imThreshold:Number(q("imThreshold")?.value)||0,strict:!!q("strict")?.checked,criticalFloor:Number(q("criticalFloor")?.value)||0.010}}
  function evaluateFrequency(freq,deviceId){
    const r=currentLocation(),d=state.devices?.[deviceId],out={possible:false,freq:Number(freq),tier:"fuera_de_rango",tierLabel:"ℹ️ FUERA DE RANGO",score:0,scan:scanAssessment(freq)};
    if(!r||!d)return out;const min=Number(q("rangeMin").value),max=Number(q("rangeMax").value);if(!Number.isFinite(freq)||freq<min-1e-9||freq>max+1e-9)return out;
    if(d.candidateModel!=="channels"&&d.candidateModel!=="continuous")return out;
    out.possible=generateCandidates(d,min,max).some(c=>Math.abs(c.freq-freq)<1e-6);if(!out.possible)return out;
    const rr={min:min-getRangeMargin(),max:max+getRangeMargin()},sc=scoreCandidate({freq,label:"Backup"},state.occupied,min,max,analysisOptions(),intermods(state.occupied,5,rr),d,precomputeDangerZones(state.occupied,5,rr));
    out.tier=sc.tier;out.tierLabel=sc.tierLabel;out.score=sc.score;out.hits=sc.hits||[];return out;
  }
  function backupStatus(a,slot){
    const v=(a.backups||[])[slot];if(!Number.isFinite(Number(v)))return '<span class="backup-status empty">BKP '+(slot+1)+' —</span>';
    const ev=evaluateFrequency(Number(v),a.deviceId);let s=ev.possible?ev.tierLabel:"⚠ no válida para el equipo";if(ev.scan?.blocked)s+=" · ⚠ SCAN";
    return '<span class="backup-status'+(ev.tier==="recomendado"&&ev.possible?'':' invalid')+'">BKP '+(slot+1)+' '+fmt(v)+' · '+esc(s)+'</span>';
  }
  function renderChannels(){
    const box=q("wfChannels");if(!box)return;const r=currentLocation(),channels=(r?.channels||[]).slice(),unassigned=(state.occupied||[]).filter(o=>!channels.some(a=>near(a.frequency,o.freq)));
    const cnt=q("wfChannelCount");if(cnt)cnt.textContent=String(channels.length);
    if(!channels.length&&!unassigned.length)box.innerHTML='<div class="wf-empty">Todavía no hay equipos/canales en uso.</div>';
    else{
      box.innerHTML=channels.map(a=>{const active=backupTarget&&backupTarget.id===a.id;return '<article class="wf-channel'+(active?' is-backup-target':'')+'"><div class="wf-channel-main"><div class="wf-channel-name">'+esc(a.channel)+'<span>'+esc(a.role||"")+'</span></div><div class="wf-channel-device">'+esc(deviceName(a.deviceId))+(a.digital?" · digital":"")+(a.powerMw?(" · "+esc(a.powerMw)+" mW"):"")+'</div></div><div class="wf-channel-freq">'+fmt(a.frequency)+'<small>MHz</small></div><div class="wf-channel-backups">'+renderBackupCell(a,0)+renderBackupCell(a,1)+'</div><div class="wf-channel-actions"><button type="button" class="secondary" onclick="CRF_WORKFLOW.openEdit(\''+esc(a.id)+'\')">Editar</button><button type="button" class="secondary" onclick="CRF_WORKFLOW.removeChannel(\''+esc(a.id)+'\')">Quitar</button></div>'+(a.notes?'<div class="wf-channel-notes">'+esc(a.notes)+'</div>':'')+'</article>'}).join("");
      if(unassigned.length)box.innerHTML+='<div class="wf-unassigned"><strong>Ocupadas sin ficha</strong><span>'+unassigned.map(o=>fmt(o.freq)+" MHz").join(" · ")+'</span><small>Las frecuencias detectadas por scan permanecen aquí sin convertirse en canales.</small></div>';
    }
    renderBackupHint();renderScanAvailability();
  }
  function renderBackupCell(a,slot){
    const active=backupTarget&&backupTarget.id===a.id&&backupTarget.slot===slot;
    const v=(a.backups||[])[slot];
    return '<div class="wf-backup-cell"><button type="button" class="text-btn '+(active?'selected':'')+'" onclick="CRF_WORKFLOW.startBackup(\''+esc(a.id)+'\\','+slot+')">'+backupStatus(a,slot)+'</button>'+
      (Number.isFinite(Number(v))?'<button type="button" class="secondary backup-activate-btn" onclick="CRF_WORKFLOW.activateBackup(\''+esc(a.id)+'\\','+slot+')">Activar</button>':"")+
      '</div>';
  }
  function renderBackupHint(){
    const el=q("wfBackupHint");if(!el)return;
    if(!backupTarget){el.hidden=true;el.innerHTML="";return}
    const a=currentLocation()?.channels?.find(x=>x.id===backupTarget.id);if(!a){backupTarget=null;el.hidden=true;return}
    el.hidden=false;el.innerHTML='<span>Backup '+(backupTarget.slot+1)+' para <strong>'+esc(a.channel)+'</strong> · '+fmt(a.frequency)+' MHz</span><button type="button" class="secondary" onclick="CRF_WORKFLOW.cancelBackup()">Cancelar</button>';
  }

  function renderField(){
    const r=currentLocation();if(!r)return;q("fieldProjectName").textContent=W.project.name;q("fieldRegionName").textContent=r.name+(r.location?" · "+r.location:"");const b=q("fieldAssignments");
    b.innerHTML=(r.channels||[]).length?r.channels.map(a=>{const bx=(a.backups||[]).filter(Number.isFinite);return '<article class="field-row"><div><div class="field-label">'+esc(a.channel)+'</div><div class="field-sub">'+esc(deviceName(a.deviceId))+(a.role?" · "+esc(a.role):"")+'</div></div><div class="field-freq">'+fmt(a.frequency)+' <span>MHz</span></div><div class="field-backups">'+(bx.length?bx.map((v,i)=>{const ev=evaluateFrequency(v,a.deviceId);return "BKP "+(i+1)+" · "+fmt(v)+(ev.scan?.blocked?" ⚠ SCAN":"")+(ev.tier!=="recomendado"?" · "+ev.tierLabel:"")}).join(" · "):"Sin backup asignado")+'</div></article>'}).join(""):'<div class="field-empty">No hay canales identificados en esta locación.</div>';
    const raw=(state.occupied||[]).filter(o=>!(r.channels||[]).some(a=>near(a.frequency,o.freq)));q("fieldUnassigned").textContent=raw.length?("Frecuencias ocupadas sin ficha: "+raw.map(o=>fmt(o.freq)+" MHz").join(" · ")):"";
  }
  function syncUI(){
    const r=currentLocation();if(!r)return;
    renderProjectMeta();
    if(W.selectedDeviceId&&state.devices[W.selectedDeviceId])q("deviceSelect").value=W.selectedDeviceId;
    if(typeof renderDeviceInfo==="function")renderDeviceInfo();
    q("rangeMin").value=r.rangeMin;q("rangeMax").value=r.rangeMax;q("rangeMargin").value=r.rangeMargin;q("scanGuard").value=r.scan.guard;q("scanThreshold").value=r.scan.threshold;
    renderRegionSelect();renderChannels();renderField();renderScanAvailability();
  }

  function restoreLocation(){
    const r=currentLocation();if(!r)return;
    backupTarget=null;state.occupied=clone(r.occupied||[]);
    q("rangeMin").value=r.rangeMin;q("rangeMax").value=r.rangeMax;q("rangeMargin").value=r.rangeMargin;q("scanGuard").value=r.scan.guard;q("scanThreshold").value=r.scan.threshold;
    if(typeof renderOccupied==="function")renderOccupied();if(typeof calculate==="function")calculate();syncUI();
  }

  function activateLocation(id){capture();const next=W.locations.find(x=>x.id===id);if(!next)return;W.activeLocationId=next.id;restoreLocation();schedule()}
  function addLocation(){capture();const r=freshLocation();W.locations.push(r);W.activeLocationId=r.id;state.occupied=[];if(typeof renderOccupied==="function")renderOccupied();if(typeof calculate==="function")calculate();syncUI();schedule();toast("Nueva locación creada")}
  function deleteLocation(){
    if(W.locations.length===1){toast("El proyecto necesita al menos una locación");return}
    if(window.confirm&&!window.confirm("¿Eliminar la locación actual?"))return;
    W.locations=W.locations.filter(x=>x.id!==W.activeLocationId);W.activeLocationId=W.locations[0].id;restoreLocation();schedule();toast("Locación eliminada");
  }

  function addChannelFromFrequency(freq,meta){
    const r=currentLocation();if(!r)return null;if(r.channels.some(a=>near(a.frequency,freq)))return r.channels.find(a=>near(a.frequency,freq));
    const d=currentDevice(),dId=meta?.deviceId||q("deviceSelect").value||"";
    const a={id:uid(),channel:meta?.channel||nextChannelLabel(),role:meta?.role||"",deviceId:dId,deviceName:deviceName(dId),frequency:Number(freq),
      powerMw:Number.isFinite(Number(meta?.powerMw))&&Number(meta.powerMw)>0?Number(meta.powerMw):null,
      digital:typeof meta?.digital==="boolean"?meta.digital:!!(d&&d.modulation==="digital"),backups:[null,null],notes:meta?.notes||""};
    r.channels.push(a);r.channels.sort((x,y)=>x.frequency-y.frequency);return a;
  }

  function invalidateSetResults(){const el=q("setResults");if(el)el.innerHTML="";}
  function wrappedAddOccupied(){
    const freq=Number(q("occupiedFreq").value),pw=Number(q("occupiedPower").value),dig=!!q("occupiedDigital").checked,before=state.occupied.length;
    coreAddOccupied();
    if(state.occupied.length>before&&Number.isFinite(freq))addChannelFromFrequency(freq,{powerMw:Number.isFinite(pw)&&pw>0?pw:null,digital:dig});
    invalidateSetResults();capture();renderChannels();renderField();schedule();
  }

  function wrappedRemoveFreq(i){
    const removed=state.occupied[i];coreRemoveFreq(i);
    if(removed){const r=currentLocation();r.channels=r.channels.filter(a=>!near(a.frequency,removed.freq));if(backupTarget&&!r.channels.some(a=>a.id===backupTarget.id))backupTarget=null}
    invalidateSetResults();capture();renderChannels();renderField();schedule();
  }

  function wrappedCandidate(freq){
    const s=scanAssessment(freq);if(s.blocked){const where=s.nearest?fmt(s.nearest.freq)+" MHz":"la zona detectada";if(window.confirm&&!window.confirm(fmt(freq)+" MHz está dentro de ±"+fmt(s.guard)+" MHz de una señal detectada en "+where+".\n\n¿Querés usarla de todos modos?"))return}
    const before=state.occupied.length;coreAddCandidate(freq);
    if(state.occupied.length>before){const d=currentDevice(),a=addChannelFromFrequency(freq,{deviceId:q("deviceSelect").value,digital:!!(d&&d.modulation==="digital")}),o=state.occupied.find(x=>near(x.freq,freq));if(o&&a){o.digital=a.digital;o.powerMw=a.powerMw}if(typeof renderOccupied==="function")renderOccupied();if(typeof calculate==="function")calculate()}
    invalidateSetResults();capture();renderChannels();renderField();renderScanAvailability();schedule();toast("✓ "+fmt(freq)+" MHz asignada a "+esc(currentDevice()?.name||"dispositivo"));
  }
  function wrappedSet(freqs,btn){
    const before=state.occupied.length;coreAddSet(freqs,btn);
    if(state.occupied.length>before){
      const d=currentDevice();freqs.forEach(f=>addChannelFromFrequency(f,{deviceId:q("deviceSelect").value,digital:!!(d&&d.modulation==="digital")}));
      if(typeof renderOccupied==="function")renderOccupied();if(typeof calculate==="function")calculate();
    }
    invalidateSetResults();capture();renderChannels();renderField();schedule();
  }

  function startBackup(id,slot){
    const a=currentLocation()?.channels?.find(x=>x.id===id);if(!a)return;
    backupTarget={id,slot,previousDeviceId:q("deviceSelect").value};
    if(a.deviceId&&state.devices[a.deviceId]){q("deviceSelect").value=a.deviceId;W.selectedDeviceId=a.deviceId}
    renderChannels();if(typeof calculate==="function")calculate();renderScanAvailability();const d=q("wfChannelsDetails");if(d)d.open=true;
    toast("Elegí una frecuencia en Recomendaciones para Backup "+(slot+1)+" de "+esc(deviceName(a.deviceId)));setTimeout(()=>q("results")?.scrollIntoView({behavior:"smooth",block:"start"}),30);
  }
  function cancelBackup(){
    const prev=backupTarget?.previousDeviceId;backupTarget=null;
    if(prev&&state.devices?.[prev]){q("deviceSelect").value=prev;W.selectedDeviceId=prev;if(typeof renderDeviceInfo==="function")renderDeviceInfo();if(typeof calculate==="function")calculate()}
    renderChannels();toast("Selección de backup cancelada");
  }
  function hasBackupTarget(){return !!backupTarget}
  function backupLabel(){return backupTarget?"Usar como Backup "+(backupTarget.slot+1):""}
  function useAsBackup(freq){
    if(!backupTarget){toast("Primero elegí BKP 1 o BKP 2 en un canal");return}
    const r=currentLocation(),a=r?.channels?.find(x=>x.id===backupTarget.id);if(!a){backupTarget=null;return}
    const ev=evaluateFrequency(freq,a.deviceId);if(!ev.possible){toast(fmt(freq)+" MHz no es una frecuencia válida para "+esc(deviceName(a.deviceId)));return}
    if(ev.scan?.blocked){const where=ev.scan.nearest?fmt(ev.scan.nearest.freq)+" MHz":"la zona detectada";if(window.confirm&&!window.confirm(fmt(freq)+" MHz está dentro de ±"+fmt(ev.scan.guard)+" MHz de una señal detectada en "+where+".\n\n¿Guardar igualmente como backup?"))return}
    if(ev.tier!=="recomendado"){const d=ev.tierLabel+(ev.hits?.length?" · "+ev.hits.slice(0,2).map(h=>"IM"+h.order+" a "+fmt(h.dist)+" MHz").join(" · "):"");if(window.confirm&&!window.confirm(fmt(freq)+" MHz no queda RECOMENDADA para "+esc(deviceName(a.deviceId))+": "+d+".\n\n¿Guardar igualmente como backup?"))return}
    if((state.occupied||[]).some(o=>near(o.freq,freq)&&!near(o.freq,a.frequency))){toast(fmt(freq)+" MHz ya está ocupada");return}
    if(near(freq,a.frequency)){toast("El backup no puede ser igual a la frecuencia principal");return}
    a.backups=a.backups||[null,null];a.backups[backupTarget.slot]=Number(freq);const slot=backupTarget.slot+1,prev=backupTarget.previousDeviceId;backupTarget=null;
    if(prev&&state.devices?.[prev]){q("deviceSelect").value=prev;W.selectedDeviceId=prev}
    capture();renderChannels();renderField();renderScanAvailability();schedule();if(typeof renderDeviceInfo==="function")renderDeviceInfo();if(typeof calculate==="function")calculate();
    toast("✓ "+fmt(freq)+" MHz guardada como Backup "+slot+" de "+esc(a.channel));
  }

  function activateBackup(id,slot){
    const r=currentLocation(),a=r?.channels?.find(x=>x.id===id),v=Number(a?.backups?.[slot]);
    if(!a||!Number.isFinite(v)){toast("No hay un backup válido para activar");return}
    if(near(v,a.frequency)){toast("El backup no puede ser igual a la frecuencia principal");return}
    const other=(state.occupied||[]).find(o=>near(o.freq,v)&&!near(o.freq,a.frequency));
    if(other){toast(fmt(v)+" MHz ya está ocupada en esta locación");return}
    const ev=evaluateFrequency(v,a.deviceId);
    if(!ev.possible){toast(fmt(v)+" MHz ya no es una frecuencia válida para "+esc(deviceName(a.deviceId)));return}
    if(ev.scan?.blocked){
      const where=ev.scan.nearest?fmt(ev.scan.nearest.freq)+" MHz":"la zona detectada";
      if(window.confirm&&!window.confirm(fmt(v)+" MHz está dentro de ±"+fmt(ev.scan.guard)+" MHz de una señal detectada en "+where+".\\n\\n¿Activar igualmente el backup?"))return
    }
    if(ev.tier!=="recomendado"){
      const detail=ev.tierLabel+(ev.hits?.length?" · "+ev.hits.slice(0,2).map(h=>"IM"+h.order+" a "+fmt(h.dist)+" MHz").join(" · "):"");
      if(window.confirm&&!window.confirm(fmt(v)+" MHz no queda RECOMENDADA para "+esc(deviceName(a.deviceId))+": "+detail+".\\n\\n¿Activar igualmente el backup?"))return
    }
    const primary=(state.occupied||[]).find(o=>near(o.freq,a.frequency));
    if(!primary){toast("El canal principal ya no está presente en frecuencias ocupadas");return}
    const oldFreq=a.frequency,oldBackup=v,source=primary.source||"manual";
    a.frequency=oldBackup;
    a.backups=a.backups||[null,null];
    a.backups[slot]=oldFreq;
    primary.freq=oldBackup;
    primary.powerMw=a.powerMw;
    primary.digital=a.digital;
    primary.source=source;
    state.occupied.sort((x,y)=>x.freq-y.freq);
    backupTarget=null;
    if(typeof renderOccupied==="function")renderOccupied();
    if(typeof calculate==="function")calculate();
    renderChannels();renderField();renderScanAvailability();schedule();
    toast("✓ "+fmt(oldBackup)+" MHz activada como principal de "+esc(a.channel)+" · anterior "+fmt(oldFreq)+" MHz queda como Backup "+(slot+1));
  }

  function openEdit(id){
    const a=currentLocation()?.channels?.find(x=>x.id===id);if(!a)return;
    editingId=id;q("wfEditTitle").textContent=a.channel||"Canal";q("wfEditChannel").value=a.channel||"";q("wfEditRole").value=a.role||"";
    q("wfEditDevice").innerHTML=Object.entries(state.devices||{}).map(([k,d])=>'<option value="'+esc(k)+'">'+esc(d.name)+'</option>').join("");
    q("wfEditDevice").value=a.deviceId||q("deviceSelect").value;q("wfEditFreq").value=fmt(a.frequency);q("wfEditPower").value=a.powerMw??"";
    q("wfEditDigital").checked=!!a.digital;q("wfEditNotes").value=a.notes||"";q("wfEditModal").classList.add("show");q("wfEditModal").setAttribute("aria-hidden","false");
  }
  function closeEdit(){editingId=null;q("wfEditModal").classList.remove("show");q("wfEditModal").setAttribute("aria-hidden","true")}
  function saveEdit(){
    const r=currentLocation(),a=r?.channels?.find(x=>x.id===editingId);if(!a)return;
    const nf=Number(q("wfEditFreq").value);if(!Number.isFinite(nf)){toast("Frecuencia inválida");return}
    if((state.occupied||[]).some(o=>near(o.freq,nf)&&!near(o.freq,a.frequency))){toast(fmt(nf)+" MHz ya está ocupada");return}
    const old=a.frequency;a.channel=q("wfEditChannel").value.trim()||"CH 01";a.role=q("wfEditRole").value.trim();a.deviceId=q("wfEditDevice").value;a.deviceName=deviceName(a.deviceId);a.frequency=nf;
    const p=Number(q("wfEditPower").value);a.powerMw=Number.isFinite(p)&&p>0?p:null;a.digital=!!q("wfEditDigital").checked;a.notes=q("wfEditNotes").value.trim();
    const o=(state.occupied||[]).find(x=>near(x.freq,old));if(o){o.freq=nf;o.powerMw=a.powerMw;o.digital=a.digital}
    state.occupied.sort((x,y)=>x.freq-y.freq);closeEdit();if(typeof renderOccupied==="function")renderOccupied();if(typeof calculate==="function")calculate();renderChannels();renderField();schedule();toast("✓ Canal actualizado");
  }
  function removeChannel(id){
    const r=currentLocation(),a=r?.channels?.find(x=>x.id===id);if(!a)return;
    if(window.confirm&&!window.confirm("¿Quitar "+(a.channel||"este canal")+" de las frecuencias en uso?"))return;
    r.channels=r.channels.filter(x=>x.id!==id);state.occupied=state.occupied.filter(o=>!near(o.freq,a.frequency));backupTarget=null;
    if(typeof renderOccupied==="function")renderOccupied();if(typeof calculate==="function")calculate();renderChannels();renderField();schedule();toast((a.channel||"Canal")+" quitado");
  }

  function exportProject(){
    const b=new Blob([JSON.stringify(payload(),null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");
    a.href=u;a.download=(W.project.name||"crf-rodaje").replace(/[^a-z0-9_-]+/gi,"_")+".crf.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),500);toast("Proyecto exportado");
  }

  function sheet(){
    const p=payload(),r=currentLocation(),win=window.open("","_blank");
    if(!win){toast("El navegador bloqueó la Hoja RF");return}
    const rows=(r.channels||[]).map(a=>'<tr><td>'+esc(a.channel)+'</td><td>'+esc(a.role||"")+'</td><td>'+esc(deviceName(a.deviceId))+'</td><td class="m">'+fmt(a.frequency)+'</td><td class="m">'+(a.backups?.[0]!==null&&a.backups?.[0]!==undefined?fmt(a.backups[0]):"—")+'</td><td class="m">'+(a.backups?.[1]!==null&&a.backups?.[1]!==undefined?fmt(a.backups[1]):"—")+'</td><td>'+(a.powerMw?a.powerMw+" mW":"—")+'</td></tr>').join("");
    const raw=(r.occupied||[]).filter(o=>!(r.channels||[]).some(a=>near(a.frequency,o.freq)));
    const rawHtml=raw.length?'<h2>Frecuencias ocupadas sin ficha</h2><p>'+raw.map(o=>fmt(o.freq)+" MHz").join(" · ")+'</p>':"";
    win.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>CRF · Hoja RF</title><style>body{font:14px Arial,sans-serif;color:#111;padding:28px}h1{margin:0 0 5px}p{margin:4px 0 16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:7px;text-align:left}th{background:#eee}.m{font:14px monospace}.note{margin-top:18px;padding:10px;background:#f1f1f1}</style></head><body><h1>CRF · Hoja RF</h1><p><strong>'+esc(p.project.name)+'</strong> · '+esc(r.name)+(r.location?" · "+esc(r.location):"")+' · '+esc(p.project.date)+'</p><table><thead><tr><th>Canal</th><th>Función</th><th>Dispositivo</th><th>Principal</th><th>Backup 1</th><th>Backup 2</th><th>Potencia</th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="7">Sin canales identificados.</td></tr>')+
      '</tbody></table>'+rawHtml+'<p class="note">CRF es un coordinador matemático/heurístico. Esta hoja representa la coordinación cargada y no una medición de espectro en tiempo real.</p><script>onload=function(){setTimeout(function(){print()},150)}<\\/script></body></html>');
    win.document.close();
  }

  function importProject(file){
    const fr=new FileReader();fr.onload=()=>{
      try{normalizeProject(JSON.parse(fr.result));if(W.selectedDeviceId&&state.devices[W.selectedDeviceId])q("deviceSelect").value=W.selectedDeviceId;restoreLocation();persist();toast("Proyecto cargado")}
      catch(e){toast("Archivo CRF inválido")}
    };fr.readAsText(file);
  }

  function field(){capture();renderField();q("fieldMode").classList.add("show");q("fieldMode").setAttribute("aria-hidden","false");document.body.classList.add("field-open")}
  function closeField(){q("fieldMode").classList.remove("show");q("fieldMode").setAttribute("aria-hidden","true");document.body.classList.remove("field-open")}

  function loadSaved(){
    let raw=null;try{raw=localStorage.getItem(STORE)||localStorage.getItem(LEGACY_STORE)}catch(e){}
    if(!raw){normalizeProject({});return}
    try{normalizeProject(JSON.parse(raw))}catch(e){normalizeProject({})}
  }

  function wrapCore(){
    coreAddOccupied=window.addOccupied;coreAddCandidate=window.addCandidateAsOccupied;coreAddSet=window.addSetAsOccupied;coreRemoveFreq=window.removeFreq;
    coreLoadExample=q("loadExample").onclick;coreClearAll=q("clearAll").onclick;coreImportScan=q("importScan").onclick;
    window.addOccupied=wrappedAddOccupied;window.addCandidateAsOccupied=wrappedCandidate;window.addSetAsOccupied=wrappedSet;window.removeFreq=wrappedRemoveFreq;
    q("addFreq").onclick=wrappedAddOccupied;q("loadExample").onclick=wrappedLoadExample;q("clearAll").onclick=wrappedClearAll;q("importScan").onclick=wrappedImportScan;
  }
  function registerExampleChannels(){
    const r=currentLocation();if(!r)return;r.channels=[];
    const defs=[["G4 01","sennheiser_ew100_g4_g",566.200,30],["G4 02","sennheiser_ew100_g4_g",574.200,30],["BOYA 01","boya_wm8_pro_k2",559.990,null],["BOYA 02","boya_wm8_pro_k2",584.180,null]];
    defs.forEach(d=>r.channels.push({id:uid(),channel:d[0],role:"",deviceId:d[1],deviceName:deviceName(d[1]),frequency:d[2],powerMw:d[3],digital:false,backups:[null,null],notes:"Ejemplo CRF"}));r.channels.sort((a,b)=>a.frequency-b.frequency);
  }
  function refreshScanOccupancy(){
    const r=currentLocation();if(!r)return;
    state.occupied=state.occupied.filter(o=>o.source!=="scan");
    const threshold=Number(r.scan.threshold);
    const points=(r.scan.points||[]).filter(p=>Number.isFinite(p.level)&&p.level>=threshold);
    for(const p of points){
      if(!state.occupied.some(o=>near(o.freq,p.freq)))state.occupied.push({freq:p.freq,powerMw:null,digital:false,source:"scan"});
    }
    state.occupied.sort((a,b)=>a.freq-b.freq);
    if(typeof renderOccupied==="function")renderOccupied();
    if(typeof calculate==="function")calculate();
  }

  function wrappedLoadExample(){coreLoadExample();invalidateSetResults();const r=currentLocation();if(r){r.scan={threshold:-55,guard:0.25,points:[]};registerExampleChannels()}q("scanText").value="";q("scanStatus").textContent="";capture();renderChannels();renderField();renderScanAvailability();schedule()}
  function wrappedClearAll(){coreClearAll();const r=currentLocation();if(r){r.channels=[];r.scan.points=[]}q("scanText").value="";q("scanStatus").textContent="";q("setResults").innerHTML="";q("scanAvailability").innerHTML="";capture();renderChannels();renderField();renderScanAvailability();schedule()}
  function wrappedImportScan(){invalidateSetResults();const txt=q("scanText").value,th=Number(q("scanThreshold").value),parsed=typeof parseScanText==="function"?parseScanText(txt):[],threshold=Number.isFinite(th)?th:-55;coreImportScan();const r=currentLocation();if(r)r.scan={threshold,guard:Math.max(0,Number(q("scanGuard").value)||0),points:parsed};capture();renderChannels();renderField();renderScanAvailability();schedule()}

  function bind(){
    loadSaved();try{const raw=localStorage.getItem(STORE)||localStorage.getItem(LEGACY_STORE)||localStorage.getItem(OLD_STORE);if(raw){const saved=JSON.parse(raw),a=saved.analysis||{};if(a.coordinationProfile)q("coordinationProfile").value=a.coordinationProfile;if(Number.isFinite(a.minSeparation))q("minSeparation").value=a.minSeparation;if(Number.isFinite(a.imThreshold))q("imThreshold").value=a.imThreshold;if(Number.isFinite(a.resultCount))q("resultCount").value=a.resultCount;if(Number.isFinite(a.criticalFloor))q("criticalFloor").value=a.criticalFloor;if(typeof a.strict==="boolean")q("strict").checked=a.strict}}catch(e){}if(W.selectedDeviceId&&state.devices[W.selectedDeviceId])q("deviceSelect").value=W.selectedDeviceId;
    restoreLocation();wrapCore();
    q("wfSave").onclick=()=>{capture();persist();toast("Proyecto RF guardado")};q("wfExport").onclick=exportProject;q("wfImport").onclick=()=>q("wfFile").click();
    q("wfFile").onchange=e=>e.target.files[0]&&importProject(e.target.files[0]);q("wfSheet").onclick=sheet;q("wfFieldMode").onclick=field;q("fieldClose").onclick=closeField;q("fieldSheet").onclick=sheet;
    q("wfNewRegion").onclick=addLocation;q("wfDeleteRegion").onclick=deleteLocation;q("wfRegionSelect").onchange=e=>activateLocation(e.target.value);q("wfEditClose").onclick=closeEdit;q("wfEditSave").onclick=saveEdit;
    ["wfProjectName","wfProduction","wfProjectDate","wfProjectNotes"].forEach(id=>q(id).addEventListener("input",schedule));
    ["wfRegionName","wfRegionLocation"].forEach(id=>q(id).addEventListener("input",()=>{const r=currentLocation();r.name=q("wfRegionName").value.trim()||"Locación";r.location=q("wfRegionLocation").value.trim();renderRegionSelect();renderField();schedule()}));
    q("deviceSelect").addEventListener("change",()=>{W.selectedDeviceId=q("deviceSelect").value;if(typeof renderDeviceInfo==="function")renderDeviceInfo();if(typeof calculate==="function")calculate();renderChannels();schedule()});
    ["rangeMin","rangeMax","rangeMargin"].forEach(id=>q(id).addEventListener("change",()=>{const r=currentLocation();if(!r)return;r.rangeMin=Number(q("rangeMin").value)||r.rangeMin;r.rangeMax=Number(q("rangeMax").value)||r.rangeMax;r.rangeMargin=Number.isFinite(Number(q("rangeMargin").value))?Number(q("rangeMargin").value):r.rangeMargin;if(typeof calculate==="function")calculate();renderChannels();renderScanAvailability();schedule()}));
    ["scanGuard","scanThreshold","coordinationProfile","minSeparation","imThreshold","resultCount","criticalFloor","strict"].forEach(id=>q(id)?.addEventListener("change",()=>{const r=currentLocation();if(r&&id==="scanGuard")r.scan.guard=Math.max(0,Number(q("scanGuard").value)||0);if(r&&id==="scanThreshold"){r.scan.threshold=Number.isFinite(Number(q("scanThreshold").value))?Number(q("scanThreshold").value):-55;refreshScanOccupancy()}if(typeof calculate==="function")calculate();renderChannels();renderField();renderScanAvailability();schedule()}));
    
    
    
    window.addEventListener("beforeunload",()=>{try{persist()}catch(e){}});syncUI();setStatus("Guardado local");
  }

  window.CRF_WORKFLOW={scanAssessment,evaluateFrequency,removeChannel,useFrequency:wrappedCandidate,useSet:wrappedSet,startBackup,cancelBackup,useAsBackup,activateBackup,hasBackupTarget,backupLabel,openEdit,openField:field,closeField,
    save:()=>{capture();persist();toast("Proyecto RF guardado")},downloadProject:exportProject,rfSheet:sheet};

  (async()=>{for(let i=0;i<150;i++){if(Object.keys(state.devices||{}).length){bind();return}await new Promise(r=>setTimeout(r,20))}if(q("wfProjectName"))bind()})();
})();