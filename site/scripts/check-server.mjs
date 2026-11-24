// Teste do servidor do site (npm run check:server): o servidor estático (server/serve.mjs) e o pacote da Discloud inteiro.
// Rode depois do build: a parte do pacote usa o dist/ de verdade (sem ele, essa parte é pulada).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { buildIndex, createHandler } from "../server/serve.mjs";
import { SECURITY_HEADERS, CACHE_RULES } from "../security/policy.mjs";

const SITE = path.resolve(import.meta.dirname, "..");
const DIST = path.join(SITE, "dist");

// Pedido HTTP "cru": o caminho vai exatamente como escrito (o fetch arrumaria ".." e outras esquisitices antes de enviar).
function request(port, { method = "GET", path: target = "/", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: target, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

const assertSecurityHeaders = (res, label) => {
  for (const [name, value] of SECURITY_HEADERS) {
    assert.equal(res.headers[name.toLowerCase()], value, `${label}: falta ou mudou o cabeçalho ${name}`);
  }
};

// ---------- o servidor, com uma pasta de mentirinha cheia de "segredos" que nunca podem aparecer ----------

const fixture = mkdtempSync(path.join(os.tmpdir(), "devlingo-site-"));
const write = (rel, content) => {
  const file = path.join(fixture, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
};
write("index.html", "<!doctype html><title>Início</title>");
write("404.html", "<!doctype html><title>Página não encontrada</title>");
write("sobre.html", "<p>sobre</p>");
write("docs/index.html", "<p>docs</p>");
write("_astro/app.abc123.css", "body{margin:0}");
write("fonts/f.woff2", Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1, 2, 3]));
write(".well-known/security.txt", "Contact: mailto:seguranca@example.com\n");
write("_headers", "SEGREDO-HEADERS");
write(".env", "SEGREDO-ENV");
write("nested/.oculto", "SEGREDO-OCULTO");
write(".git/config", "SEGREDO-GIT");
let symlinked = false;
try {
  symlinkSync(path.join(fixture, "index.html"), path.join(fixture, "atalho.html"));
  symlinked = true;
} catch {
  // Sem permissão para criar link simbólico (Windows comum): o teste do link é pulado.
}

const server = http.createServer(createHandler({ index: buildIndex(fixture), headers: SECURITY_HEADERS, cacheRules: CACHE_RULES }));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
test.after(() => {
  server.close();
  rmSync(fixture, { recursive: true, force: true });
});

const get = (target, headers) => request(port, { path: target, headers });

test("serve as páginas, as URLs limpas e os arquivos com o tipo certo", async () => {
  const home = await get("/");
  assert.equal(home.status, 200);
  assert.equal(home.headers["content-type"], "text/html; charset=utf-8");
  assert.match(home.body.toString(), /Início/);
  assert.deepEqual((await get("/index.html")).body, home.body);

  assert.equal((await get("/sobre")).body.toString(), "<p>sobre</p>", "URL limpa: /sobre -> sobre.html");
  assert.equal((await get("/sobre.html")).body.toString(), "<p>sobre</p>");
  assert.equal((await get("/docs")).body.toString(), "<p>docs</p>", "/docs -> docs/index.html");

  const css = await get("/_astro/app.abc123.css");
  assert.equal(css.headers["content-type"], "text/css; charset=utf-8");
  assert.equal((await get("/fonts/f.woff2")).headers["content-type"], "font/woff2");
  assert.deepEqual((await get("/fonts/f.woff2")).body, Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1, 2, 3]));

  const security = await get("/.well-known/security.txt");
  assert.equal(security.status, 200, "o security.txt fica no ar");
  assert.match(security.body.toString(), /Contact:/);
});

