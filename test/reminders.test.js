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
const reminders = require("../src/utils/reminders");
const { hourOf } = require("../src/utils/time");
const lembrete = require("../src/commands/lembrete");
const remindButton = require("../src/buttons/remind");
const ready = require("../src/events/ready");

// 2026-11-09 é uma segunda-feira. As horas são do Brasil (UTC-3).
const at = (date, hour = 12) => new Date(Date.parse(`${date}T00:00:00Z`) + (hour + 3) * 3_600_000);
const SUN = "2026-11-08";
const MON = "2026-11-09";
const TUE = "2026-11-10";
const WED = "2026-11-11";
const THU = "2026-11-12";

const DEFAULTS = {
  timezone: "America/Sao_Paulo",
  dailyXpCap: 0,
  dailyGoal: 0,
  streakMilestones: {},
  freezeEvery: 7,
  freezeMax: 2,
  dailyChallengeBonusXp: 10,
  remindersEnabled: true,
  reminderDefaultHour: 20,
  reminderWindowHours: 3,
  reminderTickMs: 60_000,
  reminderBatch: 20,
  reminderSpacingMs: 1_100,
  reminderMaxFailures: 3,
};

test.beforeEach(() => {
  Object.assign(config, DEFAULTS);
  db.open(":memory:");
});
test.after(() => db.close());

const textOf = (components) =>
  flatten(components)
    .filter((n) => n.type === TYPE.TextDisplay)
    .map((n) => n.content)
    .join("\n");
const dmError = (code) => Object.assign(new Error(`erro ${code}`), { code });

// Um "Discord" falso: guarda o que foi enviado e deixa escolher quem falha e com qual código.
function fakeDiscord() {
  const sent = [];
  const sendErrors = new Map();
  const fetchErrors = new Map();
  let fetches = 0;
  const client = {
    users: {
      fetch: async (id) => {
        fetches++;
        if (fetchErrors.has(id)) throw fetchErrors.get(id);
        return {
          id,
          send: async (payload) => {
            if (sendErrors.has(id)) throw sendErrors.get(id);
            sent.push({ id, payload });
          },
        };
      },
    },
  };
  return { client, sent, sendErrors, fetchErrors, fetches: () => fetches };
}

const sleeps = [];
const sleep = async (ms) => void sleeps.push(ms);
test.beforeEach(() => {
  sleeps.length = 0;
});

// ---------- hora e interpretação do texto ----------

test("hourOf: hora cheia no fuso do bot, com a meia-noite sendo 0", () => {
  assert.equal(hourOf(at(MON, 20), "America/Sao_Paulo"), 20);
  assert.equal(hourOf(at(MON, 0), "America/Sao_Paulo"), 0);
  assert.equal(hourOf(new Date("2026-11-09T23:30:00Z"), "UTC"), 23);
  assert.equal(hourOf(new Date("2026-11-09T23:30:00Z"), "Asia/Tokyo"), 8);
});

test("parseHour aceita 20, 20h, 08h e 20:00, e recusa o resto", () => {
  assert.equal(reminders.parseHour("20"), 20);
  assert.equal(reminders.parseHour("20h"), 20);
  assert.equal(reminders.parseHour(" 08H "), 8);
  assert.equal(reminders.parseHour("7:00"), 7);
  assert.equal(reminders.parseHour("0"), 0);
  assert.equal(reminders.parseHour("23"), 23);
  for (const bad of ["24", "-1", "8h30", "20.5", "", "abc", "vinte", null, undefined, "100"]) {
    assert.equal(reminders.parseHour(bad), null, JSON.stringify(bad));
  }
});

// ---------- banco ----------

test("ligar, mudar a hora e desligar", () => {
  assert.equal(db.getReminder("ana"), null, "quem nunca ligou não tem registro");

  db.setReminder("ana", 20);
  assert.deepEqual(db.getReminder("ana"), { enabled: true, hour: 20, offReason: null });
  db.setReminder("ana", 8);
  assert.equal(db.getReminder("ana").hour, 8);

  assert.equal(db.clearReminder("ana"), true);
  assert.equal(db.getReminder("ana"), null, "desligar apaga tudo");
  assert.equal(db.clearReminder("ana"), false);
});

