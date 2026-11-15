// Telas completas do bot (o que cada comando mostra). Os comandos e os botões de atalho (nav)
// usam as mesmas funções daqui, então "digitar o comando" e "clicar no botão" dão o mesmo resultado.
const { AttachmentBuilder } = require("discord.js");
const config = require("../config");
const db = require("./db");
const { dayKey, daysBetween, addDays } = require("./time");
const { safeText } = require("./text");
const challenges = require("./challenges");
const courseLib = require("./courses");
const courseUi = require("./courseUi");
const certificate = require("./certificate");
const progress = require("./progress");
const reminders = require("./reminders");
const study = require("./study");
const ui = require("./ui");

const MEDALS = ["🥇", "🥈", "🥉"];

// Grupos da ajuda. O comando escolhe o grupo com `category` e a ordem com `order`.
const HELP_GROUPS = [
  { id: "estudar", title: "📚 Estudar" },
  { id: "voce", title: "👤 Você" },
  { id: "ajuda", title: "💬 Ajuda" },
];

function help(client, { inGuild, ownerId }) {
  const commands = [...client.commands.values()];
  const known = new Set(HELP_GROUPS.map((g) => g.id));
  const groups = [...HELP_GROUPS, { id: "outros", title: "✨ Outros" }]
    .map((group) => ({
      title: group.title,
      lines: commands
        .filter((cmd) => (known.has(cmd.category) ? cmd.category : "outros") === group.id)
        .sort((a, b) => (a.order ?? 50) - (b.order ?? 50) || a.name.localeCompare(b.name))
        .map((cmd) => `\`${cmd.usage ?? cmd.name}\` — ${cmd.description}`),
    }))
    .filter((group) => group.lines.length > 0);

  // A menção aparece uma vez só, no exemplo, em vez de repetida em cada comando.
  const intro = inGuild
    ? `Marque ${client.user} e escreva o comando. Exemplo: ${ui.commandRef(client, true, "aprender")}`
    : `Escreva o comando direto aqui na conversa. Exemplo: ${ui.commandRef(client, false, "aprender")}`;
  const footer = inGuild
    ? "Também dá para falar comigo por DM, sem precisar me marcar."
    : "Na DM não precisa de nada na frente: é só escrever o comando.";

  return ui.helpMessage({ client, groups, intro, footer, ownerId });
}

// "aprender": configuração na primeira vez; depois, direto nos assuntos do nível e das áreas da pessoa.
function studyEntry(ownerId) {
  if (challenges.availableDifficulties().length === 0) return ui.notice("Ainda não há desafios cadastrados.");
  const prefs = study.preferencesOf(ownerId);
  if (!prefs) return ui.setupAreasMenu(ownerId, { intro: true });
  return study.topicMenu(ownerId, prefs.level) ?? ui.learningLevelMenu(ownerId);
}

// "configurar": passo 1, com as escolhas atuais já marcadas.
const setup = (ownerId) => ui.setupAreasMenu(ownerId, { current: study.preferencesOf(ownerId) });

function profile({ ownerId, name, avatarUrl }) {
  return ui.profileMessage({
    name,
    avatarUrl,
    user: db.getUser(ownerId),
    prefs: study.preferencesOf(ownerId),
    stats: db.getStats(ownerId),
    habit: db.getHabit(ownerId),
    unlocked: db.getAchievements(ownerId),
    ownerId,
  });
}

const achievementsView = (ownerId) => ui.achievementsMessage({ unlockedKeys: db.getAchievements(ownerId), ownerId });

async function displayName(client, guild, userId) {
  const member = await guild?.members.fetch(userId).catch(() => null);
  const name = member?.displayName ?? (await client.users.fetch(userId).catch(() => null))?.username;
  // O apelido é escolhido por cada pessoa e aparece para todo mundo no ranking: nunca entra cru.
  return safeText(name ?? `usuário ${userId}`);
}