test("TODA resposta leva os cabeçalhos de segurança da política: 200, 404, 304, redirecionamentos e erros", async () => {
  const etag = (await get("/")).headers.etag;
  const cases = {
    "200": await get("/"),
    "HEAD": await request(port, { method: "HEAD", path: "/" }),
    "404": await get("/nao-existe"),
    "304": await get("/", { "If-None-Match": etag }),
    "308 (barra no fim)": await get("/sobre/"),
    "301 (http)": await get("/", { "X-Forwarded-Proto": "http", Host: "exemplo.discloud.dev" }),
    "405": await request(port, { method: "POST", path: "/" }),
    "400 (%)": await get("/%E0%A4%A"),
    "400 (absoluto)": await get("http://outro-site.example/"),
    "414": await get(`/${"a".repeat(3000)}`),
  };
  const statuses = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, v.status]));
  assert.deepEqual(statuses, { "200": 200, HEAD: 200, "404": 404, "304": 304, "308 (barra no fim)": 308, "301 (http)": 301, "405": 405, "400 (%)": 400, "400 (absoluto)": 400, "414": 414 });
  for (const [label, res] of Object.entries(cases)) assertSecurityHeaders(res, label);
});

test("cache: arquivos com hash duram um ano, o resto sempre revalida, e o ETag evita reenviar", async () => {
  const rule = (prefix) => CACHE_RULES.find((r) => r.pattern.startsWith(prefix)).value;
  assert.equal((await get("/_astro/app.abc123.css")).headers["cache-control"], rule("/_astro/"));
  assert.equal((await get("/fonts/f.woff2")).headers["cache-control"], rule("/fonts/"));
  assert.equal((await get("/")).headers["cache-control"], "no-cache");
  assert.equal((await get("/nao-existe")).headers["cache-control"], "no-cache");

  const first = await get("/sobre");
  assert.match(first.headers.etag, /^"[0-9a-f]{32}"$/);
  const again = await get("/sobre", { "If-None-Match": first.headers.etag });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  assert.equal((await get("/sobre", { "If-None-Match": `W/${first.headers.etag}` })).status, 304, "ETag fraco também vale");
  assert.equal((await get("/sobre", { "If-None-Match": '"outro"' })).status, 200);
  assert.equal((await get("/sobre", { "If-None-Match": "*" })).status, 304);
});

test("404: devolve a página própria com status 404", async () => {
  const res = await get("/nao-existe");
  assert.equal(res.status, 404);
  assert.match(res.body.toString(), /Página não encontrada/);
  assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
});

test("nada fora do site é alcançável: '..', %2e%2e, barras, bytes nulos, arquivos ocultos e dos hospedeiros", async () => {
  const attempts = [
    "/../package.json",
    "/../../etc/passwd",
    "/%2e%2e/%2e%2e/etc/passwd",
    "/..%2f..%2fetc/passwd",
    "/%2e%2e%2f%2e%2e%2fpackage.json",
    "/..\\..\\package.json",
    "/docs/../../package.json",
    "/./../index.html/../..",
    "/_headers",
    "/.env",
    "/nested/.oculto",
    "/.git/config",
    "/.well-known/../.env",
    "/%2e/%2e/.env",
    "/index.html%00.png",
    "/sobre%00",
    "//etc/passwd",
    "/index.html/",
    "/server.js",
    "/policy.mjs",
  ];
  for (const target of attempts) {
    const res = await get(target);
    assert.ok([400, 404, 308].includes(res.status), `${target} -> ${res.status} (esperado 400, 404 ou 308)`);
    assert.doesNotMatch(res.body.toString(), /SEGREDO|root:|"name"/, `${target} vazou conteúdo`);
    if (res.status === 308) assert.match(res.headers.location, /^\/[^/]/, `${target}: o redirecionamento não pode virar "//outro-site"`);
  }
  if (symlinked) assert.equal((await get("/atalho.html")).status, 404, "link simbólico não é servido");
});

test("só aceita GET e HEAD (o resto volta 405 com Allow); HEAD não manda corpo", async () => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE"]) {
    const res = await request(port, { method, path: "/" });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.allow, "GET, HEAD");
  }
  const get1 = await get("/sobre");
  const head = await request(port, { method: "HEAD", path: "/sobre" });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(head.headers["content-length"], get1.headers["content-length"], "HEAD declara o mesmo tamanho do GET");
});

