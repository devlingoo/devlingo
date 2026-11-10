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

function helpMessage(lines, footer, intro) {
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(
      text("## 📚 Devlingo — aprenda programação jogando"),
      ...(intro ? [text(intro)] : []),
      text(lines.join("\n"))
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`-# ${footer}`));
  return [container];
}

function rankingMessage(title, lines) {
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(text(`## ${title}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(lines.join("\n")));
  return [container];
}

function progressBar(value, max, size = 10) {
  const filled = Math.round((value / max) * size);
  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function profileMessage({ name, avatarUrl, user }) {
  const level = Math.floor(user.xp / config.xpPerLevel) + 1;
  const into = user.xp % config.xpPerLevel;

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      text(`## ${escapeMarkdown(name)}`),
      text(
        [
          `⭐ **${user.xp} XP** • nível **${level}**`,
          `${progressBar(into, config.xpPerLevel)} ${into}/${config.xpPerLevel}`,
          `🔥 **${user.streak}** dia(s) de sequência`,
          ...(config.dailyXpCap > 0 ? [`📅 Hoje: **${user.dailyXp ?? 0}/${config.dailyXpCap}** XP`] : []),
        ].join("\n")
      )
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  return [new ContainerBuilder().setAccentColor(config.colors.brand).addSectionComponents(section)];
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
function learningTopicMenu(ownerId, difficulty, topics) {
  const lines = topics.map((topic) => `• **${topic.label}** — ${topic.description}`);
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(
      text(`## 📚 ${challenges.difficultyLabel(difficulty)}`),
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

  const back = new ButtonBuilder()
    .setCustomId(`learn:levels:${ownerId}`)
    .setLabel("Trocar nível")
    .setEmoji("🔄")
    .setStyle(ButtonStyle.Secondary);

  return [
    container,
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(back),
  ];
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
  const color =
    state.type === "answered" ? (state.correct ? colors.success : colors.danger)
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
      text(`${ch.difficulty ? `Nível: **${challenges.difficultyLabel(ch.difficulty)}**\n\n` : ""}${body}`)
    )
    .addSeparatorComponents(divider())
    .addActionRowComponents(buttons);

  if (state.type === "answered") {
    const verdict = state.correct
      ? `✅ **Acertou!** ${state.gained > 0 ? `+${state.gained} XP` : "Sem XP desta vez."}`
      : `❌ **Errou!** A resposta certa era **${LETTERS[ch.answer]}**.`;
    container
      .addSeparatorComponents(divider())
      .addTextDisplayComponents(
        text(`${verdict}\n💡 ${ch.explanation}`),
        text(
          `-# ⭐ ${state.xp} XP • 🔥 ${state.streak} dia(s) de sequência` +
            (state.capped ? `\n-# 🛑 Limite diário de ${config.dailyXpCap} XP atingido: o XP volta amanhã.` : "")
        )
      );
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
  challengeMessage,
  learningLevelMenu,
  learningTopicMenu,
};
