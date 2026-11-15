const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ChannelType, MessageFlags } = require("discord.js");
const { TYPE, flatten, customIds, fakeInteraction, fakeClient, assertWithinDiscordLimits, downgradeTo } = require("./helpers");

const config = require("../src/config");
const db = require("../src/utils/db");
const ui = require("../src/utils/ui");
const views = require("../src/utils/views");
const { addDays, weekStartOf } = require("../src/utils/time");
const ligaCommand = require("../src/commands/liga");
const leagueButton = require("../src/buttons/league");
const navButton = require("../src/buttons/nav");

// 2026-11-09 é uma segunda-feira e 2026-11-15, o domingo da mesma semana. As horas são do Brasil (UTC-3).
const at = (date, hour = 12) => new Date(Date.parse(`${date}T00:00:00Z`) + (hour + 3) * 3_600_000);
const MON = "2026-11-09";
const WED = "2026-11-11";
const SAT = "2026-11-14";
const SUN = "2026-11-15";
const NEXT_MON = "2026-11-16";

const DEFAULTS = {
  timezone: "America/Sao_Paulo",
  dailyXpCap: 0, // sem limite: os testes da liga não são sobre o limite diário
  dailyGoal: 0,
  comboEvery: 5,
  comboBonusXp: 5,
  xpPerLevel: 100,
  streakMilestones: {},
  freezeEvery: 7,
  freezeMax: 2,
  dailyChallengeBonusXp: 10,
};

test.beforeEach(() => {
  Object.assign(config, DEFAULTS);
  db.open(":memory:");
});
test.after(() => db.close());

const G1 = "g1";
const G2 = "g2";
// Uma resposta certa vale 10 XP.
const right = (user, guild, when) => db.recordAnswer(user, guild, true, 10, when);
const textOf = (components) =>
  flatten(components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");
const buttonLabels = (components) => flatten(components).filter((n) => n.type === TYPE.Button).map((n) => n.label);

// ---------- semanas ----------

test("a semana vai de segunda a domingo e leva o nome da segunda-feira", () => {
  assert.equal(weekStartOf(MON), MON, "segunda");
  assert.equal(weekStartOf(WED), MON, "quarta");
  assert.equal(weekStartOf(SUN), MON, "domingo ainda é a semana que acabou");
  assert.equal(weekStartOf(NEXT_MON), NEXT_MON, "a segunda seguinte começa outra semana");
  assert.equal(weekStartOf("2026-12-31"), "2026-12-28", "atravessa a virada do ano");
  assert.equal(weekStartOf("2027-01-01"), "2026-12-28");
});

test("somar dias atravessa mês, ano e fevereiro", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29", "ano bissexto");
  assert.equal(addDays(MON, -7), "2026-11-02");
});

// ---------- entrar, sair e pontuar ----------

test("entrar e sair: entrar duas vezes não repete, sair sem ter entrado não faz nada", () => {
  assert.equal(db.joinLeague(G1, "ana", at(MON)), true);
  assert.equal(db.joinLeague(G1, "ana", at(MON)), false, "já estava");
  assert.equal(db.leagueBoard(G1, "ana", at(MON)).participants, 1);

  assert.equal(db.leaveLeague(G1, "bia"), false, "nunca entrou");
  assert.equal(db.leaveLeague(G1, "ana"), true);
  assert.equal(db.leagueBoard(G1, "ana", at(MON)).participants, 0);
});

test("só conta o XP ganho depois de entrar, e só o do servidor da liga", () => {
  right("ana", G1, at(MON, 9)); // antes de entrar: não conta
  db.joinLeague(G1, "ana", at(MON, 10));

  right("ana", G1, at(MON, 11)); // conta
  right("ana", G2, at(MON, 12)); // outro servidor: não conta aqui
  right("ana", null, at(MON, 13)); // DM: não conta

  const board = db.leagueBoard(G1, "ana", at(MON, 14));
  assert.deepEqual(board.rows, [{ userId: "ana", xp: 10 }]);
  assert.deepEqual(board.you, { member: true, xp: 10, position: 1 });
  assert.equal(db.getUser("ana", at(MON)).xp, 40, "o XP geral continua contando tudo");
});

test("os bônus também contam, como no ranking do servidor", () => {
  db.joinLeague(G1, "ana", at(MON, 9));
  const result = db.recordAnswer("ana", G1, true, 10, at(MON, 10), { daily: true });

  assert.equal(result.gained + result.bonus.total, 20);
  assert.equal(db.leagueBoard(G1, "ana", at(MON)).you.xp, 20);
  assert.deepEqual(db.top(G1), [{ userId: "ana", xp: 20 }], "e o ranking do servidor bate com a liga");
});