test("quem está na hora: janela de 3 horas a partir da marcada, nem antes nem depois", () => {
  db.setReminder("ana", 8);
  const due = (hour) => db.dueReminders(at(MON, hour)).map((r) => r.userId);

  assert.deepEqual(due(7), [], "cedo demais");
  assert.deepEqual(due(8), ["ana"]);
  assert.deepEqual(due(10), ["ana"], "bot que ficou fora do ar ainda manda dentro da janela");
  assert.deepEqual(due(11), [], "passou da janela: pula o dia");

  db.setReminder("bia", 23);
  assert.deepEqual(db.dueReminders(at(MON, 23)).map((r) => r.userId), ["bia"]);
  assert.deepEqual(db.dueReminders(at(TUE, 0)).map((r) => r.userId), [], "a meia-noite não herda a janela das 23h");
});

test("quem já respondeu hoje não recebe, quem respondeu só ontem ou nunca jogou recebe", () => {
  for (const user of ["ana", "bia", "caio"]) db.setReminder(user, 20);
  db.recordAnswer("ana", null, true, 10, at(MON, 9)); // hoje
  db.recordAnswer("bia", null, true, 10, at(SUN, 22)); // ontem
  // caio nunca jogou

  assert.deepEqual(db.dueReminders(at(MON, 20)).map((r) => r.userId), ["bia", "caio"]);
});

test("a tentativa de hoje é reservada uma vez só, e amanhã vale de novo", () => {
  db.setReminder("ana", 20);
  assert.equal(db.claimReminder("ana", at(MON, 20)), true);
  assert.equal(db.claimReminder("ana", at(MON, 21)), false, "já tentou hoje");
  assert.deepEqual(db.dueReminders(at(MON, 21)), [], "e não aparece mais como devida");

  assert.equal(db.claimReminder("ana", at(TUE, 20)), true, "no dia seguinte");
  assert.equal(db.claimReminder("ninguem", at(MON, 20)), false, "quem não ligou não tem o que reservar");
});

test("mudar a hora no mesmo dia depois de uma tentativa não permite uma segunda DM", () => {
  db.setReminder("ana", 8);
  db.claimReminder("ana", at(MON, 8));
  db.setReminder("ana", 9);
  assert.deepEqual(db.dueReminders(at(MON, 9)), []);
});

test("ordem e limite: por hora marcada e depois pelo id", () => {
  db.setReminder("c", 19);
  db.setReminder("a", 20);
  db.setReminder("b", 19);
  const all = db.dueReminders(at(MON, 20)).map((r) => r.userId);
  assert.deepEqual(all, ["b", "c", "a"]);
  assert.deepEqual(db.dueReminders(at(MON, 20), 2).map((r) => r.userId), ["b", "c"]);
});

test("falha de DM: a fatal desliga na hora, as outras só no 3º dia seguido, e um sucesso zera a conta", () => {
  db.setReminder("ana", 20);
  assert.deepEqual(db.reminderFailed("ana"), { disabled: false, failures: 1 });
  db.reminderSent("ana");
  assert.deepEqual(db.reminderFailed("ana"), { disabled: false, failures: 1 }, "o sucesso zerou");
  assert.deepEqual(db.reminderFailed("ana"), { disabled: false, failures: 2 });
  assert.deepEqual(db.reminderFailed("ana"), { disabled: true, failures: 3 });
  assert.deepEqual(db.getReminder("ana"), { enabled: false, hour: 20, offReason: "dm" });
  assert.deepEqual(db.dueReminders(at(MON, 20)), [], "desligado não é mais chamado");

  db.setReminder("bia", 20);
  assert.equal(db.reminderFailed("bia", { fatal: true }).disabled, true);

  assert.deepEqual(db.reminderFailed("ninguem"), { disabled: false, failures: 0 });

  db.setReminder("ana", 18); // ligar de novo limpa tudo
  assert.deepEqual(db.getReminder("ana"), { enabled: true, hour: 18, offReason: null });
});

