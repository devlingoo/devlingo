const { MessageFlags } = require("discord.js");
const views = require("../utils/views");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

// Botões de atalho entre telas: "nav:<idDoDono>:<destino>". Trocam a mensagem pela tela escolhida,
// que é a mesma que o comando correspondente mostraria.
module.exports = {
  prefix: "nav",

  async execute(interaction, parts, client) {
    const [, ownerId, target] = parts;

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Esses botões são de outra pessoa. Use um comando para ter os seus."));
    }

    const name = interaction.member?.displayName ?? interaction.user.displayName;
    const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 128 });
    const screens = {
      estudar: async () => views.studyEntry(ownerId),
      perfil: async () => views.profile({ ownerId, name, avatarUrl }),
      ranking: () => views.ranking({ client, guild: interaction.guild, guildId: interaction.guildId, ownerId }),
      conquistas: async () => views.achievements(ownerId),
      configurar: async () => views.setup(ownerId),
    };

    const build = screens[target];
    if (!build) return interaction.reply(ephemeral("Esse atalho não existe mais. Use o comando ajuda."));

    // O ranking busca nomes e pode passar dos 3 segundos: reconhece o clique antes e edita depois.
    await interaction.deferUpdate();
    return interaction.editReply({ components: await build(), flags: MessageFlags.IsComponentsV2 });
  },
};
