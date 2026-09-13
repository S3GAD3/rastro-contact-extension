const RASTRO = {
  email: "https://s3gad3.github.io/rastro-user/",
  phone: "https://s3gad3.github.io/rastro-phone/",
  domain: "https://s3gad3.github.io/rastro-web/",
  company: "https://s3gad3.github.io/rastro-company/",
  username: "https://s3gad3.github.io/rastro-socmint/"
};

export function pivotLinks(entity) {
  const q = encodeURIComponent(entity.normalized || entity.raw || "");
  const links = [];
  if (RASTRO[entity.type]) links.push({label: `Abrir en ${entity.type === "email" ? "RASTRO-USER" : entity.type === "phone" ? "RASTRO-PHONE" : "RASTRO"}`, url: `${RASTRO[entity.type]}?q=${q}`});
  links.push({label: "Google", url: `https://www.google.com/search?q=%22${q}%22`});
  if (entity.type === "email") links.push({label: "GitHub", url: `https://github.com/search?q=${q}&type=code`});
  return links;
}
