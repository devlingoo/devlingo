const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ChannelType, MessageFlags } = require("discord.js");
const { customIds, flatten, TYPE } = require("./helpers");

const loadCommands = require("../src/handlers/commandHandler");
const loadEvents = require("../src/handlers/eventHandler");
const buttonHandler = require("../src/handlers/buttonHandler");
const messageCreate = require("../src/events/messageCreate");
const db = require("../src/utils/db");
const challenges = require("../src/utils/challenges");
const areas = require("../src/utils/areas");

// Cliente falso, mas com os handlers reais carregando as pastas commands/, events/ e buttons/.
const client = Object.assign(new EventEmitter(), {
  user: { id: "1", toString: () => "<@1>" },
  guilds: { cache: { size: 0 } },
  users: { fetch: async (id) => ({ username: `usuario-${id}` }) },
});
db.open(":memory:"); // nenhum teste toca no banco real (data/devlingo.db)
loadCommands(client);
buttonHandler.load(client);
loadEvents(client);

function fakeMessage({ content, authorId, dm = false }) {
  const sent = [];
  return {
    sent,
    author: { id: authorId, bot: false, displayName: "Ana", displayAvatarURL: () => "https://cdn.example/avatar.png" },
    content,
    guildId: dm ? null : "g1",
    channel: {
      id: "c1",
      type: dm ? ChannelType.DM : ChannelType.GuildText,
      send: async (payload) => sent.push(payload),
    },
    react: async () => {},
  };
}

test("os handlers carregam comandos, botões e eventos das pastas", () => {
  for (const name of ["aprender", "desafio", "diario", "perfil", "ranking", "ajuda"]) {
    assert.ok(client.commands.has(name), `comando ${name}`);
  }
  assert.ok(client.findCommand("estudar"), "alias estudar -> aprender");
  assert.ok(client.buttons.has("learn") && client.buttons.has("ch"));
  assert.equal(client.listenerCount("messageCreate"), 1);
  assert.equal(client.listenerCount("interactionCreate"), 1);
});

test("'@bot aprender' de quem nunca configurou pede o setup antes de qualquer pergunta (Components V2)", async () => {
  const msg = fakeMessage({ content: "<@1> aprender", authorId: "201" });
  await messageCreate.execute(client, msg);

  assert.equal(msg.sent.length, 1);
  assert.ok(msg.sent[0].flags & MessageFlags.IsComponentsV2);
  assert.equal(msg.sent[0].content, undefined, "Components V2 não pode ter content");
  assert.ok(customIds(msg.sent[0].components).includes("setup:areas:201"));
});

test("'aprender' na DM funciona sem marcar o bot (e também pede o setup na primeira vez)", async () => {
  const msg = fakeMessage({ content: "aprender", authorId: "202", dm: true });
  await messageCreate.execute(client, msg);
  assert.ok(customIds(msg.sent[0].components).includes("setup:areas:202"));
});

test("mensagem de servidor sem marcar o bot é ignorada", async () => {
  const msg = fakeMessage({ content: "aprender", authorId: "203" });
  await messageCreate.execute(client, msg);
  assert.equal(msg.sent.length, 0);
});

