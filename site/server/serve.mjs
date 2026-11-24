// Servidor estático do site para hospedagens que só rodam um app Node (a Discloud). Sem nenhuma dependência.
//
// Desenho de segurança: na subida o servidor lê a pasta do site UMA vez e monta um índice (caminho da URL -> conteúdo).
// Cada pedido é só uma consulta nesse índice: o caminho pedido nunca vira um caminho de arquivo, então "..", links
// simbólicos, arquivos ocultos e qualquer coisa fora da pasta simplesmente não existem para ele.
//
// Os cabeçalhos de segurança vêm da política do site (security/policy.mjs, a mesma que gera o `_headers` e o
// `vercel.json`) e vão em TODA resposta: página, 404, redirecionamento, 304 e erro.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// Arquivos que só os hospedeiros estáticos usam (nunca devem ser servidos como página).
const HOST_ONLY = new Set(["_headers", "_redirects"]);

const MAX_URL_LENGTH = 2048;
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

// Os protocolos (minúsculos) que os cabeçalhos do proxy dizem que o visitante usou: o primeiro valor de x-forwarded-proto
// e o "scheme" do cf-visitor ({"scheme":"https"}). Cabeçalho ausente ou mal formado simplesmente não conta.
function visitorSchemes(headers) {
  const schemes = [];
  const forwarded = String(headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase();
  if (forwarded) schemes.push(forwarded);
  try {
    const scheme = JSON.parse(String(headers["cf-visitor"] ?? "")).scheme;
    if (typeof scheme === "string" && scheme) schemes.push(scheme.trim().toLowerCase());
  } catch {
    // não é JSON: ignora
  }
  return schemes;
}

// Lê a pasta do site e devolve Map(caminho da URL -> { body, type, etag }).
// Fora: links simbólicos, arquivos e pastas ocultos (menos /.well-known, onde fica o security.txt) e os arquivos HOST_ONLY.
export function buildIndex(root) {
  const index = new Map();

  const add = (key, entry) => {
    if (!index.has(key)) index.set(key, entry);
  };

  const walk = (dir, prefix) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isSymbolicLink()) continue;
      if (item.name.startsWith(".") && rel !== ".well-known") continue;
      if (item.isDirectory()) {
        walk(path.join(dir, item.name), rel);
        continue;
      }
      if (!item.isFile() || (!prefix && HOST_ONLY.has(item.name))) continue;

      const body = readFileSync(path.join(dir, item.name));
      const entry = {
        body,
        type: TYPES[path.extname(item.name).toLowerCase()] ?? "application/octet-stream",
        etag: `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`,
      };
      add(`/${rel}`, entry);

      // URLs limpas, como o site é feito para funcionar: /sobre -> sobre.html, / -> index.html, /docs -> docs/index.html.
      if (rel.endsWith(".html")) {
        const base = rel.slice(0, -".html".length);
        if (base === "index") add("/", entry);
        else if (base.endsWith("/index")) add(`/${base.slice(0, -"/index".length)}`, entry);
        else add(`/${base}`, entry);
      }
    }
  };

  walk(root, "");
  return index;
}

// Devolve o tratador de pedidos (req, res) para o `http.createServer`.
//   index       o Map de buildIndex
//   headers     [[nome, valor], ...] de segurança (SECURITY_HEADERS da política), em toda resposta
//   cacheRules  [{ pattern: "/_astro/*", value }, ...] (CACHE_RULES da política); o resto das respostas sempre revalida
export function createHandler({ index, headers, cacheRules }) {
  const security = Object.fromEntries(headers);
  const notFoundPage = index.get("/404.html");
  const cacheFor = (urlPath) =>
    cacheRules.find((rule) => urlPath.startsWith(rule.pattern.replace(/\*$/, "")))?.value ?? "no-cache";

  function send(res, status, { type = "text/plain; charset=utf-8", body = "", extra = {}, head = false } = {}) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    res.writeHead(status, { ...security, "Content-Type": type, "Content-Length": buffer.length, ...extra });
    res.end(head ? undefined : buffer);
  }

  function respond(req, res) {
    const head = req.method === "HEAD";
    if (req.method !== "GET" && !head) {
      return send(res, 405, { body: "Método não permitido.\n", extra: { Allow: "GET, HEAD" } });
    }

    const raw = req.url ?? "";
    if (raw.length > MAX_URL_LENGTH) return send(res, 414, { body: "Endereço longo demais.\n", head });
    // Só aceita "/caminho?consulta": recusa "*", "http://outro-site/..." e o que não começa com "/".
    if (!raw.startsWith("/")) return send(res, 400, { body: "Pedido inválido.\n", head });

    // HTTPS: quem chegou por http vai para https (a Discloud não faz isso sozinha). Há dois sinais e vale se QUALQUER um disser
    // que o visitante veio por http: o x-forwarded-proto (proxies comuns) e o cf-visitor (Cloudflare). Na Discloud o
    // x-forwarded-proto é SEMPRE "https" (o trecho entre o Cloudflare e o proxy deles é https): quem diz a verdade é o
    // cf-visitor, que vale {"scheme":"http"} para quem abriu o endereço sem TLS. Medido numa conta real.
    // O destino usa só o cabeçalho Host, que o proxy preenche com o endereço público.
    if (visitorSchemes(req.headers).some((scheme) => scheme !== "https")) {
      const host = String(req.headers.host ?? "");
      if (!HOST_PATTERN.test(host)) return send(res, 400, { body: "Pedido inválido.\n", head });
      return send(res, 301, { body: "", extra: { Location: `https://${host}${raw}` }, head });
    }

    const queryAt = raw.search(/[?#]/);
    const rawPath = queryAt === -1 ? raw : raw.slice(0, queryAt);
    const search = queryAt === -1 ? "" : raw.slice(queryAt);

    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return send(res, 400, { body: "Pedido inválido.\n", head });
    }
    if (decoded.includes("\0")) return send(res, 400, { body: "Pedido inválido.\n", head });

    // O site não usa barra no fim ("/sobre/" -> "/sobre"). Junta as barras do começo para o destino nunca virar "//outro-site".
    if (decoded.length > 1 && decoded.endsWith("/")) {
      const clean = `/${rawPath.replace(/\/+$/, "").replace(/^\/+/, "")}`;
      return send(res, 308, { body: "", extra: { Location: `${clean}${search}` }, head });
    }

    const entry = index.get(decoded);
    if (!entry) {
      if (!notFoundPage) return send(res, 404, { body: "Não encontrado.\n", head, extra: { "Cache-Control": "no-cache" } });
      return send(res, 404, { type: notFoundPage.type, body: notFoundPage.body, head, extra: { "Cache-Control": "no-cache" } });
    }

    const cache = cacheFor(decoded);
    const conditional = req.headers["if-none-match"];
    if (conditional && (conditional.trim() === "*" || conditional.split(",").some((tag) => tag.trim().replace(/^W\//, "") === entry.etag))) {
      res.writeHead(304, { ...security, ETag: entry.etag, "Cache-Control": cache });
      return res.end();
    }

    return send(res, 200, { type: entry.type, body: entry.body, head, extra: { ETag: entry.etag, "Cache-Control": cache } });
  }

  return function handle(req, res) {
    try {
      respond(req, res);
    } catch (error) {
      // Nunca mostra o erro a quem pediu; só registra no log do app.
      console.error("[site] erro ao responder:", error);
      if (!res.headersSent) send(res, 500, { body: "Erro interno.\n" });
      else res.end();
    }
  };
}
