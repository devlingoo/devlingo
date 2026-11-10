const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");
const logger = require("../utils/logger");
const { normalizeName } = require("../utils/parse");

// Carrega todo arquivo .js de src/commands. Cada um exporta:
// { name, aliases?, description, usage?, execute({ message, args, client }) }
module.exports = (client) => {
  client.commands = new Collection();
  const aliases = new Collection();

  const dir = path.join(__dirname, "../commands");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(dir, file));

    if (!command.name || typeof command.execute !== "function") {
      logger.warn(`Comando ignorado (${file}): precisa de "name" e "execute".`);
      continue;
    }

    client.commands.set(command.name, command);
    // O nome e os apelidos são comparados sem acento, sem maiúsculas e sem pontuação no fim.
    for (const key of [command.name, ...(command.aliases ?? [])]) aliases.set(normalizeName(key), command.name);
  }

  client.findCommand = (name) => {
    const commandName = aliases.get(normalizeName(name));
    return commandName ? client.commands.get(commandName) : undefined;
  };

  logger.info(`${client.commands.size} comando(s) carregado(s).`);
};