// Top 10 do servidor (ou global, na DM), com a posição de quem pediu.
async function ranking({ client, guild, guildId, ownerId }) {
  const rows = db.top(guildId, 10);
  if (rows.length === 0) {
    return ui.notice(`Ninguém pontuou ainda. Comece com ${ui.commandRef(client, Boolean(guildId), "desafio")}!`);
  }

  const lines = await Promise.all(
    rows.map(async (row, i) => {
      const name = await displayName(client, guild, row.userId);
      const mark = MEDALS[i] ?? `**${i + 1}.**`;
      // No ranking global o XP é o total e dá para mostrar o nível; no do servidor é só o XP ganho ali.
      const level = guildId ? "" : ` • ${progress.titleFor(progress.levelOf(row.xp)).emoji} Nv ${progress.levelOf(row.xp)}`;
      const you = row.userId === ownerId ? "  ◀ você" : "";
      return `${mark} **${name}** — ${row.xp} XP${level}${you}`;
    })
  );

  const mine = db.rankOf(ownerId, guildId);
  const you = mine
    ? `📍 Sua posição: **#${mine.position}** • ${mine.xp} XP`
    : "📍 Você ainda não pontuou aqui. Responda uma pergunta para entrar no ranking!";

  return ui.rankingMessage({
    title: guildId ? "🏆 Ranking do servidor" : "🏆 Ranking global",
    subtitle: guildId ? "Quem mais ganhou XP neste servidor" : "Quem mais ganhou XP no total",
    lines,
    you,
    ownerId,
    league: Boolean(guildId),
  });
}

// ---------- liga semanal ----------

const shortDate = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// A liga da semana do servidor. `action` ("join" ou "leave") faz a pessoa entrar ou sair antes de mostrar a tela
// (é o que o comando `liga entrar|sair` e os botões fazem). Na DM não há liga: ela é de cada servidor.
async function league({ client, guild, guildId, ownerId, action = null, now = new Date() }) {
  if (!guildId) {
    return ui.notice(
      `A liga é de cada servidor. Use ${ui.commandRef(client, true, "liga")} em um servidor onde eu esteja.`
    );
  }

  let flash = null;
  if (action === "join") {
    flash = db.joinLeague(guildId, ownerId, now)
      ? "✅ **Você entrou na liga!** Só conta o XP que você ganhar daqui para a frente, neste servidor."
      : "Você já estava na liga.";
  } else if (action === "leave") {
    flash = db.leaveLeague(guildId, ownerId)
      ? "👋 **Você saiu da liga** e seus pontos nela foram apagados. Dá para voltar quando quiser (começando do zero)."
      : "Você não estava na liga.";
  }

  const board = db.leagueBoard(guildId, ownerId, now, { limit: 10 });
  const last = db.leagueBoard(guildId, ownerId, now, { weeksAgo: 1, limit: 3 });

  // Empatados dividem a posição (e a medalha), como no "Sua posição": 1º, 2º, 2º, 4º...
  const positionOf = (rows, row) => 1 + rows.findIndex((r) => r.xp === row.xp);
  const name = (row) => displayName(client, guild, row.userId);
  const lines = await Promise.all(
    board.rows.map(async (row) => {
      const position = positionOf(board.rows, row);
      const you = row.userId === ownerId ? "  ◀ você" : "";
      return `${MEDALS[position - 1] ?? `**${position}.**`} **${await name(row)}** — ${row.xp} XP${you}`;
    })
  );
  const lastWeek = await Promise.all(
    last.rows.map(async (row) => `${MEDALS[positionOf(last.rows, row) - 1]} ${await name(row)} (${row.xp} XP)`)
  );

  const { member, xp, position } = board.you;
  const you = !member
    ? "📍 Você ainda não está na liga. Quem entra compete de segunda a domingo, só com o XP ganho **depois** de entrar. " +
      "Sair a qualquer momento apaga seus pontos da liga."
    : position
      ? `📍 Sua posição: **#${position}** • ${xp} XP nesta semana`
      : "📍 Você está na liga, mas ainda não pontuou nesta semana. Responda uma pergunta!";

  const today = dayKey(now, config.timezone);
  const daysLeft = 6 - daysBetween(board.week, today); // a semana vai de segunda (0) a domingo (6)
  const timeLeft = daysLeft === 0 ? "termina hoje" : daysLeft === 1 ? "termina amanhã" : `faltam ${daysLeft} dias`;

  return ui.leagueMessage({
    period: `seg ${shortDate(board.week)} – dom ${shortDate(addDays(board.week, 6))}`,
    timeLeft,
    participants: board.participants,
    lines,
    you,
    joined: member,
    lastWeek,
    flash,
    ownerId,
  });
}

