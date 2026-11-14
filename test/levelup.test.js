const test = require("node:test");
const assert = require("node:assert/strict");
const { TYPE, flatten, customIds, fakeInteraction, fakeClient, assertWithinDiscordLimits } = require("./helpers");

const config = require("../src/config");
const db = require("../src/utils/db");
const challenges = require("../src/utils/challenges");
const study = require("../src/utils/study");
const answerButton = require("../src/buttons/challenge");
const setupButton = require("../src/buttons/setup");

const OWNER = "100";
const lastCall = (i) => i.calls[i.calls.length - 1];
const textOf = (call) =>
  flatten(call.payload.components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");

test.beforeEach(() => {
  Object.assign(config, { levelUpWindow: 20, levelUpPercent: 90, dailyXpCap: 0 });
  db.open(":memory:");
});
test.after(() => db.close());

// Responde direto no banco, como se a pessoa tivesse clicado numa pergunta do nível `difficulty`.
const answer = (correct, difficulty = "beginner", userId = OWNER) =>
  db.recordAnswer(userId, null, correct, 10, new Date(), { difficulty });
// n respostas seguidas com o mesmo resultado; devolve o progresso da última.
const repeat = (n, correct, difficulty) => {
  let last;
  for (let i = 0; i < n; i++) last = answer(correct, difficulty).levelProgress;
  return last;
};
const configure = (level = "beginner", areas = ["frontend"]) => db.setPreferences(OWNER, { level, areas });

// ---------- o que conta como resposta "do nível" ----------

test("só conta resposta do nível escolhido em configurar; sem configurar, nada conta", () => {
  assert.equal(answer(true).levelProgress, null, "sem configuração não há nível para avaliar");

  configure("beginner");
  assert.equal(answer(true, "intermediate").levelProgress, null, "pergunta de outro nível não entra");
  assert.deepEqual(answer(true).levelProgress, { answered: 1, correct: 1 });
  assert.deepEqual(answer(false).levelProgress, { answered: 2, correct: 1 });
  assert.equal(answer(true, "advanced").levelProgress, null, "e também não zera o que já foi contado");
  assert.deepEqual(answer(true).levelProgress, { answered: 3, correct: 2 });
});

test("a janela guarda só as últimas respostas e anda uma a uma", () => {
  config.levelUpWindow = 5;
  configure("beginner");
  for (const correct of [false, false, true, true, true]) answer(correct);
  assert.deepEqual(answer(true).levelProgress, { answered: 5, correct: 4 }, "o erro mais antigo saiu da janela");
  assert.deepEqual(answer(true).levelProgress, { answered: 5, correct: 5 }, "o segundo erro também");
  assert.deepEqual(answer(false).levelProgress, { answered: 5, correct: 4 });
});

test("LEVEL_UP_WINDOW=0 desliga: nada é contado nem sugerido", () => {
  config.levelUpWindow = 0;
  configure("beginner");
  const progress = repeat(30, true);
  assert.equal(progress, null);
  assert.equal(study.levelSuggestion(OWNER, { answered: 30, correct: 30 }), null);
});

test("trocar de nível zera a contagem; mexer só nas áreas não", () => {
  configure("beginner", ["frontend"]);
  repeat(7, true);

  configure("beginner", ["backend", "banco"]);
  assert.deepEqual(answer(true).levelProgress, { answered: 8, correct: 8 }, "mesmo nível: continua de onde estava");

  configure("intermediate", ["backend", "banco"]);
  assert.deepEqual(answer(true, "intermediate").levelProgress, { answered: 1, correct: 1 }, "nível novo: começa do zero");
});

// ---------- quando sugerir ----------

test("com a janela cheia e 90% de acerto sugere o nível de cima e recomeça a contagem", () => {
  configure("beginner", ["frontend", "backend"]);
  repeat(18, true);
  repeat(1, false);
  const progress = answer(true).levelProgress;
  assert.deepEqual(progress, { answered: 20, correct: 19 });

  const suggestion = study.levelSuggestion(OWNER, progress);
  assert.equal(suggestion.from.id, "beginner");
  assert.equal(suggestion.to.id, "intermediate");
  assert.equal(suggestion.correct, 19);
  assert.equal(suggestion.answered, 20);

  assert.deepEqual(answer(true).levelProgress, { answered: 1, correct: 1 }, "depois de sugerir, a contagem recomeça");
  assert.equal(study.levelSuggestion(OWNER, { answered: 1, correct: 1 }), null);
  assert.deepEqual(db.getPreferences(OWNER), { level: "beginner", areas: ["frontend", "backend"] }, "sugerir não muda o nível sozinho");
});

test("exatamente 90% já basta; abaixo disso não sugere e a janela continua andando", () => {
  configure("beginner");
  repeat(2, false);
  const exact = repeat(18, true); // 18 de 20 = 90%
  assert.deepEqual(exact, { answered: 20, correct: 18 });
  assert.ok(study.levelSuggestion(OWNER, exact), "sugerir zera a contagem");

  repeat(3, false);
  const below = repeat(17, true); // 17 de 20 = 85%
  assert.deepEqual(below, { answered: 20, correct: 17 });
  assert.equal(study.levelSuggestion(OWNER, below), null);
  assert.equal(answer(true).levelProgress.answered, 20, "sem sugerir, nada foi zerado");
});

test("janela incompleta nunca sugere, mesmo com 100% de acerto", () => {
  configure("beginner");
  const progress = repeat(19, true);
  assert.deepEqual(progress, { answered: 19, correct: 19 });
  assert.equal(study.levelSuggestion(OWNER, progress), null);
});

test("LEVEL_UP_PERCENT muda o mínimo; 100 exige a janela inteira certa", () => {
  config.levelUpPercent = 100;
  configure("beginner");
  repeat(1, false);
  assert.equal(study.levelSuggestion(OWNER, repeat(19, true)), null, "19 de 20 não basta");
  db.clearRecent(OWNER);
  assert.ok(study.levelSuggestion(OWNER, repeat(20, true)));
});

test("no último nível não há para onde subir: não sugere e não zera a contagem", () => {
  configure("expert");
  const progress = repeat(20, true, "expert");
  assert.deepEqual(progress, { answered: 20, correct: 20 });
  assert.equal(study.levelSuggestion(OWNER, progress), null);
  assert.equal(answer(true, "expert").levelProgress.answered, 20);
});

test("progresso ausente ou pessoa sem configuração válida: nada a sugerir", () => {
  assert.equal(study.levelSuggestion(OWNER, null), null);
  assert.equal(study.levelSuggestion("ninguem", { answered: 20, correct: 20 }), null);
});

// ---------- promover ----------

test("promover troca só o nível, mantém áreas e XP, e recomeça a contagem", () => {
  configure("beginner", ["backend", "devops"]);
  repeat(5, true);
  const xpBefore = db.getUser(OWNER).xp;
  assert.ok(xpBefore > 0);

  const result = study.promote(OWNER, "intermediate");
  assert.equal(result.status, "ok");
  assert.deepEqual(db.getPreferences(OWNER), { level: "intermediate", areas: ["backend", "devops"] });
  assert.equal(db.getUser(OWNER).xp, xpBefore);
  assert.deepEqual(answer(true, "intermediate").levelProgress, { answered: 1, correct: 1 });
});

test("promover só aceita o nível logo acima: pular nível, voltar ou nível que não existe é recusado", () => {
  configure("beginner");
  assert.equal(study.promote(OWNER, "advanced").status, "invalid", "pular um nível");
  assert.equal(study.promote(OWNER, "god").status, "invalid");
  assert.equal(study.promote(OWNER, "beginner").status, "already");
  assert.equal(study.promote("ninguem", "intermediate").status, "invalid", "sem configuração");
  assert.equal(db.getPreferences(OWNER).level, "beginner", "nada mudou");

  configure("intermediate");
  assert.equal(study.promote(OWNER, "beginner").status, "invalid", "descer não é promover");
});

// ---------- na tela, pelos botões ----------

// Clica numa resposta de uma pergunta do nível dado. `messageId` precisa mudar a cada clique.
let messageCounter = 0;
async function click({ difficulty = "beginner", right = true, study: studyMode = false } = {}) {
  const ch = challenges.list.find((c) => c.difficulty === difficulty);
  const option = right ? ch.answer : (ch.answer + 1) % ch.options.length;
  const customId = `ch:${ch.id}:${option}:${OWNER}:${Date.now().toString(36)}${studyMode ? ":s" : ""}`;
  const interaction = fakeInteraction({ customId, userId: OWNER, kind: "button", messageId: `msg-${++messageCounter}` });
  await answerButton.execute(interaction, customId.split(":"), fakeClient);
  return interaction;
}

test("a resposta que fecha a janela mostra o convite e o botão de subir, sem mudar o nível sozinha", async () => {
  configure("beginner", ["frontend"]);
  repeat(19, true);

  const i = await click();
  const text = textOf(lastCall(i));
  assert.match(text, /Você está mandando bem no nível Iniciante/);
  assert.match(text, /20 respostas/);
  assert.match(text, /Intermediário/);
  assert.ok(customIds(lastCall(i).payload.components).includes(`setup:up:${OWNER}:intermediate`));
  assertWithinDiscordLimits(lastCall(i).payload.components, "resposta com sugestão", assert);
  assert.equal(db.getPreferences(OWNER).level, "beginner");

  const next = await click();
  assert.doesNotMatch(textOf(lastCall(next)), /mandando bem/, "o convite aparece uma vez só, não a cada acerto");
});

test("um erro na janela não impede: o convite vem no acerto seguinte, e errar não mostra convite", async () => {
  configure("beginner");
  repeat(19, true);

  const wrong = await click({ right: false });
  assert.doesNotMatch(textOf(lastCall(wrong)), /mandando bem/, "no erro não há convite");
  assert.ok(!customIds(lastCall(wrong).payload.components).some((id) => id.startsWith("setup:up:")));

  const right = await click(); // janela: 18 certas, 1 erro e esta certa = 19 de 20
  assert.match(textOf(lastCall(right)), /19 acertos nas últimas 20 respostas/);
});

test("em sessão de estudo o convite convive com os botões de navegação", async () => {
  configure("beginner");
  repeat(19, true);
  const i = await click({ study: true });
  const ids = customIds(lastCall(i).payload.components);
  assert.ok(ids.includes(`setup:up:${OWNER}:intermediate`));
  assert.ok(ids.some((id) => id.startsWith("learn:next:")), "continua com 'Próxima pergunta'");
  assertWithinDiscordLimits(lastCall(i).payload.components, "sugestão em sessão de estudo", assert);
});

test("quem responde pergunta de outro nível não recebe convite", async () => {
  configure("beginner");
  repeat(19, true);
  const i = await click({ difficulty: "advanced" });
  assert.doesNotMatch(textOf(lastCall(i)), /mandando bem/);
});

test("o botão 'Subir para ...' promove em resposta só da pessoa e guarda a explicação na tela", async () => {
  configure("beginner", ["frontend", "backend"]);
  const customId = `setup:up:${OWNER}:intermediate`;

  const i = fakeInteraction({ customId, userId: OWNER, kind: "button" });
  await setupButton.execute(i, customId.split(":"), fakeClient);
  assert.equal(lastCall(i).method, "reply", "não substitui a mensagem da pergunta");
  assert.ok(lastCall(i).payload.flags, "resposta efêmera (flags de efêmera + Components V2)");
  assert.match(textOf(lastCall(i)), /Você subiu de nível/);
  assert.match(textOf(lastCall(i)), /Intermediário/);
  assert.ok(customIds(lastCall(i).payload.components).includes(`learn:topics:${OWNER}:intermediate`), "atalho para estudar já no nível novo");
  assert.deepEqual(db.getPreferences(OWNER), { level: "intermediate", areas: ["frontend", "backend"] });

  // Segundo clique no mesmo botão (a mensagem antiga continua lá): só avisa, não mexe em nada.
  const again = fakeInteraction({ customId, userId: OWNER, kind: "button" });
  await setupButton.execute(again, customId.split(":"), fakeClient);
  assert.match(lastCall(again).payload.content, /já está no nível Intermediário/);
  assert.equal(db.getPreferences(OWNER).level, "intermediate");
});

test("botão de subir: só o dono usa, e convite velho (nível que já não é o seguinte) é recusado", async () => {
  configure("beginner");
  const other = fakeInteraction({ customId: `setup:up:${OWNER}:intermediate`, userId: "999", kind: "button" });
  await setupButton.execute(other, other.customId.split(":"), fakeClient);
  assert.equal(lastCall(other).method, "reply");
  assert.equal(db.getPreferences(OWNER).level, "beginner");

  configure("advanced"); // a pessoa mudou de nível depois de ver o convite
  const stale = fakeInteraction({ customId: `setup:up:${OWNER}:intermediate`, userId: OWNER, kind: "button" });
  await setupButton.execute(stale, stale.customId.split(":"), fakeClient);
  assert.match(lastCall(stale).payload.content, /não vale mais/);
  assert.equal(db.getPreferences(OWNER).level, "advanced");
});

test("banco antigo (versão 4) ganha a coluna nova sem perder dados", () => {
  const fs = require("fs");
  const os = require("os");
  const path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-v4-"));
  try {
    const file = path.join(dir, "devlingo.db");
    db.open(file);
    db.setPreferences("velha", { level: "beginner", areas: ["banco"] });
    db.close();

    // Volta o banco para a versão 4: sem a coluna desta mudança (v5) e sem o que as versões seguintes criaram.
    const { DatabaseSync } = require("node:sqlite");
    const raw = new DatabaseSync(file);
    raw.exec("ALTER TABLE users DROP COLUMN recent; ALTER TABLE users DROP COLUMN freezes; DROP TABLE daily_done; PRAGMA user_version = 4;");
    raw.close();

    db.open(file);
    assert.deepEqual(db.getPreferences("velha"), { level: "beginner", areas: ["banco"] });
    assert.deepEqual(db.recordAnswer("velha", null, true, 10, new Date(), { difficulty: "beginner" }).levelProgress, { answered: 1, correct: 1 });
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
