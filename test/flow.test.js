const test = require("node:test");
const assert = require("node:assert/strict");
const { TYPE, flatten, customIds, fakeInteraction, fakeClient } = require("./helpers");

// Troca o banco por um falso: estes testes não tocam em arquivo nenhum (o banco real é testado
// em db.test.js). `capLeft` simula o limite diário: quanto XP ainda pode entrar hoje.
const recorded = [];
let capLeft = Infinity;
const dbPath = require.resolve("../src/utils/db");
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    recordAnswer(userId, guildId, correct, reward) {
      recorded.push({ userId, guildId, correct });
      const wanted = correct ? reward : 0;
      const gained = Math.min(wanted, capLeft);
      capLeft -= gained;
      return { xp: gained, streak: 1, gained, capped: gained < wanted, dailyXp: gained };
    },
    getUser: () => ({ xp: 0, streak: 0, dailyXp: 0 }),
    getPreferences: () => null,
    setPreferences() {},
    // Memória de perguntas e certificados: este banco falso nunca viu nada (nem emite certificado).
    getSeen: () => new Map(),
    getSolved: () => new Set(),
    getCertificate: () => null,
    getCertificates: () => [],
    addCertificate: () => true,
    getCertificateName: () => null,
    setCertificateName() {},
    top: () => [],
  },
};

const challenges = require("../src/utils/challenges");
const learn = require("../src/buttons/aprender");
const answer = require("../src/buttons/challenge");

const OWNER = "100";
const lastCall = (i) => i.calls[i.calls.length - 1];
const run = (handler, interaction, client = fakeClient) =>
  handler.execute(interaction, interaction.customId.split(":"), client);

// Acha o id do desafio nos botões de resposta ("ch:<id>:<opção>:...").
const challengeIdIn = (call) => {
  const ids = customIds(call.payload.components).filter((id) => id.startsWith("ch:"));
  assert.ok(ids.length >= 2, "a pergunta precisa ter botões de resposta");
  return ids[0].split(":")[1];
};

test("só o dono da trilha pode usar os menus e botões", async () => {
  const i = fakeInteraction({ customId: `learn:difficulty:${OWNER}`, userId: "999", kind: "menu", values: ["beginner"] });
  await run(learn, i);
  assert.equal(lastCall(i).method, "reply");
  assert.ok(lastCall(i).payload.flags, "resposta efêmera");
});

test("fluxo completo: nível -> assunto -> perguntas seguidas só desse assunto", async () => {
  // 1) escolhe o nível
  const level = fakeInteraction({ customId: `learn:difficulty:${OWNER}`, userId: OWNER, kind: "menu", values: ["advanced"] });
  await run(learn, level);
  assert.equal(lastCall(level).method, "update");
  const topicMenuId = customIds(lastCall(level).payload.components).find((id) => id.startsWith("learn:topic:"));
  assert.equal(topicMenuId, `learn:topic:${OWNER}:advanced`);

  // 2) escolhe o assunto exato
  const topic = fakeInteraction({ customId: topicMenuId, userId: OWNER, kind: "menu", values: ["python-collections"] });
  await run(learn, topic);
  let current = challenges.getById(challengeIdIn(lastCall(topic)));
  assert.equal(current.difficulty, "advanced");
  assert.equal(current.topic.id, "python-collections");

  // 3) responde e pede "Próxima pergunta" várias vezes, sempre na MESMA mensagem
  for (let n = 0; n < 25; n++) {
    const issuedAt = Date.now().toString(36);
    const button = `ch:${current.id}:${current.answer}:${OWNER}:${issuedAt}:s`;
    const reply = fakeInteraction({ customId: button, userId: OWNER, kind: "button", messageId: "mesma-mensagem" });
    await run(answer, reply);

    assert.equal(lastCall(reply).method, "update", `resposta ${n + 1} deveria ser aceita`);
    const next = customIds(lastCall(reply).payload.components).find((id) => id.startsWith("learn:next:"));
    assert.equal(next, `learn:next:${OWNER}:advanced:python-collections:${current.id}`);

    const more = fakeInteraction({ customId: next, userId: OWNER, kind: "button", messageId: "mesma-mensagem" });
    await run(learn, more);
    const following = challenges.getById(challengeIdIn(lastCall(more)));

    assert.equal(following.difficulty, "advanced");
    assert.equal(following.topic.id, "python-collections");
    assert.notEqual(following.id, current.id, "não repete a pergunta que acabou de ser respondida");
    current = following;
    await new Promise((resolve) => setTimeout(resolve, 2)); // issuedAt diferente em cada pergunta
  }
  assert.equal(recorded.length, 25);
  assert.ok(recorded.every((r) => r.correct && r.userId === OWNER && r.guildId === "g1"));
});

test("clique repetido na mesma pergunta não dá XP em dobro", async () => {
  recorded.length = 0;
  const ch = challenges.random({ difficulty: "beginner", topic: "git-versioning" });
  const issuedAt = Date.now().toString(36);
  const customId = `ch:${ch.id}:${ch.answer}:${OWNER}:${issuedAt}:s`;

  const first = fakeInteraction({ customId, userId: OWNER, kind: "button", messageId: "dup" });
  const second = fakeInteraction({ customId, userId: OWNER, kind: "button", messageId: "dup" });
  await run(answer, first);
  await run(answer, second);

  assert.equal(lastCall(first).method, "update");
  assert.equal(lastCall(second).method, "deferUpdate");
  assert.equal(recorded.length, 1);
});