test("barra no fim vira URL sem barra, mantém a consulta e nunca vira redirecionamento para outro site", async () => {
  const res = await get("/sobre/?a=1");
  assert.equal(res.status, 308);
  assert.equal(res.headers.location, "/sobre?a=1");

  for (const target of ["//outro-site.example/", "///outro-site.example///", "//", "/\\/"]) {
    const r = await get(target);
    if (r.status === 308) assert.match(r.headers.location, /^\/(?!\/)/, `${target} -> ${r.headers.location}`);
  }
  assert.equal((await get("//outro-site.example/")).headers.location, "/outro-site.example");
});

test("https: quem chega por http é redirecionado (só pelo cabeçalho do proxy e só para o próprio Host)", async () => {
  const http1 = await get("/sobre?x=1", { "X-Forwarded-Proto": "http", Host: "devlingo.discloud.dev" });
  assert.equal(http1.status, 301);
  assert.equal(http1.headers.location, "https://devlingo.discloud.dev/sobre?x=1");

  assert.equal((await get("/sobre", { "X-Forwarded-Proto": "https" })).status, 200, "já é https: não redireciona");
  assert.equal((await get("/sobre")).status, 200, "sem o cabeçalho (acesso local): não redireciona");
  assert.equal((await get("/sobre", { "X-Forwarded-Proto": "https, http" })).status, 200, "vale o primeiro valor da lista");

  // O caso REAL da Discloud (medido numa conta): o proxy dela diz x-forwarded-proto: https até para quem abriu por http,
  // e só o cf-visitor do Cloudflare conta a verdade.
  const real = await get("/sobre?x=1", { "X-Forwarded-Proto": "https", "CF-Visitor": '{"scheme":"http"}', Host: "devlingo.discloud.dev" });
  assert.equal(real.status, 301);
  assert.equal(real.headers.location, "https://devlingo.discloud.dev/sobre?x=1");
  assert.equal((await get("/sobre", { "X-Forwarded-Proto": "https", "CF-Visitor": '{"scheme":"https"}' })).status, 200, "cf-visitor https: não redireciona");
  assert.equal((await get("/sobre", { "CF-Visitor": '{"scheme":"HTTP"}' })).status, 301, "sem x-forwarded-proto, o cf-visitor sozinho basta (e ignora maiúsculas)");
  for (const malformed of ["isto-nao-e-json", "{}", '{"scheme":5}', '{"scheme":""}', "null", "[]"]) {
    assert.equal((await get("/sobre", { "CF-Visitor": malformed })).status, 200, `cf-visitor mal formado (${malformed}) é ignorado`);
  }

  // O destino usa o Host da própria requisição; um Host mal formado é recusado em vez de montar um endereço estranho.
  for (const host of ["evil.com/x", "a b", "evil.com@outro.com", "-.com", "x:99999999"]) {
    const res = await get("/", { "X-Forwarded-Proto": "http", Host: host });
    assert.ok(res.status === 400 || (res.status === 301 && /^https:\/\/[a-z0-9.-]+(:\d+)?\//i.test(res.headers.location)), `${host} -> ${res.status} ${res.headers.location ?? ""}`);
    assert.notEqual(res.status, 200);
  }
  // O X-Forwarded-Host não é usado (quem o controla não escolhe o destino).
  const forged = await get("/", { "X-Forwarded-Proto": "http", Host: "devlingo.discloud.dev", "X-Forwarded-Host": "evil.com" });
  assert.equal(forged.headers.location, "https://devlingo.discloud.dev/");
});

test("um erro interno responde 500 genérico, sem detalhe, e com os cabeçalhos de segurança", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const poisoned = new Map([["/", { get body() { throw new Error("DETALHE-INTERNO"); }, type: "text/html", etag: '"x"' }]]);
    const broken = http.createServer(createHandler({ index: poisoned, headers: SECURITY_HEADERS, cacheRules: CACHE_RULES }));
    await new Promise((resolve) => broken.listen(0, "127.0.0.1", resolve));
    const res = await request(broken.address().port, { path: "/" });
    broken.close();
    assert.equal(res.status, 500);
    assert.doesNotMatch(res.body.toString(), /DETALHE-INTERNO|Error|at /);
    assertSecurityHeaders(res, "500");
  } finally {
    console.error = quiet;
  }
});

