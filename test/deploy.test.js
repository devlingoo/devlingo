const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// Hospedagem do bot na Discloud: a configuração e o zip que sobe para lá (npm run zip:bot).
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

// Chaves que a Discloud entende no discloud.config. Linhas de comentário não estão na documentação deles,
// então o arquivo só pode ter CHAVE=valor (se um comentário derrubasse o deploy, só se descobriria na hora).
const KNOWN_KEYS = new Set(["NAME", "AVATAR", "TYPE", "MAIN", "RAM", "VERSION", "ID", "BUILD", "START", "AUTORESTART", "VLAN", "HOSTNAME", "APT"]);

function parseConfig(text) {
  const config = {};
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const match = /^([A-Z]+)=(.*)$/.exec(line);
    assert.ok(match, `linha inválida no discloud.config (só CHAVE=valor; comentário não): "${line}"`);
    assert.ok(KNOWN_KEYS.has(match[1]), `chave desconhecida no discloud.config: ${match[1]}`);
    assert.ok(!(match[1] in config), `chave repetida no discloud.config: ${match[1]}`);
    config[match[1]] = match[2];
  }
  return config;
}

test("discloud.config: bot com o ponto de entrada certo, memória segura e nenhum segredo", () => {
  const config = parseConfig(read("discloud.config"));

  assert.equal(config.TYPE, "bot");
  assert.ok(config.NAME.length >= 1 && config.NAME.length <= 30, "NAME tem de 1 a 30 caracteres");
  assert.ok(fs.existsSync(path.join(ROOT, config.MAIN)), `MAIN aponta para um arquivo que não existe: ${config.MAIN}`);
  assert.ok(!("ID" in config), "ID é só de site");
  assert.equal(config.AUTORESTART, "true", "se o bot cair, a Discloud tem de reiniciar");

  // O pico medido (discord.js + banco + 3 certificados renderizados) foi de ~200 MB: com menos de 256 o bot reiniciaria sozinho.
  assert.ok(Number(config.RAM) >= 256, `RAM=${config.RAM} é pouca (o pico medido foi de ~200 MB)`);

  // O comando de início roda o mesmo que `npm start` (com o aviso do node:sqlite desligado) e o MAIN confere.
  const pkg = JSON.parse(read("package.json"));
  assert.equal(config.START, "npm start");
  assert.match(pkg.scripts.start, new RegExp(config.MAIN.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")), "scripts.start roda o MAIN");

  const text = read("discloud.config");
  assert.doesNotMatch(text, /TOKEN|SECRET|PASSWORD/i, "o token nunca vai no discloud.config");
  assert.doesNotMatch(text, /[\w-]{23,28}\.[\w-]{6,7}\.[\w-]{27,}/, "isto parece um token do Discord");
});

test(".discloudignore: só nomes exatos e protege o banco, o .env e o que não é do bot", () => {
  const lines = read(".discloudignore").split(/\r?\n/).filter((line) => line.trim() !== "");

  for (const line of lines) {
    assert.doesNotMatch(line, /[*?]/, `"${line}": a Discloud não aceita curinga no .discloudignore`);
    assert.ok(!line.endsWith("/"), `"${line}": sem barra no fim`);
    assert.ok(!line.startsWith("#"), `"${line}": a Discloud não documenta comentário no .discloudignore`);
  }
  // `data` é o banco com o progresso de todo mundo: um commit com a cópia local o sobrescreveria.
  for (const must of ["data", ".env", "node_modules", ".git", "site", "test", "deploy", "tools"]) {
    assert.ok(lines.includes(must), `faltou "${must}" no .discloudignore`);
  }
});

// ---------- o zip de verdade ----------

// Nomes das entradas de um zip (lê o diretório central, que guarda o nome de cada arquivo em texto puro).
function zipNames(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0, "não achei o fim do zip");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < count; n++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "entrada do diretório central inválida");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString("utf8", offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

// O zip é feito com `git archive`, então vale o que está no Git (no índice, para o teste enxergar o que você acabou de dar
// `git add`). Sem git, ou fora de um repositório (por exemplo, numa cópia solta), não há o que conferir.
function archiveNames() {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  try {
    git("rev-parse", "--is-inside-work-tree");
    const tree = git("write-tree").toString().trim();
    return zipNames(git("archive", "--format=zip", tree));
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    return null;
  }
}

test("o zip do bot (git archive) leva o que o bot usa e nada que não deve ir", (t) => {
  const names = archiveNames();
  if (!names) return t.skip("sem git ou fora de um repositório");
  const has = (name) => names.includes(name);

  // O que o bot precisa para rodar (inclusive os dois SVGs de brand/ que o certificado lê em tempo de execução).
  for (const needed of [
    "src/devlingo.js",
    "src/data/challenges.json",
    "src/utils/certificate.js",
    "brand/logo/logo-horizontal.svg",
    "brand/icons/medal.svg",
    "package.json",
    "package-lock.json",
    ".npmrc",
    "discloud.config",
  ]) {
    assert.ok(has(needed), `faltou no zip: ${needed}`);
  }
  assert.ok(names.some((name) => name.startsWith("src/assets/fonts/") && !name.endsWith("/")), "faltaram as fontes do certificado");

  // O que NUNCA pode ir: o banco, segredos e o que é de outras partes do projeto.
  const forbidden = [/^data\//, /(^|\/)\.env/, /node_modules/, /^site\//, /^test\//, /^deploy\//, /^tools\//, /^\.github\//, /\.db(-wal|-shm)?$/];
  for (const pattern of forbidden) {
    const hit = names.find((name) => pattern.test(name));
    assert.equal(hit, undefined, `não podia ir no zip do bot: ${hit}`);
  }
});

test("zip:bot é o comando que o README manda usar", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts["zip:bot"], /^git archive --format=zip --output=devlingo-bot\.zip HEAD$/);
  assert.match(read(".gitignore"), /^\/devlingo-bot\.zip$/m, "o zip gerado não pode ser commitado por engano");
});
