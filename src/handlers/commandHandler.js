const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");
const logger = require("../utils/logger");

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
    for (const alias of command.aliases ?? []) aliases.set(alias, command.name);
  }

  client.findCommand = (name) =>
    client.commands.get(name) ?? client.commands.get(aliases.get(name));

  logger.info(`${client.commands.size} comando(s) carregado(s).`);
};