// ---------- o relógio (tick) ----------

test("tick: manda a DM na hora marcada, só com a mensagem certa e só para quem ligou", async () => {
  db.recordAnswer("ana", null, true, 10, at(SUN, 12)); // sequência de 1 dia, ainda sem responder hoje
  db.setReminder("ana", 20);
  db.recordAnswer("bia", null, true, 10, at(SUN, 12)); // joga, mas NÃO ligou os lembretes
  const discord = fakeDiscord();

  const result = await reminders.tick(discord.client, { now: at(MON, 20), sleep });

  assert.deepEqual(result, { sent: 1, failed: 0, disabled: 0 });
  assert.equal(discord.sent.length, 1);
  assert.equal(discord.sent[0].id, "ana", "quem não ligou nunca recebe");
  assert.ok(discord.sent[0].payload.flags & MessageFlags.IsComponentsV2);

  const text = textOf(discord.sent[0].payload.components);
  assert.match(text, /Lembrete do Devlingo/);
  assert.match(text, /Sua sequência é de \*\*1 dia\*\*/);
  assert.match(text, /desafio do dia está esperando \(\+10 XP\): escreva `diario`/);
  assert.match(text, /no máximo uma DM por dia, e só se ainda não respondeu nada hoje/);
  const ids = customIds(discord.sent[0].payload.components);
  assert.ok(ids.includes("nav:ana:estudar") && ids.includes("remind:off:ana"));
  assertWithinDiscordLimits(discord.sent[0].payload.components, "DM do lembrete", assert);
});

test("tick: no máximo uma DM por dia, e outra no dia seguinte", async () => {
  db.setReminder("ana", 20);
  const discord = fakeDiscord();

  assert.equal((await reminders.tick(discord.client, { now: at(MON, 20), sleep })).sent, 1);
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 20), sleep })).sent, 0, "mesma conferência de novo");
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 22), sleep })).sent, 0, "mais tarde, ainda hoje");
  assert.equal((await reminders.tick(discord.client, { now: at(TUE, 20), sleep })).sent, 1, "amanhã");
  assert.equal(discord.sent.length, 2);
});

test("tick: quem já respondeu hoje não é incomodado (e quem responde depois da hora também não)", async () => {
  db.setReminder("ana", 20);
  db.recordAnswer("ana", null, true, 10, at(MON, 9));
  const discord = fakeDiscord();
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 20), sleep })).sent, 0);
  assert.equal(discord.fetches(), 0, "nem chegou a buscar a pessoa");
});

test("tick: respeita a janela (reinício depois da hora ainda manda, de madrugada não)", async () => {
  db.setReminder("ana", 20);
  const discord = fakeDiscord();

  assert.equal((await reminders.tick(discord.client, { now: at(MON, 19), sleep })).sent, 0, "ainda não é a hora");
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 23), sleep })).sent, 0, "passou da janela");
  assert.equal(discord.sent.length, 0);
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 22), sleep })).sent, 1, "dentro da janela de 3 horas");
});

test("tick: sem ninguém para avisar não faz nada", async () => {
  const discord = fakeDiscord();
  assert.deepEqual(await reminders.tick(discord.client, { now: at(MON, 20), sleep }), { sent: 0, failed: 0, disabled: 0 });
  assert.equal(discord.fetches(), 0);
});