test("quem não entrou não aparece nem deixa rastro na liga", () => {
  right("ana", G1, at(MON));
  const board = db.leagueBoard(G1, "ana", at(MON));

  assert.deepEqual(board.rows, []);
  assert.equal(board.participants, 0);
  assert.deepEqual(board.you, { member: false, xp: 0, position: null });
});

test("a mesma pessoa tem uma liga em cada servidor, cada uma com seus pontos", () => {
  db.joinLeague(G1, "ana", at(MON));
  db.joinLeague(G2, "ana", at(MON));
  right("ana", G1, at(MON));
  right("ana", G1, at(MON));
  right("ana", G2, at(MON));

  assert.equal(db.leagueBoard(G1, "ana", at(MON)).you.xp, 20);
  assert.equal(db.leagueBoard(G2, "ana", at(MON)).you.xp, 10);

  db.leaveLeague(G1, "ana");
  assert.equal(db.leagueBoard(G2, "ana", at(MON)).you.xp, 10, "sair de uma não mexe na outra");
});

test("sair apaga os pontos da liga e voltar começa do zero (o XP geral fica)", () => {
  db.joinLeague(G1, "ana", at(MON));
  right("ana", G1, at(MON));
  db.leaveLeague(G1, "ana");

  const gone = db.leagueBoard(G1, "ana", at(MON));
  assert.deepEqual(gone.rows, []);
  assert.deepEqual(gone.you, { member: false, xp: 0, position: null });

  db.joinLeague(G1, "ana", at(MON, 15));
  assert.equal(db.leagueBoard(G1, "ana", at(MON, 16)).you.xp, 0, "voltou do zero");
  assert.equal(db.getUser("ana", at(MON)).xp, 10, "o XP geral e o ranking do servidor não mudam");
  assert.deepEqual(db.top(G1), [{ userId: "ana", xp: 10 }]);
});

// ---------- a semana, o ranking e o desempate ----------

test("a semana vira na segunda: o domingo ainda conta na semana que acaba e a segunda começa do zero", () => {
  db.joinLeague(G1, "ana", at(MON));
  right("ana", G1, at(SUN, 23));
  right("ana", G1, at(NEXT_MON, 0)); // meia-noite e pouco da segunda

  const thisWeek = db.leagueBoard(G1, "ana", at(NEXT_MON, 8));
  assert.equal(thisWeek.week, NEXT_MON);
  assert.equal(thisWeek.you.xp, 10, "só a resposta da segunda");

  const lastWeek = db.leagueBoard(G1, "ana", at(NEXT_MON, 8), { weeksAgo: 1 });
  assert.equal(lastWeek.week, MON);
  assert.deepEqual(lastWeek.rows, [{ userId: "ana", xp: 10 }], "a do domingo");
});

test("o ranking ordena por XP, desempata pelo id e empatados dividem a posição", () => {
  for (const user of ["caio", "bia", "ana"]) db.joinLeague(G1, user, at(MON, 8));
  right("ana", G1, at(MON, 9));
  right("ana", G1, at(MON, 10));
  right("ana", G1, at(MON, 11)); // 30
  right("bia", G1, at(MON, 9));
  right("bia", G1, at(MON, 10));
  right("bia", G1, at(MON, 11)); // 30
  right("caio", G1, at(MON, 9)); // 10

  const board = db.leagueBoard(G1, "caio", at(MON, 12));
  assert.deepEqual(board.rows, [
    { userId: "ana", xp: 30 },
    { userId: "bia", xp: 30 },
    { userId: "caio", xp: 10 },
  ]);
  assert.equal(db.leagueBoard(G1, "ana", at(MON, 12)).you.position, 1);
  assert.equal(db.leagueBoard(G1, "bia", at(MON, 12)).you.position, 1, "empate na ponta");
  assert.equal(board.you.position, 3, "depois de dois empatados vem o 3º");
});

test("quem entrou mas ainda não pontuou conta como participante, sem aparecer no top", () => {
  db.joinLeague(G1, "ana", at(MON));
  db.joinLeague(G1, "bia", at(MON));
  right("ana", G1, at(MON));

  const board = db.leagueBoard(G1, "bia", at(MON));
  assert.equal(board.participants, 2);
  assert.deepEqual(board.rows, [{ userId: "ana", xp: 10 }]);
  assert.deepEqual(board.you, { member: true, xp: 0, position: null });
});