test("'@bot ajuda' lista o comando aprender", async () => {
  const msg = fakeMessage({ content: "<@1> ajuda", authorId: "204" });
  await messageCreate.execute(client, msg);
  const text = flatten(msg.sent[0].components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");
  assert.match(text, /aprender/);
});

const textOf = (msg) =>
  flatten(msg.sent[0].components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");

test("'perfil' e 'ranking' leem o banco SQLite de verdade", async () => {
  const empty = fakeMessage({ content: "ranking", authorId: "301", dm: true });
  await messageCreate.execute(client, empty);
  assert.match(textOf(empty), /Ninguém pontuou/);

  db.recordAnswer("302", null, true, 10);
  db.recordAnswer("302", null, true, 10);

  const profile = fakeMessage({ content: "perfil", authorId: "302", dm: true });
  await messageCreate.execute(client, profile);
  assert.match(textOf(profile), /Semente · Nível 1\*\* — ⭐ \*\*20 XP\*\*/);
  assert.match(textOf(profile), /XP de hoje: \*\*20\/\d+\*\*/);
  assert.match(textOf(profile), /Sequência: \*\*1 dia\*\*/);
  assert.match(textOf(profile), /Meta de hoje: .*\*\*2\/5\*\*/);
  assert.match(textOf(profile), /\*\*2\*\* respostas • \*\*2\*\* acertos \(\*\*100%\*\*\)/);
  assert.match(textOf(profile), /Conquistas: \*\*1\/\d+\*\*/);

  const ranking = fakeMessage({ content: "ranking", authorId: "303", dm: true });
  await messageCreate.execute(client, ranking);
  assert.match(textOf(ranking), /usuario-302.*20 XP/);
  assert.match(textOf(ranking), /Você ainda não pontuou/, "quem não tem XP é convidado a entrar no ranking");
});

test("o ranking mostra a posição de quem pediu e marca a própria linha", async () => {
  db.recordAnswer("311", null, true, 10);
  db.recordAnswer("311", null, true, 10);
  db.recordAnswer("312", null, true, 10);

  const mine = fakeMessage({ content: "ranking", authorId: "312", dm: true });
  await messageCreate.execute(client, mine);
  const text = textOf(mine);
  assert.match(text, /Sua posição: \*\*#\d+\*\* • 10 XP/);
  assert.match(text, /usuario-312.*◀ você/);
  assert.doesNotMatch(text.split("\n").find((l) => l.includes("usuario-311")), /◀ você/);
  assert.match(text, /🌱 Nv 1/, "no ranking global aparece o emoji do título e o nível");
});

test("'conquistas' lista as conquistas, com as ganhas em cima", async () => {
  db.recordAnswer("321", null, true, 10); // desbloqueia "Primeiro passo"
  const msg = fakeMessage({ content: "conquistas", authorId: "321", dm: true });
  await messageCreate.execute(client, msg);
  const lines = textOf(msg).split("\n");
  assert.match(lines[0], /Conquistas — 1\/\d+/);
  assert.ok(lines.some((l) => l.startsWith("✅") && l.includes("Primeiro passo")));
  assert.ok(lines.some((l) => l.startsWith("🔒") && l.includes("Mira afiada")));
  assert.ok(lines.findIndex((l) => l.startsWith("✅")) < lines.findIndex((l) => l.startsWith("🔒")), "ganhas primeiro");
});

test("a ajuda agrupa os comandos por categoria e traz os atalhos", async () => {
  const msg = fakeMessage({ content: "ajuda", authorId: "331", dm: true });
  await messageCreate.execute(client, msg);
  const text = textOf(msg);
  assert.ok(text.indexOf("📚 Estudar") < text.indexOf("👤 Você"), "grupos na ordem certa");
  assert.ok(text.indexOf("👤 Você") < text.indexOf("💬 Ajuda"));
  for (const cmd of ["configurar", "aprender", "desafio", "perfil", "ranking", "conquistas", "ajuda"]) {
    assert.match(text, new RegExp(`\`${cmd}`), `lista ${cmd}`);
  }
  const ids = customIds(msg.sent[0].components);
  for (const target of ["estudar", "perfil", "ranking", "conquistas"]) {
    assert.ok(ids.includes(`nav:331:${target}`), `atalho ${target}`);
  }
});

test("'aprender' de quem já configurou abre direto nos assuntos do nível e das áreas dela", async () => {
  db.setPreferences("401", { level: "intermediate", areas: ["banco"] });
  const msg = fakeMessage({ content: "<@1> aprender", authorId: "401" });
  await messageCreate.execute(client, msg);

  assert.ok(customIds(msg.sent[0].components).includes("learn:topic:401:intermediate"));
  assert.match(textOf(msg), /Consultas SQL/);
  assert.doesNotMatch(textOf(msg), /Funções em JavaScript/);
});

test("'desafio' pede o setup na primeira vez; configurado, sorteia do nível e das áreas", async () => {
  const first = fakeMessage({ content: "desafio", authorId: "402", dm: true });
  await messageCreate.execute(client, first);
  assert.ok(customIds(first.sent[0].components).includes("setup:areas:402"));
  assert.ok(!customIds(first.sent[0].components).some((id) => id.startsWith("ch:")), "nenhuma pergunta antes do setup");

  db.setPreferences("403", { level: "advanced", areas: ["devops"] });
  const second = fakeMessage({ content: "desafio", authorId: "403", dm: true });
  await messageCreate.execute(client, second);
  const chId = customIds(second.sent[0].components).find((id) => id.startsWith("ch:")).split(":")[1];
  assert.equal(challenges.getById(chId).difficulty, "advanced");
  // A área DevOps tem vários assuntos (Git, Linux, Docker...) e o sorteio escolhe qualquer um deles:
  // o que importa é nunca sair de fora da área da pessoa.
  const doDevops = areas.topicIdsFor(["devops"]);
  assert.ok(doDevops.size >= 1);
  assert.ok(doDevops.has(challenges.getById(chId).topic.id), `${challenges.getById(chId).topic.id} não é da área DevOps`);

  // E, repetindo o sorteio, as perguntas vêm só dali (o teste antigo passava por sorte quando só havia o Git).
  for (let n = 0; n < 60; n++) {
    const ch = challenges.random({ difficulty: "advanced", topicIds: doDevops });
    assert.ok(doDevops.has(ch.topic.id) && ch.difficulty === "advanced");
  }
});

test("'perfil' mostra a trilha escolhida", async () => {
  db.setPreferences("404", { level: "beginner", areas: ["backend", "banco"] });
  const msg = fakeMessage({ content: "perfil", authorId: "404", dm: true });
  await messageCreate.execute(client, msg);
  assert.match(textOf(msg), /Trilha: .*Backend.*Banco de dados.*Iniciante/);
});

test("'configurar' abre o passo 1, com a configuração atual quando já existe", async () => {
  const fresh = fakeMessage({ content: "configurar", authorId: "405", dm: true });
  await messageCreate.execute(client, fresh);
  assert.ok(customIds(fresh.sent[0].components).includes("setup:areas:405"));
  assert.match(textOf(fresh), /Configurar minha trilha/);
  assert.doesNotMatch(textOf(fresh), /Antes de estudar/);

  db.setPreferences("406", { level: "expert", areas: ["devops"] });
  const again = fakeMessage({ content: "<@1> setup", authorId: "406" });
  await messageCreate.execute(client, again);
  assert.match(textOf(again), /Configuração atual: .*Ferramentas e DevOps.*Especialista/);
});

test("'ajuda' lista o comando configurar", async () => {
  const msg = fakeMessage({ content: "ajuda", authorId: "407", dm: true });
  await messageCreate.execute(client, msg);
  assert.match(textOf(msg), /configurar/);
});

// O Discord não resolve menção dentro de crases (código inline): aparece o número do bot, tipo
// <@1569442084426092686>, em vez do nome. A menção tem que ficar sempre fora do código.
const mentionInsideCode = /`[^`\n]*<@!?\d+>[^`\n]*`/;

test("a menção ao bot nunca fica dentro de crases (a ajuda no servidor mostra o nome, não o número)", async () => {
  const help = fakeMessage({ content: "<@1> ajuda", authorId: "501" });
  await messageCreate.execute(client, help);
  assert.doesNotMatch(textOf(help), mentionInsideCode);
  assert.match(textOf(help), /Marque <@1> e escreva o comando\. Exemplo: <@1> `aprender`/);
  assert.equal(textOf(help).split("<@1>").length - 1, 2, "a menção aparece só no texto de como usar, não em cada comando");
});

test("na DM a ajuda não menciona o bot em lugar nenhum", async () => {
  const help = fakeMessage({ content: "ajuda", authorId: "502", dm: true });
  await messageCreate.execute(client, help);
  assert.doesNotMatch(textOf(help), /<@/);
  assert.match(textOf(help), /Exemplo: `aprender`/);
});

test("'não conheci esse comando' também mostra a menção fora das crases", async () => {
  const inGuild = fakeMessage({ content: "<@1> xyzzy", authorId: "503" });
  await messageCreate.execute(client, inGuild);
  assert.doesNotMatch(textOf(inGuild), mentionInsideCode);
  assert.match(textOf(inGuild), /Use <@1> `ajuda` para ver a lista/);

  const dm = fakeMessage({ content: "xyzzy", authorId: "504", dm: true });
  await messageCreate.execute(client, dm);
  assert.match(textOf(dm), /Use `ajuda` para ver a lista/);
});

test("'ranking' vazio ensina a começar sem deixar a menção dentro de crases", async () => {
  db.open(":memory:");
  const msg = fakeMessage({ content: "<@1> ranking", authorId: "505" });
  await messageCreate.execute(client, msg);
  assert.doesNotMatch(textOf(msg), mentionInsideCode);
  assert.match(textOf(msg), /Comece com <@1> `desafio`!/);
});

test.after(() => db.close());
