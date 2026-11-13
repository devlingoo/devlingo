const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ChannelType } = require("discord.js");
const { TYPE, flatten, customIds, fakeInteraction, fakeClient, assertWithinDiscordLimits } = require("./helpers");

const config = require("../src/config");
const db = require("../src/utils/db");
const challenges = require("../src/utils/challenges");
const daily = require("../src/utils/daily");
const ui = require("../src/utils/ui");
const answerButton = require("../src/buttons/challenge");
const diario = require("../src/commands/diario");

// Dia n (0 = 1º de novembro) ao meio-dia no Brasil (UTC-3).
const day = (n) => new Date(Date.UTC(2026, 10, 1 + n, 15, 0, 0));
const dayKeyOf = (n) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);

const DEFAULTS = {
  timezone: "America/Sao_Paulo",
  dailyXpCap: 200,
  dailyGoal: 5,
  goalBonusXp: 15,
  comboEvery: 5,
  comboBonusXp: 5,
  xpPerLevel: 100,
  streakMilestones: { 3: 10, 7: 30, 14: 60, 30: 150, 60: 300, 100: 500 },
  freezeEvery: 7,
  freezeMax: 2,
  dailyChallengeBonusXp: 10,
  levelUpWindow: 20,
  levelUpPercent: 90,
};

test.beforeEach(() => {
  Object.assign(config, DEFAULTS);
  db.open(":memory:");
});
test.after(() => db.close());

