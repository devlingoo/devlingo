const { ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require("discord.js");
const challenges = require("../utils/challenges");
const { learningTopicMessage, challengeMessage } = require("../utils/ui");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

module.exports = {
  prefix: "learn",

  async execute(interaction, parts) {
    const [, stage, ownerId, difficulty] = parts;

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Essa seleção pertence a outra pessoa. Peça sua própria trilha com o comando aprender."));
    }

    if (!interaction.isStringSelectMenu()) return;

    if (stage === "difficulty") {
      const selectedDifficulty = interaction.values[0];
      const topics = challenges.topics(selectedDifficulty);

      if (!topics.length) {
        return interaction.reply(ephemeral("Ainda não há perguntas cadastradas nesse nível. Escolha Iniciante por enquanto; novos desafios serão adicionados às outras trilhas."));
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId("learn:topic:" + ownerId + ":" + selectedDifficulty)
        .setPlaceholder("Escolha um assunto")
        .addOptions(topics.slice(0, 25).map((topic) => ({
          label: topic.label.slice(0, 100),
          value: topic.id,
          description: topic.description.slice(0, 100),
        })));

      return interaction.update({
        components: [
          ...learningTopicMessage(selectedDifficulty, topics),
          new ActionRowBuilder().addComponents(menu),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (stage === "topic") {
      const topicId = interaction.values[0];
      const topic = challenges.topics(difficulty).find((item) => item.id === topicId);
      if (!topic) return interaction.reply(ephemeral("Esse assunto não está disponível nessa trilha. Use aprender para começar novamente."));

      const challenge = challenges.random({ difficulty, topic: topicId });
      if (!challenge) return interaction.reply(ephemeral("Ainda não há perguntas para esse assunto."));

      const issuedAt = Date.now().toString(36);
      return interaction.update({
        components: challengeMessage(challenge, ownerId, issuedAt),
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },
};
