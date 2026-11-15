const { ActivityType, Events } = require("discord.js");
const logger = require("../utils/logger");
const reminders = require("../utils/reminders");

module.exports = {
  name: Events.ClientReady,
  once: true,

  execute(client) {
    logger.info(`Logado como ${client.user.tag} em ${client.guilds.cache.size} servidor(es).`);
    client.user.setActivity("Desafios de código 🧩", { type: ActivityType.Playing });
    // O relógio dos lembretes por DM só começa com o bot já conectado (e guarda a "alça" para parar no encerramento).
    client.reminders = reminders.start(client);
  },
};
