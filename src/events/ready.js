const { ActivityType, Events } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
  name: Events.ClientReady,
  once: true,

  execute(client) {
    logger.info(`Logado como ${client.user.tag} em ${client.guilds.cache.size} servidor(es).`);
    client.user.setActivity("Desafios de código 🧩", { type: ActivityType.Playing });
  },
};
