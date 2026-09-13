import { buildEntity, mergeEntities } from "../core/entities.js";
import { pivotLinks } from "../core/pivots.js";
import { extractEntitiesFromHtml } from "../core/contact-extract.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const send = msg => chrome.runtime.sendMessage(msg);
let state = {id: `case-${Date.now()}`, current: null, historical: [], currentEntities: [], allEntities: [], snapshotsFound: 0, snapshotsAnalyzed: 0, running: false, createdAt: new Date().toISOString()};

init();
async function init() {
  const pending = (await chrome.storage.session.get("pendingCase")).pendingCase;
  if (pending) { state = {...state, ...pending}; await chrome.storage.session.remove("pendingCase"); processCurrent(); }
  bind();
  render();
}

function bind() {
  $$(".nav").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("#scanCurrent").addEventListener("click", scanCurrentTab);
  $("#runHistorical").addEventListener("click", runHistorical);
  $("#cancel").addEventListener("click", cancelCase);
  $("#scanInternal").addEventListener("click", scanInternal);
  $("#saveCase").addEventListener("click", saveCase);
  $("#exportJson").addEventListener("click", exportJson);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#newCase").addEventListener("click", newCase);
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "HISTORICAL_PROGRESS" && msg.caseId === state.id) setProgress(msg.completed, msg.total, "Analizando snapshots históricos…");
  });
}

async function scanCurrentTab() {
  const active = await send({type: "GET_ACTIVE_TAB"});
  if (!active.tab?.id || !/^https?:/i.test(active.tab.url || "")) return alert("Abre primero una página web http/https.");
  const res = await send({type: "SCAN_TAB", tabId: active.tab.id});
  if (!res.ok) return alert(res.error);
  state.current = res.data;
  processCurrent(); render();
}

function processCurrent() {
  if (!state.current) return;
  const src = state.current.url;
  const entities = [];
  for (const email of state.current.emails || []) entities.push(buildEntity({type: "email", value: email, source: src, confidence: 0.96}));
  for (const phone of state.current.phones || []) {
    const value = typeof phone === "string" ? phone : (phone.normalized || phone.raw || "");
    const confidence = typeof phone === "string" ? 0.78 : (phone.confidence || 0.78);
    if (value) entities.push(buildEntity({type: "phone", value, source: src, confidence, context: phone.context || "", meta: {country: phone.country || "", phoneType: phone.phoneType || "", extraction: phone.extraction || "dom"}}));
  }
  for (const item of state.current.social || []) {
    let host = "social"; try { host = new URL(item.href).hostname.replace(/^www\./, ""); } catch {}
    entities.push(buildEntity({type: "username", value: item.href, source: src, context: item.text || host, confidence: 0.9, meta: {platform: host}}));
  }
  state.currentEntities = mergeEntities(entities);
  correlate();
}

function correlate() { state.allEntities = mergeEntities([...state.currentEntities, ...state.historical]); }

async function runHistorical() {
  if (!state.current?.host) return alert("Analiza primero una página.");
  state.running = true;
  toggleRunning(true);
  setProgress(0, 1, "Consultando índice CDX…");
  try {
    const res = await send({type: "START_HISTORICAL", domain: state.current.host, caseId: state.id, options: {maxSnapshots: 36, cdxLimit: 1200}});
    if (!res?.ok) {
      if (res?.error !== "Investigación cancelada") alert(res?.error || "Error durante el análisis histórico.");
      return;
    }
    state.historical = res.entities || [];
    state.snapshotsFound = res.snapshotsFound || 0;
    state.snapshotsAnalyzed = res.snapshotsAnalyzed || 0;
    correlate();
    render();
    showView("historical");
  } finally {
    state.running = false;
    toggleRunning(false);
    hideProgress();
  }
}

async function scanInternal() {
  const checked = $$("#interesting input:checked").map(i => i.value).slice(0, 12);
  if (!checked.length) return;
  const origins = [...new Set(checked.map(u => `${new URL(u).origin}/*`))];
  const granted = await chrome.permissions.request({origins});
  if (!granted) return alert("No se concedió acceso al sitio.");
  setProgress(0, checked.length, "Analizando páginas internas…");
  const res = await send({type: "FETCH_INTERNAL", urls: checked});
  if (!res?.ok) { hideProgress(); return alert(res?.error || "No se pudieron analizar las páginas internas."); }
  const extra = [];
  let n = 0;
  for (const page of res.pages || []) {
    n += 1; setProgress(n, checked.length, "Analizando páginas internas…");
    if (!page.ok) continue;
    extra.push(...extractEntitiesFromHtml(page.html, page.url, {sourceType:"current", defaultCountry:"ES"}));
  }
  state.currentEntities = mergeEntities([...state.currentEntities, ...extra]); correlate(); hideProgress(); render();
}

async function cancelCase() { await send({type:"CANCEL_CASE", caseId:state.id}); state.running=false; toggleRunning(false); hideProgress(); }
async function saveCase() { await send({type:"SAVE_CASE", caseData:{...state, running:false}}); $("#caseStatus").textContent="Caso guardado localmente"; }
function newCase(){ if(state.running) cancelCase(); state={id:`case-${Date.now()}`,current:null,historical:[],currentEntities:[],allEntities:[],snapshotsFound:0,snapshotsAnalyzed:0,running:false,createdAt:new Date().toISOString()}; render(); showView("summary"); }