test("tick: DM que o Discord recusa (50007) ou conta que não existe (10013) desliga na hora e avisa depois", async () => {
  db.setReminder("ana", 20);
  db.setReminder("bia", 20);
  const discord = fakeDiscord();
  discord.sendErrors.set("ana", dmError(50007));
  discord.fetchErrors.set("bia", dmError(10013));

  const result = await reminders.tick(discord.client, { now: at(MON, 20), sleep });
  assert.deepEqual(result, { sent: 0, failed: 2, disabled: 2 });
  assert.deepEqual(db.getReminder("ana"), { enabled: false, hour: 20, offReason: "dm" });
  assert.equal(db.getReminder("bia").enabled, false);

  assert.equal((await reminders.tick(discord.client, { now: at(TUE, 20), sleep })).failed, 0, "não insiste no dia seguinte");

  const screen = textOf(ui.reminderScreen({ ownerId: "ana", reminder: db.getReminder("ana") }));
  assert.match(screen, /Desligados/);
  assert.match(screen, /Desliguei seus lembretes porque não consegui te mandar DM/);
});

test("tick: erro passageiro tenta de novo no dia seguinte e só desliga no 3º dia seguido", async () => {
  db.setReminder("ana", 20);
  const discord = fakeDiscord();
  discord.sendErrors.set("ana", new Error("rede caiu"));

  assert.deepEqual(await reminders.tick(discord.client, { now: at(MON, 20), sleep }), { sent: 0, failed: 1, disabled: 0 });
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 21), sleep })).failed, 0, "no mesmo dia não repete");
  assert.equal((await reminders.tick(discord.client, { now: at(TUE, 20), sleep })).failed, 1);
  assert.equal(db.getReminder("ana").enabled, true, "dois dias de erro ainda não desligam");
  assert.deepEqual(await reminders.tick(discord.client, { now: at(WED, 20), sleep }), { sent: 0, failed: 1, disabled: 1 });
  assert.equal(db.getReminder("ana").enabled, false);
});

test("tick: um dia que dá certo zera a contagem de falhas", async () => {
  db.setReminder("ana", 20);
  const discord = fakeDiscord();

  discord.sendErrors.set("ana", new Error("rede caiu"));
  await reminders.tick(discord.client, { now: at(MON, 20), sleep });
  await reminders.tick(discord.client, { now: at(TUE, 20), sleep });
  discord.sendErrors.delete("ana");
  assert.equal((await reminders.tick(discord.client, { now: at(WED, 20), sleep })).sent, 1);
  discord.sendErrors.set("ana", new Error("rede caiu"));
  await reminders.tick(discord.client, { now: at(THU, 20), sleep });

  assert.equal(db.getReminder("ana").enabled, true, "falhou 2, deu certo, falhou 1: nunca chegou a 3 seguidos");
});

test("tick: se outro processo reservou a tentativa de hoje depois de a lista ser lida, não manda em dobro", async () => {
  db.setReminder("ana", 20);
  const stale = db.dueReminders(at(MON, 20)); // a lista que este processo leu: ana está na hora
  assert.equal(stale.length, 1);
  assert.equal(db.claimReminder("ana", at(MON, 20)), true); // e o outro processo chegou primeiro

  const real = db.dueReminders;
  db.dueReminders = () => stale;
  const discord = fakeDiscord();
  try {
    const result = await reminders.tick(discord.client, { now: at(MON, 20), sleep });
    assert.deepEqual(result, { sent: 0, failed: 0, disabled: 0 });
    assert.equal(discord.fetches(), 0, "nem chegou a mexer na DM da pessoa");
  } finally {
    db.dueReminders = real;
  }
});

test("tick: pausa entre as DMs (nunca antes da primeira) e respeita o lote", async () => {
  for (const user of ["a", "b", "c", "d", "e"]) db.setReminder(user, 20);
  config.reminderBatch = 2;
  const discord = fakeDiscord();

  assert.equal((await reminders.tick(discord.client, { now: at(MON, 20), sleep })).sent, 2);
  assert.deepEqual(sleeps, [1_100], "uma pausa entre as duas DMs");
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 20), sleep })).sent, 2);
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 20), sleep })).sent, 1);
  assert.equal((await reminders.tick(discord.client, { now: at(MON, 20), sleep })).sent, 0);
  assert.deepEqual(discord.sent.map((s) => s.id).sort(), ["a", "b", "c", "d", "e"], "todos receberam, cada um uma vez");
});

