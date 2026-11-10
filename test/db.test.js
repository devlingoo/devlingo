const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../src/config");
const db = require("../src/utils/db");

// Horários em UTC. America/Sao_Paulo é UTC-3: 15:00Z = meio-dia no Brasil.
const D1 = new Date("2026-11-09T15:00:00Z");
const D1_NIGHT = new Date("2026-11-09T20:00:00Z");
const D2 = new Date("2026-11-10T15:00:00Z");
const D4 = new Date("2026-11-12T15:00:00Z");

const tmpDirs = [];
const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-test-"));
  tmpDirs.push(dir);
  return dir;
};

test.beforeEach(() => {
  config.timezone = "America/Sao_Paulo";
  config.dailyXpCap = 200;
  db.open(":memory:");
});

test.after(() => {
  db.close();
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

test("quem nunca jogou aparece zerado", () => {
  assert.deepEqual(db.getUser("novo", D1), { xp: 0, streak: 0, lastDay: null, dailyXp: 0 });
});

test("acerto dá XP e conta no ranking do servidor; erro não dá XP mas conta como atividade", () => {
  // O retorno tem mais campos (bônus, meta, conquistas...), testados mais abaixo; aqui só o básico.
  const basics = ({ xp, streak, gained, capped, dailyXp }) => ({ xp, streak, gained, capped, dailyXp });

  const right = db.recordAnswer("ana", "g1", true, 10, D1);
  assert.deepEqual(basics(right), { xp: 10, streak: 1, gained: 10, capped: false, dailyXp: 10 });

  const wrong = db.recordAnswer("bia", "g1", false, 10, D1);
  assert.deepEqual(basics(wrong), { xp: 0, streak: 1, gained: 0, capped: false, dailyXp: 0 });

  assert.deepEqual(db.top("g1"), [{ userId: "ana", xp: 10 }]);
});

test("sequência: cresce a cada dia, não muda no mesmo dia e zera ao pular um dia", () => {
  assert.equal(db.recordAnswer("ana", null, true, 10, D1).streak, 1);
  assert.equal(db.recordAnswer("ana", null, true, 10, D1_NIGHT).streak, 1, "mesmo dia");
  assert.equal(db.recordAnswer("ana", null, true, 10, D2).streak, 2, "dia seguinte");

  assert.equal(db.getUser("ana", D2).streak, 2);
  assert.equal(db.getUser("ana", D4).streak, 0, "pulou o dia 11: perdeu a sequência");
  assert.equal(db.recordAnswer("ana", null, true, 10, D4).streak, 1, "recomeça em 1");
});

test("o dia vira à meia-noite do fuso configurado, não do servidor", () => {
  const before = new Date("2026-11-10T02:30:00Z"); // 23:30 do dia 9 no Brasil
  const after = new Date("2026-11-10T03:30:00Z"); //  00:30 do dia 10 no Brasil

  assert.equal(db.recordAnswer("br", null, true, 10, before).streak, 1);
  assert.equal(db.recordAnswer("br", null, true, 10, after).streak, 2, "no Brasil já é outro dia");

  config.timezone = "UTC";
  assert.equal(db.recordAnswer("utc", null, true, 10, before).streak, 1);
  assert.equal(db.recordAnswer("utc", null, true, 10, after).streak, 1, "em UTC ainda é o mesmo dia");
});

test("limite diário: corta o XP, avisa com capped e volta no dia seguinte", () => {
  config.dailyXpCap = 25;
  const results = [1, 2, 3, 4].map(() => db.recordAnswer("ana", "g1", true, 10, D1));

  assert.deepEqual(results.map((r) => r.gained), [10, 10, 5, 0]);
  assert.deepEqual(results.map((r) => r.capped), [false, false, true, true]);
  assert.equal(results[3].xp, 25);
  assert.equal(db.getUser("ana", D1).dailyXp, 25);
  assert.deepEqual(db.top("g1"), [{ userId: "ana", xp: 25 }], "ranking do servidor só soma o XP que entrou");

  const next = db.recordAnswer("ana", "g1", true, 10, D2);
  assert.equal(next.gained, 10, "novo dia, limite zerado");
  assert.equal(next.capped, false);
  assert.equal(db.getUser("ana", D2).dailyXp, 10);
});

test("erro depois de bater o limite não marca capped (não havia XP a perder)", () => {
  config.dailyXpCap = 10;
  db.recordAnswer("ana", null, true, 10, D1);
  assert.equal(db.recordAnswer("ana", null, false, 10, D1).capped, false);
});

test("DAILY_XP_CAP=0 desliga o limite", () => {
  config.dailyXpCap = 0;
  let last;
  for (let i = 0; i < 40; i++) last = db.recordAnswer("ana", null, true, 10, D1);
  assert.equal(last.dailyXp, 400, "40 acertos x 10 XP, sem nada segurado (bônus não entram na conta do limite)");
  assert.equal(last.capped, false);
  assert.ok(last.xp > 400, "o XP total inclui os bônus de combo e de meta");
});

test("ranking: global soma tudo (inclusive DM), servidor só o XP ganho nele; ordem estável", () => {
  db.recordAnswer("ana", "g1", true, 10, D1);
  db.recordAnswer("ana", "g1", true, 10, D1);
  db.recordAnswer("bia", "g2", true, 10, D1);
  db.recordAnswer("caio", null, true, 10, D1); // DM: só entra no global
  db.recordAnswer("caio", null, true, 10, D1);
  db.recordAnswer("caio", null, true, 10, D1);
  db.recordAnswer("zero", "g1", false, 10, D1); // sem XP: não aparece

  assert.deepEqual(db.top(null), [
    { userId: "caio", xp: 30 },
    { userId: "ana", xp: 20 },
    { userId: "bia", xp: 10 },
  ]);
  assert.deepEqual(db.top("g1"), [{ userId: "ana", xp: 20 }]);
  assert.deepEqual(db.top("g2"), [{ userId: "bia", xp: 10 }]);
  assert.deepEqual(db.top("g1", 0), []);
});

test("os dados continuam lá depois de fechar e reabrir o arquivo", () => {
  const file = path.join(tmpDir(), "devlingo.db");
  db.open(file);
  db.recordAnswer("ana", "g1", true, 10, D1);
  db.close();

  db.open(file);
  assert.equal(db.getUser("ana", D1).xp, 10);
  assert.deepEqual(db.top("g1"), [{ userId: "ana", xp: 10 }]);
});

test("importa o antigo data.json uma única vez e guarda o original como backup", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "data.json"),
    JSON.stringify({
      users: { ana: { xp: 50, streak: 3, lastDay: "2026-11-09" }, bia: { xp: 20, streak: 1, lastDay: null } },
      guilds: { g1: { ana: 40, bia: 20 } },
    })
  );

  db.open(path.join(dir, "devlingo.db"));
  assert.equal(db.getUser("ana", D1).xp, 50);
  assert.equal(db.getUser("ana", D1).streak, 3);
  assert.deepEqual(db.top("g1"), [{ userId: "ana", xp: 40 }, { userId: "bia", xp: 20 }]);
  assert.ok(!fs.existsSync(path.join(dir, "data.json")));
  assert.ok(fs.existsSync(path.join(dir, "data.json.migrated")));

  // Um data.json novo aparecendo depois não sobrescreve um banco que já tem dados.
  fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify({ users: { ana: { xp: 999 } } }));
  db.open(path.join(dir, "devlingo.db"));
  assert.equal(db.getUser("ana", D1).xp, 50);
  assert.ok(fs.existsSync(path.join(dir, "data.json")), "não mexe no arquivo se não importou");
});