test("buildIndex deixa de fora o que é oculto, dos hospedeiros e link simbólico", () => {
  const keys = [...buildIndex(fixture).keys()];
  for (const hidden of ["/.env", "/_headers", "/.git/config", "/nested/.oculto", "/atalho.html"]) assert.ok(!keys.includes(hidden), `${hidden} não pode estar no índice`);
  for (const shown of ["/", "/index.html", "/sobre", "/sobre.html", "/docs", "/404.html", "/.well-known/security.txt", "/_astro/app.abc123.css"]) assert.ok(keys.includes(shown), `${shown} tem de estar no índice`);
});

// ---------- o verificador do site no ar (check-live) ----------

// Um site de mentirinha, com a página inicial, o 404 e o security.txt, para o check-live conferir. \`tweak\` troca os
// cabeçalhos de segurança (como um hospedeiro faria) e \`canonical\` troca o endereço que a página declara.
async function liveSite(t, { tweak = (pairs) => pairs, canonical, csp } = {}) {
  const index = new Map();
  const entry = (body, type = "text/html; charset=utf-8") => ({ body: Buffer.from(body), type, etag: '"x"' });
  index.set("/404.html", entry("<!doctype html><title>Página não encontrada</title>"));
  index.set("/.well-known/security.txt", entry("Contact: mailto:a@example.com\nExpires: 2099-01-01T00:00:00Z\n", "text/plain; charset=utf-8"));
  const home = entry("");
  index.set("/", home);

  const headers = tweak(SECURITY_HEADERS.map(([k, v]) => [k, k === "Content-Security-Policy" && csp !== undefined ? csp : v]));
  const live = http.createServer(createHandler({ index, headers, cacheRules: CACHE_RULES }));
  await new Promise((resolve) => live.listen(0, "127.0.0.1", resolve));
  t.after(() => live.close());
  const origin = "http://127.0.0.1:" + live.address().port;
  home.body = Buffer.from('<!doctype html><link rel="canonical" href="' + (canonical ?? origin + "/") + '"><title>Início</title>');
  return origin;
}