test("tick: duas conferências nunca rodam ao mesmo tempo, e uma que falha não trava as seguintes", async () => {
  db.setReminder("ana", 20);
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const slow = { users: { fetch: async () => ({ send: () => gate }) } };

  const first = reminders.tick(slow, { now: at(MON, 20), sleep });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await reminders.tick(slow, { now: at(MON, 20), sleep }), { skipped: true });
  release();
  assert.equal((await first).sent, 1);

  // depois disso a trava foi solta, mesmo que a conferência anterior tenha estourado
  db.setReminder("bia", 20);
  const broken = { users: { fetch: () => { throw new Error("bug"); } } };
  assert.equal((await reminders.tick(broken, { now: at(MON, 20), sleep })).failed, 1);
  // No dia seguinte as duas pessoas voltam a estar na hora: a conferência roda de verdade (não é "skipped").
  assert.deepEqual(await reminders.tick(fakeDiscord().client, { now: at(TUE, 20), sleep }), { sent: 2, failed: 0, disabled: 0 }, "não ficou travado");
});

test("a mensagem do lembrete muda com a situação, sem cobrança", () => {
  const msg = (state) => textOf(ui.reminderMessage({ ownerId: "ana", ...state }));

  assert.match(msg({ streak: 5, dailyDone: true }), /Sua sequência é de \*\*5 dias\*\*/);
  assert.doesNotMatch(msg({ streak: 5, dailyDone: true }), /diario/, "desafio do dia já feito: não menciona");
  assert.match(msg({ streak: 0, dailyDone: false }), /Que tal uma pergunta hoje/);
  assert.match(msg({ streak: 0, dailyDone: false }), /escreva `diario`/);
  assert.match(msg({ streak: 7, frozenDays: 1, dailyDone: true }), /Você ficou 1 dia sem responder, mas um congelamento cobre isso/);
  assert.match(msg({ streak: 7, frozenDays: 2, dailyDone: true }), /2 dias sem responder, mas os congelamentos cobrem isso/);

  config.dailyChallengeBonusXp = 0;
  assert.doesNotMatch(msg({ streak: 0, dailyDone: false }), /\+\d+ XP/);
});

// ---------- o relógio ligado ao bot ----------

test("start: com REMINDERS=off nada é agendado; ligado, agenda a conferência e dá para parar", () => {
  const calls = { set: [], cleared: [] };
  const timer = { unref: () => (calls.unrefed = true) };
  const deps = { setIntervalFn: (fn, ms) => (calls.set.push(ms), timer), clearIntervalFn: (t) => calls.cleared.push(t) };

  config.remindersEnabled = false;
  assert.equal(reminders.start(fakeClient, deps), null);
  assert.deepEqual(calls.set, []);

  config.remindersEnabled = true;
  const handle = reminders.start(fakeClient, deps);
  assert.deepEqual(calls.set, [60_000]);
  assert.equal(calls.unrefed, true, "o relógio sozinho não segura o processo aberto");
  handle.stop();
  assert.deepEqual(calls.cleared, [timer]);
});

test("o evento ready liga o relógio dos lembretes e guarda a alça para parar", () => {
  const client = { user: { tag: "Devlingo#0001", setActivity() {} }, guilds: { cache: { size: 1 } } };
  ready.execute(client);
  try {
    assert.equal(typeof client.reminders?.stop, "function");
  } finally {
    client.reminders?.stop();
  }

  const off = { user: client.user, guilds: client.guilds };
  config.remindersEnabled = false;
  ready.execute(off);
  assert.equal(off.reminders, null);
});

// ---------- ligar e desligar ----------

const fakeUser = (id, { failSend = false } = {}) => {
  const sent = [];
  return { id, sent, send: async (payload) => (failSend ? Promise.reject(dmError(50007)) : sent.push(payload)) };
};

