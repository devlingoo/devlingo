const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./config");
const logger = require("./utils/logger");
const loadCommands = require("./handlers/commandHandler");
const loadEvents = require("./handlers/eventHandler");
const buttonHandler = require("./handlers/buttonHandler");

if (!config.token) {
  logger.error("Defina DISCORD_TOKEN no arquivo .env");
  process.exit(1);
}

// Nenhuma intent privilegiada: o bot só lê o texto de DMs e de mensagens que marcam ele.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // necessário para receber DMs
  allowedMentions: { parse: [] }, // o bot nunca marca ninguém
});

loadCommands(client);
buttonHandler.load(client);
loadEvents(client);

process.on("unhandledRejection", (error) => logger.error("Promessa rejeitada:", error));
process.on("uncaughtException", (error) => logger.error("Exceção não tratada:", error));

client.login(config.token);
