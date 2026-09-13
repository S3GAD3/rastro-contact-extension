import { normalizeEmail, normalizePhone, stableId } from "./normalize.js";

export function buildEntity({type, value, source, sourceType = "current", context = "", confidence = 0.8, meta = {}}) {
  let normalized = value?.trim?.() || "";
  if (type === "email") normalized = normalizeEmail(value);
  if (type === "phone") normalized = normalizePhone(value);
  return {
    id: stableId(type, normalized, source),
    type,
    raw: value,
    normalized,
    source,
    sourceType,
    context: context.replace(/\s+/g, " ").trim().slice(0, 260),
    confidence,
    meta,
    firstSeen: meta.timestamp || null,
    lastSeen: meta.timestamp || null,
    observations: 1
  };
}

export function mergeEntities(items = []) {
  const map = new Map();
  for (const item of items) {
    if (!item?.normalized) continue;
    const key = `${item.type}|${item.normalized}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {...item, sources: [item.source].filter(Boolean)});
      continue;
    }
    prev.observations += item.observations || 1;
    prev.confidence = Math.max(prev.confidence, item.confidence || 0);
    if (item.source && !prev.sources.includes(item.source)) prev.sources.push(item.source);
    if (item.firstSeen && (!prev.firstSeen || item.firstSeen < prev.firstSeen)) prev.firstSeen = item.firstSeen;
    if (item.lastSeen && (!prev.lastSeen || item.lastSeen > prev.lastSeen)) prev.lastSeen = item.lastSeen;
    if (item.sourceType === "current") prev.sourceType = prev.sourceType === "historical" ? "persistent" : "current";
    if (prev.sourceType === "current" && item.sourceType === "historical") prev.sourceType = "persistent";
    if (!prev.context && item.context) prev.context = item.context;
  }
  return [...map.values()];
}