test("ligar num servidor manda uma DM de confirmação antes de ligar", async () => {
  const user = fakeUser("ana");
  const flash = await reminders.apply({ action: "on", user, ownerId: "ana", inGuild: true, hour: 18 });

  assert.deepEqual(db.getReminder("ana"), { enabled: true, hour: 18, offReason: null });
  assert.equal(user.sent.length, 1);
  assert.ok(user.sent[0].flags & MessageFlags.IsComponentsV2);
  assert.match(textOf(user.sent[0].components), /Lembretes ligados!/);
  assert.match(textOf(user.sent[0].components), /todo dia às \*\*18h\*\*/);
  assert.ok(customIds(user.sent[0].components).includes("remind:off:ana"));
  assert.match(flash, /Lembretes ligados!\*\* Mandei uma DM de confirmação/);
});

test("se a DM de confirmação não chega, os lembretes NÃO são ligados", async () => {
  const user = fakeUser("ana", { failSend: true });
  const flash = await reminders.apply({ action: "on", user, ownerId: "ana", inGuild: true, hour: 18 });

  assert.equal(db.getReminder("ana"), null);
  assert.match(flash, /Não consegui te mandar DM/);
  assert.match(flash, /não liguei os lembretes/);
});

test("ligar na DM não manda confirmação extra (a própria conversa já prova que dá)", async () => {
  const user = fakeUser("ana", { failSend: true }); // se tentasse mandar, falharia
  const flash = await reminders.apply({ action: "on", user, ownerId: "ana", inGuild: false, hour: 9 });

  assert.equal(user.sent.length, 0);
  assert.equal(db.getReminder("ana").hour, 9);
  assert.doesNotMatch(flash, /DM de confirmação/);
});

test("a hora vem do pedido, senão da que a pessoa já tinha, senão da padrão", async () => {
  const user = fakeUser("ana");
  await reminders.apply({ action: "on", user, ownerId: "ana", inGuild: false });
  assert.equal(db.getReminder("ana").hour, 20, "padrão");
  db.setReminder("ana", 7);
  await reminders.apply({ action: "on", user, ownerId: "ana", inGuild: false });
  assert.equal(db.getReminder("ana").hour, 7, "a que já tinha");
  await reminders.apply({ action: "on", user, ownerId: "ana", inGuild: false, hour: 0 });
  assert.equal(db.getReminder("ana").hour, 0, "o pedido manda (inclusive a meia-noite)");
});

test("desligar apaga o registro; desligar sem estar ligado avisa e não quebra", async () => {
  db.setReminder("ana", 20);
  assert.match(await reminders.apply({ action: "off", user: fakeUser("ana"), ownerId: "ana", inGuild: false }), /Lembretes desligados/);
  assert.equal(db.getReminder("ana"), null);
  assert.match(await reminders.apply({ action: "off", user: fakeUser("ana"), ownerId: "ana", inGuild: false }), /já estavam desligados/);
  assert.equal(await reminders.apply({ action: null, user: fakeUser("ana"), ownerId: "ana", inGuild: false }), null);
});

// ---------- a tela ----------

