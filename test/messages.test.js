const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { ChannelType, MessageFlags } = require("discord.js");
const { customIds, flatten, TYPE } = require("./helpers");

const loadCommands = require("../src/handlers/commandHandler");
const loadEvents = require("../src/handlers/eventHandler");
const buttonHandler = require("../src/handlers/buttonHandler");
const messageCreate = require("../src/events/messageCreate");

// Cliente falso, mas com os handlers reais carregando as pastas commands/, events/ e buttons/.
const client = Object.assign(new EventEmitter(), {
  user: { id: "1", toString: () => "<@1>" },
  guilds: { cache: { size: 0 } },
});
loadCommands(client);
buttonHandler.load(client);
loadEvents(client);

function fakeMessage({ content, authorId, dm = false }) {
  const sent = [];
  return {
    sent,
    author: { id: authorId, bot: false },
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
