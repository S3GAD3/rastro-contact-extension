const PRIORITY = [
  [/(contact|contacto|kontakt|contatti)/i, 100],
  [/(aviso-legal|legal|impressum|terms|terminos)/i, 95],
  [/(about|quienes-somos|empresa|company|equipo|team)/i, 85],
  [/(privacy|privacidad)/i, 70],
  [/(support|soporte|help|ayuda)/i, 70]
];

function scoreUrl(url) {
  let score = 10;
  for (const [rx, value] of PRIORITY) if (rx.test(url)) score = Math.max(score, value);
  return score;
}

export function selectSnapshots(rows, max = 48) {
  const enriched = rows.map(r => ({...r, score: scoreUrl(r.original)}));
  enriched.sort((a, b) => b.score - a.score || a.timestamp.localeCompare(b.timestamp));

  const seenBucket = new Set();
  const selected = [];
  for (const item of enriched) {
    const year = item.timestamp.slice(0, 4);
    const month = item.timestamp.slice(4, 6);
    const quarter = Math.ceil(Number(month || 1) / 3);
    const path = (() => { try { return new URL(item.original).pathname.toLowerCase(); } catch { return item.original; } })();
    const kind = scoreUrl(path) >= 90 ? path.split("/").filter(Boolean).slice(0, 1).join("") || "root" : "general";
    const key = `${year}-Q${quarter}|${kind}`;
    if (seenBucket.has(key) && item.score < 90) continue;
    seenBucket.add(key);
    selected.push(item);
    if (selected.length >= max) break;
  }
  return selected.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
