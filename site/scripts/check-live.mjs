// Confere o site NO AR (npm run check:live -- https://devlingo.discloud.app). Só faz pedidos de leitura (GET e um POST que tem de ser recusado).
//
// O que confere:
//   1. a página inicial responde 200 e traz TODOS os cabeçalhos da política (security/policy.mjs);
//   2. quem abre por http é mandado para https;
//   3. o 404 é a página própria, com os cabeçalhos;
//   4. tentativas de sair da pasta do site e arquivos do servidor não são servidos;
//   5. método que não é GET/HEAD é recusado;
//   6. o security.txt está no ar e não venceu;
//   7. o <link rel="canonical"> do HTML é mesmo o endereço de onde a página foi servida
//      (pega um SITE_URL errado no build, por exemplo o sufixo .dev no lugar do .app).
//
// Alguns hospedeiros SOBRESCREVEM cabeçalhos por conta própria. Isso aparece como AVISO (não como erro) quando o valor
// trocado continua seguro: a Discloud, no endereço .app, troca X-Frame-Options para SAMEORIGIN e Referrer-Policy para
// same-origin (a CSP, com frame-ancestors 'none', continua mandando no enquadramento). Qualquer outra diferença é erro.
//
// Saída 0 se não houver erro (avisos não contam), 1 se houver, 2 se o uso estiver errado.
import http from "node:http";
import https from "node:https";
import { SECURITY_HEADERS } from "../security/policy.mjs";

const input = process.argv[2];
if (!input) {
  console.error("Uso: npm run check:live -- https://devlingo.discloud.app");
  process.exit(2);
}
let origin;
try {
  origin = new URL(input).origin;
} catch {
  console.error(`Endereço inválido: ${input}`);
  process.exit(2);
}
const base = new URL(origin);

// Valores que um hospedeiro pode trocar sem enfraquecer o site de verdade (nome do cabeçalho em minúsculas -> valores aceitos).
const SAFE_OVERRIDES = {
  "x-frame-options": { values: ["sameorigin"], because: "a CSP com frame-ancestors 'none' prevalece sobre ele nos navegadores atuais" },
  "referrer-policy": { values: ["same-origin", "strict-origin"], because: "nenhum desses envia a página de origem a outro site" },
};

const results = [];
const ok = (name, detail = "") => results.push({ level: "ok", name, detail });
const warn = (name, detail = "") => results.push({ level: "warn", name, detail });
const fail = (name, detail = "") => results.push({ level: "fail", name, detail });

