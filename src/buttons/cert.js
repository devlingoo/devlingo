const { MessageFlags } = require("discord.js");
const views = require("../utils/views");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

// customId dos certificados (o dono vai sempre no 3º campo):
//   cert:list:<dono>         botão "Meus certificados"
//   cert:show:<dono>:<código>  botão "Ver meu certificado" (aparece na resposta que o emitiu)
//   cert:pick:<dono>         menu "Ver um certificado" (o valor é o código)
// A imagem vai numa resposta só para quem clicou: dá para baixar e compartilhar de lá.
module.exports = {
  prefix: "cert",

  async execute(interaction, parts) {
    const [, stage, ownerId, code] = parts;

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Esse certificado é de outra pessoa. Use o comando certificados para ver os seus."));
    }
    const discordName = interaction.member?.displayName ?? interaction.user.displayName;

    if (stage === "list" && interaction.isButton()) {
      return interaction.update({ components: views.certificates(ownerId, discordName), flags: MessageFlags.IsComponentsV2 });
    }

    if ((stage === "show" && interaction.isButton()) || (stage === "pick" && interaction.isStringSelectMenu())) {
      const view = views.certificateView(ownerId, stage === "show" ? code : interaction.values[0], discordName);
      if (!view) return interaction.reply(ephemeral("Não encontrei esse certificado. Use o comando certificados para ver a lista."));
      return interaction.reply({
        components: view.components,
        files: view.files,
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  },
};
