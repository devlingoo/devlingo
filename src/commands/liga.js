const views = require("../utils/views");
const { normalizeName } = require("../utils/parse");
const { sendV2, notice, commandRef } = require("../utils/ui");

// O que a pessoa pode escrever depois de "liga".
const ACTIONS = { entrar: "join", participar: "join", sair: "leave" };

module.exports = {
  name: "liga",
  aliases: ["league"],
  description: "a liga da semana do servidor: só quem entrar compete por XP, de segunda a domingo",
  usage: "liga [entrar|sair]",
  category: "voce",
  order: 2.5, // logo depois do ranking

  async execute({ message, args, client }) {
    const action = args.length > 0 ? (ACTIONS[normalizeName(args[0])] ?? "invalid") : null;
    if (action === "invalid") {
      const liga = commandRef(client, Boolean(message.guildId), "liga");
      return sendV2(message.channel, notice(`Use ${liga} para ver a liga, \`entrar\` para participar ou \`sair\` para deixar de participar.`));
    }

    const components = await views.league({
      client,
      guild: message.guild,
      guildId: message.guildId,
      ownerId: message.author.id,
      action,
    });
    return sendV2(message.channel, components);
  },
};
