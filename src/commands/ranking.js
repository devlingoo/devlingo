const views = require("../utils/views");
const { sendV2 } = require("../utils/ui");

module.exports = {
  name: "ranking",
  aliases: ["top", "rank"],
  description: "top 10 do servidor (na DM, ranking global) e a sua posição",
  usage: "ranking",
  category: "voce",
  order: 2,

  async execute({ message, client }) {
    const components = await views.ranking({
      client,
      guild: message.guild,
      guildId: message.guildId,
      ownerId: message.author.id,
    });
    return sendV2(message.channel, components);
  },
};
