// Diagnóstico DESCARTÁVEL para a Discloud. Não faz parte do Devlingo e não usa token nenhum.
// Mostra nos logs o que o bot precisa saber antes de ser hospedado: versão do Node, node:sqlite (e o modo WAL),
// se os arquivos criados em tempo de execução sobrevivem a reinício e a commit, o pacote nativo do resvg,
// memória disponível, variáveis de ambiente, fuso horário e acesso ao Discord.
const fs = require("fs");
const os = require("os");
const path = require("path");

const results = [];
function say(ok, name, detail = "") {
  const tag = ok === true ? "OK   " : ok === false ? "FALHA" : "info ";
  results.push({ ok, name });
  console.log(`[${tag}] ${name}${detail ? ` -> ${detail}` : ""}`);
}
const mb = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

async function main() {
  console.log("==================== DIAGNOSTICO DEVLINGO / DISCLOUD ====================");
  console.log(`iniciado em ${new Date().toISOString()}`);

  // 1) Node e sistema
  const [major, minor] = process.versions.node.split(".").map(Number);
  say(major > 22 || (major === 22 && minor >= 13), "Node.js >= 22.13 (o bot exige, por causa do node:sqlite)", `versão ${process.version}`);
  say(null, "Sistema", `${process.platform}/${process.arch}, ${os.cpus().length} CPU(s)`);
  const glibc = process.report?.getReport?.().header?.glibcVersionRuntime;
  say(null, "libc", process.platform !== "linux" ? "não se aplica (não é Linux)" : glibc ? `glibc ${glibc}` : "não é glibc (provavelmente musl/Alpine)");

  // 2) Arquivos de dados: sobrevivem a reinício e a commit?
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const counterFile = path.join(dataDir, "boots.txt");
  const boots = (fs.existsSync(counterFile) ? Number(fs.readFileSync(counterFile, "utf8")) || 0 : 0) + 1;
  fs.writeFileSync(counterFile, String(boots));
  say(null, "Arquivo data/boots.txt", `esta é a inicialização nº ${boots} (se subir ao reiniciar, o disco persiste)`);

  // 3) node:sqlite e WAL (o bot usa os dois)
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(dataDir, "check.db"));
    const mode = db.prepare("PRAGMA journal_mode = WAL").get().journal_mode;
    say(mode === "wal", "SQLite em modo WAL (o bot liga este modo)", `journal_mode = ${mode}`);
    db.exec("CREATE TABLE IF NOT EXISTS boots (at TEXT NOT NULL)");
    db.prepare("INSERT INTO boots (at) VALUES (?)").run(new Date().toISOString());
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM boots").get();
    say(true, "node:sqlite funciona e grava", `${n} linha(s) no banco data/check.db (se sobe a cada reinício, o banco persiste)`);
    db.close();
  } catch (error) {
    say(false, "node:sqlite", error.message);
  }

  // 4) Pacote nativo (o certificado usa o @resvg/resvg-js)
  try {
    const { Resvg } = require("@resvg/resvg-js");
    const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>').render().asPng();
    say(png.length > 0, "@resvg/resvg-js (pacote nativo) renderiza", `PNG de ${png.length} bytes`);
  } catch (error) {
    say(false, "@resvg/resvg-js (pacote nativo)", error.message);
  }
  const scope = path.join(__dirname, "node_modules", "@resvg");
  say(null, "Pacotes instalados em node_modules/@resvg", fs.existsSync(scope) ? fs.readdirSync(scope).join(", ") : "pasta não existe (as dependências não foram instaladas?)");
  say(null, "node_modules/.package-lock.json", fs.existsSync(path.join(__dirname, "node_modules", ".package-lock.json")) ? "existe (instalou com npm)" : "não existe");
  say(null, "package-lock.json enviado", fs.existsSync(path.join(__dirname, "package-lock.json")) ? "SIM (ficou no zip)" : "não (a documentação manda excluir)");

  // 5) Memória
  let limit = "sem limite lido";
  for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const raw = fs.readFileSync(file, "utf8").trim();
      limit = raw === "max" ? "max (sem limite no cgroup)" : mb(Number(raw));
      break;
    } catch {}
  }
  say(null, "Memória", `RAM do sistema ${mb(os.totalmem())}, limite do contêiner ${limit}, uso deste processo ${mb(process.memoryUsage().rss)}`);

  // 6) Variáveis de ambiente (cadastre CHECK_VAR=abc123 no painel para testar)
  const value = process.env.CHECK_VAR;
  say(null, "Variável CHECK_VAR (painel)", value ? `chegou, ${value.length} caractere(s)` : "NÃO chegou (cadastre CHECK_VAR no painel e faça rebuild)");

  // 7) Fuso horário e ICU (o bot usa Intl com America/Sao_Paulo)
  try {
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date());
    say(true, "Intl com America/Sao_Paulo", `agora são ${hour}h lá; fuso do sistema: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  } catch (error) {
    say(false, "Intl com America/Sao_Paulo", error.message);
  }

  // 8) Rede: o bot precisa falar com o Discord
  try {
    const response = await fetch("https://discord.com/api/v10/gateway", { signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    say(response.ok && Boolean(body.url), "Acesso à API do Discord", `HTTP ${response.status}, gateway ${body.url}`);
  } catch (error) {
    say(false, "Acesso à API do Discord", error.message);
  }

  const failed = results.filter((r) => r.ok === false);
  console.log("--------------------------------------------------------------------------");
  console.log(failed.length === 0 ? "RESUMO: nenhuma falha." : `RESUMO: ${failed.length} FALHA(S): ${failed.map((r) => r.name).join(" | ")}`);
  console.log("==========================================================================");
}

main()
  .catch((error) => console.log("[FALHA] erro inesperado no diagnóstico:", error))
  .finally(() => {
    if (process.env.CHECK_ONCE) process.exit(0); // só para rodar no computador
    // Fica no ar (um bot que encerra pode ser reiniciado em loop): um sinal de vida por minuto nos logs.
    setInterval(() => console.log(`[info ] vivo desde ${new Date(Date.now() - process.uptime() * 1000).toISOString()}, uso ${mb(process.memoryUsage().rss)}`), 60_000);
  });