// Pedido com o caminho EXATAMENTE como escrito (o fetch arrumaria "..", e queremos testar o servidor de verdade).
function raw(method, path) {
  return new Promise((resolve, reject) => {
    const client = base.protocol === "https:" ? https : http;
    const req = client.request({ host: base.hostname, port: base.port || undefined, method, path, timeout: 20_000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    req.end();
  });
}

async function run() {
  // 1) página inicial e cabeçalhos
  const home = await raw("GET", "/");
  if (home.status !== 200) fail("página inicial", `HTTP ${home.status} (esperado 200)`);
  else ok("página inicial", "HTTP 200");

  const csp = String(home.headers["content-security-policy"] ?? "");
  for (const [name, expected] of SECURITY_HEADERS) {
    const actual = home.headers[name.toLowerCase()];
    if (actual === expected) {
      ok(`cabeçalho ${name}`);
    } else if (actual === undefined) {
      fail(`cabeçalho ${name}`, "ausente");
    } else {
      const safe = SAFE_OVERRIDES[name.toLowerCase()];
      const canOverride = safe?.values.includes(String(actual).toLowerCase()) && (name.toLowerCase() !== "x-frame-options" || /frame-ancestors\s+'none'/.test(csp));
      if (canOverride) warn(`cabeçalho ${name}`, `o hospedeiro trocou "${expected}" por "${actual}" (${safe.because})`);
      else fail(`cabeçalho ${name}`, `esperado "${expected}", veio "${actual}"`);
    }
  }

  // 2) http -> https
  if (base.protocol === "https:") {
    const plain = await fetch(`http://${base.host}/?conferindo=1`, { redirect: "manual" }).catch((error) => ({ error }));
    if (plain.error) fail("http redireciona para https", `não consegui abrir por http (${plain.error.cause?.code ?? plain.error.message})`);
    else if ([301, 308].includes(plain.status) && String(plain.headers.get("location")).startsWith(`https://${base.host}/`)) ok("http redireciona para https", `HTTP ${plain.status} para ${plain.headers.get("location")}`);
    else fail("http redireciona para https", `HTTP ${plain.status}, Location: ${plain.headers.get("location")}`);
  } else {
    warn("http redireciona para https", "pulado: o endereço conferido é http");
  }

  // 3) 404 próprio
  const missing = await raw("GET", `/nao-existe-${Date.now()}`);
  if (missing.status === 404 && /<title>[^<]*n[ãa]o encontrada/i.test(missing.body) && missing.headers["content-security-policy"]) ok("404 é a página própria, com cabeçalhos");
  else fail("404 é a página própria, com cabeçalhos", `HTTP ${missing.status}`);

  // 4) fuga da pasta e arquivos do servidor
  const leaks = /createServer|SECURITY_HEADERS|TYPE=site|DISCORD_TOKEN|"scripts"\s*:/;
  const bad = [];
  for (const path of ["/../server.js", "/%2e%2e/package.json", "/..%2fpolicy.mjs", "/server.js", "/serve.mjs", "/policy.mjs", "/package.json", "/discloud.config", "/_headers", "/www/index.html", "/.env", "/%00"]) {
    const res = await raw("GET", path).catch((error) => ({ status: `erro: ${error.message}`, body: "" }));
    if (![400, 403, 404].includes(res.status) || leaks.test(res.body)) bad.push(`${path} -> ${res.status}`);
  }
  if (bad.length === 0) ok("não serve arquivos do servidor nem sai da pasta", "12 tentativas recusadas, sem vazamento");
  else fail("não serve arquivos do servidor nem sai da pasta", bad.join("; "));

  // 5) métodos
  const post = await raw("POST", "/");
  if ([405, 403].includes(post.status)) ok("POST é recusado", `HTTP ${post.status}`);
  else fail("POST é recusado", `HTTP ${post.status}`);

  // 6) security.txt
  const security = await raw("GET", "/.well-known/security.txt");
  const expires = /^Expires:\s*(.+)$/m.exec(security.body)?.[1];
  if (security.status !== 200 || !/^Contact:/m.test(security.body)) fail("security.txt no ar", `HTTP ${security.status}`);
  else if (!expires || !(Date.parse(expires) > Date.now())) fail("security.txt no ar", `Expires ausente ou vencido (${expires})`);
  else ok("security.txt no ar e dentro da validade", `vale até ${expires}`);

  // 7) canonical
  const canonical = /<link\s+rel="canonical"\s+href="([^"]*)"/.exec(home.body)?.[1];
  if (!canonical) warn("canonical", "a página não declara <link rel=\"canonical\"> (o SITE_URL foi usado no build?)");
  else if (canonical === `${origin}/`) ok("canonical é o endereço do site", canonical);
  else fail("canonical é o endereço do site", `a página diz "${canonical}", mas foi servida de "${origin}/". Ajuste o SITE_URL do build (site.yml) e publique de novo`);
}

try {
  await run();
} catch (error) {
  fail("conferência", `não consegui falar com ${origin}: ${error.message}`);
}

const icon = { ok: "✔", warn: "⚠", fail: "✖" };
console.log(`Conferindo ${origin}\n`);
for (const r of results) console.log(`  ${icon[r.level]} ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
const count = (level) => results.filter((r) => r.level === level).length;
console.log(`\n${count("ok")} ok, ${count("warn")} aviso(s), ${count("fail")} erro(s)`);
process.exit(count("fail") > 0 ? 1 : 0);
