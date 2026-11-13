// Auto-teste do auditor (npm run audit:selftest): injeta problemas de propósito numa cópia do dist/ e confere que scripts/audit-dist.mjs
// REPROVA cada um. Sem isso, um auditor quebrado diria "tudo certo" para sempre. Rode depois de `npm run build`.
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const SITE = path.resolve(import.meta.dirname, "..");
const base = path.join(SITE, "dist");
const find = (dir, ext) => readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));

const MUTATIONS = [
  ["script inline", (d) => edit(d, "index.html", (h) => h.replace("</body>", "<script>alert(1)</script></body>")), /script. inline/],
  ["atributo onclick", (d) => edit(d, "index.html", (h) => h.replace("<main ", '<main onclick="x()" ')), /atributo de evento onclick/],
  ["atributo style", (d) => edit(d, "index.html", (h) => h.replace("<main ", '<main style="color:red" ')), /atributo style/],
  ["<style> inline", (d) => edit(d, "index.html", (h) => h.replace("</head>", "<style>a{}</style></head>")), /<style> inline/],
  ["iframe", (d) => edit(d, "index.html", (h) => h.replace("</main>", '<iframe src="/x"></iframe></main>')), /tag proibida <iframe>/],
  ["formulário", (d) => edit(d, "index.html", (h) => h.replace("</main>", "<form></form></main>")), /tag proibida <form>/],
  ["javascript: em href", (d) => edit(d, "index.html", (h) => h.replace("</main>", '<a href="javascript:alert(1)">x</a></main>')), /URL perigosa/],
  ["link externo sem noopener", (d) => edit(d, "index.html", (h) => h.replace("</main>", '<a href="https://github.com/x" target="_blank">x</a></main>')), /target=_blank sem rel/],
  ["link para domínio não permitido", (d) => edit(d, "index.html", (h) => h.replace("</main>", '<a href="https://exemplo-malicioso.com/x">x</a></main>')), /fora da lista permitida/],
  ["script de outro domínio", (d) => edit(d, "index.html", (h) => h.replace("</head>", '<script src="https://cdn.exemplo.com/a.js"></script></head>')), /script de outro domínio/],
  ["imagem de outro domínio", (d) => edit(d, "index.html", (h) => h.replace("</main>", '<img src="https://track.exemplo.com/p.gif" alt=""></main>')), /recurso de outro domínio em <img>/],
  ["imagem sem alt", (d) => edit(d, "index.html", (h) => h.replace("</main>", '<img src="/favicon.svg"></main>')), /<img> sem alt/],
  ["meta CSP alterada", (d) => edit(d, "index.html", (h) => h.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")), /CSP da página difere/],
  ["innerHTML no JS", (d) => edit(d, find(d, ".js")[0], (j) => j + "\ndocument.body.innerHTML = x;"), /innerHTML/],
  ["eval no JS", (d) => edit(d, find(d, ".js")[0], (j) => j + "\neval('1');"), /eval\(\)/],
  ["fetch no JS", (d) => edit(d, find(d, ".js")[0], (j) => j + "\nfetch('/x');"), /chamada de rede/],
  ["@import externo no CSS", (d) => edit(d, find(d, ".css")[0], (c) => '@import url("https://fonts.googleapis.com/x.css");' + c), /@import de outro domínio/],
  ["_headers adulterado", (d) => edit(d, "_headers", (t) => t.replace("nosniff", "")), /_headers difere/],
  ["sourcemap no pacote", (d) => writeFileSync(path.join(d, "app.js.map"), "{}"), /arquivo que não deve ir ao ar/],
  ["segundo h1", (d) => edit(d, "index.html", (h) => h.replace("</main>", "<h1>outro</h1></main>")), /exatamente um <h1>/],
];

function edit(dir, file, fn) {
  const target = path.isAbsolute(file) ? file : path.join(dir, file);
  const before = readFileSync(target, "utf-8");
  const after = fn(before);
  if (after === before) throw new Error(`a mutação não alterou ${file}`);
  writeFileSync(target, after);
}

let wrong = 0;
for (const [name, mutate, expected] of MUTATIONS) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "audit-mut-"));
  try {
    cpSync(base, dir, { recursive: true });
    mutate(dir);
    const r = spawnSync(process.execPath, ["scripts/audit-dist.mjs"], { cwd: SITE, encoding: "utf-8", env: { ...process.env, AUDIT_DIST: dir } });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const caught = r.status === 1 && expected.test(out);
    const problems = (out.match(/✖/g) ?? []).length;
    if (!caught) wrong++;
    console.log(`${caught ? "  ✔ reprovou" : "  ✖ NÃO reprovou"}  ${name}  (${problems} problema${problems === 1 ? "" : "s"})${caught ? "" : "\n" + out.split("\n").slice(0, 6).join("\n")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
// controle: o dist original continua passando
const control = spawnSync(process.execPath, ["scripts/audit-dist.mjs"], { cwd: SITE, encoding: "utf-8" });
console.log(`  ${control.status === 0 ? "✔" : "✖"} controle: o dist original passa sem problemas`);
console.log(`\n${MUTATIONS.length - wrong}/${MUTATIONS.length} mutações reprovadas${wrong || control.status !== 0 ? " (HÁ FALHAS NO AUDITOR)" : ""}`);
process.exit(wrong || control.status !== 0 ? 1 : 0);