// ---------- lembretes por DM ----------

// A tela dos lembretes. `action` ("on" ou "off") liga ou desliga antes de mostrar a tela, e `hour` escolhe a hora ao
// ligar (o que o comando `lembrete` e os botões fazem). `user` é quem pediu e `inGuild` diz se foi num servidor:
// a DM de confirmação depende dos dois.
async function reminder({ ownerId, user, inGuild, action = null, hour = null }) {
  const flash = await reminders.apply({ action, user, ownerId, inGuild, hour });
  return ui.reminderScreen({ ownerId, reminder: db.getReminder(ownerId), flash });
}

// ---------- cursos e certificados ----------

// Lista de cursos com o progresso de cada nível. Ao abrir, confere se a pessoa merece algum
// certificado que ainda não foi emitido (idempotente) e avisa no topo.
function courses(ownerId) {
  const issued = courseLib.sync(ownerId);
  const solved = db.getSolved(ownerId);
  const items = courseLib.list.map((course) => ({ course, rows: courseLib.progress(ownerId, course, solved) }));
  return courseUi.coursesList({ ownerId, items, certificateCount: courseLib.certificatesOf(ownerId).length, issued });
}

// Um curso, módulo a módulo. null se o curso não existe (mensagem antiga, curso removido).
function courseDetail(ownerId, courseId) {
  const course = courseLib.get(courseId);
  if (!course) return null;
  const rows = courseLib.progress(ownerId, course);
  return courseUi.courseDetail({ ownerId, course, rows, next: courseLib.nextStep(rows) });
}

// Lista de certificados da pessoa. `discordName` só serve de nome inicial se ela ainda não escolheu um.
function certificates(ownerId, discordName) {
  courseLib.sync(ownerId);
  return courseUi.certificatesList({
    ownerId,
    certs: courseLib.certificatesOf(ownerId),
    name: courseLib.nameFor(ownerId, discordName),
  });
}

// O cartão com a imagem de um certificado DA PESSOA: { components, files }. null se o código não é dela.
function certificateView(ownerId, code, discordName) {
  const found = db.findCertificate(code);
  if (!found || found.userId !== ownerId) return null;
  const cert = courseLib.certificatesOf(ownerId).find((c) => c.code === found.code);
  if (!cert) return null;

  const name = courseLib.nameFor(ownerId, discordName);
  const filename = `certificado-${cert.course.id}-${cert.level.id}.png`;
  const png = certificate.renderCertificate({
    name,
    courseName: cert.course.name,
    levelId: cert.level.id,
    levelLabel: cert.level.label,
    modules: courseLib.moduleLabels(cert.course),
    issuedAt: new Date(cert.issuedAt),
    code: cert.code,
  });
  return {
    components: courseUi.certificateCard({ ownerId, cert, name, filename }),
    files: [new AttachmentBuilder(png, { name: filename })],
  };
}

// Comando verificar: qualquer pessoa confere um código.
function verify(codeInput) {
  const code = courseLib.normalizeCode(codeInput);
  const found = code ? db.findCertificate(code) : null;
  const cert = found ? courseLib.certificatesOf(found.userId).find((c) => c.code === found.code) ?? null : null;
  const name = cert ? courseLib.nameFor(found.userId, null) : null;
  return courseUi.verifyCard({ cert, code: codeInput, name });
}

module.exports = {
  help,
  studyEntry,
  setup,
  profile,
  achievements: achievementsView,
  ranking,
  league,
  reminder,
  courses,
  courseDetail,
  certificates,
  certificateView,
  verify,
};
