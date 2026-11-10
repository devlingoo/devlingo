// Todas as mensagens do bot são Components V2: sem `content` nem `embeds`,
// só componentes (Container, TextDisplay, Section, Separator, ActionRow...).
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  escapeMarkdown,
} = require("discord.js");
const config = require("../config");
const challenges = require("./challenges");
const areas = require("./areas");
const progress = require("./progress");
const achievements = require("./achievements");

const LETTERS = "ABCD";
const FENCE = { git: "bash" }; // linguagem -> bloco de código do Discord

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const text = (content) => new TextDisplayBuilder().setContent(content);
const divider = () =>
  new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

// ---------- envio e contexto ----------

function sendV2(channel, components) {
  return channel.send({ components, flags: MessageFlags.IsComponentsV2 });
}

const isDM = (message) => message.channel.type === ChannelType.DM;

// Como a pessoa chama um comando: no servidor, marcando o bot ("@Devlingo `ajuda`"); na DM, só o comando.
// A menção fica FORA das crases de propósito: dentro de código o Discord não a resolve e mostra
// o número do bot (<@1569...>) em vez do nome.
const commandRef = (client, inGuild, command) =>
  inGuild ? `${client.user} \`${command}\`` : `\`${command}\``;

// ---------- mensagens simples ----------

function notice(content, color = config.colors.brand) {
  return [new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(text(content))];
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------- atalhos entre telas ----------

// Botões de atalho (customId nav:<idDoDono>:<destino>; tratados em buttons/nav.js).
const NAV = {
  estudar: { label: "Estudar", emoji: "📚" },
  perfil: { label: "Perfil", emoji: "👤" },
  ranking: { label: "Ranking", emoji: "🏆" },
  conquistas: { label: "Conquistas", emoji: "🏅" },
  configurar: { label: "Configurar", emoji: "⚙️" },
};

// O primeiro destino fica em destaque; os outros, discretos.
function navRow(ownerId, targets) {
  return new ActionRowBuilder().addComponents(
    targets.map((target, i) =>
      new ButtonBuilder()
        .setCustomId(`nav:${ownerId}:${target}`)
        .setLabel(NAV[target].label)
        .setEmoji(NAV[target].emoji)
        .setStyle(i === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
}

// ---------- ajuda ----------

// groups: [{ title, lines }]. A foto do bot aparece quando o cliente sabe qual é.
function helpMessage({ client, groups, intro, footer, ownerId }) {
  const avatar = client?.user?.displayAvatarURL?.({ extension: "png", size: 128 });
  const header = [
    text("## 📚 Devlingo"),
    text("Aprenda programação respondendo perguntas. Um pouquinho por dia já conta! 🔥"),
  ];

  const container = new ContainerBuilder().setAccentColor(config.colors.brand);
  if (avatar) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(...header).setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar))
    );
  } else {
    container.addTextDisplayComponents(...header);
  }

  container.addTextDisplayComponents(text(intro)).addSeparatorComponents(divider());
  for (const group of groups) {
    container.addTextDisplayComponents(text(`**${group.title}**\n${group.lines.join("\n")}`));
  }
  container
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`-# ${footer}`))
    .addActionRowComponents(navRow(ownerId, ["estudar", "perfil", "ranking", "conquistas"]));
  return [container];
}

// ---------- ranking ----------

// lines: linhas já formatadas do top; you: texto da posição de quem pediu (ou null).
function rankingMessage({ title, subtitle, lines, you, ownerId }) {
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(text(`## ${title}`), ...(subtitle ? [text(`-# ${subtitle}`)] : []))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(lines.join("\n")));
  if (you) container.addSeparatorComponents(divider()).addTextDisplayComponents(text(you));
  container.addActionRowComponents(navRow(ownerId, ["estudar", "perfil", "conquistas"]));
  return [container];
}

// ---------- perfil ----------

