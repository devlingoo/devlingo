// Auditoria de segurança do que o build gerou (dist/). Roda no CI e falha se alguém reintroduzir algo perigoso.
// Não é um teste do bot: o nome do arquivo não casa com os padrões do `node --test` da raiz, de propósito.
//
// O que confere:
//  - HTML: nada de script/estilo inline, atributos de evento, iframe/form/object/base, URLs perigosas; CSP certa e em primeiro;
//    links externos só para domínios permitidos e com rel="noopener noreferrer"; recursos só do próprio domínio.
//  - CSS e JS: sem @import externo, sem eval, new Function, document.write, innerHTML e parecidos.
//  - Cabeçalhos: _headers e vercel.json iguais à política (security/policy.mjs), sem 'unsafe-*' nem curinga.
//  - Arquivos que não podem ir ao ar (sourcemaps, .env, .git) e o orçamento de tamanho.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "parse5";
import { ALLOWED_LINK_HOSTS, CSP, cspHeader, cspMeta, headersFile, vercelConfig } from "../security/policy.mjs";

const SITE = path.resolve(import.meta.dirname, "..");
const DIST = process.env["AUDIT_DIST"] ? path.resolve(process.env["AUDIT_DIST"]) : path.join(SITE, "dist"); // AUDIT_DIST: só para testar o auditor
if (!existsSync(DIST)) {
  console.error("dist/ não existe: rode `npm run build` antes.");
  process.exit(2);
}

const failures = [];
let checks = 0;
const ok = (condition, message) => {
  checks++;
  if (!condition) failures.push(message);
  return condition;
};

// ---------- arquivos ----------
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}
const files = listFiles(DIST);
const rel = (file) => path.relative(DIST, file).replaceAll("\\", "/");
const read = (file) => readFileSync(file, "utf-8");

