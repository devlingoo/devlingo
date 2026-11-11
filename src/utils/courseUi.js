// Telas de cursos e certificados (Components V2). Os dados vêm prontos; aqui só se monta a mensagem.
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const config = require("../config");
const progress = require("./progress");
const { safeText } = require("./text");
const { text, divider, navRow, plural } = require("./ui");

const dateBR = (ms) => new Intl.DateTimeFormat("pt-BR", { timeZone: config.timezone }).format(new Date(ms));

const button = (id, label, emoji, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);

// ---------- lista de cursos ----------

// items: [{ course, rows }] (rows = courses.progress); issued: certificados emitidos agora, ao abrir a tela.
function coursesList({ ownerId, items, certificateCount, issued = [] }) {
  const lines = items.map(({ course, rows }) => {
    const tokens = rows.map((row) => `${row.level.emoji} ${row.certificate ? "✅" : `${row.doneModules}/${row.total}`}`);
    return `${course.emoji} **${course.name}** — ${plural(course.modules.length, "módulo", "módulos")}\n${tokens.join("   ")}`;
  });

  const container = new ContainerBuilder().setAccentColor(issued.length ? config.colors.gold : config.colors.brand);
  if (issued.length) {
    container.addTextDisplayComponents(
      text(issued.map((i) => `🎓 **Novo certificado!** ${i.course.emoji} ${i.course.name} — ${i.level.label}`).join("\n"))
    );
  }
  container
    .addTextDisplayComponents(
      text("## 🎓 Cursos"),
      text(
        `Conclua **todos os módulos** de um nível e ganhe um **certificado** com código de verificação. ` +
          `Para concluir um módulo, acerte **${config.coursePassPercent}%** das perguntas *diferentes* dele (repetir a mesma pergunta não conta).`
      )
    )
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(lines.join("\n\n")))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`-# Certificados conquistados: **${certificateCount}**`));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`course:open:${ownerId}`)
    .setPlaceholder("Abrir um curso")
    .addOptions(items.map(({ course }) => ({ label: course.name, value: course.id, description: course.description, emoji: course.emoji })));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      button(`cert:list:${ownerId}`, "Meus certificados", "🎓", ButtonStyle.Primary),
      button(`nav:${ownerId}:estudar`, "Estudar", "📚"),
      button(`nav:${ownerId}:perfil`, "Perfil", "👤")
    )
  );
  return [container, new ActionRowBuilder().addComponents(menu)];
}

// ---------- um curso ----------

// rows: courses.progress do curso. next: o próximo módulo a praticar ({ levelId, levelLabel, topicId, label }) ou null.
function courseDetail({ ownerId, course, rows, next }) {
  const blocks = rows.map((row) => {
    const head = `${row.level.emoji} **${row.level.label}** — ${
      row.certificate ? `✅ certificado \`${row.certificate.code}\`` : `${row.doneModules}/${row.total} módulos`
    }`;
    const modules = row.modules.map((m) => {
      const shown = Math.min(m.solved, m.needed);
      return `${progress.progressBar(shown, m.needed, 6)} ${shown}/${m.needed}  ${m.done ? "✅ " : ""}${m.label}`;
    });
    return [head, ...modules].join("\n");
  });

  const container = new ContainerBuilder()
    .setAccentColor(config.colors.brand)
    .addTextDisplayComponents(text(`## ${course.emoji} ${course.name}`), text(course.description))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(blocks.join("\n\n")))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(
      text(
        next
          ? `-# Falta praticar: **${next.label}** (${next.levelLabel}). Cada barra conta perguntas *diferentes* acertadas.`
          : "-# 🏁 Você concluiu todos os níveis deste curso!"
      )
    );

  const buttons = [];
  if (next) {
    buttons.push(button(`learn:go:${ownerId}:${next.levelId}:${next.topicId}`, `Praticar: ${next.label}`.slice(0, 80), "▶️", ButtonStyle.Primary));
  }
  buttons.push(button(`course:list:${ownerId}`, "Cursos", "⬅️"), button(`cert:list:${ownerId}`, "Certificados", "🎓"));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
  return [container];
}

// ---------- certificados ----------

const LIST_BUDGET = 3400; // caracteres da lista de certificados (o Discord aceita 4000 de texto por mensagem)