// user: { xp, streak, dailyXp } (db.getUser). Os demais campos são opcionais: stats (db.getStats),
// prefs (configuração) e unlocked (chaves das conquistas); sem eles, a parte correspondente some.
function profileMessage({ name, avatarUrl, user, prefs = null, stats = null, unlocked = [], ownerId = null }) {
  const lv = progress.levelProgress(user.xp);
  const title = progress.titleFor(lv.level);
  const streak = user.streak ?? 0;

  const header = new SectionBuilder()
    .addTextDisplayComponents(
      text(`## ${title.emoji} ${escapeMarkdown(name)}`),
      text(
        [
          `**${title.name} · Nível ${lv.level}** — ⭐ **${user.xp} XP**`,
          `${progress.progressBar(lv.into, lv.needed)} ${lv.into}/${lv.needed} XP para o nível ${lv.level + 1}`,
        ].join("\n")
      )
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  // Hábito: sequência, meta e XP do dia.
  const habit = [
    streak > 0
      ? `🔥 Sequência: **${plural(streak, "dia", "dias")}**${stats ? ` • recorde ${Math.max(stats.bestStreak, streak)}` : ""}`
      : "🔥 Sequência: **0 dias** — responda hoje para começar!",
  ];
  const next = progress.nextMilestone(streak);
  if (next) habit.push(`-# Próximo marco: ${next.days} dias (+${next.bonus} XP) — faltam ${next.left}`);
  if (stats && config.dailyGoal > 0) {
    const done = Math.min(stats.goalCount, config.dailyGoal);
    habit.push(
      `🎯 Meta de hoje: ${progress.progressBar(done, config.dailyGoal, 5)} **${done}/${config.dailyGoal}**${done >= config.dailyGoal ? " ✅" : ""}`
    );
  }
  if (config.dailyXpCap > 0) habit.push(`📅 XP de hoje: **${user.dailyXp ?? 0}/${config.dailyXpCap}**`);
  if (stats && streak > 0 && stats.goalCount === 0) {
    habit.push(`-# ⏳ Responda hoje para manter sua sequência de ${plural(streak, "dia", "dias")}!`);
  }

  // Números e conquistas.
  const numbers = [];
  if (stats) {
    numbers.push(
      stats.answered > 0
        ? `📊 **${stats.answered}** respostas • **${stats.correct}** acertos (**${stats.accuracy}%**) • melhor combo **${stats.bestCombo}**`
        : "📊 Ainda sem respostas. Que tal começar agora?"
    );
  }
  const unlockedSet = new Set(unlocked);
  const badges = achievements.list.filter((a) => unlockedSet.has(a.key)).map((a) => a.emoji).join(" ");
  numbers.push(`🏅 Conquistas: **${unlockedSet.size}/${achievements.list.length}**${badges ? `  ${badges}` : ""}`);
  if (prefs) numbers.push(`🧭 Trilha: ${areas.labels(prefs.areas)} • ${levelTag(prefs.level)}`);

  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addSectionComponents(header)
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(habit.join("\n")))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(numbers.join("\n")));
  if (ownerId) container.addActionRowComponents(navRow(ownerId, ["estudar", "ranking", "conquistas", "configurar"]));
  return [container];
}

// ---------- conquistas ----------

function achievementsMessage({ unlockedKeys, ownerId }) {
  const have = new Set(unlockedKeys);
  const all = achievements.list;
  const done = all.filter((a) => have.has(a.key));
  const todo = all.filter((a) => !have.has(a.key));
  const line = (a, mark) => `${mark} ${a.emoji} **${a.name}** — ${a.description}`;

  const container = new ContainerBuilder()
    .setAccentColor(done.length === all.length ? config.colors.gold : config.colors.brand)
    .addTextDisplayComponents(
      text(`## 🏅 Conquistas — ${done.length}/${all.length}`),
      text(`${progress.progressBar(done.length, all.length)} ${Math.round((done.length / all.length) * 100)}%`)
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text([...done.map((a) => line(a, "✅")), ...todo.map((a) => line(a, "🔒"))].join("\n")))
    .addActionRowComponents(navRow(ownerId, ["estudar", "perfil", "ranking"]));
  return [container];
}


