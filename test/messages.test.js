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
  for (const name of ["aprender", "desafio", "perfil", "ranking", "ajuda"]) {
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
  assert.match(textOf(profile), /20 XP/);
  assert.match(textOf(profile), /Hoje: \*\*20\/\d+\*\* XP/);
  assert.match(textOf(profile), /1\*\* dia\(s\) de sequência/);

  const ranking = fakeMessage({ content: "ranking", authorId: "303", dm: true });
  await messageCreate.execute(client, ranking);
  assert.match(textOf(ranking), /usuario-302.*20 XP/);
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
  assert.equal(challenges.getById(chId).topic.id, "git-versioning");
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

test.after(() => db.close());
