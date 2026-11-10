const views = require("../utils/views");
const { sendV2 } = require("../utils/ui");

module.exports = {
  name: "ajuda",
  aliases: ["help", "comandos"],
  description: "mostra esta lista",
  usage: "ajuda",
  category: "ajuda",

  async execute({ message, client }) {
    // A lista vem dos próprios comandos carregados: novo arquivo em commands/ aparece aqui sozinho
    return sendV2(
      message.channel,
      views.help(client, { inGuild: Boolean(message.guildId), ownerId: message.author.id })
    );
  },
};
