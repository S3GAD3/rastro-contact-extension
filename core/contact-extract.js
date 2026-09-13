import { buildEntity } from "./entities.js";

const EMAIL_RX = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/gi;
const EMAIL_HINT_RX = /(?:\[at\]|\(at\)|\sat\s|\{at\}|\[arroba\]|\(arroba\)|\sarroba\s)/gi;
const DOT_HINT_RX = /(?:\[dot\]|\(dot\)|\sdot\s|\{dot\}|\[punto\]|\(punto\)|\spunto\s)/gi;
const PHONE_CANDIDATE_RX = /(?<![\w@])(?:\+|00)?\d[\d\s().\-/]{6,22}\d(?![\w@])/g;
const PHONE_HINT = /\b(?:tel(?:e?f(?:ono)?)?|phone|mobile|m[oó]vil|whatsapp|wa|fax|contacto|contact|call|llama(?:r)?|atenci[oó]n al cliente)\b/i;
const BAD_PHONE_CONTEXT = /\b(?:iban|bic|swift|vat|cif|nif|dni|isbn|ean|sku|pedido|order|factura|invoice|postal|cp\.?|zip|timestamp|fecha|date|id|ref(?:erencia)?|cookie|analytics|pixel|version|versi[oó]n|width|height|precio|price|importe|amount)\b/i;

export function decodeHtmlEntities(text = "") {
  return text
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);?/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

export function deobfuscateEmails(text = "") {
  return decodeHtmlEntities(text)
    .replace(EMAIL_HINT_RX, "@")
    .replace(DOT_HINT_RX, ".")
    .replace(/\s*@\s*/g, "@")
    .replace(/\s*\.\s*/g, ".");
}

export function validEmail(value = "") {
  const v = value.trim().replace(/[),.;:]+$/, "");
  if (!v || v.length > 254 || /\.\./.test(v)) return false;
  const [local, domain, ...rest] = v.split("@");
  if (!local || !domain || rest.length || local.length > 64) return false;
  if (!domain.includes(".") || /^[-.]|[-.]$/.test(domain)) return false;
  if (/\.(?:png|jpe?g|gif|svg|webp|css|js|woff2?|ttf|ico)$/i.test(domain)) return false;
  if (/^(?:example|test|email|name|user|usuario|correo)@/i.test(v)) return false;
  return true;
}

export function extractEmailsFromText(text = "") {
  const normalized = deobfuscateEmails(text);
  const set = new Set();
  for (const hit of normalized.match(EMAIL_RX) || []) {
    const clean = hit.replace(/[),.;:]+$/, "");
    if (validEmail(clean)) set.add(clean.toLowerCase());
  }
  return [...set];
}

export function decodeCloudflareEmail(encoded = "") {
  if (!/^[0-9a-f]+$/i.test(encoded) || encoded.length < 4 || encoded.length % 2) return "";
  try {
    const key = parseInt(encoded.slice(0, 2), 16);
    let out = "";
    for (let i = 2; i < encoded.length; i += 2) out += String.fromCharCode(parseInt(encoded.slice(i, i + 2), 16) ^ key);
    return validEmail(out) ? out.toLowerCase() : "";
  } catch { return ""; }
}

function onlyDigits(value) { return String(value || "").replace(/\D/g, ""); }

export function assessPhoneCandidate(raw, context = "", {defaultCountry = "ES", explicit = false} = {}) {
  let value = String(raw || "").trim().replace(/^tel:/i, "").split(/[?;]/)[0].trim();
  if (!value) return null;
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value)) return null;
  const digits = onlyDigits(value);
  if (digits.length < 8 || digits.length > 15) return null;
  if (/^(\d)\1{7,}$/.test(digits)) return null;
  if (/^(?:19|20)\d{6,}$/.test(digits) && !explicit) return null; // fechas/timestamps frecuentes

  let normalized = value.replace(/[^0-9+]/g, "");
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  const localDigits = onlyDigits(normalized);
  let country = "";
  let type = "possible";
  let score = explicit ? 0.98 : 0.45;

  if (defaultCountry === "ES") {
    let es = localDigits;
    if (es.startsWith("34") && es.length === 11) es = es.slice(2);
    if (es.length === 9 && /^[6789]/.test(es)) {
      normalized = `+34${es}`;
      country = "ES";
      type = /^[67]/.test(es) ? "mobile" : "fixed_or_service";
      score = Math.max(score, explicit ? 0.99 : 0.72);
    } else if (!normalized.startsWith("+") && !explicit) {
      return null; // en webs españolas, secuencias locales no telefónicas son demasiado comunes
    }
  }

  if (normalized.startsWith("+") && localDigits.length >= 8 && localDigits.length <= 15) {
    score = Math.max(score, explicit ? 0.99 : 0.66);
  }

  const compactContext = String(context || "").replace(/\s+/g, " ").slice(0, 300);
  if (PHONE_HINT.test(compactContext)) score += 0.18;
  if (BAD_PHONE_CONTEXT.test(compactContext)) score -= 0.3;
  if (/\b(?:tel:|telefono|teléfono|phone|mobile|móvil|whatsapp)\b/i.test(compactContext)) score += 0.08;
  if (/\d{5,}/.test(value.replace(/[\s().+-]/g, "")) && /[-/]\d/.test(value) && !explicit) score -= 0.12;
  score = Math.max(0, Math.min(1, score));
  if (!explicit && score < 0.62) return null;

  return {raw: value, normalized, confidence: score, country, phoneType: type};
}

