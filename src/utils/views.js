// Telas completas do bot (o que cada comando mostra). Os comandos e os botões de atalho (nav)
// usam as mesmas funções daqui, então "digitar o comando" e "clicar no botão" dão o mesmo resultado.
const { escapeMarkdown } = require("discord.js");
const db = require("./db");
const challenges = require("./challenges");
const progress = require("./progress");
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
    unlocked: db.getAchievements(ownerId),
    ownerId,
  });
}

const achievementsView = (ownerId) => ui.achievementsMessage({ unlockedKeys: db.getAchievements(ownerId), ownerId });

async function displayName(client, guild, userId) {
  const member = await guild?.members.fetch(userId).catch(() => null);
  const name = member?.displayName ?? (await client.users.fetch(userId).catch(() => null))?.username;
  return escapeMarkdown(name ?? `usuário ${userId}`);
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
  });
}

module.exports = { help, studyEntry, setup, profile, achievements: achievementsView, ranking };
