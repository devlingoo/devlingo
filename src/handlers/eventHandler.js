const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

// Carrega todo arquivo .js de src/events. Cada um exporta:
// { name, once?, execute(client, ...args) }
module.exports = (client) => {
  const dir = path.join(__dirname, "../events");
  let count = 0;

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const event = require(path.join(dir, file));

    if (!event.name || typeof event.execute !== "function") {
      logger.warn(`Evento ignorado (${file}): precisa de "name" e "execute".`);
      continue;
    }

    const run = async (...args) => {
      try {
        await event.execute(client, ...args);
      } catch (error) {
        logger.error(`Erro no evento ${event.name}:`, error);
      }
    };

    if (event.once) client.once(event.name, run);
    else client.on(event.name, run);
    count++;
  }

  logger.info(`${count} evento(s) registrado(s).`);
};