function render() {
  $("#domain").textContent = state.current?.host || "—";
  $("#title").textContent = state.current?.title || "RASTRO-CONTACT";
  $("#url").textContent = state.current?.url || "—"; $("#url").href = state.current?.url || "#";
  $("#caseStatus").textContent = state.current ? `Caso ${state.id}` : "Sin investigación";
  $("#mEmails").textContent = state.allEntities.filter(e=>e.type==="email").length;
  $("#mPhones").textContent = state.allEntities.filter(e=>e.type==="phone").length;
  $("#mSocial").textContent = state.currentEntities.filter(e=>e.type==="username").length;
  $("#mHistorical").textContent = state.allEntities.filter(e=>e.sourceType==="historical"||e.sourceType==="persistent").length;
  $("#snapshotBadge").textContent = state.snapshotsAnalyzed ? `${state.snapshotsAnalyzed}/${state.snapshotsFound} SNAPSHOTS` : "WAYBACK";
  renderEntities("#priority", state.allEntities.slice(0, 12));
  renderEntities("#currentResults", state.currentEntities);
  renderEntities("#historicalResults", state.allEntities.filter(e=>e.sourceType==="historical"||e.sourceType==="persistent"));
  renderInteresting(); renderTimeline();
  $("#sources").textContent = JSON.stringify({metadata: state.current?.meta || [], jsonLd: state.current?.jsonLd || [], snapshotsFound: state.snapshotsFound, snapshotsAnalyzed: state.snapshotsAnalyzed}, null, 2);
}

function renderEntities(selector, entities) {
  const el = $(selector); if (!entities.length) { el.innerHTML='<div class="empty">No hay resultados.</div>'; return; }
  el.innerHTML = entities.map(e => {
    const pivots = pivotLinks(e).slice(0,3).map(p=>`<a class="pivot" href="${esc(p.url)}" target="_blank" rel="noreferrer">${esc(p.label)}</a>`).join("");
    return `<div class="entity"><div class="entity-main"><strong>${esc(e.normalized||e.raw)}</strong><small>${esc(e.context||e.sources?.[0]||e.source||"")}</small></div><div class="entity-meta"><span class="chip ${e.sourceType}">${esc(e.sourceType)}</span><span class="chip">${Math.round((e.confidence||0)*100)}%</span>${pivots}</div></div>`;
  }).join("");
}

function renderInteresting(){ const el=$("#interesting"); const items=state.current?.interesting||[]; if(!items.length){el.innerHTML='<div class="empty">Sin páginas detectadas.</div>';return;} el.innerHTML=items.map((x,i)=>`<div class="checkrow"><input type="checkbox" id="u${i}" value="${esc(x.href)}" ${i<6?'checked':''}><label for="u${i}"><strong>${esc(x.text||new URL(x.href).pathname)}</strong><small>${esc(x.href)}</small></label></div>`).join(""); }
function renderTimeline(){ const el=$("#timeline"); const dated=state.allEntities.filter(e=>e.firstSeen||e.lastSeen); if(!dated.length){el.innerHTML='<div class="empty">Ejecuta el análisis histórico para construir la cronología.</div>';return;} const years=dated.flatMap(e=>[e.firstSeen,e.lastSeen]).filter(Boolean).map(t=>Number(String(t).slice(0,4))).filter(Boolean); const min=Math.min(...years),max=Math.max(...years); el.innerHTML=dated.map(e=>{const a=Number(String(e.firstSeen||e.lastSeen).slice(0,4)),b=Number(String(e.lastSeen||e.firstSeen).slice(0,4));const span=Math.max(1,max-min+1);const left=((a-min)/span)*100,width=Math.max(3,((b-a+1)/span)*100);return `<div class="timeline-row"><strong>${esc(e.normalized)}</strong><div class="timeline-bar"><i style="left:${left}%;width:${width}%"></i></div><small>${a}${b!==a?` — ${b}`:""}</small></div>`}).join(""); }
function showView(name){$$(".nav").forEach(b=>b.classList.toggle("active",b.dataset.view===name));$$(".view").forEach(v=>v.classList.add("hidden"));$(`#view-${name}`).classList.remove("hidden");}
function setProgress(done,total,text){$("#progressWrap").classList.remove("hidden");$("#progressText").textContent=text;$("#progressCount").textContent=`${done}/${total}`;$("#progressBar").style.width=`${total?Math.min(100,(done/total)*100):0}%`;}
function hideProgress(){$("#progressWrap").classList.add("hidden");}
function toggleRunning(v){$("#cancel").disabled=!v;$("#runHistorical").disabled=v;}
function exportJson(){download(`rastro-contact-${state.current?.host||"caso"}.json`,JSON.stringify({...state,running:false},null,2),"application/json");}
function exportCsv(){const rows=[["tipo","valor","estado","confianza","primera_aparicion","ultima_aparicion","fuentes"],...state.allEntities.map(e=>[e.type,e.normalized,e.sourceType,e.confidence,e.firstSeen||"",e.lastSeen||"",(e.sources||[e.source]).join(" | ")])];download(`rastro-contact-${state.current?.host||"caso"}.csv`,rows.map(r=>r.map(csvCell).join(",")).join("\n"),"text/csv");}
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);chrome.downloads.download({url,filename:name,saveAs:true}).finally(()=>setTimeout(()=>URL.revokeObjectURL(url),5000));}
function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
function esc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
