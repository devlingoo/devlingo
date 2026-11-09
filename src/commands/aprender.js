const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { sendV2, learningDifficultyMessage } = require("../utils/ui");

module.exports = {
  name: "aprender",
  aliases: ["learn", "estudar", "trilha"],
  description: "escolha seu nível e o assunto que deseja aprender",
  usage: "aprender",

  async execute({ message }) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`learn:difficulty:${message.author.id}`)
      .setPlaceholder("Selecione seu nível")
      .addOptions(
        { label: "Iniciante", value: "beginner", description: "Fundamentos e primeiros passos", emoji: "🟢" },
        { label: "Intermediário", value: "intermediate", description: "Prática e resolução de problemas", emoji: "🟡" },
        { label: "Avançado", value: "advanced", description: "Conceitos complexos e boas práticas", emoji: "🟠" },
        { label: "Especialista", value: "expert", description: "Arquitetura e domínio técnico", emoji: "🔴" }
      );

    return sendV2(message.channel, [
      ...learningDifficultyMessage(),
      new ActionRowBuilder().addComponents(menu),
    ]);
  },
};
