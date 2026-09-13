import { fetchCdx } from "../historical/cdx.js";
import { selectSnapshots } from "../historical/selector.js";
import { extractFromHtml } from "../historical/extract.js";
import { mergeEntities } from "../core/entities.js";
import { extractEntitiesFromHtml } from "../core/contact-extract.js";

const controllers = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse).catch(err => sendResponse({ok: false, error: err.message || String(err)}));
  return true;
});

async function handle(message) {
  switch (message.type) {
    case "GET_ACTIVE_TAB": {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      return {ok: true, tab: tab ? {id: tab.id, url: tab.url, title: tab.title} : null};
    }
    case "SCAN_TAB":
      return scanTab(message.tabId);
    case "START_HISTORICAL":
      return runHistorical(message.domain, message.caseId, message.options || {});
    case "CANCEL_CASE": {
      controllers.get(message.caseId)?.abort();
      controllers.delete(message.caseId);
      return {ok: true};
    }
    case "FETCH_INTERNAL":
      return fetchInternalPages(message.urls || []);
    case "SAVE_CASE":
      await chrome.storage.local.set({[`case:${message.caseData.id}`]: message.caseData});
      return {ok: true};
    case "LOAD_CASE": {
      const key = `case:${message.caseId}`;
      const result = await chrome.storage.local.get(key);
      return {ok: true, caseData: result[key] || null};
    }
    default:
      return {ok: false, error: "Mensaje desconocido"};
  }
}

async function scanTab(tabId) {
  const result = await chrome.scripting.executeScript({target: {tabId}, func: pageScanner});
  return {ok: true, data: result?.[0]?.result || null};
}

async function fetchInternalPages(urls) {
  const out = [];
  for (const url of urls.slice(0, 12)) {
    try {
      const res = await fetch(url, {credentials: "omit", redirect: "follow", cache: "no-store"});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        throw new Error(`Contenido no HTML (${contentType})`);
      }
      const contentLength = Number(res.headers.get("content-length") || 0);
      if (contentLength > 3_000_000) throw new Error("Página demasiado grande para análisis automático");
      const html = (await res.text()).slice(0, 3_000_000);
      out.push({url, ok: true, html});
    } catch (e) {
      out.push({url, ok: false, error: e.message || String(e)});
    }
  }
  return {ok: true, pages: out};
}

async function runHistorical(domain, caseId, options) {
  controllers.get(caseId)?.abort();
  const controller = new AbortController();
  controllers.set(caseId, controller);

  try {
    const rows = await fetchCdx(domain, {signal: controller.signal, limit: options.cdxLimit || 1200});
    const selected = selectSnapshots(rows, options.maxSnapshots || 36);
    const entities = [];
    let completed = 0;

    for (const snap of selected) {
      if (controller.signal.aborted) throw new Error("Investigación cancelada");
      const archived = `https://web.archive.org/web/${snap.timestamp}id_/${snap.original}`;
      try {
        const res = await fetchWithRetry(archived, controller.signal, 2);
        const contentType = (res.headers.get("content-type") || "").toLowerCase();
        if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
          throw new Error(`Snapshot no HTML (${contentType})`);
        }
        const contentLength = Number(res.headers.get("content-length") || 0);
        if (contentLength > 3_000_000) throw new Error("Snapshot demasiado grande para análisis automático");
        const html = (await res.text()).slice(0, 3_000_000);
        entities.push(...extractFromHtml(html, archived, snap.timestamp));
      } catch (e) {
        if (controller.signal.aborted) throw e;
      }
      completed += 1;
      chrome.runtime.sendMessage({type: "HISTORICAL_PROGRESS", caseId, completed, total: selected.length}).catch(() => {});
      await sleep(450);
    }

    return {ok: true, snapshotsFound: rows.length, snapshotsAnalyzed: selected.length, entities: mergeEntities(entities)};
  } finally {
    if (controllers.get(caseId) === controller) controllers.delete(caseId);
  }
}

async function fetchWithRetry(url, signal, retries) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {signal, cache: "no-store"});
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      last = e;
      if (attempt >= retries) break;
      await sleep(700 * (2 ** attempt));
    }
  }
  throw last;
}

