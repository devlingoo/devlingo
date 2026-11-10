const test = require("node:test");
const assert = require("node:assert/strict");
const { TYPE, flatten, customIds, fakeInteraction } = require("./helpers");

const db = require("../src/utils/db");
const challenges = require("../src/utils/challenges");
const areas = require("../src/utils/areas");
const study = require("../src/utils/study");
const setup = require("../src/buttons/setup");
const learn = require("../src/buttons/aprender");

const OWNER = "100";
const lastCall = (i) => i.calls[i.calls.length - 1];
const run = (handler, interaction) => handler.execute(interaction, interaction.customId.split(":"), {});
const textOf = (call) =>
  flatten(call.payload.components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");

// Valores oferecidos pelo menu de seleção da mensagem (assuntos, níveis ou áreas).
const optionValues = (call) =>
  flatten(call.payload.components)
    .filter((n) => n.type === TYPE.StringSelect)
    .flatMap((n) => n.options.map((o) => o.value));

test.beforeEach(() => db.open(":memory:"));
test.after(() => db.close());

// ---------- o setup em si ----------

test("setup completo: áreas (passo 1) -> nível (passo 2) -> salvo, com atalho para estudar", async () => {
  const step1 = fakeInteraction({ customId: `setup:areas:${OWNER}`, userId: OWNER, kind: "menu", values: ["frontend", "backend"] });
  await run(setup, step1);
  assert.equal(lastCall(step1).method, "update");
  assert.ok(customIds(lastCall(step1).payload.components).includes(`setup:level:${OWNER}:frontend,backend`));
  assert.equal(db.getPreferences(OWNER), null, "nada é gravado antes do passo 2");

  const step2 = fakeInteraction({ customId: `setup:level:${OWNER}:frontend,backend`, userId: OWNER, kind: "menu", values: ["intermediate"] });
  await run(setup, step2);
  assert.deepEqual(db.getPreferences(OWNER), { level: "intermediate", areas: ["frontend", "backend"] });
  assert.match(textOf(lastCall(step2)), /Tudo pronto/);
  assert.ok(customIds(lastCall(step2).payload.components).includes(`learn:topics:${OWNER}:intermediate`));
});

test("configurar de novo troca as escolhas, mantém XP e sequência, e mostra as atuais já marcadas", async () => {
  db.recordAnswer(OWNER, null, true, 10);
  db.setPreferences(OWNER, { level: "beginner", areas: ["banco"] });

  const start = fakeInteraction({ customId: `setup:start:${OWNER}`, userId: OWNER, kind: "button" });
  await run(setup, start);
  const options = flatten(lastCall(start).payload.components)
    .filter((n) => n.type === TYPE.StringSelect)
    .flatMap((n) => n.options);
  assert.deepEqual(options.filter((o) => o.default).map((o) => o.value), ["banco"], "só a área atual vem marcada");
  assert.match(textOf(lastCall(start)), /Configuração atual/);

  const save = fakeInteraction({ customId: `setup:level:${OWNER}:devops,backend`, userId: OWNER, kind: "menu", values: ["advanced"] });
  await run(setup, save);
  assert.deepEqual(db.getPreferences(OWNER), { level: "advanced", areas: ["backend", "devops"] });
  assert.equal(db.getUser(OWNER).xp, 10, "XP preservado");
});

test("valores inválidos (área ou nível que não existem) não gravam nada", async () => {
  const badArea = fakeInteraction({ customId: `setup:areas:${OWNER}`, userId: OWNER, kind: "menu", values: ["mobile"] });
  await run(setup, badArea);
  assert.equal(lastCall(badArea).method, "reply");

  const badLevel = fakeInteraction({ customId: `setup:level:${OWNER}:frontend`, userId: OWNER, kind: "menu", values: ["god"] });
  await run(setup, badLevel);
  assert.equal(lastCall(badLevel).method, "reply");

  const noAreas = fakeInteraction({ customId: `setup:level:${OWNER}:`, userId: OWNER, kind: "menu", values: ["beginner"] });
  await run(setup, noAreas);
  assert.equal(lastCall(noAreas).method, "reply");

  assert.equal(db.getPreferences(OWNER), null);
});

test("só o dono mexe na própria configuração", async () => {
  const i = fakeInteraction({ customId: `setup:level:${OWNER}:frontend`, userId: "999", kind: "menu", values: ["beginner"] });
  await run(setup, i);
  assert.equal(lastCall(i).method, "reply");
  assert.equal(db.getPreferences(OWNER), null);
  assert.equal(db.getPreferences("999"), null);
});

// ---------- preferências conferidas com o conteúdo de hoje ----------

test("preferencesOf descarta áreas e níveis que não existem mais; sem nada utilizável, pede setup de novo", () => {
  assert.equal(study.preferencesOf("ninguem"), null);

  db.setPreferences(OWNER, { level: "beginner", areas: ["legado", "banco", "legado2"] });
  assert.deepEqual(study.preferencesOf(OWNER), { level: "beginner", areas: ["banco"] });

  db.setPreferences(OWNER, { level: "inexistente", areas: ["banco"] });
  assert.equal(study.preferencesOf(OWNER), null, "nível inválido");

  db.setPreferences(OWNER, { level: "beginner", areas: ["legado"] });
  assert.equal(study.preferencesOf(OWNER), null, "nenhuma área válida");
});

// ---------- menu de assuntos filtrado pelas áreas ----------

test("quem escolheu Banco de dados só vê assuntos de SQL, com botão para ver todas as áreas", async () => {
  db.setPreferences(OWNER, { level: "beginner", areas: ["banco"] });

  const i = fakeInteraction({ customId: `learn:topics:${OWNER}:beginner`, userId: OWNER, kind: "button" });
  await run(learn, i);
  assert.deepEqual(optionValues(lastCall(i)), ["sql-queries"]);
  assert.match(textOf(lastCall(i)), /Suas áreas: .*Banco de dados/);
  const ids = customIds(lastCall(i).payload.components);
  assert.ok(ids.includes(`learn:topics:${OWNER}:beginner:all`), "botão 'Ver todas as áreas'");
  assert.ok(ids.includes(`setup:start:${OWNER}`), "botão 'Alterar minha trilha'");

  const all = fakeInteraction({ customId: `learn:topics:${OWNER}:beginner:all`, userId: OWNER, kind: "button" });
  await run(learn, all);
  assert.ok(optionValues(lastCall(all)).length >= 7, "todos os assuntos do nível");
  assert.ok(customIds(lastCall(all).payload.components).includes(`learn:topics:${OWNER}:beginner`), "botão 'Só as minhas áreas'");
});

test("áreas sobrepostas: Frontend e Backend dividem JavaScript sem duplicar o assunto no menu", async () => {
  db.setPreferences(OWNER, { level: "beginner", areas: ["frontend", "backend"] });
  const i = fakeInteraction({ customId: `learn:topics:${OWNER}:beginner`, userId: OWNER, kind: "button" });
  await run(learn, i);

  const values = optionValues(lastCall(i));
  assert.equal(new Set(values).size, values.length, "sem assunto repetido");

  // O menu é a união dos assuntos das duas áreas (derivada dos dados: assunto novo não quebra o teste).
  const front = areas.topicIdsFor(["frontend"]);
  const back = areas.topicIdsFor(["backend"]);
  const shared = [...front].filter((id) => back.has(id));
  assert.ok(shared.includes("javascript-fundamentals"), "JavaScript pertence às duas áreas");
  const expected = challenges.topics("beginner", new Set([...front, ...back])).map((t) => t.id);
  assert.deepEqual([...values].sort(), expected.sort());
  for (const id of shared) assert.equal(values.filter((v) => v === id).length, 1, `${id} aparece uma vez só`);
});

test("se as áreas da pessoa não têm nada no nível, mostra tudo com um aviso (menu nunca fica vazio)", async () => {
  db.setPreferences(OWNER, { level: "expert", areas: ["banco"] });
  // Tira temporariamente os desafios SQL do nível expert; a área Banco continua existindo nos outros níveis.
  const removed = challenges.list.filter((c) => c.difficulty === "expert" && c.topic.id === "sql-queries");
  for (const c of removed) challenges.list.splice(challenges.list.indexOf(c), 1);
  try {
    const i = fakeInteraction({ customId: `learn:topics:${OWNER}:expert`, userId: OWNER, kind: "button" });
    await run(learn, i);
    assert.ok(optionValues(lastCall(i)).length > 0);
    assert.ok(!optionValues(lastCall(i)).includes("sql-queries"));
    assert.match(textOf(lastCall(i)), /Ainda não há perguntas das suas áreas nesse nível/);
  } finally {
    challenges.list.push(...removed);
  }
});

test("quem escolhe um assunto fora das suas áreas (via 'Ver todas') consegue estudar normalmente", async () => {
  db.setPreferences(OWNER, { level: "beginner", areas: ["banco"] });
  const pick = fakeInteraction({ customId: `learn:topic:${OWNER}:beginner`, userId: OWNER, kind: "menu", values: ["git-versioning"] });
  await run(learn, pick);
  assert.equal(lastCall(pick).method, "update");
  const chId = customIds(lastCall(pick).payload.components).find((id) => id.startsWith("ch:")).split(":")[1];
  assert.equal(challenges.getById(chId).topic.id, "git-versioning");
});

// ---------- desafio avulso respeita a configuração ----------

test("o pool do 'desafio' sem argumento é o nível e as áreas da pessoa", () => {
  const prefs = { level: "advanced", areas: ["banco"] };
  for (let n = 0; n < 40; n++) {
    const ch = challenges.random({ difficulty: prefs.level, topicIds: areas.topicIdsFor(prefs.areas) });
    assert.equal(ch.difficulty, "advanced");
    assert.equal(ch.topic.id, "sql-queries");
  }
});
