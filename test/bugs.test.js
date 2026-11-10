// Regressões de bugs achados numa revisão: cada teste aqui falhava com o código antigo.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ChannelType, MessageFlags } = require("discord.js");
const { TYPE, flatten, fakeInteraction } = require("./helpers");

const db = require("../src/utils/db");
const challenges = require("../src/utils/challenges");
const views = require("../src/utils/views");
const ui = require("../src/utils/ui");
const cooldown = require("../src/utils/cooldown");
const { safeText } = require("../src/utils/text");
const { parseCommand, normalizeName } = require("../src/utils/parse");
const loadCommands = require("../src/handlers/commandHandler");
const buttonHandler = require("../src/handlers/buttonHandler");
const messageCreate = require("../src/events/messageCreate");

const client = Object.assign(new EventEmitter(), {
  user: { id: "1", toString: () => "<@1>" },
  users: { fetch: async (id) => ({ username: `usuario-${id}` }) },
});
loadCommands(client);
buttonHandler.load(client);

test.beforeEach(() => db.open(":memory:"));
test.after(() => db.close());

const textOf = (components) =>
  flatten(components).filter((n) => n.type === TYPE.TextDisplay).map((n) => n.content).join("\n");
// Um link mascarado "vivo": colchete SEM barra invertida antes, seguido de ](
const liveMaskedLink = /(?<!\\)\[[^\]]*\]\(/;

// ---------- nomes e textos de pessoas (link mascarado, menção, URL) ----------

test("safeText neutraliza link mascarado, autolink, menção, URL e @everyone", () => {
  const masked = safeText("[Ganhe Nitro](https://golpe.example/x)");
  assert.doesNotMatch(masked, liveMaskedLink);
  assert.ok(!masked.includes("https://"), "URL quebrada com caractere invisível");

  assert.doesNotMatch(safeText("<https://golpe.example>"), /(?<!\\)</);
  assert.doesNotMatch(safeText("<@123456789012345678>"), /(?<!\\)<@/, "a menção não pode renderizar");
  assert.doesNotMatch(safeText("@everyone @here"), /@everyone|@here/);
  assert.doesNotMatch(safeText("**negrito** `código` ||spoiler||"), /(?<!\\)(\*\*|`|\|\|)/);
});

test("safeText deixa nomes normais legíveis e trata casos extremos", () => {
  assert.equal(safeText("Ana Paula"), "Ana Paula");
  assert.equal(safeText("João 🎮"), "João 🎮");
  assert.equal(safeText("   "), "(sem nome)");
  assert.equal(safeText(undefined), "(sem nome)");
  assert.equal(safeText("linha1\nlinha2"), "linha1 linha2", "sem quebra de linha (não vira título nem lista)");
  assert.equal([...safeText("🎮".repeat(50))].length, 32, "corta por caractere, sem partir emoji");
  assert.equal([...safeText("a".repeat(100), { max: 10 })].length, 10);
});

test("o ranking não exibe link mascarado nem menção vindos de apelidos", async () => {
  const evil = {
    "11": "[Ganhe Nitro](https://golpe.example/x)",
    "12": "<@999888777666555444>",
    "13": "<https://golpe.example>",
  };
  const fakeClient = { ...client, users: { fetch: async (id) => ({ username: evil[id] }) } };
  for (const id of Object.keys(evil)) db.recordAnswer(id, "g1", true, 10);

  const text = textOf(await views.ranking({ client: fakeClient, guild: null, guildId: "g1", ownerId: "11" }));
  assert.doesNotMatch(text, liveMaskedLink);
  assert.doesNotMatch(text, /(?<!\\)<@/);
  assert.doesNotMatch(text, /(?<!\\)<https/);
  assert.ok(!text.includes("https://"));
});

test("o perfil também trata o próprio nome, e 'desafio' não devolve o que a pessoa digitou sem tratar", async () => {
  const profile = textOf(ui.profileMessage({ name: "[x](https://golpe.example)", avatarUrl: "https://cdn.example/a.png", user: { xp: 0, streak: 0 } }));
  assert.doesNotMatch(profile, liveMaskedLink);

  db.setPreferences("21", { level: "beginner", areas: ["banco"] });
  const sent = [];
  const message = {
    author: { id: "21", bot: false },
    content: "<@1> desafio [clique](https://golpe.example) @everyone",
    guildId: "g1",
    channel: { id: "c", type: ChannelType.GuildText, send: async (p) => sent.push(p) },
    react: async () => {},
  };
  await messageCreate.execute(client, message);
  const echoed = textOf(sent[0].components);
  assert.match(echoed, /Não tenho desafios de/);
  assert.doesNotMatch(echoed, liveMaskedLink);
  assert.ok(!echoed.includes("https://"));
});

// ---------- comandos com pontuação, acento, barra e DM sem texto ----------

test("o comando é reconhecido com pontuação, maiúsculas, acento e barra na frente", () => {
  const find = (text, dm = false) => {
    const parsed = parseCommand(text, "1", dm);
    return client.findCommand(parsed.name)?.name ?? null;
  };
  assert.equal(find("<@1> perfil!"), "perfil");
  assert.equal(find("<@1> Perfil?"), "perfil");
  assert.equal(find("<@1> RANKING."), "ranking");
  assert.equal(find("<@1> configuração"), "configurar");
  assert.equal(find("<@1> Configuração!"), "configurar");
  assert.equal(find("<@1> ajúda"), "ajuda");
  assert.equal(find("/perfil", true), "perfil");
  assert.equal(find("!perfil", true), "perfil");
  assert.equal(find("<@1> estudar..."), "aprender", "apelido de comando com pontuação");
  assert.equal(normalizeName("Configuração!!!"), "configuracao");
});

test("DM sem texto (foto, figurinha, GIF) é ignorada, mas marcar o bot ainda mostra a ajuda", async () => {
  for (const content of ["", "   ", undefined, "!"]) assert.equal(parseCommand(content, "1", true), null, JSON.stringify(content));
  assert.equal(parseCommand("<@1>", "1", false)?.name, "ajuda");
  assert.equal(parseCommand("<@1>   ", "1", true)?.name, "ajuda");
  assert.equal(parseCommand("sem marcar", "1", false), null, "servidor sem marcar continua ignorado");

  const sent = [];
  const message = { author: { id: "31", bot: false }, content: "", guildId: null, channel: { id: "c", type: ChannelType.DM, send: async (p) => sent.push(p) }, react: async () => {} };
  await messageCreate.execute(client, message);
  assert.equal(sent.length, 0, "não responde a uma DM vazia");
});

// ---------- botões de versões antigas ----------

test("botão sem handler responde com um aviso em vez de deixar 'a interação falhou'", async () => {
  const i = fakeInteraction({ customId: "antigo:123:algo", userId: "100", kind: "button" });
  await buttonHandler.handle(client, i);
  assert.equal(i.calls.length, 1);
  assert.equal(i.calls[0].method, "reply");
  assert.ok(i.calls[0].payload.flags & MessageFlags.Ephemeral, "só quem clicou vê");
  assert.match(i.calls[0].payload.content, /versão antiga/);
});

// ---------- falha no banco no meio de uma resposta ----------

test("se o banco falhar ao responder, a pessoa pode tentar de novo (e o XP entra uma vez só)", async () => {
  const ch = challenges.random({ difficulty: "beginner", topic: "git-versioning" });
  const customId = `ch:${ch.id}:${ch.answer}:100:${Date.now().toString(36)}`;
  const real = db.recordAnswer;
  let fail = true;
  db.recordAnswer = (...args) => {
    if (fail) { fail = false; throw new Error("SQLITE_BUSY: database is locked"); }
    return real(...args);
  };
  try {
    const first = fakeInteraction({ customId, userId: "100", kind: "button", messageId: "retry-msg" });
    await buttonHandler.handle(client, first);
    assert.deepEqual(first.calls.map((c) => c.method), ["reply"], "avisa que deu errado");

    const retry = fakeInteraction({ customId, userId: "100", kind: "button", messageId: "retry-msg" });
    await buttonHandler.handle(client, retry);
    assert.deepEqual(retry.calls.map((c) => c.method), ["update"], "a segunda tentativa é processada");

    const again = fakeInteraction({ customId, userId: "100", kind: "button", messageId: "retry-msg" });
    await buttonHandler.handle(client, again);
    assert.deepEqual(again.calls.map((c) => c.method), ["deferUpdate"], "mas um terceiro clique continua sendo duplicado");
  } finally {
    db.recordAnswer = real;
  }
  assert.equal(db.getUser("100").xp, 10, "XP uma vez só");
});

// ---------- cooldown e memória ----------

test("cooldown: bloqueia dentro do intervalo, libera depois, e não cresce para sempre", () => {
  assert.equal(cooldown.remaining("a", 3000, 0), 0);
  assert.equal(cooldown.remaining("a", 3000, 1000), 2000);
  assert.equal(cooldown.remaining("a", 3000, 3000), 0);

  const before = cooldown.size();
  for (let i = 0; i < 5000; i++) cooldown.remaining(`user-${i}`, 3000, 100_000);
  assert.ok(cooldown.size() >= 5000, "dentro do intervalo, todos são lembrados");
  cooldown.remaining("outra-pessoa", 3000, 200_000); // muito depois: tudo o que venceu sai
  assert.ok(cooldown.size() < before + 10, `deveria limpar os vencidos (tamanho ${cooldown.size()})`);
});

test("o tratamento de mensagens usa esse cooldown (e a 2ª mensagem seguida leva ⏳)", async () => {
  const reactions = [];
  const make = () => ({
    author: { id: "cooldown-user", bot: false },
    content: "ajuda",
    guildId: null,
    channel: { id: "c", type: ChannelType.DM, send: async () => {} },
    react: async (emoji) => reactions.push(emoji),
  });
  const before = cooldown.size();
  await messageCreate.execute(client, make());
  assert.equal(cooldown.size(), before + 1, "a mensagem passou pelo cooldown compartilhado");
  await messageCreate.execute(client, make());
  assert.deepEqual(reactions, ["⏳"]);
});

// ---------- arquivo de banco compartilhado ----------

test("banco em arquivo espera até 5 s por outro processo em vez de falhar na hora", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-busy-"));
  try {
    const conn = db.open(path.join(dir, "devlingo.db"));
    assert.equal(conn.prepare("PRAGMA busy_timeout").get().timeout, 5000);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
