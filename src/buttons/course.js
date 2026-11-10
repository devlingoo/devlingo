const { MessageFlags } = require("discord.js");
const views = require("../utils/views");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const show = (interaction, components) =>
  interaction.update({ components, flags: MessageFlags.IsComponentsV2 });

// customId das telas de cursos (o dono vai sempre no 3º campo):
//   course:open:<dono>   menu "Abrir um curso" (o valor é o id do curso)
//   course:list:<dono>   botão "Cursos": volta para a lista
module.exports = {
  prefix: "course",

  async execute(interaction, parts) {
    const [, stage, ownerId] = parts;

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Essa tela é de outra pessoa. Use o comando cursos para ver a sua."));
    }

    if (stage === "open" && interaction.isStringSelectMenu()) {
      const detail = views.courseDetail(ownerId, interaction.values[0]);
      if (!detail) return interaction.reply(ephemeral("Esse curso não existe mais. Use o comando cursos para ver a lista atual."));
      return show(interaction, detail);
    }

    if (stage === "list" && interaction.isButton()) return show(interaction, views.courses(ownerId));
  },
};
