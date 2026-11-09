const fs = require("fs");
const path = require("path");
const { Collection, MessageFlags } = require("discord.js");
const logger = require("../utils/logger");

// Carrega todo arquivo .js de src/buttons. Cada um exporta:
// { prefix, execute(interaction, parts, client) }
// O customId dos botões é "prefixo:dado1:dado2...", e `parts` é esse texto separado por ":".
function load(client) {
  client.buttons = new Collection();

  const dir = path.join(__dirname, "../buttons");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const button = require(path.join(dir, file));

    if (!button.prefix || typeof button.execute !== "function") {
      logger.warn(`Botão ignorado (${file}): precisa de "prefix" e "execute".`);
      continue;
    }
    client.buttons.set(button.prefix, button);
  }

  logger.info(`${client.buttons.size} handler(s) de botão carregado(s).`);
}

async function handle(client, interaction) {
  const parts = interaction.customId.split(":");
  const button = client.buttons.get(parts[0]);
  if (!button) return;

  try {
    await button.execute(interaction, parts, client);
  } catch (error) {
    logger.error(`Erro no botão ${parts[0]}:`, error);
    const reply = { content: "Algo deu errado. Tente de novo.", flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
}

module.exports = { load, handle };
