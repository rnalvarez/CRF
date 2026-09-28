/* CRF - workflow de produccion. Capa de uso sobre el motor existente. */
(function(){
  const STORE="crf.rfProject.v1";
  const q=id=>document.getElementById(id);
  const near=(a,b)=>Math.abs(Number(a)-Number(b))<0.0001;
  const fmt=f=>Number(f).toFixed(3);
  const esc=s=>String(s??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const cp=x=>JSON.parse(JSON.stringify(x));
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  let W={project:{name:"Mi rodaje",production:"",date:new Date().toISOString().slice(0,10),notes:""},regions:[],active:null};
  const dev=id=>state.devices?.[id]||null;
  const deviceId=()=>q("wfDeviceSelect")?.value||q("deviceSelect")?.value||"";
  const region=()=>W.regions.find(r=>r.id===W.active)||W.regions[0];

  function freshRegion(name){
    return {id:uid(),name:name||"Locacion 01",location:"",
      rangeMin:+q("rangeMin").value||550,rangeMax:+q("rangeMax").value||600,
      rangeMargin:+q("rangeMargin").value||2,occupied:[],assignments:[]};
  }
  function normRegion(r){
    r={id:r.id||uid(),name:r.name||"Locacion",location:r.location||"",
      rangeMin:+r.rangeMin||550,rangeMax:+r.rangeMax||600,
      rangeMargin:Number.isFinite(+r.rangeMargin)?+r.rangeMargin:2,
      occupied:Array.isArray(r.occupied)?r.occupied:[],assignments:Array.isArray(r.assignments)?r.assignments:[]};
    r.occupied=r.occupied.map(o=>({freq:+o.freq,powerMw:+o.powerMw>0?+o.powerMw:null,digital:!!o.digital,source:o.source||"manual"})).filter(o=>Number.isFinite(o.freq));
    r.assignments=r.assignments.filter(a=>Number.isFinite(+a.frequency)&&r.occupied.some(o=>near(o.freq,a.frequency)));
    return r;
  }
  function normProject(p){
    W.project={name:p?.project?.name||"Mi rodaje",production:p?.project?.production||"",
      date:p?.project?.date||new Date().toISOString().slice(0,10),notes:p?.project?.notes||""};
    W.regions=(p?.regions||[]).map(normRegion);
    if(!W.regions.length)W.regions=[freshRegion()];
    W.active=p?.activeRegionId&&W.regions.some(r=>r.id===p.activeRegionId)?p.activeRegionId:W.regions[0].id;
  }
  function capture(){
    const r=region(); if(!r)return;
    W.project.name=q("wfProjectName").value.trim()||"Mi rodaje";
    W.project.production=q("wfProduction").value.trim();
    W.project.date=q("wfProjectDate").value;
    W.project.notes=q("wfProjectNotes").value.trim();
    r.name=q("wfRegionName").value.trim()||"Locacion";
    r.location=q("wfRegionLocation").value.trim();
    r.rangeMin=+q("rangeMin").value||r.rangeMin;
    r.rangeMax=+q("rangeMax").value||r.rangeMax;
    r.rangeMargin=Number.isFinite(+q("rangeMargin").value)?+q("rangeMargin").value:2;
    r.occupied=cp(state.occupied||[]);
    r.assignments=r.assignments.filter(a=>r.occupied.some(o=>near(o.freq,a.frequency)));
  }
  function payload(){capture();return{version:1,project:cp(W.project),activeRegionId:W.active,regions:cp(W.regions)}}
  function persist(){try{localStorage.setItem(STORE,JSON.stringify(payload()));q("wfSaveStatus").textContent="Guardado local"}catch(e){q("wfSaveStatus").textContent="Sin guardado local"}}
  let timer; function schedule(){clearTimeout(timer);timer=setTimeout(persist,250)}
  function syncUI(){
    const r=region(); if(!r)return;
    q("wfProjectName").value=W.project.name;
    q("wfProduction").value=W.project.production;
    q("wfProjectDate").value=W.project.date;
    q("wfProjectNotes").value=W.project.notes;
    q("wfRegionName").value=r.name;
    q("wfRegionLocation").value=r.location;
    q("wfRegionSelect").innerHTML=W.regions.map(x=>"<option value=\""+esc(x.id)+"\">"+esc(x.name)+"</option>").join("");
    q("wfDeviceSelect").innerHTML=Object.entries(state.devices||{}).map(([id,d])=>"<option value=\""+esc(id)+"\">"+esc(d.name)+"</option>").join("");
    q("wfDeviceSelect").value=q("deviceSelect").value;
    q("wfRegionSelect").value=W.active;
    q("rangeMin").value=r.rangeMin;q("rangeMax").value=r.rangeMax;q("rangeMargin").value=r.rangeMargin;
    const d=dev(deviceId());
    q("wfTargetDevice").textContent=d?.name||"Elegi un dispositivo en CH.03";
    if(d?.powerOptionsMw?.length&&!q("wfPower").value)q("wfPower").value=d.powerOptionsMw[0];
    if(d?.modulation)q("wfDigital").checked=d.modulation==="digital";
    renderAssignments();renderField();q("wfSaveStatus").textContent="Guardado local";
  }
  function loadRegion(r){state.occupied=cp(r.occupied||[]);q("rangeMin").value=r.rangeMin;q("rangeMax").value=r.rangeMax;q("rangeMargin").value=r.rangeMargin;renderOccupied();calculate()}
  function addRegion(){capture();const r=freshRegion("Locacion "+(W.regions.length+1));W.regions.push(r);W.active=r.id;loadRegion(r);syncUI();schedule();toast("Nueva locacion creada")}
  function delRegion(){if(W.regions.length===1)return toast("El proyecto necesita al menos una locacion");W.regions=W.regions.filter(r=>r.id!==W.active);W.active=W.regions[0].id;loadRegion(region());syncUI();schedule();toast("Locacion eliminada")}
  function activate(id){capture();W.active=id;loadRegion(region());syncUI();schedule()}
  function clearForm(){q("wfAssignFreq").value="";q("wfChannel").value="";q("wfRole").value="";q("wfPower").value="";q("wfBackup1").value="";q("wfBackup2").value="";q("wfAssignNotes").value="";syncUI()}
  function addAssignment(freqOverride){
    const r=region(),d=dev(q("deviceSelect").value),freq=Number(freqOverride??q("wfAssignFreq").value),ch=q("wfChannel").value.trim();
    if(!Number.isFinite(freq)||!ch)return toast("Completa frecuencia y canal / identificador");
    const p=Number(q("wfPower").value);
    const a={id:uid(),deviceId:deviceId(),deviceName:d?.name||"Dispositivo",channel:ch,role:q("wfRole").value.trim(),frequency:freq,
      powerMw:Number.isFinite(p)&&p>0?p:null,digital:q("wfDigital").checked,backups:[q("wfBackup1").value.trim(),q("wfBackup2").value.trim()],notes:q("wfAssignNotes").value.trim()};
    if(!state.occupied.some(o=>near(o.freq,freq)))state.occupied.push({freq,powerMw:a.powerMw,digital:a.digital,source:"assigned"});
    else{const o=state.occupied.find(o=>near(o.freq,freq));o.powerMw=a.powerMw;o.digital=a.digital}
    r.assignments.push(a);state.occupied.sort((x,y)=>x.freq-y.freq);
    renderOccupied();calculate();capture();renderAssignments();renderField();clearForm();schedule();toast("Canal agregado a la coordinacion")
  }
  function removeAssignment(id){
    const r=region(),a=r.assignments.find(x=>x.id===id);if(!a)return;
    r.assignments=r.assignments.filter(x=>x.id!==id);
    state.occupied=state.occupied.filter(o=>!near(o.freq,a.frequency));
    renderOccupied();calculate();capture();renderAssignments();renderField();schedule();toast((a.channel||"Canal")+" eliminado")
  }
  function renderAssignments(){
    const r=region(),b=q("wfAssignments");if(!r||!b)return;
    if(!r.assignments.length){b.innerHTML="<div class=\"wf-empty\">No hay canales asignados en esta locacion.</div>";return}
    b.innerHTML=r.assignments.map(a=>{
      const bx=(a.backups||[]).filter(Boolean), extra=bx.length||a.notes;
      return "<div class=\"wf-assignment\"><div><div class=\"wf-channel\">"+esc(a.channel||"SIN ID")+" <span>"+esc(a.role||"")+"</span></div>"+
        "<div class=\"wf-device\">"+esc(a.deviceName)+(a.digital?" · digital":"")+(a.powerMw?" · "+esc(a.powerMw)+" mW":"")+
        "</div></div><div class=\"wf-frequency\">"+fmt(a.frequency)+"<small>MHz</small></div>"+
        "<button type=\"button\" class=\"secondary\" onclick=\"CRF_WORKFLOW.removeAssignment('"+esc(a.id)+"')\">Quitar</button>"+
        (extra?"<div class=\"wf-extra\">"+(bx.length?"Backups: "+bx.map(x=>esc(x)+" MHz").join(" · "):"")+(bx.length&&a.notes?" · ":"")+(a.notes?esc(a.notes):"")+"</div>":"")+
        "</div>";
    }).join("");
  }
  function renderField(){
    const r=region(),b=q("fieldAssignments");if(!r||!b)return;
    q("fieldProjectName").textContent=W.project.name;
    q("fieldRegionName").textContent=r.name+(r.location?" · "+r.location:"");
    if(!r.assignments.length){b.innerHTML="<div class=\"field-empty\">No hay canales asignados en esta locacion.</div>";return}
    b.innerHTML=r.assignments.map(a=>{
      const bx=(a.backups||[]).filter(Boolean);
      return "<article class=\"field-row\"><div><div class=\"field-label\">"+esc(a.channel||"SIN ID")+"</div><div class=\"field-sub\">"+
        esc(a.deviceName)+(a.role?" · "+esc(a.role):"")+"</div></div><div class=\"field-freq\">"+fmt(a.frequency)+" <span>MHz</span></div>"+
        "<div class=\"field-backups\">"+(bx.length?"BACKUP · "+bx.map(esc).join(" · "):"")+"</div></article>";
    }).join("");
  }
  function useFreq(f){
    if(typeof addCandidateAsOccupied==="function")addCandidateAsOccupied(f);
    q("wfAssignFreq").value=fmt(f);
    if(q("wfChannel").value.trim())addAssignment(f);else{capture();schedule();toast(fmt(f)+" MHz agregada a ocupadas")}
  }
  function sheet(){
    capture();const r=region(),w=window.open("","_blank");if(!w)return toast("El navegador bloqueo la hoja RF");
    const rows=r.assignments.map(a=>"<tr><td>"+esc(a.channel)+"</td><td>"+esc(a.role)+"</td><td>"+esc(a.deviceName)+"</td><td class=\"m\">"+fmt(a.frequency)+"</td><td>"+(a.powerMw?a.powerMw+" mW":"-")+"</td><td>"+((a.backups||[]).filter(Boolean).map(fmt).join(" · ")||"-")+"</td></tr>").join("");
    w.document.write("<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>CRF · Hoja RF</title><style>body{font:14px Arial;color:#111;padding:25px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:7px;text-align:left}.m{font:15px monospace}.note{margin-top:18px;padding:10px;background:#f2f2f2}</style></head><body><h1>CRF · Hoja de coordinacion RF</h1><p><b>"+esc(W.project.name)+"</b> · "+esc(r.name)+(r.location?" · "+esc(r.location):"")+" · "+esc(W.project.date)+"</p><table><tr><th>Canal</th><th>Funcion</th><th>Dispositivo</th><th>MHz</th><th>Potencia</th><th>Backups</th></tr>"+(rows||"<tr><td colspan=\"6\">Sin canales asignados.</td></tr>")+"</table><p class=\"note\">CRF es un coordinador matematico/heuristico. Esta hoja representa la coordinacion cargada y no sustituye la verificacion del espectro real.</p><script>onload=function(){setTimeout(function(){print()},150)}<\\/script></body></html>");
    w.document.close();
  }
  function exportProject(){
    const b=new Blob([JSON.stringify(payload(),null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");
    a.href=u;a.download=(W.project.name||"crf-rodaje").replace(/[^a-z0-9_-]+/gi,"_")+".crf.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),500);toast("Proyecto exportado");
  }
  function importProject(file){const fr=new FileReader();fr.onload=()=>{try{normProject(JSON.parse(fr.result));loadRegion(region());syncUI();persist();toast("Proyecto cargado")}catch(e){toast("Archivo CRF invalido")}};fr.readAsText(file)}
  function field(){renderField();q("fieldMode").classList.add("show");document.body.classList.add("field-open")}
  function closeField(){q("fieldMode").classList.remove("show");document.body.classList.remove("field-open")}
  function toast(s){const e=q("wfToast");e.textContent=s;e.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove("show"),2200)}
  function bind(){
    let raw=null;try{raw=localStorage.getItem(STORE)}catch(e){}
    let saved=null;try{saved=raw?JSON.parse(raw):null}catch(e){saved=null}
    normProject(saved||{});loadRegion(region());syncUI();
    ["wfProjectName","wfProduction","wfProjectDate","wfProjectNotes"].forEach(id=>q(id).addEventListener("input",schedule));
    ["wfRegionName","wfRegionLocation"].forEach(id=>q(id).addEventListener("input",()=>{const r=region();r.name=q("wfRegionName").value.trim()||"Locacion";r.location=q("wfRegionLocation").value.trim();q("wfRegionSelect").querySelector('option[value="'+r.id+'"]').textContent=r.name;renderField();schedule()}));
    q("wfRegionSelect").addEventListener("change",e=>activate(e.target.value));q("wfNewRegion").onclick=addRegion;q("wfDeleteRegion").onclick=delRegion;
    q("wfSave").onclick=()=>{saveLocal();toast("Proyecto RF guardado")};q("wfExport").onclick=exportProject;q("wfImport").onclick=()=>q("wfFile").click();q("wfFile").onchange=e=>e.target.files[0]&&importProject(e.target.files[0]);
    q("wfSheet").onclick=sheet;q("wfFieldMode").onclick=field;q("fieldClose").onclick=closeField;q("fieldSheet").onclick=sheet;q("wfAssignButton").onclick=()=>addAssignment();q("wfAssignClear").onclick=clearForm;
    q("deviceSelect").addEventListener("change",()=>{syncUI();schedule()});
    q("wfDeviceSelect").addEventListener("change",()=>{q("deviceSelect").value=q("wfDeviceSelect").value;q("deviceSelect").dispatchEvent(new Event("change"));});
    ["rangeMin","rangeMax","rangeMargin"].forEach(id=>q(id).addEventListener("input",()=>{const r=region();r.rangeMin=+q("rangeMin").value||r.rangeMin;r.rangeMax=+q("rangeMax").value||r.rangeMax;r.rangeMargin=+q("rangeMargin").value||2;renderField();schedule()}));
    document.addEventListener("click",()=>setTimeout(()=>{capture();schedule();renderAssignments();renderField()},0));
    window.addEventListener("beforeunload",()=>{try{persist()}catch(e){}});
  }
  window.CRF_WORKFLOW={removeAssignment,useFrequency:useFreq,openField:field,closeField,save:()=>{saveLocal();toast("Proyecto RF guardado")},downloadProject:exportProject,rfSheet:sheet};
  (async()=>{for(let i=0;i<100;i++){if(Object.keys(state.devices||{}).length){bind();return}await new Promise(r=>setTimeout(r,20))}if(q("wfProjectName"))bind()})();
})();