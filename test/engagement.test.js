const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../src/config");
const db = require("../src/utils/db");
const progress = require("../src/utils/progress");
const achievements = require("../src/utils/achievements");

// Dia n (0 = 1º de novembro) ao meio-dia no Brasil (UTC-3). Dias seguidos = n seguidos.
const day = (n) => new Date(Date.UTC(2026, 10, 1 + n, 15, 0, 0));

const DEFAULTS = {
  timezone: "America/Sao_Paulo",
  dailyXpCap: 200,
  dailyGoal: 5,
  goalBonusXp: 15,
  comboEvery: 5,
  comboBonusXp: 5,
  xpPerLevel: 100,
  streakMilestones: { 3: 10, 7: 30, 14: 60, 30: 150, 60: 300, 100: 500 },
};

const tmpDirs = [];
test.beforeEach(() => {
  Object.assign(config, DEFAULTS);
  db.open(":memory:");
});
test.after(() => {
  db.close();
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- meta diária ----------

test("meta diária: conta respostas certas e erradas, dá o bônus uma vez só e zera no dia seguinte", () => {
  const results = [1, 2, 3, 4, 5, 6].map(() => db.recordAnswer("ana", null, false, 10, day(0)));

  assert.deepEqual(results.map((r) => r.goal.count), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(results.map((r) => r.goal.completed), [false, false, false, false, true, false]);
  assert.deepEqual(results.map((r) => r.bonus.goal), [0, 0, 0, 0, 15, 0]);
  assert.equal(results[4].goal.target, 5);
  assert.equal(results[5].xp, 15, "só o bônus da meta (as respostas estavam erradas)");

  const nextDay = db.recordAnswer("ana", null, false, 10, day(1));
  assert.equal(nextDay.goal.count, 1, "contagem recomeça");
  assert.equal(nextDay.goal.completed, false);
});

test("DAILY_GOAL=0 desliga a meta", () => {
  config.dailyGoal = 0;
  const results = Array.from({ length: 8 }, () => db.recordAnswer("ana", null, false, 10, day(0)));
  assert.ok(results.every((r) => !r.goal.completed && r.bonus.goal === 0));
});

test("o bônus da meta não gasta o limite diário de XP", () => {
  config.dailyXpCap = 50;
  for (let i = 0; i < 4; i++) db.recordAnswer("ana", null, false, 10, day(0));
  const fifth = db.recordAnswer("ana", null, true, 10, day(0));
  assert.equal(fifth.gained, 10);
  assert.equal(fifth.bonus.goal, 15);
  assert.equal(fifth.xp, 25);
  assert.equal(fifth.dailyXp, 10, "o limite só conta o XP das respostas");
});

// ---------- marcos de sequência ----------

test("marco de sequência: bônus no dia em que o marco é atingido, uma vez, e só na 1ª resposta do dia", () => {
  const byDay = [0, 1, 2, 3, 4, 5, 6].map((n) => db.recordAnswer("ana", null, true, 10, day(n)));

  assert.deepEqual(byDay.map((r) => r.streak), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(byDay.map((r) => r.milestone), [null, null, { days: 3, bonus: 10 }, null, null, null, { days: 7, bonus: 30 }]);
  assert.equal(byDay[2].bonus.streak, 10);
  assert.equal(byDay[6].bonus.streak, 30);

  const again = db.recordAnswer("ana", null, true, 10, day(6));
  assert.equal(again.milestone, null, "segunda resposta no mesmo dia não repete o marco");
  assert.equal(again.streak, 7);
});

test("perder a sequência e recomeçar não ganha marco antigo de graça", () => {
  [0, 1, 2].forEach((n) => db.recordAnswer("ana", null, true, 10, day(n))); // marco de 3 dias
  const back = db.recordAnswer("ana", null, true, 10, day(10)); // voltou depois de dias parado
  assert.equal(back.streak, 1);
  assert.equal(back.milestone, null);
});

// ---------- combo ----------

test("combo: sobe a cada acerto, dá bônus a cada 5, e erro zera (avisando se era um combo bom)", () => {
  const hits = [1, 2, 3, 4, 5, 6].map(() => db.recordAnswer("ana", null, true, 10, day(0)));
  assert.deepEqual(hits.map((r) => r.combo), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(hits.map((r) => r.bonus.combo), [0, 0, 0, 0, 5, 0]);

  const miss = db.recordAnswer("ana", null, false, 10, day(0));
  assert.equal(miss.combo, 0);
  assert.equal(miss.comboBroken, 6, "avisa que um combo de 6 acabou");

  const smallMiss = (() => {
    db.recordAnswer("ana", null, true, 10, day(0));
    return db.recordAnswer("ana", null, false, 10, day(0));
  })();
  assert.equal(smallMiss.comboBroken, 0, "combo de 1 não merece aviso de perda");
});

test("combo com o limite diário batido não dá bônus (não houve XP de resposta)", () => {
  config.dailyXpCap = 40;
  const hits = [1, 2, 3, 4, 5].map(() => db.recordAnswer("ana", null, true, 10, day(0)));
  assert.equal(hits[4].combo, 5);
  assert.equal(hits[4].gained, 0);
  assert.equal(hits[4].bonus.combo, 0);
});

// ---------- nível ----------

test("subir de nível é avisado uma vez", () => {
  config.xpPerLevel = 25;
  const [a, b, c, d] = [1, 2, 3, 4].map(() => db.recordAnswer("ana", null, true, 10, day(0)));
  assert.equal(a.levelUp, null);
  assert.equal(b.levelUp, null);
  assert.deepEqual(c.levelUp, { from: 1, to: 2 }, "30 XP passa dos 25");
  assert.equal(c.level, 2);
  assert.equal(d.levelUp, null);
});

test("um bônus que empurra para o próximo nível também conta como subir de nível", () => {
  config.xpPerLevel = 20;
  config.dailyGoal = 2;
  config.goalBonusXp = 15;
  const first = db.recordAnswer("ana", null, false, 10, day(0)); // 0 de XP, meta em 1/2
  assert.equal(first.xp, 0);
  assert.equal(first.levelUp, null);
  // O acerto vale 10 (não chegaria aos 20 sozinho), mas cumpre a meta: +15 -> 25 >= 20.
  const second = db.recordAnswer("ana", null, true, 10, day(0));
  assert.equal(second.gained, 10);
  assert.equal(second.bonus.goal, 15);
  assert.deepEqual(second.levelUp, { from: 1, to: 2 });
});

// ---------- conquistas ----------

test("conquistas: desbloqueia na hora certa, só uma vez, e guarda a lista", () => {
  const first = db.recordAnswer("ana", null, true, 10, day(0));
  assert.deepEqual(first.achievements.map((a) => a.key), ["first"]);

  const second = db.recordAnswer("ana", null, true, 10, day(0));
  assert.deepEqual(second.achievements, [], "não repete");

  for (let i = 0; i < 8; i++) db.recordAnswer("ana", null, true, 10, day(0)); // 10 acertos no total
  assert.ok(db.getAchievements("ana").includes("correct10"));
  assert.ok(db.getAchievements("ana").includes("combo5"));
  assert.deepEqual(db.getAchievements("ana"), [...new Set(db.getAchievements("ana"))], "sem duplicatas");
});

test("conquistas de sequência, de meta e de nível Especialista", () => {
  [0, 1, 2].forEach((n) => db.recordAnswer("ana", null, true, 10, day(n), { difficulty: "beginner" }));
  assert.ok(db.getAchievements("ana").includes("streak3"));
  assert.ok(!db.getAchievements("ana").includes("expert1"));

  const expert = db.recordAnswer("ana", null, true, 10, day(2), { difficulty: "expert" });
  assert.deepEqual(expert.achievements.map((a) => a.key), ["expert1"]);

  const wrongExpert = db.recordAnswer("bia", null, false, 10, day(0), { difficulty: "expert" });
  assert.ok(!wrongExpert.achievements.some((a) => a.key === "expert1"), "errar não conta");

  for (let i = 0; i < 5; i++) db.recordAnswer("caio", null, false, 10, day(0));
  assert.ok(db.getAchievements("caio").includes("goal1"));
});

test("todas as conquistas têm chave única, texto e regra", () => {
  const keys = achievements.list.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const a of achievements.list) {
    assert.ok(a.emoji && a.name && a.description && typeof a.test === "function", a.key);
  }
  // Com estatísticas "gigantes" todas as regras valem; com zeros, nenhuma.
  const huge = { answered: 999, correct: 999, streak: 999, bestStreak: 999, bestCombo: 999, goalDoneDays: 999, expertCorrect: 999, level: 99 };
  const none = { answered: 0, correct: 0, streak: 0, bestStreak: 0, bestCombo: 0, goalDoneDays: 0, expertCorrect: 0, level: 1 };
  assert.equal(achievements.earned(huge).length, achievements.list.length);
  assert.deepEqual(achievements.earned(none), []);
});

// ---------- estatísticas e ranking ----------

test("estatísticas: respostas, acertos, precisão, melhor sequência e melhor combo", () => {
  assert.deepEqual(db.getStats("novo", day(0)), {
    answered: 0, correct: 0, accuracy: 0, streak: 0, bestStreak: 0, combo: 0, bestCombo: 0, goalCount: 0, goalDoneDays: 0,
  });

  [true, true, true, false].forEach((ok) => db.recordAnswer("ana", null, ok, 10, day(0)));
  db.recordAnswer("ana", null, true, 10, day(1));

  const stats = db.getStats("ana", day(1));
  assert.equal(stats.answered, 5);
  assert.equal(stats.correct, 4);
  assert.equal(stats.accuracy, 80);
  assert.equal(stats.bestCombo, 3);
  assert.equal(stats.streak, 2);
  assert.equal(stats.goalCount, 1, "a meta é só de hoje");
  assert.equal(db.getStats("ana", day(5)).streak, 0);
  assert.equal(db.getStats("ana", day(5)).bestStreak, 2, "o recorde não some");
});

test("posição no ranking: global e do servidor, com empate dividindo a posição", () => {
  db.recordAnswer("ana", "g1", true, 10, day(0));
  db.recordAnswer("ana", "g1", true, 10, day(0));
  db.recordAnswer("bia", "g1", true, 10, day(0));
  db.recordAnswer("caio", "g2", true, 10, day(0));
  db.recordAnswer("zero", "g1", false, 10, day(0));

  assert.deepEqual(db.rankOf("ana", null), { position: 1, xp: 20 });
  assert.deepEqual(db.rankOf("bia", null), { position: 2, xp: 10 });
  assert.deepEqual(db.rankOf("caio", null), { position: 2, xp: 10 }, "empate com a bia");
  assert.deepEqual(db.rankOf("bia", "g1"), { position: 2, xp: 10 });
  assert.deepEqual(db.rankOf("caio", "g2"), { position: 1, xp: 10 });
  assert.equal(db.rankOf("zero", null), null, "sem XP não tem posição");
  assert.equal(db.rankOf("bia", "g2"), null, "não jogou nesse servidor");
});

test("o XP de bônus entra no ranking do servidor", () => {
  config.dailyGoal = 1;
  db.recordAnswer("ana", "g1", true, 10, day(0)); // 10 + 15 de meta
  assert.deepEqual(db.top("g1"), [{ userId: "ana", xp: 25 }]);
});

// ---------- progresso (funções puras) ----------

test("nível, título, barra e próximo marco", () => {
  assert.equal(progress.levelOf(0), 1);
  assert.equal(progress.levelOf(99), 1);
  assert.equal(progress.levelOf(100), 2);
  assert.deepEqual(progress.levelProgress(145), { level: 2, into: 45, needed: 100, percent: 45 });

  assert.equal(progress.titleFor(1).name, "Semente");
  assert.equal(progress.titleFor(4).name, "Broto");
  assert.equal(progress.titleFor(5).name, "Árvore");
  assert.equal(progress.titleFor(25).name, "Lenda");

  assert.equal(progress.progressBar(3, 5, 5), "▰▰▰▱▱");
  assert.equal(progress.progressBar(9, 5, 5), "▰▰▰▰▰", "aparado no máximo");
  assert.equal(progress.progressBar(0, 0, 4), "▱▱▱▱");

  assert.deepEqual(progress.nextMilestone(0), { days: 3, bonus: 10, left: 3 });
  assert.deepEqual(progress.nextMilestone(3), { days: 7, bonus: 30, left: 4 });
  assert.equal(progress.nextMilestone(100), null);
});

// ---------- migração ----------

test("banco da versão 2 (só com setup) é migrado para a 3 sem perder dados e já aceita as novas respostas", () => {
  const { DatabaseSync } = require("node:sqlite");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-test-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "devlingo.db");

  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
      last_day TEXT, daily_day TEXT, daily_xp INTEGER NOT NULL DEFAULT 0, level TEXT, areas TEXT);
    CREATE TABLE guild_xp (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id));
    INSERT INTO users (id, xp, streak, last_day, level, areas) VALUES ('velha', 130, 2, '2026-11-01', 'beginner', 'banco');
    PRAGMA user_version = 2;
  `);
  old.close();

  db.open(file);
  assert.equal(db.getUser("velha", day(1)).xp, 130);
  assert.deepEqual(db.getPreferences("velha"), { level: "beginner", areas: ["banco"] });
  assert.equal(db.getStats("velha", day(1)).answered, 0, "estatísticas começam do zero para quem já jogava");
  assert.deepEqual(db.getAchievements("velha"), []);

  const r = db.recordAnswer("velha", null, true, 10, day(1));
  assert.equal(r.xp, 150, "130 de antes + 10 da resposta + 10 do marco de 3 dias");
  assert.equal(r.streak, 3, "a sequência que já existia continua");
  assert.deepEqual(r.milestone, { days: 3, bonus: 10 });
  assert.deepEqual(db.getPreferences("velha"), { level: "beginner", areas: ["banco"] }, "setup preservado");
});