// certs: courses.certificatesOf (com course e level). name: o nome que sai no certificado.
function certificatesList({ ownerId, certs, name }) {
  const container = new ContainerBuilder().setAccentColor(config.colors.gold).addTextDisplayComponents(text("## 🎓 Meus certificados"));

  if (certs.length === 0) {
    container
      .addTextDisplayComponents(
        text("Você ainda não tem certificados. Conclua **todos os módulos de um nível** de um curso para ganhar o primeiro!")
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(button(`nav:${ownerId}:cursos`, "Ver cursos", "🎓", ButtonStyle.Primary), button(`nav:${ownerId}:estudar`, "Estudar", "📚"))
      );
    return [container];
  }

  const lines = certs.map((c) => `${c.course.emoji} **${c.course.name}** · ${c.level.emoji} ${c.level.label} — ${dateBR(c.issuedAt)} · \`${c.code}\``);

  // Uma mensagem aceita no máximo 4000 caracteres de texto no total. Quem tem muitos certificados (todos os
  // níveis de todos os cursos passam disso) vê os mais recentes que cabem, e um aviso diz quantos ficaram de
  // fora; o código desses está na tela do curso. O orçamento deixa folga para o título, o nome e o aviso.
  let first = 0;
  let size = lines.reduce((sum, line) => sum + line.length + 1, 0);
  while (size > LIST_BUDGET && first < lines.length - 1) size -= lines[first++].length + 1;
  const note =
    first > 0
      ? `\n-# + ${first} ${first === 1 ? "certificado mais antigo" : "certificados mais antigos"} (o código de cada um está na tela do curso, no comando \`cursos\`).`
      : "";

  container
    .addTextDisplayComponents(text(`Nome nos certificados: **${safeText(name)}**\n-# Para trocar, use o comando \`certificados nome Seu Nome Completo\`.`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(lines.slice(first).join("\n") + note))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(button(`nav:${ownerId}:cursos`, "Cursos", "🎓"), button(`nav:${ownerId}:estudar`, "Estudar", "📚"))
    );

  // O menu cabe 25 opções: os mais recentes.
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cert:pick:${ownerId}`)
    .setPlaceholder("Ver um certificado")
    .addOptions(
      [...certs]
        .reverse()
        .slice(0, 25)
        .map((c) => ({ label: `${c.course.name} — ${c.level.label}`.slice(0, 100), value: c.code, description: `${dateBR(c.issuedAt)} · ${c.code}`, emoji: "🎓" }))
    );
  return [container, new ActionRowBuilder().addComponents(menu)];
}

// A imagem do certificado (anexada como `filename`) com o código e como verificar.
function certificateCard({ ownerId, cert, name, filename }) {
  const container = new ContainerBuilder()
    .setAccentColor(config.colors.gold)
    .addTextDisplayComponents(
      text(`## 🎓 ${cert.course.name}`),
      text(`${cert.level.emoji} ${cert.level.label} · emitido em ${dateBR(cert.issuedAt)}\nCódigo: \`${cert.code}\`\nPara verificar: \`verificar ${cert.code}\``)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${filename}`)
          .setDescription(`Certificado de ${safeText(name)}: ${cert.course.name}, nível ${cert.level.label}`)
      )
    )
    .addTextDisplayComponents(text(`-# Nome no certificado: ${safeText(name)}. Troque com \`certificados nome Seu Nome Completo\` (vale para os próximos certificados e para os já emitidos).`))
    .addActionRowComponents(new ActionRowBuilder().addComponents(button(`cert:list:${ownerId}`, "Meus certificados", "🎓")));
  return [container];
}

// Resultado do comando verificar. cert: com course e level, ou null se o código não existe.
function verifyCard({ cert, code, name }) {
  if (!cert) {
    return [
      new ContainerBuilder()
        .setAccentColor(config.colors.danger)
        .addTextDisplayComponents(
          text("## ❌ Código não encontrado"),
          text(`Não existe certificado com o código \`${safeText(code, { max: 24 })}\`. Confira se digitou igual ao que está no certificado (por exemplo, \`DVL-7K3M-9QXA\`).`)
        ),
    ];
  }
  return [
    new ContainerBuilder()
      .setAccentColor(config.colors.success)
      .addTextDisplayComponents(
        text("## ✅ Certificado válido"),
        text(`**${safeText(name)}** concluiu o curso **${cert.course.name}** (${cert.level.emoji} ${cert.level.label}).\nEmitido em ${dateBR(cert.issuedAt)} · código \`${cert.code}\`.`)
      ),
  ];
}

module.exports = { coursesList, courseDetail, certificatesList, certificateCard, verifyCard };
