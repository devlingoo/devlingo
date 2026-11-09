const { sendV2, helpMessage, callPrefix } = require("../utils/ui");

module.exports = {
  name: "ajuda",
  aliases: ["help", "comandos"],
  description: "mostra esta lista",
  usage: "ajuda",

  async execute({ message, client }) {
    const inGuild = Boolean(message.guildId);
    const call = callPrefix(client, inGuild);

    // A lista vem dos próprios comandos carregados: novo arquivo em commands/ aparece aqui sozinho
    const lines = [...client.commands.values()].map(
      (cmd) => `\`${call}${cmd.usage ?? cmd.name}\` — ${cmd.description}`
    );

    const footer = inGuild
      ? "Também dá para falar comigo por DM, sem precisar me marcar."
      : "Na DM não precisa de nada na frente: é só escrever o comando.";

    return sendV2(message.channel, helpMessage(lines, footer));
  },
};
