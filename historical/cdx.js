const CDX = "https://web.archive.org/cdx/search/cdx";

export async function fetchCdx(domain, {signal, limit = 1200} = {}) {
  const url = new URL(CDX);
  url.searchParams.set("url", `${domain}/*`);
  url.searchParams.set("output", "json");
  url.searchParams.set("fl", "timestamp,original,statuscode,mimetype,digest");
  url.searchParams.append("filter", "statuscode:200");
  url.searchParams.append("filter", "mimetype:text/html");
  url.searchParams.set("collapse", "digest");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, {signal, cache: "no-store"});
  if (!res.ok) throw new Error(`CDX respondió ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length < 2) return [];
  const [headers, ...rows] = data;
  return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}
