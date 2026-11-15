const { MessageFlags } = require("discord.js");
const views = require("../utils/views");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

// Botões da liga semanal: "league:join:<idDoDono>" e "league:leave:<idDoDono>". Fazem a pessoa entrar ou sair
// e trocam a mensagem pela liga atualizada (a mesma tela do comando `liga`).
const ACTIONS = new Set(["join", "leave"]);

module.exports = {
  prefix: "league",

  async execute(interaction, parts, client) {
    const [, action, ownerId] = parts;

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Esses botões são de outra pessoa. Use o comando `liga` para ter os seus."));
    }
    if (!ACTIONS.has(action) || !interaction.guildId) {
      return interaction.reply(ephemeral("Esse botão não vale mais. Use o comando `liga` de novo, em um servidor."));
    }

    // Os nomes do ranking vêm do Discord e podem passar dos 3 segundos: reconhece o clique antes e edita depois.
    await interaction.deferUpdate();
    const components = await views.league({
      client,
      guild: interaction.guild,
      guildId: interaction.guildId,
      ownerId,
      action,
    });
    return interaction.editReply({ components, flags: MessageFlags.IsComponentsV2 });
  },
};