test("data.json corrompido é ignorado sem derrubar o bot nem apagar o arquivo", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "data.json"), "{ isso não é json");

  db.open(path.join(dir, "devlingo.db"));
  assert.equal(db.getUser("ana", D1).xp, 0);
  assert.ok(fs.existsSync(path.join(dir, "data.json")));
});

// ---------- configuração inicial (nível e áreas) ----------

test("preferências: nulas até configurar; salvar cria a pessoa sem XP; trocar não mexe em XP nem sequência", () => {
  assert.equal(db.getPreferences("ana"), null);

  db.setPreferences("ana", { level: "beginner", areas: ["frontend", "banco"] });
  assert.deepEqual(db.getPreferences("ana"), { level: "beginner", areas: ["frontend", "banco"] });
  assert.deepEqual(db.getUser("ana", D1), { xp: 0, streak: 0, lastDay: null, dailyXp: 0 });
  assert.deepEqual(db.top(null), [], "quem só configurou, sem XP, não aparece no ranking");

  db.recordAnswer("ana", "g1", true, 10, D1);
  db.setPreferences("ana", { level: "advanced", areas: ["devops"] });
  assert.deepEqual(db.getPreferences("ana"), { level: "advanced", areas: ["devops"] });
  assert.equal(db.getUser("ana", D1).xp, 10);
  assert.equal(db.getUser("ana", D1).streak, 1);
});

test("responder depois de configurar não apaga a configuração", () => {
  db.setPreferences("ana", { level: "beginner", areas: ["banco"] });
  db.recordAnswer("ana", null, true, 10, D1);
  assert.deepEqual(db.getPreferences("ana"), { level: "beginner", areas: ["banco"] });
});

test("banco criado antes dessa mudança (versão 1) é migrado sem perder dados", () => {
  const { DatabaseSync } = require("node:sqlite");
  const file = path.join(tmpDir(), "devlingo.db");

  // Esquema exato da versão 1, com uma pessoa que já jogou.
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
      last_day TEXT, daily_day TEXT, daily_xp INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE guild_xp (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id));
    INSERT INTO users (id, xp, streak, last_day) VALUES ('velha', 70, 4, '2026-11-09');
    PRAGMA user_version = 1;
  `);
  old.close();

  db.open(file);
  assert.equal(db.getUser("velha", D1).xp, 70);
  assert.equal(db.getUser("velha", D1).streak, 4);
  assert.equal(db.getPreferences("velha"), null, "quem já jogava precisa passar pelo setup uma vez");

  db.setPreferences("velha", { level: "intermediate", areas: ["backend"] });
  db.close();
  db.open(file);
  assert.deepEqual(db.getPreferences("velha"), { level: "intermediate", areas: ["backend"] });
});
