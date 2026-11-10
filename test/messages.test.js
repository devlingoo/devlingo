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

// Cliente falso, mas com os handlers reais carregando as pastas commands/, events/ e buttons/.
const client = Object.assign(new EventEmitter(), {
  user: { id: "1", toString: () => "<@1>" },
  guilds: { cache: { size: 0 } },
  users: { fetch: async (id) => ({ username: `usuario-${id}` }) },
});
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

test("'@bot aprender' num servidor responde com o menu de níveis (Components V2)", async () => {
  const msg = fakeMessage({ content: "<@1> aprender", authorId: "201" });
  await messageCreate.execute(client, msg);

  assert.equal(msg.sent.length, 1);
  assert.ok(msg.sent[0].flags & MessageFlags.IsComponentsV2);
  assert.equal(msg.sent[0].content, undefined, "Components V2 não pode ter content");
  assert.ok(customIds(msg.sent[0].components).includes("learn:difficulty:201"));
});

test("'aprender' na DM funciona sem marcar o bot", async () => {
  const msg = fakeMessage({ content: "aprender", authorId: "202", dm: true });
  await messageCreate.execute(client, msg);
  assert.ok(customIds(msg.sent[0].components).includes("learn:difficulty:202"));
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
  db.open(":memory:");

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

  db.close();
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
  db.close();
});