function pageScanner() {
  const SOCIAL_HOSTS = ["linkedin.com", "instagram.com", "facebook.com", "x.com", "twitter.com", "t.me", "telegram.me", "github.com", "youtube.com", "tiktok.com", "wa.me", "discord.gg", "discord.com"];
  const PRIORITY = [/(contact|contacto)/i, /(aviso-legal|legal|impressum)/i, /(about|quienes-somos|empresa|team|equipo)/i, /(privacy|privacidad|terms|terminos)/i, /(support|soporte|help|ayuda)/i];
  const EMAIL_RX = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi;
  const PHONE_RX = /(?<![\w@])(?:\+|00)?\d[\d\s().\-/]{6,22}\d(?![\w@])/g;
  const PHONE_HINT = /\b(?:tel(?:e?f(?:ono)?)?|phone|mobile|m[oó]vil|whatsapp|fax|contacto|contact|call|llama(?:r)?|atenci[oó]n al cliente)\b/i;
  const BAD_PHONE = /\b(?:iban|bic|swift|vat|cif|nif|dni|isbn|ean|sku|pedido|order|factura|invoice|postal|cp\.?|zip|timestamp|fecha|date|id|ref(?:erencia)?|cookie|analytics|pixel|version|versi[oó]n|width|height|precio|price|importe|amount)\b/i;

  const decodeEntities = (text="") => text
    .replace(/&#x([0-9a-f]+);?/gi, (_,h)=>String.fromCodePoint(parseInt(h,16)))
    .replace(/&#([0-9]+);?/g, (_,d)=>String.fromCodePoint(parseInt(d,10)))
    .replace(/&commat;/gi,"@").replace(/&period;/gi,".").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&");
  const deobfuscate = (text="") => decodeEntities(text)
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\[arroba\]|\(arroba\)|\sarroba\s|\sat\s)\s*/gi,"@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[punto\]|\(punto\)|\spunto\s|\sdot\s)\s*/gi,".")
    .replace(/\\u0040/gi,"@").replace(/\\x40/gi,"@").replace(/\\u002e/gi,".").replace(/\\x2e/gi,".")
    .replace(/\s*@\s*/g,"@").replace(/\s*\.\s*/g,".");
  const validEmail = (v="") => {
    v=v.trim().replace(/[),.;:]+$/,'');
    if(!v||v.length>254||/\.\./.test(v)) return false;
    const parts=v.split('@'); if(parts.length!==2||!parts[0]||!parts[1]||parts[0].length>64||!parts[1].includes('.')) return false;
    if(/\.(?:png|jpe?g|gif|svg|webp|css|js|woff2?|ttf|ico)$/i.test(parts[1])) return false;
    if(/^(?:example|test|email|name|user|usuario|correo)@/i.test(v)) return false;
    return true;
  };
  const addEmails = (set, text="") => {
    const normalized=deobfuscate(text);
    for(const hit of normalized.match(EMAIL_RX)||[]){ const v=hit.replace(/[),.;:]+$/,'').toLowerCase(); if(validEmail(v)) set.add(v); }
  };
  const cfDecode = enc => {
    if(!/^[0-9a-f]+$/i.test(enc||'')||enc.length<4||enc.length%2) return '';
    try{const key=parseInt(enc.slice(0,2),16);let out='';for(let i=2;i<enc.length;i+=2)out+=String.fromCharCode(parseInt(enc.slice(i,i+2),16)^key);return validEmail(out)?out.toLowerCase():'';}catch{return '';}
  };
  const digits = v => String(v||'').replace(/\D/g,'');
  const assessPhone = (raw, context='', explicit=false) => {
    let value=String(raw||'').trim().replace(/^tel:/i,'').split(/[?;]/)[0].trim();
    if(!value||/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value)) return null;
    let ds=digits(value); if(ds.length<8||ds.length>15||/^(\d)\1{7,}$/.test(ds)) return null;
    if(/^(?:19|20)\d{6,}$/.test(ds)&&!explicit) return null;
    let normalized=value.replace(/[^0-9+]/g,''); if(normalized.startsWith('00')) normalized='+'+normalized.slice(2); ds=digits(normalized);
    let confidence=explicit?.99:.45, country='', phoneType='possible';
    let es=ds; if(es.startsWith('34')&&es.length===11) es=es.slice(2);
    if(es.length===9&&/^[6789]/.test(es)){normalized='+34'+es;country='ES';phoneType=/^[67]/.test(es)?'mobile':'fixed_or_service';confidence=Math.max(confidence,explicit?.99:.72);}
    else if(normalized.startsWith('+')&&ds.length>=8&&ds.length<=15){confidence=Math.max(confidence,explicit?.99:.66);}
    else if(!explicit){return null;}
    const c=String(context||'').replace(/\s+/g,' ').slice(0,300);
    if(PHONE_HINT.test(c)) confidence+=.18;
    if(BAD_PHONE.test(c)) confidence-=.30;
    confidence=Math.max(0,Math.min(1,confidence));
    if(!explicit&&confidence<.62) return null;
    return {raw:value,normalized,confidence,country,phoneType,context:c};
  };

  const bodyText = document.body?.innerText || "";
  const html = document.documentElement?.innerHTML || "";
  const emails = new Set();
  const phones = new Map();
  addEmails(emails, bodyText); addEmails(emails, html);

  // Examine attributes and data fields too; many themes hide contacts outside visible text.
  for (const el of document.querySelectorAll('[href],[data-email],[data-mail],[data-contact],[content],[value]')) {
    for (const attr of ['href','data-email','data-mail','data-contact','content','value']) {
      const v=el.getAttribute?.(attr); if(v) addEmails(emails,v);
    }
  }

  const links = [...document.querySelectorAll("a[href]")].map(a => ({href: a.href, rawHref:a.getAttribute('href')||'', text: (a.innerText || a.getAttribute("aria-label") || a.getAttribute('title') || "").trim().slice(0, 160)}));
  for(const x of links.filter(x=>/^mailto:/i.test(x.rawHref))){
    let val=x.rawHref.replace(/^mailto:/i,'').split('?')[0]; try{val=decodeURIComponent(val)}catch{}
    addEmails(emails,val);
  }

  for (const el of document.querySelectorAll("[data-cfemail]")) {
    const out=cfDecode(el.getAttribute("data-cfemail")); if(out) emails.add(out);
  }

  // High-confidence phone sources first.
  for(const x of links.filter(x=>/^tel:/i.test(x.rawHref))){
    let val=x.rawHref.replace(/^tel:/i,''); try{val=decodeURIComponent(val)}catch{}
    const p=assessPhone(val,`tel: ${x.text}`,true); if(p) phones.set(p.normalized,p);
  }
  // Structured data is usually reliable.
  for(const s of document.querySelectorAll('script[type="application/ld+json"]')){
    const raw=s.textContent||''; addEmails(emails,raw);
    try{
      const data=JSON.parse(raw); const stack=[data];
      while(stack.length){const v=stack.pop();if(Array.isArray(v)){stack.push(...v);continue;}if(!v||typeof v!=='object')continue;for(const [k,val] of Object.entries(v)){if(/^(telephone|phone|faxNumber)$/i.test(k)&&typeof val==='string'){const p=assessPhone(val,k,true);if(p)phones.set(p.normalized,p);} if(/^(email)$/i.test(k)&&typeof val==='string')addEmails(emails,val); if(val&&typeof val==='object')stack.push(val);}}
    }catch{}
  }
  // Visible-text candidates require contextual evidence and strict ES/international validation.
  for(const m of bodyText.matchAll(PHONE_RX)){
    const raw=m[0], start=Math.max(0,m.index-90), end=Math.min(bodyText.length,m.index+raw.length+90), ctx=bodyText.slice(start,end);
    const p=assessPhone(raw,ctx,false); if(p){const prev=phones.get(p.normalized);if(!prev||p.confidence>prev.confidence)phones.set(p.normalized,p);}
  }

  const social = links.filter(x => { try { return SOCIAL_HOSTS.some(h => new URL(x.href).hostname.toLowerCase().endsWith(h)); } catch { return false; } });
  const internal = links.filter(x => { try { return new URL(x.href).origin === location.origin; } catch { return false; } });
  const interesting = internal.map(x => ({...x, score: PRIORITY.reduce((s, rx, i) => rx.test(`${x.href} ${x.text}`) ? Math.max(s, 100 - i * 10) : s, 0)})).filter(x => x.score > 0).sort((a,b) => b.score - a.score);
  const uniqueInteresting = [...new Map(interesting.map(x => [x.href.split("#")[0], x])).values()].slice(0, 20);
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).filter(Boolean).slice(0, 20);
  const meta = [...document.querySelectorAll("meta[name], meta[property]")].map(m => ({name: m.getAttribute("name") || m.getAttribute("property"), content: m.getAttribute("content") || ""})).filter(x => x.content).slice(0, 100);

  return {
    url: location.href,
    origin: location.origin,
    host: location.hostname.replace(/^www\./, ""),
    title: document.title,
    emails: [...emails],
    phones: [...phones.values()],
    social,
    interesting: uniqueInteresting,
    jsonLd,
    meta,
    scannedAt: new Date().toISOString()
  };
}
