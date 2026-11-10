const { Events } = require("discord.js");
const config = require("../config");
const logger = require("../utils/logger");
const { parseCommand } = require("../utils/parse");
const { sendV2, notice, isDM, commandRef } = require("../utils/ui");

const lastUse = new Map(); // userId -> momento do último comando

module.exports = {
  name: Events.MessageCreate,

  async execute(client, message) {
    if (message.author.bot) return;

    const dm = isDM(message);
    if (config.allowedChannelId && !dm && message.channel.id !== config.allowedChannelId) return;

    const parsed = parseCommand(message.content, client.user.id, dm);
    if (!parsed) return;

    const command = client.findCommand(parsed.name);
    if (!command) {
      return sendV2(
        message.channel,
        notice(`Não conheci esse comando. Use ${commandRef(client, !dm, "ajuda")} para ver a lista.`)
      );
    }

    // Cooldown: se mandar rápido demais, só reage com ⏳
    const now = Date.now();
    if (now - (lastUse.get(message.author.id) ?? 0) < config.cooldownMs) {
      return message.react("⏳").catch(() => {});
    }
    lastUse.set(message.author.id, now);

    try {
      await command.execute({ message, args: parsed.args, client });
    } catch (error) {
      logger.error(`Erro no comando ${command.name}:`, error);
      await sendV2(message.channel, notice("Algo deu errado. Tente de novo.")).catch(() => {});
    }
  },
};