export function extractPhonesFromText(text = "", options = {}) {
  const clean = decodeHtmlEntities(String(text || ""));
  const out = new Map();
  for (const match of clean.matchAll(PHONE_CANDIDATE_RX)) {
    const raw = match[0];
    const start = Math.max(0, match.index - 80);
    const end = Math.min(clean.length, match.index + raw.length + 80);
    const context = clean.slice(start, end);
    const assessed = assessPhoneCandidate(raw, context, options);
    if (!assessed) continue;
    const prev = out.get(assessed.normalized);
    if (!prev || assessed.confidence > prev.confidence) out.set(assessed.normalized, {...assessed, context});
  }
  return [...out.values()];
}

export function extractEntitiesFromHtml(html, source, {sourceType = "current", timestamp = null, defaultCountry = "ES"} = {}) {
  const entities = [];
  const raw = String(html || "");
  const withoutNoise = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  const text = decodeHtmlEntities(withoutNoise.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

  // mailto tiene máxima confianza
  for (const m of raw.matchAll(/href\s*=\s*["']mailto:([^"'#?]+)(?:\?[^"']*)?["']/gi)) {
    for (const email of extractEmailsFromText(decodeURIComponentSafe(m[1]))) {
      entities.push(buildEntity({type:"email", value:email, source, sourceType, context: contextAround(text,email), confidence:.99, meta:{timestamp, extraction:"mailto"}}));
    }
  }
  // cfemail
  for (const m of raw.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) {
    const email = decodeCloudflareEmail(m[1]);
    if (email) entities.push(buildEntity({type:"email", value:email, source, sourceType, confidence:.98, meta:{timestamp, extraction:"cloudflare"}}));
  }
  for (const email of extractEmailsFromText(raw)) {
    entities.push(buildEntity({type:"email", value:email, source, sourceType, context: contextAround(deobfuscateEmails(text), email), confidence:.88, meta:{timestamp, extraction:"html"}}));
  }

  // JSON-LD / Schema.org: fuente de alta confianza para teléfono y correo.
  for (const block of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(decodeHtmlEntities(block[1]));
      const stack = [data];
      while (stack.length) {
        const item = stack.pop();
        if (Array.isArray(item)) { stack.push(...item); continue; }
        if (!item || typeof item !== "object") continue;
        for (const [key, val] of Object.entries(item)) {
          if (/^email$/i.test(key) && typeof val === "string") {
            for (const email of extractEmailsFromText(val)) entities.push(buildEntity({type:"email", value:email, source, sourceType, confidence:.99, meta:{timestamp, extraction:"jsonld"}}));
          }
          if (/^(telephone|phone|faxNumber)$/i.test(key) && typeof val === "string") {
            const assessed = assessPhoneCandidate(val, key, {defaultCountry, explicit:true});
            if (assessed) entities.push(buildEntity({type:"phone", value:assessed.normalized, source, sourceType, confidence:assessed.confidence, meta:{timestamp, extraction:"jsonld", country:assessed.country, phoneType:assessed.phoneType}}));
          }
          if (val && typeof val === "object") stack.push(val);
        }
      }
    } catch {}
  }

  // tel: explícitos
  for (const m of raw.matchAll(/href\s*=\s*["']tel:([^"'#?]+)(?:\?[^"']*)?["']/gi)) {
    const assessed = assessPhoneCandidate(decodeURIComponentSafe(m[1]), "tel:", {defaultCountry, explicit:true});
    if (assessed) entities.push(buildEntity({type:"phone", value:assessed.normalized, source, sourceType, confidence:assessed.confidence, meta:{timestamp, extraction:"tel", country:assessed.country, phoneType:assessed.phoneType}}));
  }
  for (const p of extractPhonesFromText(text, {defaultCountry})) {
    entities.push(buildEntity({type:"phone", value:p.normalized, source, sourceType, context:p.context, confidence:p.confidence, meta:{timestamp, extraction:"text", country:p.country, phoneType:p.phoneType}}));
  }
  return entities;
}

function contextAround(text, needle) {
  const hay = String(text || "");
  const n = String(needle || "");
  const i = hay.toLowerCase().indexOf(n.toLowerCase());
  if (i < 0) return "";
  return hay.slice(Math.max(0, i - 110), Math.min(hay.length, i + n.length + 110));
}

function decodeURIComponentSafe(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}