// ---------- 1) estrutura e arquivos proibidos ----------
for (const required of ["index.html", "404.html", "_headers", "robots.txt", ".well-known/security.txt"]) {
  ok(existsSync(path.join(DIST, required)), `falta ${required} em dist/`);
}
for (const file of files) {
  const name = rel(file);
  ok(!/\.(map|env|pem|key|log|bak|orig)$/i.test(name) && !/(^|\/)\.(git|env|npmrc|DS_Store)/.test(name), `arquivo que não deve ir ao ar: ${name}`);
  ok(!/(^|\/)node_modules\//.test(name), `node_modules em dist/: ${name}`);
}

// security.txt com validade futura e de no máximo 1 ano (RFC 9116)
const securityTxt = existsSync(path.join(DIST, ".well-known/security.txt")) ? read(path.join(DIST, ".well-known/security.txt")) : "";
const expires = /^Expires:\s*(.+)$/m.exec(securityTxt)?.[1];
const days = expires ? (Date.parse(expires) - Date.now()) / 86_400_000 : NaN;
ok(/^Contact:\s*https:\/\//m.test(securityTxt), "security.txt sem Contact https");
ok(days > 30 && days <= 366, `security.txt: Expires precisa estar entre 30 dias e 1 ano à frente (está em ${Number.isFinite(days) ? days.toFixed(0) + " dias" : "formato inválido"})`);

// ---------- 2) HTML ----------
const FORBIDDEN_TAGS = new Set(["iframe", "frame", "frameset", "object", "embed", "applet", "form", "base", "input", "textarea", "select", "button-form"]);
const URL_ATTRS = ["href", "src", "action", "formaction", "poster", "data", "srcset"];
const isSameOrigin = (value) => value.startsWith("/") && !value.startsWith("//") || (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//"));

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
}

function auditHtml(file) {
  const page = rel(file);
  const document = parse(read(file));
  const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value;
  let htmlNode, headNode;
  const ids = new Set();
  const h1 = [];
  walk(document, (node) => {
    if (node.nodeName === "html") htmlNode = node;
    if (node.nodeName === "head") headNode = node;
  });
  ok(Boolean(attr(htmlNode, "lang")), `${page}: <html> sem lang`);

  // a CSP vem primeiro no <head> (depois do charset) e é exatamente a da política
  const headTags = (headNode?.childNodes ?? []).filter((n) => n.tagName);
  const cspIndex = headTags.findIndex((n) => n.tagName === "meta" && attr(n, "http-equiv")?.toLowerCase() === "content-security-policy");
  ok(cspIndex !== -1 && cspIndex <= 1, `${page}: a meta de CSP precisa ser a primeira do <head> (depois do charset)`);
  if (cspIndex !== -1) ok(attr(headTags[cspIndex], "content") === cspMeta(), `${page}: a CSP da página difere da política (security/policy.mjs)`);
  ok(headTags.some((n) => n.tagName === "title" && n.childNodes?.some((c) => c.value?.trim())), `${page}: sem <title>`);

  walk(document, (node) => {
    const tag = node.tagName;
    if (!tag) return;

    if (tag === "h1") h1.push(node);
    const id = attr(node, "id");
    if (id !== undefined) { ok(!ids.has(id), `${page}: id repetido "${id}"`); ids.add(id); }

    // nada de código nem estilo inline, nem tags que abrem superfície de ataque
    if (tag === "script") {
      const src = attr(node, "src");
      ok(src !== undefined, `${page}: <script> inline (a CSP bloquearia e é uma porta para XSS)`);
      if (src !== undefined) ok(isSameOrigin(src), `${page}: script de outro domínio: ${src}`);
      ok(attr(node, "type") !== "importmap", `${page}: importmap inline`);
    }
    ok(tag !== "style", `${page}: <style> inline`);
    ok(!FORBIDDEN_TAGS.has(tag), `${page}: tag proibida <${tag}>`);
    if (tag === "meta" && attr(node, "http-equiv")?.toLowerCase() === "refresh") ok(false, `${page}: meta refresh`);

    for (const { name, value } of node.attrs ?? []) {
      ok(!/^on/i.test(name), `${page}: atributo de evento ${name} em <${tag}>`);
      ok(name !== "style", `${page}: atributo style em <${tag}>`);
      ok(name !== "srcdoc", `${page}: srcdoc em <${tag}>`);
      if (URL_ATTRS.includes(name)) {
        ok(!/^\s*(javascript|vbscript|data):/i.test(value), `${page}: URL perigosa em ${name} de <${tag}>: ${value.slice(0, 40)}`);
      }
    }

    // recursos (o que o navegador baixa sozinho) só do próprio domínio
    const subresource = (tag === "link" && ["stylesheet", "preload", "icon", "apple-touch-icon", "modulepreload", "manifest"].includes(attr(node, "rel") ?? "")) || tag === "img" || tag === "script";
    if (subresource) {
      const url = attr(node, tag === "link" ? "href" : "src");
      if (url !== undefined) ok(isSameOrigin(url), `${page}: recurso de outro domínio em <${tag}>: ${url}`);
    }
    if (tag === "img") ok(attr(node, "alt") !== undefined, `${page}: <img> sem alt`);

    // links: externos só para domínios permitidos, e target=_blank exige noopener e noreferrer
    if (tag === "a") {
      const href = attr(node, "href") ?? "";
      if (/^https?:\/\//i.test(href)) {
        const host = new URL(href).hostname;
        ok(href.startsWith("https://"), `${page}: link sem HTTPS: ${href}`);
        ok(ALLOWED_LINK_HOSTS.includes(host), `${page}: link para domínio fora da lista permitida: ${host}`);
      }
      if (attr(node, "target") === "_blank") {
        const relValue = (attr(node, "rel") ?? "").split(/\s+/);
        ok(relValue.includes("noopener") && relValue.includes("noreferrer"), `${page}: target=_blank sem rel="noopener noreferrer": ${href}`);
      }
    }
  });
  ok(h1.length === 1, `${page}: precisa ter exatamente um <h1> (tem ${h1.length})`);
}
for (const file of files.filter((f) => f.endsWith(".html"))) auditHtml(file);

// ---------- 3) CSS ----------
for (const file of files.filter((f) => f.endsWith(".css"))) {
  const css = read(file);
  ok(!/@import\s+(url\()?\s*["']?(https?:)?\/\//i.test(css), `${rel(file)}: @import de outro domínio`);
  ok(!/url\(\s*["']?(https?:|\/\/|data:)/i.test(css), `${rel(file)}: url() de outro domínio ou data:`);
  // `behavior:` (do IE) só conta como propriedade solta; `scroll-behavior:` é legítimo.
  ok(!/expression\s*\(|(?<![\w-])behavior\s*:|-moz-binding/i.test(css), `${rel(file)}: construção CSS perigosa`);
}

// ---------- 4) JavaScript ----------
const DANGEROUS_JS = [
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\s*\(/, "new Function()"],
  [/document\.write(ln)?\s*\(/, "document.write()"],
  [/\.(innerHTML|outerHTML)\s*=/, "innerHTML/outerHTML ="],
  [/insertAdjacentHTML\s*\(/, "insertAdjacentHTML()"],
  [/\bset(Timeout|Interval)\s*\(\s*["'`]/, "setTimeout/setInterval com texto"],
  [/https?:\/\//, "URL absoluta no código (o site não fala com ninguém)"],
  [/\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|navigator\.sendBeacon/, "chamada de rede (a CSP já proíbe: connect-src 'none')"],
];
for (const file of files.filter((f) => f.endsWith(".js"))) {
  const js = read(file);
  for (const [pattern, label] of DANGEROUS_JS) ok(!pattern.test(js), `${rel(file)}: ${label}`);
}

// ---------- 5) política de cabeçalhos ----------
const headersOnDisk = existsSync(path.join(DIST, "_headers")) ? read(path.join(DIST, "_headers")) : "";
ok(headersOnDisk === headersFile(), "dist/_headers difere da política: rode `npm run sync` e faça o commit de public/_headers");
const vercelPath = path.join(SITE, "vercel.json");
ok(existsSync(vercelPath) && JSON.stringify(JSON.parse(read(vercelPath))) === JSON.stringify(vercelConfig()), "vercel.json difere da política: rode `npm run sync` e faça o commit");

const policy = cspHeader();
ok(!/'unsafe-(inline|eval|hashes)'|'wasm-unsafe-eval'/.test(policy), "CSP com 'unsafe-*'");
ok(!/(^|\s)\*(\s|;|$)|\sdata:|\sblob:|https?:/.test(policy), "CSP com curinga, data:, blob: ou domínio externo");
ok(CSP["default-src"]?.join(" ") === "'none'", "CSP: default-src precisa ser 'none'");
ok(CSP["frame-ancestors"]?.join(" ") === "'none'", "CSP: frame-ancestors precisa ser 'none'");
for (const required of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) {
  ok(new RegExp(`^\\s+${required}:`, "m").test(headersOnDisk), `_headers sem ${required}`);
}

// ---------- 6) orçamento de tamanho ----------
const size = (list) => list.reduce((sum, file) => sum + statSync(file).size, 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const js = files.filter((f) => f.endsWith(".js"));
const css = files.filter((f) => f.endsWith(".css"));
const fonts = files.filter((f) => f.endsWith(".woff2"));
ok(size(js) <= 12 * 1024, `JavaScript total acima de 12 KB (${kb(size(js))})`);
ok(size(css) <= 30 * 1024, `CSS total acima de 30 KB (${kb(size(css))})`);
ok(size(fonts) <= 120 * 1024, `fontes acima de 120 KB (${kb(size(fonts))})`);
ok(statSync(path.join(DIST, "index.html")).size <= 90 * 1024, `index.html acima de 90 KB`);
for (const file of files) ok(statSync(file).size <= 400 * 1024, `arquivo grande demais: ${rel(file)} (${kb(statSync(file).size)})`);

// ---------- resultado ----------
console.log(`Auditoria de dist/: ${files.length} arquivos, ${checks} verificações.`);
console.log(`JavaScript ${kb(size(js))} | CSS ${kb(size(css))} | fontes ${kb(size(fonts))} | index.html ${kb(statSync(path.join(DIST, "index.html")).size)}`);
if (failures.length) {
  console.error(`\n${failures.length} problema(s):`);
  for (const message of failures) console.error(`  ✖ ${message}`);
  process.exit(1);
}
console.log("Tudo certo: nenhum problema encontrado.");
