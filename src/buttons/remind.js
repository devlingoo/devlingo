const { MessageFlags } = require("discord.js");
const views = require("../utils/views");
const reminders = require("../utils/reminders");

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

// Botões e menu dos lembretes por DM:
//   remind:on:<idDoDono>    liga (na hora que a pessoa já tinha ou na padrão)
//   remind:off:<idDoDono>   desliga (também é o "Parar lembretes" das próprias DMs)
//   remind:hour:<idDoDono>  menu de hora: liga na hora escolhida
// Trocam a mensagem pela tela dos lembretes (a mesma do comando `lembrete`).
module.exports = {
  prefix: "remind",

  async execute(interaction, parts) {
    const [, action, ownerId] = parts;

    if (interaction.user.id !== ownerId) {
      return interaction.reply(ephemeral("Esses botões são de outra pessoa. Use o comando `lembrete` para ter os seus."));
    }

    let act = action;
    let hour = null;
    if (action === "hour") {
      hour = reminders.parseHour(interaction.values?.[0]);
      if (hour === null) return interaction.reply(ephemeral("Essa hora não vale. Escolha de novo no menu."));
      act = "on";
    } else if (action !== "on" && action !== "off") {
      return interaction.reply(ephemeral("Esse botão não vale mais. Use o comando `lembrete` de novo."));
    }

    // Ligar num servidor manda uma DM de teste, que pode passar dos 3 segundos: reconhece o clique antes e edita depois.
    await interaction.deferUpdate();
    const components = await views.reminder({
      ownerId,
      user: interaction.user,
      inGuild: interaction.inGuild(),
      action: act,
      hour,
    });
    return interaction.editReply({ components, flags: MessageFlags.IsComponentsV2 });
  },
};
