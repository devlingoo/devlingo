const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config");
const db = require("../src/utils/db");
const challenges = require("../src/utils/challenges");
const achievements = require("../src/utils/achievements");
const ui = require("../src/utils/ui");
const views = require("../src/utils/views");
const answer = require("../src/buttons/challenge");
const nav = require("../src/buttons/nav");
const { TYPE, flatten, customIds, fakeInteraction, fakeClient, assertWithinDiscordLimits } = require("./helpers");

const OWNER = "700";
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

test.beforeEach(() => {
  Object.assign(config, DEFAULTS);
  db.open(":memory:");
});
test.after(() => db.close());

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const textOf = (call) =>
  flatten(call.payload.components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");
const accent = (call) => call.payload.components[0].toJSON().accent_color;

let seq = 0;
// Responde um desafio de verdade pelo handler (com o banco em memória) e devolve a mensagem resultante.
async function respond(correct = true, difficulty = "beginner") {
  const ch = challenges.random({ difficulty, topic: "javascript-fundamentals" });
  const choice = correct ? ch.answer : (ch.answer + 1) % ch.options.length;
  const i = fakeInteraction({
    customId: `ch:${ch.id}:${choice}:${OWNER}:${Date.now().toString(36)}`,
    userId: OWNER,
    kind: "button",
    messageId: `m${seq++}`,
  });
  await answer.execute(i, i.customId.split(":"), fakeClient);
  return i.calls.at(-1);
}

// ---------- comemorações na mensagem de resposta ----------

test("a primeira resposta já comemora a conquista, e a mensagem fica dourada", async () => {
  const call = await respond(true);
  assert.match(textOf(call), /Conquista desbloqueada:.*Primeiro passo/);
  assert.equal(accent(call), config.colors.gold);
});

test("resposta comum, sem nada a festejar, mantém o verde (acerto) e o vermelho (erro)", async () => {
  await respond(true); // gasta a conquista inicial
  const right = await respond(true);
  assert.equal(accent(right), config.colors.success);
  assert.doesNotMatch(textOf(right), /Conquista|Subiu|Meta do dia cumprida/);

  const wrong = await respond(false);
  assert.equal(accent(wrong), config.colors.danger);
  assert.match(textOf(wrong), /Errou/);
});

test("rodapé mostra XP, nível, sequência e o progresso da meta do dia", async () => {
  await respond(true);
  const call = await respond(true);
  const text = textOf(call);
  assert.match(text, /⭐ 20 XP • 🌱 Nível 1 • 🔥 1 dia/);
  assert.match(text, /Meta do dia: ▰▰▱▱▱ 2\/5/);
});

test("cumprir a meta do dia é comemorado com o bônus", async () => {
  config.dailyGoal = 2;
  await respond(true);
  const call = await respond(true);
  assert.match(textOf(call), /Meta do dia cumprida!\*\* \+15 XP/);
  assert.match(textOf(call), /Meta do dia: ▰▰▰▰▰ 2\/2 ✅/);
  assert.equal(accent(call), config.colors.gold);
});

test("o terceiro dia seguido comemora o marco de sequência", async () => {
  db.recordAnswer(OWNER, null, true, 10, daysAgo(2));
  db.recordAnswer(OWNER, null, true, 10, daysAgo(1));
  const call = await respond(true);
  assert.match(textOf(call), /3 dias seguidos!\*\* \+10 XP de bônus/);
});

test("subir de nível é comemorado com o título novo", async () => {
  config.xpPerLevel = 10;
  const call = await respond(true); // 10 XP: passa de 1 para 2
  assert.match(textOf(call), /Subiu para o nível 2!\*\* 🌱 Semente/);
});

test("acertos seguidos mostram o combo e dão o bônus a cada cinco", async () => {
  const calls = [];
  for (let i = 0; i < 5; i++) calls.push(await respond(true));
  assert.doesNotMatch(textOf(calls[1]), /combo/);
  assert.match(textOf(calls[2]), /🔥 combo ×3/);
  assert.match(textOf(calls[4]), /Combo ×5!\*\* \+5 XP/);
});

test("errar depois de um bom combo avisa, sem drama e sem festa", async () => {
  for (let i = 0; i < 3; i++) await respond(true);
  const call = await respond(false);
  assert.match(textOf(call), /O combo de 3 acertos acabou/);
});

test("com o limite diário batido, a meta e o aviso do limite aparecem juntos", async () => {
  config.dailyXpCap = 10;
  await respond(true);
  const call = await respond(true);
  assert.match(textOf(call), /Sem XP desta vez/);
  assert.match(textOf(call), /Limite diário de 10 XP atingido/);
});

test("tudo acontecendo na mesma resposta ainda cabe nos limites do Discord", async () => {
  config.dailyGoal = 1;
  config.xpPerLevel = 5;
  // Dois dias antes e ontem, com 2 acertos cada: combo 4 e sequência 2. Hoje o 5º acerto fecha tudo.
  for (const n of [2, 1]) {
    db.recordAnswer(OWNER, null, true, 10, daysAgo(n));
    db.recordAnswer(OWNER, null, true, 10, daysAgo(n));
  }
  const call = await respond(true, "expert");
  const text = textOf(call);
  for (const expected of [/Subiu para o nível/, /Meta do dia cumprida/, /3 dias seguidos/, /Combo ×5/, /Conquista desbloqueada/]) {
    assert.match(text, expected);
  }
  assertWithinDiscordLimits(call.payload.components, "resposta com todas as comemorações", assert);
  assert.ok(db.getAchievements(OWNER).includes("expert1"), "a dificuldade do desafio chega às conquistas");
});

// ---------- telas ----------

test("todas as telas novas respeitam os limites do Discord, vazias e cheias", async () => {
  const client = {
    user: { toString: () => "<@1>", displayAvatarURL: () => "https://cdn.example/bot.png" },
    users: fakeClient.users,
    commands: new Map(
      ["ajuda", "aprender", "configurar", "desafio", "perfil", "ranking", "conquistas"].map((name) => [
        name,
        { name, usage: name, description: "descrição de teste", category: name === "ajuda" ? "ajuda" : "estudar" },
      ])
    ),
  };
  const avatarUrl = "https://cdn.example/a.png";

  assertWithinDiscordLimits(views.help(client, { inGuild: true, ownerId: OWNER }), "ajuda no servidor (com foto)", assert);
  assertWithinDiscordLimits(views.help(client, { inGuild: false, ownerId: OWNER }), "ajuda na DM", assert);
  assertWithinDiscordLimits(views.profile({ ownerId: OWNER, name: "Ana", avatarUrl }), "perfil vazio", assert);
  assertWithinDiscordLimits(views.achievements(OWNER), "conquistas vazias", assert);

  // Cheio: todas as conquistas, nível alto, sequência longa.
  const everything = { answered: 999, correct: 999, streak: 999, bestStreak: 999, bestCombo: 999, goalDoneDays: 999, expertCorrect: 999, level: 99 };
  for (const key of achievements.earned(everything)) {
    db.recordAnswer(OWNER, "g1", true, 10, daysAgo(0), { difficulty: "expert" });
    void key;
  }
  const profile = ui.profileMessage({
    name: "Uma pessoa com um nome bem comprido para testar quebra de linha",
    avatarUrl,
    user: { xp: 987654, streak: 365, dailyXp: 200 },
    prefs: { level: "expert", areas: ["frontend", "backend", "banco", "devops"] },
    stats: { answered: 5000, correct: 4000, accuracy: 80, streak: 365, bestStreak: 400, combo: 12, bestCombo: 40, goalCount: 9, goalDoneDays: 80 },
    unlocked: achievements.list.map((a) => a.key),
    ownerId: OWNER,
  });
  assertWithinDiscordLimits(profile, "perfil cheio", assert);
  assertWithinDiscordLimits(ui.achievementsMessage({ unlockedKeys: achievements.list.map((a) => a.key), ownerId: OWNER }), "conquistas completas", assert);
  assertWithinDiscordLimits(await views.ranking({ client, guild: null, guildId: null, ownerId: OWNER }), "ranking", assert);
});

test("a foto do bot aparece na ajuda quando o cliente a conhece (Section com thumbnail)", () => {
  const client = {
    user: { toString: () => "<@1>", displayAvatarURL: () => "https://cdn.example/bot.png" },
    commands: new Map([["ajuda", { name: "ajuda", usage: "ajuda", description: "x", category: "ajuda" }]]),
  };
  const nodes = flatten(views.help(client, { inGuild: false, ownerId: OWNER }));
  assert.ok(nodes.some((n) => n.type === TYPE.Section), "cabeçalho em Section");
  assert.ok(nodes.some((n) => n.accessory?.media?.url === "https://cdn.example/bot.png"));
});

test("comando sem categoria vai para 'Outros' e novos comandos aparecem sozinhos na ajuda", () => {
  const client = {
    user: { toString: () => "<@1>" },
    commands: new Map([
      ["ola", { name: "ola", usage: "ola", description: "diz olá" }],
      ["perfil", { name: "perfil", usage: "perfil", description: "seu perfil", category: "voce" }],
    ]),
  };
  const text = flatten(views.help(client, { inGuild: false, ownerId: OWNER }))
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");
  assert.match(text, /\*\*✨ Outros\*\*\n`ola` — diz olá/);
  assert.ok(text.indexOf("👤 Você") < text.indexOf("✨ Outros"));
});

test("o perfil avisa quando a sequência está em risco hoje, e para de avisar depois da 1ª resposta", () => {
  db.recordAnswer(OWNER, null, true, 10, daysAgo(1)); // respondeu ontem, ainda não hoje
  const before = flatten(views.profile({ ownerId: OWNER, name: "Ana", avatarUrl: "https://x/y.png" }))
    .filter((n) => n.type === TYPE.TextDisplay).map((n) => n.content).join("\n");
  assert.match(before, /Responda hoje para manter sua sequência de 1 dia/);

  db.recordAnswer(OWNER, null, true, 10, new Date());
  const after = flatten(views.profile({ ownerId: OWNER, name: "Ana", avatarUrl: "https://x/y.png" }))
    .filter((n) => n.type === TYPE.TextDisplay).map((n) => n.content).join("\n");
  assert.doesNotMatch(after, /Responda hoje/);
});

test("quem nunca jogou vê um convite no lugar das estatísticas, sem aviso de sequência", () => {
  const text = flatten(views.profile({ ownerId: "novato", name: "Novo", avatarUrl: "https://x/y.png" }))
    .filter((n) => n.type === TYPE.TextDisplay).map((n) => n.content).join("\n");
  assert.match(text, /Ainda sem respostas/);
  assert.match(text, /Sequência: \*\*0 dias\*\* — responda hoje para começar!/);
  assert.doesNotMatch(text, /Responda hoje para manter/);
});

// ---------- atalhos (nav) ----------

test("cada atalho troca a mensagem pela tela certa e só o dono pode usar", async () => {
  db.recordAnswer(OWNER, "g1", true, 10); // ranking e perfil com dados (a interação simulada é do servidor g1)

  const cases = {
    estudar: /Antes de estudar|Escolha exatamente o assunto/,
    perfil: /Semente · Nível 1/,
    ranking: /Ranking do servidor/,
    conquistas: /Conquistas — 1\//,
    configurar: /Configurar minha trilha/,
  };
  for (const [target, expected] of Object.entries(cases)) {
    const i = fakeInteraction({ customId: `nav:${OWNER}:${target}`, userId: OWNER, kind: "button" });
    await nav.execute(i, i.customId.split(":"), fakeClient);
    assert.deepEqual(i.calls.map((c) => c.method), ["deferUpdate", "editReply"], target);
    assert.match(textOf(i.calls[1]), expected, target);
  }

  const stranger = fakeInteraction({ customId: `nav:${OWNER}:perfil`, userId: "999", kind: "button" });
  await nav.execute(stranger, stranger.customId.split(":"), fakeClient);
  assert.deepEqual(stranger.calls.map((c) => c.method), ["reply"]);

  const unknown = fakeInteraction({ customId: `nav:${OWNER}:nada`, userId: OWNER, kind: "button" });
  await nav.execute(unknown, unknown.customId.split(":"), fakeClient);
  assert.deepEqual(unknown.calls.map((c) => c.method), ["reply"]);
});

test("todo botão de atalho gerado pelas telas tem um destino que o handler conhece", async () => {
  const screens = [
    views.profile({ ownerId: OWNER, name: "Ana", avatarUrl: "https://x/y.png" }),
    views.achievements(OWNER),
    await views.ranking({ client: fakeClient, guild: null, guildId: null, ownerId: OWNER }),
  ];
  db.recordAnswer(OWNER, null, true, 10);
  screens.push(await views.ranking({ client: fakeClient, guild: null, guildId: null, ownerId: OWNER }));

  const known = ["estudar", "cursos", "perfil", "ranking", "conquistas", "configurar"];
  for (const components of screens) {
    for (const id of customIds(components).filter((id) => id.startsWith("nav:"))) {
      assert.ok(known.includes(id.split(":")[2]), id);
    }
  }
});