test("a tela dos lembretes: desligada, ligada e desligada pelo bot", () => {
  const select = (components) => flatten(components).find((n) => n.type === TYPE.StringSelect);
  const screen = (reminder) => ui.reminderScreen({ ownerId: "ana", reminder });

  const off = screen(null);
  assert.match(textOf(off), /Desligados\.\*\* Você não recebe nenhuma DM minha/);
  assert.ok(customIds(off).includes("remind:on:ana"));
  assert.equal(select(off).options.length, 24);
  assert.ok(select(off).options.every((o) => !o.default), "desligado: nenhuma hora marcada");
  assert.equal(select(off).options[0].label, "00h");
  assert.equal(select(off).options[23].value, "23");
  assertWithinDiscordLimits(off, "lembretes desligados", assert);

  const on = screen({ enabled: true, hour: 18, offReason: null });
  assert.match(textOf(on), /Ligados\*\*: uma DM por dia às \*\*18h\*\* \(America\/Sao_Paulo\)/);
  assert.ok(customIds(on).includes("remind:off:ana") && !customIds(on).includes("remind:on:ana"));
  assert.deepEqual(select(on).options.filter((o) => o.default).map((o) => o.value), ["18"]);
  assertWithinDiscordLimits(on, "lembretes ligados", assert);

  const dropped = screen({ enabled: false, hour: 18, offReason: "dm" });
  assert.match(textOf(dropped), /Desliguei seus lembretes porque não consegui te mandar DM/);
  assert.ok(customIds(dropped).includes("remind:on:ana"));
  assert.match(textOf(screen(null)), /no máximo uma DM por dia, e só se você ainda não tiver respondido nada/);
});

// ---------- comando e botões ----------

function fakeMessage(authorId, { dm = false, failSend = false } = {}) {
  const sent = [];
  const author = { id: authorId, ...fakeUser(authorId, { failSend }) };
  return {
    sent,
    author,
    guildId: dm ? null : "g1",
    channel: { type: dm ? ChannelType.DM : ChannelType.GuildText, send: async (payload) => sent.push(payload) },
  };
}
const run = async (args, id = "ana", options) => {
  const message = fakeMessage(id, options);
  await lembrete.execute({ message, args, client: fakeClient });
  return message;
};

test("comando lembrete: sem argumento mostra a tela e não muda nada", async () => {
  const msg = await run([]);
  assert.match(textOf(msg.sent[0].components), /Lembretes por DM/);
  assert.ok(msg.sent[0].flags & MessageFlags.IsComponentsV2);
  assert.equal(db.getReminder("ana"), null);
  assert.equal(msg.author.sent.length, 0);
});

test("comando lembrete: ligar com hora, ligar sem hora, só a hora e desligar", async () => {
  const on = await run(["ligar", "18"]);
  assert.deepEqual(db.getReminder("ana"), { enabled: true, hour: 18, offReason: null });
  assert.equal(on.author.sent.length, 1, "num servidor, a DM de confirmação");
  assert.match(textOf(on.sent[0].components), /Lembretes ligados!\*\* Mandei uma DM de confirmação/);
  assert.match(textOf(on.sent[0].components), /Ligados\*\*: uma DM por dia às \*\*18h\*\*/, "e a tela mostra a hora");

  await run(["LIGAR"]); // sem hora: fica a que já tinha
  assert.equal(db.getReminder("ana").hour, 18);

  await run(["7h"]); // só a hora
  assert.equal(db.getReminder("ana").hour, 7);

  const off = await run(["desligar!"]);
  assert.equal(db.getReminder("ana"), null);
  assert.match(textOf(off.sent[0].components), /Lembretes desligados/);
});

test("comando lembrete: hora inválida ou palavra desconhecida explica o uso e não muda nada", async () => {
  for (const args of [["ligar", "25"], ["ligar", "8h30"], ["ligar", "10", "20"], ["desligar", "agora"], ["abracadabra"], ["99"]]) {
    const msg = await run(args);
    const text = textOf(msg.sent[0].components);
    assert.match(text, /`ligar 20`.*`desligar`/, args.join(" "));
    assert.doesNotMatch(text, /abracadabra/, "não repete o que a pessoa digitou");
    assert.equal(db.getReminder("ana"), null, args.join(" "));
    assert.equal(msg.author.sent.length, 0);
  }
});

test("comando lembrete na DM liga sem mandar confirmação extra; num servidor sem DM aberta não liga", async () => {
  const dm = await run(["ligar", "9"], "ana", { dm: true, failSend: true });
  assert.equal(db.getReminder("ana").hour, 9);
  assert.equal(dm.author.sent.length, 0);

  const blocked = await run(["ligar", "9"], "bia", { failSend: true });
  assert.equal(db.getReminder("bia"), null);
  assert.match(textOf(blocked.sent[0].components), /Não consegui te mandar DM/);
});

