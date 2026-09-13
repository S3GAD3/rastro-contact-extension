import { extractEntitiesFromHtml } from "../core/contact-extract.js";

export function extractFromHtml(html, source, timestamp) {
  return extractEntitiesFromHtml(html, source, {sourceType:"historical", timestamp, defaultCountry:"ES"});
}