// Passo 1 da trilha: escolher o nível. Só aparecem os níveis que já têm desafios cadastrados.
// customId do menu: learn:difficulty:<idDoDono>
function learningLevelMenu(ownerId) {
  const levels = challenges.availableDifficulties();
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(
      text("## 🧭 Sua trilha de aprendizado"),
      text("Escolha o nível de dificuldade. Depois, escolha o assunto exato que quer praticar: eu só pergunto sobre ele."),
      text(levels.map((d) => `${d.emoji} **${d.label}** — ${d.description}`).join("\n"))
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text("-# Os níveis e assuntos aparecem conforme os desafios são cadastrados."));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`learn:difficulty:${ownerId}`)
    .setPlaceholder("Selecione seu nível")
    .addOptions(
      levels.map((d) => ({ label: d.label, value: d.id, description: d.description, emoji: d.emoji }))
    );

  return [container, new ActionRowBuilder().addComponents(menu)];
}

// Passo 2 da trilha: escolher o assunto exato dentro do nível.
// customId do menu: learn:topic:<idDoDono>:<nível>
//   prefs    configuração da pessoa ({ level, areas }) ou null
//   filtered true se a lista está limitada às áreas dela
//   note     aviso extra (por exemplo, "mostrando todas as áreas")
function learningTopicMenu(ownerId, difficulty, topics, { prefs = null, filtered = false, note = null } = {}) {
  const lines = topics.map((topic) => `• **${topic.label}** — ${topic.description}`);
  const scope = filtered
    ? `Suas áreas: ${areas.labels(prefs.areas)}`
    : note ?? (prefs ? "Mostrando os assuntos de todas as áreas." : null);
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(
      text(`## 📚 ${challenges.difficultyLabel(difficulty)}`),
      ...(scope ? [text(`-# ${scope}`)] : []),
      text("Agora escolha exatamente o assunto que deseja estudar:"),
      text(lines.join("\n"))
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text("-# Você só recebe perguntas do assunto escolhido, até querer trocar."));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`learn:topic:${ownerId}:${difficulty}`)
    .setPlaceholder("Escolha um assunto")
    .addOptions(
      topics.slice(0, 25).map((topic) => ({
        label: topic.label.slice(0, 100),
        value: topic.id,
        description: topic.description.slice(0, 100),
      }))
    );

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`learn:levels:${ownerId}`)
      .setLabel("Trocar nível")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
  ];
  if (prefs) {
    // Alterna entre "só as minhas áreas" e "todas as áreas" (sem mexer na configuração salva).
    buttons.push(
      filtered
        ? new ButtonBuilder()
            .setCustomId(`learn:topics:${ownerId}:${difficulty}:all`)
            .setLabel("Ver todas as áreas")
            .setEmoji("🌐")
            .setStyle(ButtonStyle.Secondary)
        : new ButtonBuilder()
            .setCustomId(`learn:topics:${ownerId}:${difficulty}`)
            .setLabel("Só as minhas áreas")
            .setEmoji("🧭")
            .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`setup:start:${ownerId}`)
        .setLabel("Alterar minha trilha")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return [
    container,
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(...buttons),
  ];
}

// ---------- configuração inicial (comando configurar) ----------

const levelTag = (id) => {
  const level = challenges.DIFFICULTIES.find((d) => d.id === id);
  return level ? `${level.emoji} ${level.label}` : id;
};

// Passo 1: escolher as áreas (uma ou mais). `intro` é o convite da primeira vez; `current`
// são as escolhas atuais (aparecem já marcadas quando a pessoa vem alterar).
// customId do menu: setup:areas:<idDoDono>
function setupAreasMenu(ownerId, { intro = false, current = null } = {}) {
  const available = areas.available();
  const header = intro
    ? [
        "## 👋 Antes de estudar, vamos configurar sua trilha",
        "Leva uns 10 segundos. Assim eu só pergunto o que importa para você, e você muda tudo isso quando quiser com `configurar`.",
      ]
    : [
        "## ⚙️ Configurar minha trilha",
        ...(current ? [`Configuração atual: ${areas.labels(current.areas)} • ${levelTag(current.level)}`] : []),
      ];

  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(
      ...header.map(text),
      text("**Passo 1 de 2** — o que você quer aprender? Escolha uma ou mais áreas:"),
      text(available.map((a) => `${a.emoji} **${a.label}** — ${a.description}`).join("\n"))
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text("-# Um assunto pode estar em mais de uma área (JavaScript serve para Frontend e Backend)."));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`setup:areas:${ownerId}`)
    .setPlaceholder("Escolha suas áreas")
    .setMinValues(1)
    .setMaxValues(available.length)
    .addOptions(
      available.map((a) => ({
        label: a.label,
        value: a.id,
        description: a.description,
        emoji: a.emoji,
        default: Boolean(current?.areas.includes(a.id)),
      }))
    );

  return [container, new ActionRowBuilder().addComponents(menu)];
}