const answerOn = (n, user = "ana") => db.recordAnswer(user, null, true, 10, day(n));
const textOf = (components) =>
  flatten(components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");

// ---------- congelamento de sequência ----------

test("congelamento: ganha 1 a cada 7 dias seguidos e guarda no máximo 2", () => {
  const results = Array.from({ length: 22 }, (_, n) => answerOn(n));
  const earnedAt = results.map((r, i) => (r.freeze.earned ? i + 1 : 0)).filter(Boolean);

  assert.deepEqual(earnedAt, [7, 14], "no 7º e no 14º dia seguido");
  assert.equal(results[5].freeze.left, 0);
  assert.equal(results[6].freeze.left, 1);
  assert.equal(results[13].freeze.left, 2);
  assert.equal(results[20].freeze.left, 2, "no 21º dia já está cheio");
  assert.equal(results[20].freeze.earned, false, "cheio, não ganha mais");
});

test("pulou um dia com congelamento: a sequência segue, o congelamento é gasto e o dia salvo não soma", () => {
  for (let n = 0; n < 7; n++) answerOn(n); // 7 dias seguidos: 1 congelamento
  const back = answerOn(8); // pulou o dia 7

  assert.equal(back.streak, 8, "7 dias + o de hoje");
  assert.deepEqual(back.freeze, { used: 1, earned: false, left: 0 });
  assert.equal(answerOn(9).streak, 9, "e segue normalmente");
});

test("pulou mais dias do que tem congelamentos: a sequência zera e os congelamentos ficam", () => {
  for (let n = 0; n < 7; n++) answerOn(n); // 1 congelamento
  const back = answerOn(9); // pulou os dias 7 e 8

  assert.equal(back.streak, 1);
  assert.deepEqual(back.freeze, { used: 0, earned: false, left: 1 });
});

test("dois congelamentos cobrem dois dias seguidos sem responder, mas não três", () => {
  for (let n = 0; n < 14; n++) answerOn(n); // 14 dias seguidos: 2 congelamentos
  const saved = answerOn(16); // pulou os dias 14 e 15
  assert.equal(saved.streak, 15);
  assert.deepEqual(saved.freeze, { used: 2, earned: false, left: 0 });

  db.close();
  db.open(":memory:");
  for (let n = 0; n < 14; n++) answerOn(n);
  const lost = answerOn(17); // pulou os dias 14, 15 e 16
  assert.equal(lost.streak, 1);
  assert.equal(lost.freeze.left, 2);
});

test("a mesma resposta pode gastar um congelamento e ganhar outro", () => {
  for (let n = 0; n < 13; n++) answerOn(n); // streak 13, 1 congelamento (ganho no 7º)
  const back = answerOn(14); // pulou o dia 13: volta no 14º dia da sequência

  assert.equal(back.streak, 14);
  assert.deepEqual(back.freeze, { used: 1, earned: true, left: 1 });
});

test("responder de novo no mesmo dia não gasta nem ganha congelamento", () => {
  for (let n = 0; n < 7; n++) answerOn(n);
  const again = answerOn(6);
  assert.deepEqual(again.freeze, { used: 0, earned: false, left: 1 });
});

test("sem congelamento nada muda: um dia pulado zera a sequência, como antes", () => {
  answerOn(0);
  answerOn(1);
  const back = answerOn(3);
  assert.equal(back.streak, 1);
  assert.deepEqual(back.freeze, { used: 0, earned: false, left: 0 });
});

test("FREEZE_EVERY=0 não dá congelamentos novos, mas os que a pessoa já tem continuam valendo", () => {
  for (let n = 0; n < 7; n++) answerOn(n); // ganhou 1
  config.freezeEvery = 0;
  const back = answerOn(8);
  assert.equal(back.streak, 8);
  assert.equal(back.freeze.used, 1);

  for (let n = 9; n < 25; n++) assert.equal(answerOn(n).freeze.earned, false);
});

test("a sequência mostrada já conta os congelamentos que vão cobri-la", () => {
  for (let n = 0; n < 7; n++) answerOn(n); // streak 7, 1 congelamento

  assert.equal(db.getUser("ana", day(7)).streak, 7, "ontem foi o dia 6: nada a cobrir");
  assert.deepEqual(db.getHabit("ana", day(7)), { freezes: 1, frozenDays: 0, dailyDone: false });

  assert.equal(db.getUser("ana", day(8)).streak, 7, "pulou o dia 7, o congelamento cobre");
  assert.equal(db.getStats("ana", day(8)).streak, 7);
  assert.equal(db.getHabit("ana", day(8)).frozenDays, 1);

  assert.equal(db.getUser("ana", day(9)).streak, 0, "dois dias pulados, um congelamento só");
  assert.equal(db.getStats("ana", day(9)).streak, 0);
  assert.equal(db.getHabit("ana", day(9)).frozenDays, 0);
});

test("quem nunca jogou não tem congelamento nem desafio do dia cumprido", () => {
  assert.deepEqual(db.getHabit("novo", day(0)), { freezes: 0, frozenDays: 0, dailyDone: false });
});

// ---------- desafio do dia: a pergunta ----------

test("desafio do dia: mesma pergunta para o mesmo nível no mesmo dia, do nível certo, e outra no dia seguinte", () => {
  for (const level of challenges.availableDifficulties()) {
    const today = daily.challengeFor(level.id, dayKeyOf(11));
    assert.equal(today.difficulty, level.id);
    assert.equal(daily.challengeFor(level.id, dayKeyOf(11)).id, today.id, "estável");
    assert.notEqual(daily.challengeFor(level.id, dayKeyOf(12)).id, today.id, "muda no dia seguinte");
  }
});

test("desafio do dia: passa por todas as perguntas do nível antes de repetir qualquer uma", () => {
  for (const level of challenges.availableDifficulties()) {
    const size = challenges.list.filter((c) => c.difficulty === level.id).length;
    const ids = Array.from({ length: size }, (_, n) => daily.challengeFor(level.id, dayKeyOf(n)).id);

    assert.equal(new Set(ids).size, size, `${level.id}: ${size} dias seguidos, ${size} perguntas diferentes`);
    assert.equal(daily.challengeFor(level.id, dayKeyOf(size)).id, ids[0], "depois do ciclo, recomeça");
  }
});

test("desafio do dia: nível sem desafios devolve null", () => {
  assert.equal(daily.challengeFor("inexistente", dayKeyOf(0)), null);
});

// ---------- desafio do dia: o bônus ----------

test("bônus do desafio do dia: +10 XP no primeiro acerto, uma vez por dia, fora do limite diário", () => {
  config.dailyXpCap = 10;

  const wrong = db.recordAnswer("ana", null, false, 10, day(0), { daily: true });
  assert.equal(wrong.daily, null);
  assert.equal(db.hasDoneDaily("ana", day(0)), false, "errar não cumpre o desafio");

  const right = db.recordAnswer("ana", "g1", true, 10, day(0), { daily: true });
  assert.deepEqual(right.daily, { bonus: 10 });
  assert.equal(right.bonus.daily, 10);
  assert.equal(right.bonus.total, 10);
  assert.equal(right.gained, 10);
  assert.equal(right.xp, 20, "10 da resposta + 10 do bônus");
  assert.equal(right.dailyXp, 10, "o bônus não gasta o limite diário");
  assert.equal(db.hasDoneDaily("ana", day(0)), true);
  assert.deepEqual(db.top("g1"), [{ userId: "ana", xp: 20 }], "o bônus também vai para o ranking do servidor");

  const again = db.recordAnswer("ana", null, true, 10, day(0), { daily: true });
  assert.equal(again.daily, null, "o bônus sai uma vez só por dia");
  assert.equal(again.bonus.daily, 0);
  assert.equal(again.gained, 0, "o limite diário já tinha batido");
  assert.equal(again.capped, true);

  const tomorrow = db.recordAnswer("ana", null, true, 10, day(1), { daily: true });
  assert.deepEqual(tomorrow.daily, { bonus: 10 }, "no dia seguinte vale de novo");
  assert.equal(db.hasDoneDaily("ana", day(1)), true);
});

test("o bônus vem mesmo com o limite diário batido", () => {
  config.dailyXpCap = 10;
  db.recordAnswer("ana", null, true, 10, day(0)); // enche o limite
  const right = db.recordAnswer("ana", null, true, 10, day(0), { daily: true });

  assert.equal(right.gained, 0);
  assert.equal(right.capped, true);
  assert.equal(right.bonus.daily, 10);
  assert.equal(right.xp, 20);
});

test("resposta comum nunca dá o bônus do desafio do dia", () => {
  const plain = db.recordAnswer("ana", null, true, 10, day(0), { difficulty: "beginner" });
  assert.equal(plain.daily, null);
  assert.equal(plain.bonus.daily, 0);
  assert.equal(db.hasDoneDaily("ana", day(0)), false);
});

test("bônus em 0: o desafio conta como cumprido, sem XP extra", () => {
  config.dailyChallengeBonusXp = 0;
  const right = db.recordAnswer("ana", null, true, 10, day(0), { daily: true });
  assert.deepEqual(right.daily, { bonus: 0 });
  assert.equal(right.xp, 10);
  assert.equal(db.hasDoneDaily("ana", day(0)), true);
  assert.equal(db.recordAnswer("ana", null, true, 10, day(0), { daily: true }).daily, null);
});

test("cada pessoa cumpre o seu desafio do dia", () => {
  db.recordAnswer("ana", null, true, 10, day(0), { daily: true });
  assert.equal(db.hasDoneDaily("bia", day(0)), false);
  assert.deepEqual(db.recordAnswer("bia", null, true, 10, day(0), { daily: true }).daily, { bonus: 10 });
});

// ---------- desafio do dia: o botão e o comando ----------

const OWNER = "100";
const lastCall = (i) => i.calls[i.calls.length - 1];
const configure = (level = "beginner") => db.setPreferences(OWNER, { level, areas: ["frontend"] });
const todays = (level = "beginner") => daily.challengeFor(level, daily.todayKey());
let nextMessage = 0;

async function click(ch, option) {
  const customId = `ch:${ch.id}:${option}:${OWNER}:${Date.now().toString(36)}:d`;
  const i = fakeInteraction({ customId, userId: OWNER, kind: "button", messageId: `daily-${nextMessage++}` });
  await answerButton.execute(i, customId.split(":"), fakeClient);
  return i;
}

function fakeMessage(authorId) {
  const sent = [];
  return {
    sent,
    author: { id: authorId },
    channel: { type: ChannelType.GuildText, send: async (payload) => sent.push(payload) },
  };
}

test("botão do desafio do dia: acertar cumpre, dá o bônus e oferece atalhos", async () => {
  configure();
  const ch = todays();
  const i = await click(ch, ch.answer);

  assert.equal(lastCall(i).method, "update");
  const text = textOf(lastCall(i).payload.components);
  assert.match(text, /Desafio do dia/);
  assert.match(text, /Desafio do dia cumprido!\*\* \+10 XP de bônus/);
  assert.ok(text.includes(ch.explanation));
  assert.equal(db.hasDoneDaily(OWNER), true);
  assert.equal(db.getUser(OWNER).xp, 20);

  const ids = customIds(lastCall(i).payload.components);
  assert.ok(ids.includes(`nav:${OWNER}:estudar`) && ids.includes(`nav:${OWNER}:perfil`));
  assertWithinDiscordLimits(lastCall(i).payload.components, "desafio do dia respondido", assert);
});

test("botão do desafio do dia: errar não cumpre, avisa que dá para tentar de novo e o acerto seguinte conta", async () => {
  configure();
  const ch = todays();
  const wrong = await click(ch, (ch.answer + 1) % ch.options.length);
  const wrongText = textOf(lastCall(wrong).payload.components);

  assert.match(wrongText, /Errou/);
  assert.match(wrongText, /tentar de novo com `diario`/);
  assert.doesNotMatch(wrongText, /cumprido/);
  assert.equal(db.hasDoneDaily(OWNER), false);

  const right = await click(ch, ch.answer);
  assert.match(textOf(lastCall(right).payload.components), /Desafio do dia cumprido/);
  assert.equal(db.hasDoneDaily(OWNER), true);
});

test("botão do desafio do dia: uma pergunta que não é a de hoje responde normalmente, sem o bônus", async () => {
  configure();
  const today = todays();
  const other = challenges.list.find((c) => c.difficulty === "beginner" && c.id !== today.id);
  const i = await click(other, other.answer);

  const text = textOf(lastCall(i).payload.components);
  assert.match(text, /Acertou/);
  assert.doesNotMatch(text, /cumprido/);
  assert.equal(db.hasDoneDaily(OWNER), false);
  assert.equal(db.getUser(OWNER).xp, 10, "só o XP da resposta");
});

test("a mensagem do desafio do dia: título, botões marcados com :d e o aviso do bônus", () => {
  const ch = todays();
  const components = ui.challengeMessage(ch, OWNER, "abc", { type: "open", isDaily: true });
  const text = textOf(components);

  assert.match(text, /## 📆 Desafio do dia · /);
  assert.match(text, /\+10 XP de bônus no primeiro acerto do dia, fora do limite diário/);
  const buttons = customIds(components);
  assert.equal(buttons.length, ch.options.length);
  assert.ok(buttons.every((id) => id.startsWith("ch:") && id.endsWith(":d")), buttons.join(" "));
  assertWithinDiscordLimits(components, "desafio do dia aberto", assert);

  config.dailyChallengeBonusXp = 0;
  assert.doesNotMatch(textOf(ui.challengeMessage(ch, OWNER, "abc", { type: "open", isDaily: true })), /XP de bônus/);
});

test("o desafio do dia que expirou diz como pedir de novo", () => {
  const text = textOf(ui.challengeMessage(todays(), OWNER, "abc", { type: "expired", isDaily: true }));
  assert.match(text, /expirou/);
  assert.match(text, /`diario`/);
});

test("comando diario: quem nunca configurou passa pela configuração primeiro", async () => {
  const msg = fakeMessage("201");
  await diario.execute({ message: msg, client: fakeClient });
  assert.ok(customIds(msg.sent[0].components).includes("setup:areas:201"));
});

test("comando diario: manda a pergunta de hoje do nível da pessoa, e só uma vez depois de cumprida", async () => {
  configure("intermediate");
  const msg = fakeMessage(OWNER);
  await diario.execute({ message: msg, client: fakeClient });

  const ids = customIds(msg.sent[0].components);
  const expected = todays("intermediate");
  assert.equal(ids.length, expected.options.length);
  const shape = new RegExp(`^ch:${expected.id}:\\d:${OWNER}:[0-9a-z]+:d$`);
  assert.ok(ids.every((id) => shape.test(id)), ids.join(" "));
  assertWithinDiscordLimits(msg.sent[0].components, "diario", assert);

  db.recordAnswer(OWNER, null, true, 10, new Date(), { daily: true });
  const again = fakeMessage(OWNER);
  await diario.execute({ message: again, client: fakeClient });
  assert.deepEqual(customIds(again.sent[0].components), [], "sem botões de resposta");
  assert.match(textOf(again.sent[0].components), /já cumpriu o desafio de hoje/);
});

// ---------- telas ----------

test("celebração: congelamento usado e congelamento ganho aparecem na resposta, com a mensagem dourada", () => {
  const ch = todays();
  const base = { type: "answered", chosen: ch.answer, correct: true, gained: 10, xp: 30, level: 1, streak: 8, isDaily: false };

  const used = textOf(ui.challengeMessage(ch, OWNER, "abc", { ...base, freeze: { used: 2, earned: false, left: 0 } }));
  assert.match(used, /Congelamento usado!\*\* Você ficou 2 dias sem responder e a sequência não quebrou\. Restam 0\/2/);

  const earned = textOf(ui.challengeMessage(ch, OWNER, "abc", { ...base, freeze: { used: 0, earned: true, left: 1 } }));
  assert.match(earned, /Você ganhou um congelamento!\*\*.*1\/2/);

  // Gastou e ganhou na mesma resposta: a 1ª linha mostra o saldo antes do ganho, a 2ª o saldo final.
  const both = textOf(ui.challengeMessage(ch, OWNER, "abc", { ...base, freeze: { used: 1, earned: true, left: 1 } }));
  assert.match(both, /Congelamento usado!.*Restam 0\/2/);
  assert.match(both, /Você ganhou um congelamento!\*\*.*1\/2/);

  const quiet = textOf(ui.challengeMessage(ch, OWNER, "abc", { ...base, freeze: { used: 0, earned: false, left: 1 } }));
  assert.doesNotMatch(quiet, /ongelamento/);

  const container = ui.challengeMessage(ch, OWNER, "abc", { ...base, freeze: { used: 1, earned: false, left: 0 } })[0].toJSON();
  assert.equal(container.accent_color, config.colors.gold);
});

test("perfil: mostra congelamentos e desafio do dia, e avisa quando um congelamento vai salvar a sequência", () => {
  const profile = (habit, streak = 5) =>
    textOf(
      ui.profileMessage({
        name: "Ana",
        avatarUrl: "https://cdn.example/a.png",
        user: { xp: 120, streak, dailyXp: 0 },
        stats: { answered: 9, correct: 7, accuracy: 78, streak, bestStreak: streak, combo: 0, bestCombo: 2, goalCount: 0, goalDoneDays: 0 },
        habit,
        ownerId: OWNER,
      })
    );

  const fresh = profile({ freezes: 0, frozenDays: 0, dailyDone: false });
  assert.match(fresh, /❄️ Congelamentos: \*\*0\/2\*\* • ganhe um a cada 7 dias seguidos/);
  assert.match(fresh, /📆 Desafio do dia: \*\*disponível\*\* — use `diario` \(\+10 XP\)/);
  assert.match(fresh, /⏳ Responda hoje para manter/);

  const done = profile({ freezes: 2, frozenDays: 0, dailyDone: true });
  assert.match(done, /Congelamentos: \*\*2\/2\*\*(?! •)/);
  assert.match(done, /Desafio do dia: \*\*cumprido\*\* ✅/);

  const covered = profile({ freezes: 1, frozenDays: 1, dailyDone: false });
  assert.match(covered, /Você ficou 1 dia sem responder: responda hoje e um congelamento salva sua sequência de 5 dias/);
  assert.doesNotMatch(covered, /⏳ Responda hoje/, "o aviso do congelamento substitui o de risco");

  assert.match(profile({ freezes: 2, frozenDays: 2, dailyDone: false }), /os congelamentos salvam/);

  const without = profile(null);
  assert.doesNotMatch(without, /Congelamentos|Desafio do dia/, "sem os dados, essas linhas somem");
});

// ---------- migração ----------

test("banco antigo (versão 5) ganha congelamento e desafio do dia sem perder dados", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-v5-"));
  try {
    const file = path.join(dir, "devlingo.db");
    db.open(file);
    for (let n = 0; n < 3; n++) answerOn(n, "velha");
    db.close();

    // Volta o banco para a versão 5, como estava antes do congelamento e do desafio do dia.
    const { DatabaseSync } = require("node:sqlite");
    const raw = new DatabaseSync(file);
    raw.exec("ALTER TABLE users DROP COLUMN freezes; DROP TABLE daily_done; PRAGMA user_version = 5;");
    raw.close();

    db.open(file);
    assert.equal(db.getUser("velha", day(2)).streak, 3, "a sequência que já existia continua");
    assert.deepEqual(db.getHabit("velha", day(2)), { freezes: 0, frozenDays: 0, dailyDone: false });
    assert.deepEqual(db.recordAnswer("velha", null, true, 10, day(3), { daily: true }).daily, { bonus: 10 });
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("migração que falha fecha o banco em vez de deixar o arquivo preso", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-broken-"));
  try {
    const file = path.join(dir, "devlingo.db");
    // Um banco que diz estar na versão 0 mas já tem a tabela "users": a primeira migração não consegue criá-la.
    const { DatabaseSync } = require("node:sqlite");
    const raw = new DatabaseSync(file);
    raw.exec("CREATE TABLE users (id TEXT PRIMARY KEY)");
    raw.close();

    assert.throws(() => db.open(file), /already exists/);
    // Com a conexão aberta o SQLite deixa os arquivos -wal e -shm ao lado do banco (e no Windows a pasta
    // nem pode ser apagada); fechada, sobra só o banco.
    assert.deepEqual(fs.readdirSync(dir), ["devlingo.db"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
