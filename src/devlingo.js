const { Client, GatewayIntentBits, Partials } = require("discord.js");
const config = require("./config");
const logger = require("./utils/logger");
const db = require("./utils/db");
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

db.open(); // abre (e migra) o banco já na inicialização: se houver problema, o bot falha aqui, não na primeira resposta

loadCommands(client);
buttonHandler.load(client);
loadEvents(client);

process.on("unhandledRejection", (error) => logger.error("Promessa rejeitada:", error));
process.on("uncaughtException", (error) => logger.error("Exceção não tratada:", error));

// Encerra com calma (Ctrl+C, deploy, reinício do servidor): fecha o Discord e o banco.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    logger.info(`${signal} recebido; encerrando.`);
    await client.destroy();
    db.close();
    process.exit(0);
  });
}

client.login(config.token);