// Passo 2: escolher o nível, já sabendo as áreas (elas viajam no customId, sem guardar nada ainda).
// customId do menu: setup:level:<idDoDono>:<áreas separadas por vírgula>
function setupLevelMenu(ownerId, areaIds, { current = null } = {}) {
  const levels = challenges.availableDifficulties();
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(
      text("## ⚙️ Configurar minha trilha"),
      text(`Áreas: ${areas.labels(areaIds)}`),
      text("**Passo 2 de 2** — qual é o seu nível hoje?"),
      text(levels.map((d) => `${d.emoji} **${d.label}** — ${d.description}`).join("\n"))
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text("-# Na dúvida, comece pelo Iniciante. Dá para mudar quando quiser."));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`setup:level:${ownerId}:${areaIds.join(",")}`)
    .setPlaceholder("Escolha seu nível")
    .addOptions(
      levels.map((d) => ({
        label: d.label,
        value: d.id,
        description: d.description,
        emoji: d.emoji,
        default: current?.level === d.id,
      }))
    );

  return [container, new ActionRowBuilder().addComponents(menu)];
}

// Resumo depois de salvar, com atalho para começar a estudar.
function setupDoneMessage(ownerId, prefs) {
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.success)
    .addTextDisplayComponents(
      text("## ✅ Tudo pronto!"),
      text(`🧭 Áreas: ${areas.labels(prefs.areas)}\n🎚️ Nível inicial: ${levelTag(prefs.level)}`),
      text("-# Quer mudar? Use `configurar` a qualquer momento.")
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`learn:topics:${ownerId}:${prefs.level}`)
          .setLabel("Começar a estudar")
          .setEmoji("📚")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`setup:start:${ownerId}`)
          .setLabel("Alterar")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary)
      )
    );
  return [container];
}

// Botões que continuam a sessão de estudo depois de uma resposta (ou de o desafio expirar).
// Todos começam com "learn:" e levam o dono no 3º campo, como os menus.
function studyNavigation(ch, ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`learn:next:${ownerId}:${ch.difficulty}:${ch.topic.id}:${ch.id}`)
      .setLabel("Próxima pergunta")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`learn:topics:${ownerId}:${ch.difficulty}`)
      .setLabel("Trocar assunto")
      .setEmoji("🔀")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`learn:levels:${ownerId}`)
      .setLabel("Trocar nível")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ---------- desafio ----------