test("o limite do top é respeitado", () => {
  for (let i = 0; i < 15; i++) {
    db.joinLeague(G1, `u${String(i).padStart(2, "0")}`, at(MON));
    right(`u${String(i).padStart(2, "0")}`, G1, at(MON));
  }
  assert.equal(db.leagueBoard(G1, "u00", at(MON)).rows.length, 10);
  assert.equal(db.leagueBoard(G1, "u00", at(MON), { limit: 3 }).rows.length, 3);
});

// ---------- as telas ----------

test("a liga de quem não entrou: explica a regra e oferece o botão de entrar", async () => {
  const components = await views.league({ client: fakeClient, guild: null, guildId: G1, ownerId: "ana", now: at(MON) });
  const text = textOf(components);

  assert.match(text, /Liga da semana/);
  assert.match(text, /seg 09\/11 – dom 15\/11/);
  assert.match(text, /faltam 6 dias/);
  assert.match(text, /ninguém entrou ainda/);
  assert.match(text, /Ninguém pontuou na liga esta semana ainda/);
  assert.match(text, /Você ainda não está na liga\. Quem entra compete de segunda a domingo, só com o XP ganho \*\*depois\*\* de entrar/);
  assert.match(text, /Sair a qualquer momento apaga seus pontos/);

  const ids = customIds(components);
  assert.ok(ids.includes("league:join:ana") && !ids.includes("league:leave:ana"));
  assert.deepEqual(buttonLabels(components).slice(0, 1), ["Entrar na liga"]);
  assertWithinDiscordLimits(components, "liga de quem não entrou", assert);
});