function click(customId, { userId = "ana", inGuild = true, values } = {}) {
  const interaction = fakeInteraction({ customId, userId, kind: values ? "menu" : "button", values });
  interaction.inGuild = () => inGuild;
  interaction.user.send = async (payload) => (interaction.dms ??= []).push(payload);
  return interaction;
}
const last = (i) => i.calls[i.calls.length - 1];
const press = (i) => remindButton.execute(i, i.customId.split(":"), fakeClient);

test("botões: ligar, trocar a hora pelo menu e desligar atualizam a mesma mensagem", async () => {
  const on = click("remind:on:ana");
  await press(on);
  assert.deepEqual(on.calls.map((c) => c.method), ["deferUpdate", "editReply"]);
  assert.equal(db.getReminder("ana").hour, 20, "hora padrão");
  assert.ok(last(on).payload.flags & MessageFlags.IsComponentsV2);
  assert.ok(customIds(last(on).payload.components).includes("remind:off:ana"));
  assert.equal(on.dms.length, 1, "a DM de confirmação");

  const hour = click("remind:hour:ana", { values: ["6"] });
  await press(hour);
  assert.equal(db.getReminder("ana").hour, 6);
  assert.match(textOf(last(hour).payload.components), /às \*\*06h\*\*/);

  const off = click("remind:off:ana");
  await press(off);
  assert.equal(db.getReminder("ana"), null);
  assert.match(textOf(last(off).payload.components), /Lembretes desligados/);
});

test("o botão 'Parar lembretes' da própria DM desliga e mostra a tela", async () => {
  db.setReminder("ana", 20);
  const stop = click("remind:off:ana", { inGuild: false });
  await press(stop);
  assert.equal(db.getReminder("ana"), null);
  assert.match(textOf(last(stop).payload.components), /Lembretes desligados/);
});

test("botões: só o dono clica, hora de menu inválida e botão desconhecido não fazem nada", async () => {
  const other = click("remind:on:ana", { userId: "bia" });
  await press(other);
  assert.equal(last(other).method, "reply");
  assert.ok(last(other).payload.flags & MessageFlags.Ephemeral);
  assert.equal(db.getReminder("ana"), null, "ninguém liga os lembretes de outra pessoa");
  assert.equal(db.getReminder("bia"), null);

  for (const bad of ["24", "abc", "-1", ""]) {
    const menu = click("remind:hour:ana", { values: [bad] });
    await press(menu);
    assert.equal(last(menu).method, "reply", `hora ${JSON.stringify(bad)}`);
  }
  const unknown = click("remind:explode:ana");
  await press(unknown);
  assert.equal(last(unknown).method, "reply");
  assert.equal(db.getReminder("ana"), null);
});

// ---------- migração ----------

test("banco antigo (versão 7) ganha a tabela de lembretes sem perder dados", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-v7-"));
  try {
    const file = path.join(dir, "devlingo.db");
    db.open(file);
    db.recordAnswer("velha", "g1", true, 10, at(MON, 12));
    db.joinLeague("g1", "velha", at(MON, 12));
    db.close();

    downgradeTo(file, 7); // como estava antes dos lembretes

    db.open(file);
    assert.equal(db.getUser("velha", at(MON, 12)).xp, 10, "o que já existia continua");
    assert.equal(db.leagueBoard("g1", "velha", at(MON, 12)).you.member, true);
    db.setReminder("velha", 21);
    assert.deepEqual(db.dueReminders(at(TUE, 21)), [{ userId: "velha", hour: 21 }], "respondeu na segunda, na terça está na hora");
    assert.deepEqual(db.dueReminders(at(MON, 21)), [], "mas na segunda ela já tinha respondido");
  } finally {
    db.close(); // antes de apagar a pasta (no Windows, banco aberto impede e esconde o erro de verdade)
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