// customId: ch:<idDoDesafio>:<opção>:<idDoDono>:<criadoEm em base36>[:s]
// O ":s" marca que o desafio faz parte de uma sessão de estudo (comando aprender).
function challengeButtons(ch, ownerId, issuedAt, { disabled = false, chosen = null, reveal = false, study = false } = {}) {
  const row = new ActionRowBuilder();
  ch.options.forEach((option, i) => {
    let style = ButtonStyle.Secondary;
    if (reveal && i === ch.answer) style = ButtonStyle.Success;
    else if (reveal && i === chosen) style = ButtonStyle.Danger;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ch:${ch.id}:${i}:${ownerId}:${issuedAt}${study ? ":s" : ""}`)
        .setLabel(`${LETTERS[i]}) ${option}`.slice(0, 80))
        .setStyle(style)
        .setDisabled(disabled)
    );
  });
  return row;
}

// Comemorações que uma resposta rendeu: subir de nível, meta do dia, marco de sequência, combo e
// conquistas. `gold` é true quando há algo bom a festejar (a mensagem ganha a cor dourada);
// perder um combo aparece, mas sem festa.
function celebrationLines(state) {
  const lines = [];
  let gold = false;
  const party = (line) => {
    lines.push(line);
    gold = true;
  };

  if (state.levelUp) {
    const title = progress.titleFor(state.levelUp.to);
    party(`🆙 **Subiu para o nível ${state.levelUp.to}!** ${title.emoji} ${title.name}`);
  }
  if (state.goal?.completed) party(`🎯 **Meta do dia cumprida!** +${state.bonus?.goal ?? 0} XP`);
  if (state.milestone) party(`🔥 **${state.milestone.days} dias seguidos!** +${state.milestone.bonus} XP de bônus`);
  if (state.bonus?.combo > 0) party(`⚡ **Combo ×${state.combo}!** +${state.bonus.combo} XP`);
  for (const a of state.achievements ?? []) party(`🏅 **Conquista desbloqueada:** ${a.emoji} ${a.name} — ${a.description}`);
  if (state.comboBroken > 0) lines.push(`💔 O combo de ${state.comboBroken} acertos acabou. Bora começar outro!`);
  return { lines, gold };
}

// state: { type: "open" } | { type: "expired" } |
//        { type: "answered", chosen, correct, gained, xp, streak }
// Qualquer estado aceita `study: true` (sessão de estudo): depois da resposta aparecem
// os botões "Próxima pergunta", "Trocar assunto" e "Trocar nível".
function challengeMessage(ch, ownerId, issuedAt, state = { type: "open" }) {
  let body = ch.question;
  if (ch.code) {
    const lang = FENCE[ch.language] ?? ch.language;
    body += `\n\`\`\`${lang}\n${ch.code}\n\`\`\``;
  }

  const { colors } = config;
  const celebration = state.type === "answered" ? celebrationLines(state) : { lines: [], gold: false };
  const color =
    celebration.gold ? colors.gold
    : state.type === "answered" ? (state.correct ? colors.success : colors.danger)
    : state.type === "expired" ? colors.muted
    : colors.brand;

  const buttons = challengeButtons(ch, ownerId, issuedAt, {
    disabled: state.type !== "open",
    chosen: state.chosen ?? null,
    reveal: state.type === "answered",
    study: Boolean(state.study),
  });

  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      text(`## 🧩 ${ch.topic?.label ?? `Desafio de ${capitalize(ch.language)}`}`),
      text(`${ch.difficulty ? `Nível: ${levelTag(ch.difficulty)}\n\n` : ""}${body}`)
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(buttons);

  if (state.type === "answered") {
    const combo = state.correct && state.combo >= 3 ? `  🔥 combo ×${state.combo}` : "";
    const verdict = state.correct
      ? `✅ **Acertou!** ${state.gained > 0 ? `+${state.gained} XP` : "Sem XP desta vez."}${combo}`
      : `❌ **Errou!** A resposta certa era **${LETTERS[ch.answer]}**.`;

    // Rodapé discreto: XP total e nível, sequência, meta do dia e aviso do limite diário.
    const level = state.level ? progress.titleFor(state.level) : null;
    const footer = [
      `-# ⭐ ${state.xp} XP${level ? ` • ${level.emoji} Nível ${state.level}` : ""} • 🔥 ${plural(state.streak, "dia", "dias")}`,
    ];
    if (state.goal && state.goal.target > 0) {
      const done = Math.min(state.goal.count, state.goal.target);
      footer.push(
        `-# 🎯 Meta do dia: ${progress.progressBar(done, state.goal.target, 5)} ${done}/${state.goal.target}${done >= state.goal.target ? " ✅" : ""}`
      );
    }
    if (state.capped) footer.push(`-# 🛑 Limite diário de ${config.dailyXpCap} XP atingido: o XP volta amanhã.`);

    container.addSeparatorComponents(divider()).addTextDisplayComponents(text(`${verdict}\n💡 ${ch.explanation}`));
    if (celebration.lines.length > 0) container.addTextDisplayComponents(text(celebration.lines.join("\n")));
    container.addTextDisplayComponents(text(footer.join("\n")));
  } else if (state.type === "expired") {
    container.addTextDisplayComponents(text("-# ⏰ Esse desafio expirou."));
  } else {
    container.addTextDisplayComponents(text("-# Só quem pediu pode responder"));
  }

  if (state.study && state.type !== "open") {
    container.addActionRowComponents(studyNavigation(ch, ownerId));
  }

  return [container];
}

module.exports = {
  sendV2,
  isDM,
  commandRef,
  notice,
  helpMessage,
  rankingMessage,
  profileMessage,
  achievementsMessage,
  challengeMessage,
  learningLevelMenu,
  learningTopicMenu,
  setupAreasMenu,
  setupLevelMenu,
  setupDoneMessage,
};
