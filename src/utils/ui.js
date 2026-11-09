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
  TextDisplayBuilder,
  ThumbnailBuilder,
  escapeMarkdown,
} = require("discord.js");
const config = require("../config");

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

// Como a pessoa deve chamar o bot: marcando-o no servidor, direto na DM
const callPrefix = (client, inGuild) => (inGuild ? `${client.user} ` : "");

// ---------- mensagens simples ----------

function notice(content, color = config.colors.brand) {
  return [new ContainerBuilder().setAccentColor(color).addTextDisplayComponents(text(content))];
}

function helpMessage(lines, footer) {
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(text("## 📚 Devlingo — aprenda programação jogando"), text(lines.join("\n")))
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
        ].join("\n")
      )
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  return [new ContainerBuilder().setAccentColor(config.colors.brand).addSectionComponents(section)];
}

// ---------- desafio ----------

// customId: ch:<idDoDesafio>:<opção>:<idDoDono>:<criadoEm em base36>
function challengeButtons(ch, ownerId, issuedAt, { disabled = false, chosen = null, reveal = false } = {}) {
  const row = new ActionRowBuilder();
  ch.options.forEach((option, i) => {
    let style = ButtonStyle.Secondary;
    if (reveal && i === ch.answer) style = ButtonStyle.Success;
    else if (reveal && i === chosen) style = ButtonStyle.Danger;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`ch:${ch.id}:${i}:${ownerId}:${issuedAt}`)
        .setLabel(`${LETTERS[i]}) ${option}`.slice(0, 80))
        .setStyle(style)
        .setDisabled(disabled)
    );
  });
  return row;
}

// state: { type: "open" } | { type: "expired" } |
//        { type: "answered", chosen, correct, gained, xp, streak }
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
  });

  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(text(`## 🧩 Desafio de ${capitalize(ch.language)}`), text(body))
    .addSeparatorComponents(divider())
    .addActionRowComponents(buttons);

  if (state.type === "answered") {
    const verdict = state.correct
      ? `✅ **Acertou!** +${state.gained} XP`
      : `❌ **Errou!** A resposta certa era **${LETTERS[ch.answer]}**.`;
    container
      .addSeparatorComponents(divider())
      .addTextDisplayComponents(
        text(`${verdict}\n💡 ${ch.explanation}`),
        text(`-# ⭐ ${state.xp} XP • 🔥 ${state.streak} dia(s) de sequência`)
      );
  } else if (state.type === "expired") {
    container.addTextDisplayComponents(text("-# ⏰ Esse desafio expirou."));
  } else {
    container.addTextDisplayComponents(text("-# Só quem pediu pode responder"));
  }

  return [container];
}

module.exports = {
  sendV2,
  isDM,
  callPrefix,
  notice,
  helpMessage,
  rankingMessage,
  profileMessage,
  challengeMessage,
};