test("pergunta expirada na trilha continua oferecendo 'Próxima pergunta' e não dá XP", async () => {
  recorded.length = 0;
  const ch = challenges.random({ difficulty: "beginner", topic: "sql-queries" });
  const old = (Date.now() - 10 * 60 * 1000).toString(36);
  const i = fakeInteraction({ customId: `ch:${ch.id}:${ch.answer}:${OWNER}:${old}:s`, userId: OWNER, kind: "button", messageId: "exp" });
  await run(answer, i);

  assert.equal(lastCall(i).method, "update");
  assert.equal(recorded.length, 0);
  assert.ok(customIds(lastCall(i).payload.components).some((id) => id.startsWith("learn:next:")));
});

test("desafio avulso (comando desafio) não mostra botões da trilha", async () => {
  const ch = challenges.random("python");
  const i = fakeInteraction({ customId: `ch:${ch.id}:${ch.answer}:${OWNER}:${Date.now().toString(36)}`, userId: OWNER, kind: "button", messageId: "solo" });
  await run(answer, i);
  assert.equal(lastCall(i).method, "update");
  assert.ok(!customIds(lastCall(i).payload.components).some((id) => id.startsWith("learn:")));
});

test("'Trocar assunto' e 'Trocar nível' voltam aos menus certos", async () => {
  const topics = fakeInteraction({ customId: `learn:topics:${OWNER}:intermediate`, userId: OWNER, kind: "button" });
  await run(learn, topics);
  assert.ok(customIds(lastCall(topics).payload.components).includes(`learn:topic:${OWNER}:intermediate`));

  const levels = fakeInteraction({ customId: `learn:levels:${OWNER}`, userId: OWNER, kind: "button" });
  await run(learn, levels);
  assert.ok(customIds(lastCall(levels).payload.components).includes(`learn:difficulty:${OWNER}`));
});

// Valores (ids de nível) que o menu "Selecione seu nível" oferece hoje.
async function levelsInMenu() {
  const i = fakeInteraction({ customId: `learn:levels:${OWNER}`, userId: OWNER, kind: "button" });
  await run(learn, i);
  const json = JSON.stringify(lastCall(i).payload.components.map((c) => c.toJSON()));
  return [...json.matchAll(/"value":"(\w+)"/g)].map((m) => m[1]);
}

test("o menu de níveis oferece os quatro níveis, inclusive o Especialista", async () => {
  assert.deepEqual(await levelsInMenu(), ["beginner", "intermediate", "advanced", "expert"]);
});

test("o menu de níveis esconde um nível quando ele não tem nenhum desafio", async () => {
  // `challenges.list` é o mesmo array usado nas buscas: tiramos o nível expert e depois devolvemos.
  const removed = challenges.list.filter((c) => c.difficulty === "expert");
  assert.ok(removed.length > 0);
  for (const c of removed) challenges.list.splice(challenges.list.indexOf(c), 1);
  try {
    assert.deepEqual(await levelsInMenu(), ["beginner", "intermediate", "advanced"]);
  } finally {
    challenges.list.push(...removed);
  }
  assert.ok((await levelsInMenu()).includes("expert"), "o nível volta quando o conteúdo volta");
});

// Texto de todos os TextDisplay de uma resposta, para checar o que a pessoa lê.
const textOf = (call) =>
  flatten(call.payload.components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");

test("com o limite diário batido, acertar explica e avisa em vez de prometer XP", async () => {
  capLeft = 0; // hoje não entra mais XP
  const ch = challenges.random({ difficulty: "beginner", topic: "javascript-fundamentals" });
  const i = fakeInteraction({
    customId: `ch:${ch.id}:${ch.answer}:${OWNER}:${Date.now().toString(36)}:s`,
    userId: OWNER,
    kind: "button",
    messageId: "cap",
  });
  await run(answer, i);
  capLeft = Infinity;

  const text = textOf(lastCall(i));
  assert.match(text, /Acertou/);
  assert.match(text, /Sem XP desta vez/);
  assert.match(text, /Limite diário de \d+ XP atingido/);
  assert.ok(text.includes(ch.explanation), "a explicação continua aparecendo");
  assert.ok(customIds(lastCall(i).payload.components).some((id) => id.startsWith("learn:next:")), "dá para seguir treinando");
});

test("sem bater o limite, não aparece aviso de limite", async () => {
  capLeft = Infinity;
  const ch = challenges.random({ difficulty: "beginner", topic: "javascript-fundamentals" });
  const i = fakeInteraction({
    customId: `ch:${ch.id}:${ch.answer}:${OWNER}:${Date.now().toString(36)}`,
    userId: OWNER,
    kind: "button",
    messageId: "nocap",
  });
  await run(answer, i);
  const text = textOf(lastCall(i));
  assert.match(text, /\+10 XP/);
  assert.doesNotMatch(text, /Limite diário/);
});
