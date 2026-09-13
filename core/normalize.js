export function normalizeEmail(value = "") {
  return value.trim().replace(/^mailto:/i, "").split(/[?#]/)[0].toLowerCase();
}

export function normalizePhone(value = "", defaultCountry = "ES") {
  const raw = value.trim().replace(/^tel:/i, "");
  let digits = raw.replace(/[^0-9+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+") && defaultCountry === "ES") {
    const n = digits.replace(/\D/g, "");
    if (n.length === 9) digits = `+34${n}`;
  }
  return digits;
}

export function normalizeUrl(value = "", base) {
  try {
    const url = new URL(value, base);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

export function registrableHost(host = "") {
  return host.toLowerCase().replace(/^www\./, "");
}

export function stableId(type, normalized, source = "") {
  const input = `${type}|${normalized}|${source}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${type}-${(hash >>> 0).toString(16)}`;
}