async function runLive(origin) {
  const child = spawn(process.execPath, ["scripts/check-live.mjs", origin], { cwd: SITE, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (chunk) => (out += chunk));
  child.stderr.on("data", (chunk) => (out += chunk));
  const [code] = await once(child, "exit");
  return { code, out };
}

const swap = (name, value) => (pairs) => pairs.map(([k, v]) => (k === name ? [k, value] : [k, v]));
const drop = (name) => (pairs) => pairs.filter(([k]) => k !== name);

test("check-live: um site correto passa (sem erros)", async (t) => {
  const { code, out } = await runLive(await liveSite(t));
  assert.equal(code, 0, out);
  assert.match(out, /0 erro\(s\)/);
  assert.match(out, /✔ canonical é o endereço do site/);
  assert.match(out, /✔ security\.txt no ar/);
  assert.match(out, /✔ não serve arquivos do servidor nem sai da pasta/);
});

test("check-live: cabeçalho da política ausente é erro", async (t) => {
  const { code, out } = await runLive(await liveSite(t, { tweak: drop("Strict-Transport-Security") }));
  assert.equal(code, 1);
  assert.match(out, /✖ cabeçalho Strict-Transport-Security {2}\[ausente\]/);
});

test("check-live: canonical de outro endereço é erro (o caso do .dev no lugar do .app)", async (t) => {
  const { code, out } = await runLive(await liveSite(t, { canonical: "https://devlingo.discloud.dev/" }));
  assert.equal(code, 1);
  assert.match(out, /✖ canonical é o endereço do site/);
  assert.match(out, /Ajuste o SITE_URL/);
});

test("check-live: as trocas seguras que a Discloud faz no .app viram aviso, não erro", async (t) => {
  const tweak = (pairs) => swap("Referrer-Policy", "same-origin")(swap("X-Frame-Options", "SAMEORIGIN")(pairs));
  const { code, out } = await runLive(await liveSite(t, { tweak }));
  assert.equal(code, 0, out);
  assert.match(out, /⚠ cabeçalho X-Frame-Options/);
  assert.match(out, /⚠ cabeçalho Referrer-Policy/);
  assert.match(out, /⚠ http redireciona para https {2}\[pulado: o endereço conferido é http\]/, "num servidor local http, o redirecionamento não dá para conferir");
  assert.match(out, /3 aviso\(s\), 0 erro\(s\)/);
});

test("check-live: troca insegura continua sendo erro", async (t) => {
  const unsafeReferrer = await runLive(await liveSite(t, { tweak: swap("Referrer-Policy", "unsafe-url") }));
  assert.equal(unsafeReferrer.code, 1);
  assert.match(unsafeReferrer.out, /✖ cabeçalho Referrer-Policy/);

  // SAMEORIGIN só é aceito se a CSP ainda proíbe o enquadramento (frame-ancestors 'none').
  const noFrameAncestors = SECURITY_HEADERS.find(([k]) => k === "Content-Security-Policy")[1].replace("; frame-ancestors 'none'", "");
  const weak = await runLive(await liveSite(t, { tweak: swap("X-Frame-Options", "SAMEORIGIN"), csp: noFrameAncestors }));
  assert.equal(weak.code, 1);
  assert.match(weak.out, /✖ cabeçalho X-Frame-Options/);

  const anyOther = await runLive(await liveSite(t, { tweak: swap("X-Content-Type-Options", "outro") }));
  assert.equal(anyOther.code, 1, "só X-Frame-Options e Referrer-Policy têm troca tolerada");
});

test("check-live: site fora do ar é erro e uso errado sai com 2", async () => {
  const dead = await runLive("http://127.0.0.1:1");
  assert.equal(dead.code, 1);
  assert.match(dead.out, /não consegui falar com/);

  const noArgs = spawnSync(process.execPath, ["scripts/check-live.mjs"], { cwd: SITE, encoding: "utf8" });
  assert.equal(noArgs.status, 2);
  const invalid = spawnSync(process.execPath, ["scripts/check-live.mjs", "isto não é um endereço"], { cwd: SITE, encoding: "utf8" });
  assert.equal(invalid.status, 2);
});

// ---------- o pacote da Discloud de verdade ----------

const listFiles = (dir, base = dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((item) => (item.isDirectory() ? listFiles(path.join(dir, item.name), base) : [path.relative(base, path.join(dir, item.name)).split(path.sep).join("/")]));

test("o pacote da Discloud: monta, sobe de verdade e serve o dist/ byte a byte com a política", { skip: !existsSync(path.join(DIST, "index.html")) && "rode npm run build antes (não há dist/)" }, async (t) => {
  const work = mkdtempSync(path.join(os.tmpdir(), "devlingo-pkg-"));
  const out = path.join(work, "pacote");
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    rmSync(work, { recursive: true, force: true });
  });

  const built = spawnSync(process.execPath, ["scripts/package-discloud.mjs"], { cwd: SITE, env: { ...process.env, DISCLOUD_OUT: out, DISCLOUD_ID: "teste-pacote" }, encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr || built.stdout);

  // discloud.config: só CHAVE=valor, site, 512 MB e o subdomínio pedido.
  const config = Object.fromEntries(readFileSync(path.join(out, "discloud.config"), "utf8").split("\n").filter(Boolean).map((line) => line.split("=")));
  assert.equal(config.TYPE, "site");
  assert.equal(config.MAIN, "server.js");
  assert.equal(config.ID, "teste-pacote");
  assert.ok(Number(config.RAM) >= 512, "a Discloud exige no mínimo 512 MB para site");
  assert.ok(existsSync(path.join(out, "package.json")), "toda app Node da Discloud precisa de package.json");
  assert.equal(JSON.parse(readFileSync(path.join(out, "package.json"), "utf8")).scripts.start, "node server.js");
  assert.deepEqual(readFileSync(path.join(out, "policy.mjs")), readFileSync(path.join(SITE, "security", "policy.mjs")), "a política do pacote é a do projeto");
  assert.ok(!existsSync(path.join(out, "dist")) && !existsSync(path.join(out, "www", "_headers")), "sem pasta dist (reservada) e sem _headers");

  // Porta livre, e sobe o servidor do pacote como a Discloud faz (node server.js), só que em 127.0.0.1.
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const livePort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));

  child = spawn(process.execPath, ["server.js"], { cwd: out, env: { ...process.env, PORT: String(livePort), HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  const deadline = Date.now() + 15_000;
  while (!logs.includes("no ar em") && child.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(logs.includes("no ar em"), `o servidor não subiu:\n${logs}`);

  // Cada arquivo do dist/ (menos o _headers) sai idêntico, com os cabeçalhos da política.
  const files = listFiles(DIST).filter((rel) => rel !== "_headers");
  assert.ok(files.length >= 10, "o dist/ deveria ter vários arquivos");
  for (const rel of files) {
    const res = await request(livePort, { path: `/${rel}` });
    assert.equal(res.status, 200, `/${rel}`);
    assert.deepEqual(res.body, readFileSync(path.join(DIST, rel)), `/${rel} difere do dist/`);
    assertSecurityHeaders(res, `/${rel}`);
  }
  assert.deepEqual((await request(livePort, { path: "/" })).body, readFileSync(path.join(DIST, "index.html")));

  // O que não é do site continua fora do alcance.
  for (const hidden of ["/_headers", "/server.js", "/serve.mjs", "/policy.mjs", "/package.json", "/discloud.config", "/www/index.html"]) {
    const res = await request(livePort, { path: hidden });
    assert.equal(res.status, 404, `${hidden} não pode ser servido`);
    assertSecurityHeaders(res, hidden);
  }
  const notFound = await request(livePort, { path: "/nada-aqui" });
  assert.equal(notFound.status, 404);
  assert.deepEqual(notFound.body, readFileSync(path.join(DIST, "404.html")));

  const redirect = await request(livePort, { path: "/?a=b", headers: { "X-Forwarded-Proto": "http", Host: "devlingo.discloud.dev" } });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.location, "https://devlingo.discloud.dev/?a=b");
});

test("o empacotador recusa apagar uma pasta que não é um pacote anterior", { skip: !existsSync(path.join(DIST, "index.html")) && "rode npm run build antes (não há dist/)" }, () => {
  const work = mkdtempSync(path.join(os.tmpdir(), "devlingo-recusa-"));
  try {
    writeFileSync(path.join(work, "documento-importante.txt"), "não apague");
    const run = (env) => spawnSync(process.execPath, ["scripts/package-discloud.mjs"], { cwd: SITE, env: { ...process.env, ...env }, encoding: "utf8" });

    const refused = run({ DISCLOUD_OUT: work });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /não parece um pacote anterior/);
    assert.ok(existsSync(path.join(work, "documento-importante.txt")), "o arquivo da pasta recusada tem de continuar lá");

    assert.notEqual(run({ DISCLOUD_OUT: SITE }).status, 0, "nem a pasta do projeto");
    assert.notEqual(run({ DISCLOUD_ID: "Nome Inválido!" }).status, 0, "subdomínio inválido");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
