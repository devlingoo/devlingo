// Monta a pasta que sobe para a Discloud (npm run package:discloud). Rode depois do build (precisa do dist/).
//
// Na pasta de saída, na RAIZ (a Discloud exige o discloud.config na raiz do zip):
//   discloud.config  TYPE=site, o subdomínio (ID) e a memória
//   package.json     toda app Node da Discloud precisa de um (sem dependências)
//   server.js        o ponto de entrada (server/server.js)
//   serve.mjs        o servidor estático (server/serve.mjs)
//   policy.mjs       a política de segurança (security/policy.mjs): é dela que saem os cabeçalhos
//   www/             o site pronto (o dist/, sem os arquivos que só hospedagem estática usa)
// O nome "dist" fica de fora de propósito: a Discloud reserva essa pasta para o build interno dela.
//
// Variáveis: DISCLOUD_ID (subdomínio, padrão "devlingo") e DISCLOUD_OUT (pasta de saída, padrão site/discloud-out).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SITE = path.resolve(import.meta.dirname, "..");
const DIST = path.join(SITE, "dist");
const OUT = path.resolve(process.env.DISCLOUD_OUT || path.join(SITE, "discloud-out"));
const ID = process.env.DISCLOUD_ID || "devlingo";

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

if (!/^[a-z0-9-]{2,20}$/.test(ID)) fail(`DISCLOUD_ID inválido: "${ID}" (2 a 20 caracteres: minúsculas, números e hífen).`);
if (!existsSync(path.join(DIST, "index.html")) || !existsSync(path.join(DIST, "404.html"))) {
  fail("Não achei o dist/ (index.html e 404.html). Rode `npm run build` antes.");
}
// A pasta de saída é apagada antes de ser refeita, então só pode ser uma que não existe, está vazia ou é um pacote anterior
// (tem discloud.config e server.js). Um DISCLOUD_OUT apontado para uma pasta com outras coisas não leva nada embora.
if (OUT === SITE || OUT === DIST || SITE.startsWith(OUT + path.sep)) fail(`DISCLOUD_OUT não pode ser ${OUT}.`);
if (existsSync(OUT) && readdirSync(OUT).length > 0 && !(existsSync(path.join(OUT, "discloud.config")) && existsSync(path.join(OUT, "server.js")))) {
  fail(`${OUT} já existe e não parece um pacote anterior: escolha outra pasta em DISCLOUD_OUT (ou esvazie esta).`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

cpSync(DIST, path.join(OUT, "www"), {
  recursive: true,
  filter: (source) => !["_headers", "_redirects"].includes(path.relative(DIST, source)),
});
cpSync(path.join(SITE, "server", "server.js"), path.join(OUT, "server.js"));
cpSync(path.join(SITE, "server", "serve.mjs"), path.join(OUT, "serve.mjs"));
cpSync(path.join(SITE, "security", "policy.mjs"), path.join(OUT, "policy.mjs"));

writeFileSync(
  path.join(OUT, "package.json"),
  JSON.stringify(
    { name: "devlingo-site", private: true, version: "1.0.0", type: "module", description: "Site do Devlingo na Discloud", main: "server.js", scripts: { start: "node server.js" } },
    null,
    2
  ) + "\n"
);

// discloud.config: só CHAVE=valor (a documentação da Discloud não fala de comentários). 512 MB é o mínimo que eles exigem para site.
writeFileSync(path.join(OUT, "discloud.config"), ["NAME=Devlingo Site", "TYPE=site", "MAIN=server.js", `ID=${ID}`, "RAM=512", "VERSION=latest", "AUTORESTART=true", ""].join("\n"));

const files = [];
const walk = (dir) => {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else files.push(full);
  }
};
walk(OUT);
const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);

console.log(`Pacote da Discloud pronto em ${OUT}`);
console.log(`  ${files.length} arquivos, ${(bytes / 1024).toFixed(0)} KB, subdomínio "${ID}"`);
console.log("  Compacte o CONTEÚDO desta pasta (não a pasta) em um .zip e envie para a Discloud.");
