const { sendV2, helpMessage, commandRef } = require("../utils/ui");

module.exports = {
  name: "ajuda",
  aliases: ["help", "comandos"],
  description: "mostra esta lista",
  usage: "ajuda",

  async execute({ message, client }) {
    const inGuild = Boolean(message.guildId);

    // A lista vem dos próprios comandos carregados: novo arquivo em commands/ aparece aqui sozinho
    const lines = [...client.commands.values()].map(
      (cmd) => `\`${cmd.usage ?? cmd.name}\` — ${cmd.description}`
    );

    // A menção aparece uma vez só, no exemplo, em vez de repetida em cada comando
    const intro = inGuild
      ? `Marque ${client.user} e escreva o comando. Exemplo: ${commandRef(client, true, "aprender")}`
      : `Escreva o comando direto aqui na conversa. Exemplo: ${commandRef(client, false, "aprender")}`;

    const footer = inGuild
      ? "Também dá para falar comigo por DM, sem precisar me marcar."
      : "Na DM não precisa de nada na frente: é só escrever o comando.";

    return sendV2(message.channel, helpMessage(lines, footer, intro));
  },
};
