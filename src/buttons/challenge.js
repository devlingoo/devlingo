const { MessageFlags } = require("discord.js");
const config = require("../config");
const db = require("../utils/db");
const challenges = require("../utils/challenges");
const { commandRef, challengeMessage } = require("../utils/ui");

// Desafios já respondidos (evita duplo clique e XP em dobro). Limitado para não crescer sem fim.
// A chave é mensagem + momento da pergunta: na trilha de estudo a mesma mensagem recebe
// uma pergunta nova a cada "Próxima pergunta", e cada uma precisa poder ser respondida.
const answered = new Set();
function markAnswered(key) {
  answered.add(key);
  if (answered.size > 10_000) answered.delete(answered.values().next().value);
}

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const update = (interaction, components) =>
  interaction.update({ components, flags: MessageFlags.IsComponentsV2 });

module.exports = {
  prefix: "ch",

  // customId: ch:<idDoDesafio>:<opção>:<idDoDono>:<criadoEm em base36>[:s]
  async execute(interaction, parts, client) {
    const [, challengeId, chosenText, ownerId, issuedAt, mode] = parts;
    const study = mode === "s"; // veio do comando aprender: oferece "Próxima pergunta"

    if (interaction.user.id !== ownerId) {
      return interaction.reply(
        ephemeral(`Esse desafio é de outra pessoa. Peça o seu com ${commandRef(client, interaction.inGuild(), "desafio")}.`)
      );
    }

    const ch = challenges.getById(challengeId);
    if (!ch) {
      return interaction.reply(ephemeral("Esse desafio não existe mais. Peça um novo."));
    }

    // Já respondido (clique repetido): só confirma o clique, sem fazer nada
    const key = `${interaction.message.id}:${issuedAt}`;
    if (answered.has(key)) return interaction.deferUpdate();

    const issued = parseInt(issuedAt, 36);
    if (!Number.isFinite(issued) || Date.now() - issued > config.challengeTtlMs) {
      markAnswered(key);
      return update(interaction, challengeMessage(ch, ownerId, issuedAt, { type: "expired", study }));
    }

    markAnswered(key);

    const chosen = Number(chosenText);
    const correct = chosen === ch.answer;
    // O resultado traz tudo o que a mensagem mostra: XP que entrou (já com o limite diário), bônus,
    // combo, meta do dia, marcos de sequência, subida de nível e conquistas novas.
    const result = db.recordAnswer(
      interaction.user.id,
      interaction.guildId,
      correct,
      config.xpCorrect,
      new Date(),
      { difficulty: ch.difficulty }
    );

    return update(
      interaction,
      challengeMessage(ch, ownerId, issuedAt, { type: "answered", chosen, correct, study, ...result })
    );
  },
};