test("a liga de quem entrou: posição, '◀ você', semana passada e o botão de sair", async () => {
  for (const user of ["ana", "bia"]) db.joinLeague(G1, user, at(MON));
  right("ana", G1, at(MON));
  right("ana", G1, at(MON));
  right("bia", G1, at(MON));
  // semana passada: ana 10 pontos
  db.joinLeague(G1, "caio", at("2026-11-02"));
  right("caio", G1, at("2026-11-03"));

  const components = await views.league({ client: fakeClient, guild: null, guildId: G1, ownerId: "bia", now: at(WED) });
  const text = textOf(components);

  assert.match(text, /3 participantes/);
  assert.match(text, /🥇 \*\*usuario-ana\*\* — 20 XP/);
  assert.match(text, /🥈 \*\*usuario-bia\*\* — 10 XP {2}◀ você/);
  assert.match(text, /Sua posição: \*\*#2\*\* • 10 XP nesta semana/);
  assert.match(text, /🏁 Semana passada: 🥇 usuario-caio \(10 XP\)/);
  assert.match(text, /faltam 4 dias/);

  const ids = customIds(components);
  assert.ok(ids.includes("league:leave:bia") && !ids.includes("league:join:bia"));
  assert.ok(["nav:bia:estudar", "nav:bia:ranking", "nav:bia:perfil"].every((id) => ids.includes(id)));
  assertWithinDiscordLimits(components, "liga de quem entrou", assert);
});

test("empatados na liga dividem a posição e a medalha, e o próximo pula (1º, 2º, 2º, 4º)", async () => {
  const points = { ana: 4, bia: 3, caio: 3, dani: 1 };
  for (const [user, n] of Object.entries(points)) {
    db.joinLeague(G1, user, at(MON, 8));
    for (let i = 0; i < n; i++) right(user, G1, at(MON, 9 + i));
  }
  const text = textOf(await views.league({ client: fakeClient, guild: null, guildId: G1, ownerId: "caio", now: at(WED) }));

  assert.match(text, /🥇 \*\*usuario-ana\*\* — 40 XP/);
  assert.match(text, /🥈 \*\*usuario-bia\*\* — 30 XP/);
  assert.match(text, /🥈 \*\*usuario-caio\*\* — 30 XP {2}◀ você/);
  assert.match(text, /\*\*4\.\*\* \*\*usuario-dani\*\* — 10 XP/);
  assert.match(text, /Sua posição: \*\*#2\*\*/, "a medalha e a posição dizem a mesma coisa");
});

test("a liga diz quanto falta para a semana acabar", async () => {
  const left = async (date) =>
    /(termina hoje|termina amanhã|faltam \d+ dias)/.exec(
      textOf(await views.league({ client: fakeClient, guild: null, guildId: G1, ownerId: "ana", now: at(date) }))
    )[1];

  assert.equal(await left(MON), "faltam 6 dias");
  assert.equal(await left(SAT), "termina amanhã");
  assert.equal(await left(SUN), "termina hoje");
  assert.equal(await left(NEXT_MON), "faltam 6 dias", "a nova semana");
});

test("quem entrou e ainda não pontuou é avisado, sem posição", async () => {
  db.joinLeague(G1, "ana", at(MON));
  const text = textOf(await views.league({ client: fakeClient, guild: null, guildId: G1, ownerId: "ana", now: at(MON) }));
  assert.match(text, /Você está na liga, mas ainda não pontuou nesta semana/);
  assert.match(text, /1 participante(?!s)/);
});

test("a liga cheia mostra só o top 10 e cabe nos limites do Discord", async () => {
  for (let i = 0; i < 25; i++) {
    const user = `pessoa-${String(i).padStart(2, "0")}`;
    db.joinLeague(G1, user, at(MON));
    for (let n = 0; n <= i; n++) right(user, G1, at(MON));
  }
  const components = await views.league({ client: fakeClient, guild: null, guildId: G1, ownerId: "pessoa-00", now: at(WED) });
  const text = textOf(components);

  assert.equal((text.match(/ XP/g) ?? []).length >= 10, true);
  assert.match(text, /usuario-pessoa-24/, "o 1º colocado");
  assert.doesNotMatch(text, /usuario-pessoa-14\b/, "o 11º já fica de fora");
  assert.match(text, /Sua posição: \*\*#25\*\*/, "mas quem está fora do top vê a própria posição");
  assertWithinDiscordLimits(components, "liga cheia", assert);
});

test("ações: entrar e sair mostram um aviso e mudam o botão; repetir não quebra", async () => {
  const view = (action) => views.league({ client: fakeClient, guild: null, guildId: G1, ownerId: "ana", action, now: at(MON) });

  const joined = await view("join");
  assert.match(textOf(joined), /Você entrou na liga!\*\* Só conta o XP que você ganhar daqui para a frente/);
  assert.ok(customIds(joined).includes("league:leave:ana"));

  assert.match(textOf(await view("join")), /Você já estava na liga/);

  const left = await view("leave");
  assert.match(textOf(left), /Você saiu da liga\*\* e seus pontos nela foram apagados/);
  assert.ok(customIds(left).includes("league:join:ana"));

  assert.match(textOf(await view("leave")), /Você não estava na liga/);
});

test("na DM não há liga: ela é de cada servidor", async () => {
  const components = await views.league({ client: fakeClient, guild: null, guildId: null, ownerId: "ana", action: "join" });
  assert.match(textOf(components), /A liga é de cada servidor/);
  assert.deepEqual(customIds(components), [], "sem botões, e nada foi gravado");
});

test("o nome de quem está na liga passa pelo filtro de texto (markdown e links não vazam)", async () => {
  db.joinLeague(G1, "ana", at(MON));
  right("ana", G1, at(MON));
  const client = { ...fakeClient, users: { fetch: async () => ({ username: "[clique](https://golpe.example) @everyone" }) } };

  const text = textOf(await views.league({ client, guild: null, guildId: G1, ownerId: "ana", now: at(MON) }));
  assert.doesNotMatch(text, /\]\(https:\/\/golpe/);
  assert.doesNotMatch(text, /@everyone/);
});

test("o ranking do servidor ganha o atalho para a liga, e o da DM não", () => {
  const base = { title: "T", subtitle: "s", lines: ["x"], you: "y", ownerId: "ana" };
  assert.ok(customIds(ui.rankingMessage({ ...base, league: true })).includes("nav:ana:liga"));
  assert.ok(!customIds(ui.rankingMessage(base)).includes("nav:ana:liga"));
});

// ---------- comando e botões ----------

function fakeMessage(authorId, { dm = false } = {}) {
  const sent = [];
  return {
    sent,
    author: { id: authorId },
    guild: null,
    guildId: dm ? null : G1,
    channel: { type: dm ? ChannelType.DM : ChannelType.GuildText, send: async (payload) => sent.push(payload) },
  };
}

const run = async (...args) => {
  const message = fakeMessage(...args.slice(1));
  await ligaCommand.execute({ message, args: args[0], client: fakeClient });
  return message;
};

test("comando liga: mostra a liga; 'entrar' e 'sair' (com ou sem acento e maiúscula) mudam a participação", async () => {
  const look = await run([], "ana");
  assert.ok(customIds(look.sent[0].components).includes("league:join:ana"));
  assert.ok(look.sent[0].flags & MessageFlags.IsComponentsV2);

  const join = await run(["Entrar"], "ana");
  assert.match(textOf(join.sent[0].components), /Você entrou na liga/);
  assert.equal(db.leagueBoard(G1, "ana").you.member, true);

  const leave = await run(["SAIR!"], "ana");
  assert.match(textOf(leave.sent[0].components), /Você saiu da liga/);
  assert.equal(db.leagueBoard(G1, "ana").you.member, false);
});

test("comando liga: argumento desconhecido explica o uso e não muda nada", async () => {
  const msg = await run(["abracadabra"], "ana");
  assert.match(textOf(msg.sent[0].components), /`entrar`.*`sair`/);
  assert.doesNotMatch(textOf(msg.sent[0].components), /abracadabra/, "não repete o que a pessoa digitou");
  assert.equal(db.leagueBoard(G1, "ana").participants, 0);
});

test("comando liga na DM: avisa que a liga é do servidor e não grava nada", async () => {
  const msg = await run(["entrar"], "ana", { dm: true });
  assert.match(textOf(msg.sent[0].components), /A liga é de cada servidor/);
  assert.equal(db.leagueBoard(G1, "ana").participants, 0);
});

function click(customId, { userId = "ana", guildId = G1 } = {}) {
  const interaction = fakeInteraction({ customId, userId, kind: "button" });
  interaction.guildId = guildId;
  return interaction;
}
const last = (i) => i.calls[i.calls.length - 1];

test("botões: entrar e sair atualizam a mesma mensagem", async () => {
  const join = click("league:join:ana");
  await leagueButton.execute(join, join.customId.split(":"), fakeClient);
  assert.deepEqual(join.calls.map((c) => c.method), ["deferUpdate", "editReply"]);
  assert.match(textOf(last(join).payload.components), /Você entrou na liga/);
  assert.ok(customIds(last(join).payload.components).includes("league:leave:ana"));
  assert.ok(last(join).payload.flags & MessageFlags.IsComponentsV2);
  assert.equal(db.leagueBoard(G1, "ana").you.member, true);

  const leave = click("league:leave:ana");
  await leagueButton.execute(leave, leave.customId.split(":"), fakeClient);
  assert.match(textOf(last(leave).payload.components), /Você saiu da liga/);
  assert.equal(db.leagueBoard(G1, "ana").you.member, false);
});

test("botões: só o dono clica, e botão fora de servidor ou desconhecido não faz nada", async () => {
  const other = click("league:join:ana", { userId: "bia" });
  await leagueButton.execute(other, other.customId.split(":"), fakeClient);
  assert.equal(last(other).method, "reply");
  assert.ok(last(other).payload.flags & MessageFlags.Ephemeral);
  assert.equal(db.leagueBoard(G1, "ana").participants, 0, "ninguém entrou pela mão de outra pessoa");

  const dm = click("league:join:ana", { guildId: null });
  await leagueButton.execute(dm, dm.customId.split(":"), fakeClient);
  assert.equal(last(dm).method, "reply");

  const unknown = click("league:explode:ana");
  await leagueButton.execute(unknown, unknown.customId.split(":"), fakeClient);
  assert.equal(last(unknown).method, "reply");
  assert.equal(db.leagueBoard(G1, "ana").participants, 0);
});

test("o atalho 'Liga' da navegação abre a liga", async () => {
  const i = click("nav:ana:liga");
  await navButton.execute(i, i.customId.split(":"), fakeClient);
  assert.deepEqual(i.calls.map((c) => c.method), ["deferUpdate", "editReply"]);
  assert.match(textOf(last(i).payload.components), /Liga da semana/);
});

// ---------- migração ----------

test("banco antigo (versão 6) ganha as tabelas da liga sem perder dados", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-v6-"));
  try {
    const file = path.join(dir, "devlingo.db");
    db.open(file);
    right("velha", G1, at(MON));
    db.close();

    downgradeTo(file, 6); // como estava antes da liga

    db.open(file);
    assert.equal(db.getUser("velha", at(MON)).xp, 10, "o que já existia continua");
    assert.deepEqual(db.top(G1), [{ userId: "velha", xp: 10 }]);
    assert.equal(db.joinLeague(G1, "velha", at(MON)), true);
    right("velha", G1, at(MON));
    assert.equal(db.leagueBoard(G1, "velha", at(MON)).you.xp, 10, "e a liga funciona");
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
