const { MessageFlags } = require("discord.js");
const config = require("../config");
const db = require("../utils/db");
const challenges = require("../utils/challenges");
const { callPrefix, challengeMessage } = require("../utils/ui");

// Mensagens já respondidas (evita duplo clique e XP em dobro). Limitado para não crescer sem fim.
const answered = new Set();
function markAnswered(messageId) {
  answered.add(messageId);
  if (answered.size > 10_000) answered.delete(answered.values().next().value);
}

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const update = (interaction, components) =>
  interaction.update({ components, flags: MessageFlags.IsComponentsV2 });

module.exports = {
  prefix: "ch",

  // customId: ch:<idDoDesafio>:<opção>:<idDoDono>:<criadoEm em base36>
  async execute(interaction, parts, client) {
    const [, challengeId, chosenText, ownerId, issuedAt] = parts;

    if (interaction.user.id !== ownerId) {
      const call = callPrefix(client, interaction.inGuild());
      return interaction.reply(
        ephemeral(`Esse desafio é de outra pessoa. Peça o seu com \`${call}desafio\`.`)
      );
    }

    const ch = challenges.getById(challengeId);
    if (!ch) {
      return interaction.reply(ephemeral("Esse desafio não existe mais. Peça um novo."));
    }

    // Já respondido (clique repetido): só confirma o clique, sem fazer nada
    if (answered.has(interaction.message.id)) return interaction.deferUpdate();

    const issued = parseInt(issuedAt, 36);
    if (!Number.isFinite(issued) || Date.now() - issued > config.challengeTtlMs) {
      markAnswered(interaction.message.id);
      return update(interaction, challengeMessage(ch, ownerId, issuedAt, { type: "expired" }));
    }

    markAnswered(interaction.message.id);

    const chosen = Number(chosenText);
    const correct = chosen === ch.answer;
    const gained = correct ? config.xpCorrect : 0;
    const { xp, streak } = db.recordAnswer(
      interaction.user.id,
      interaction.guildId,
      correct,
      config.xpCorrect
    );

    return update(
      interaction,
      challengeMessage(ch, ownerId, issuedAt, { type: "answered", chosen, correct, gained, xp, streak })
    );
  },
};
