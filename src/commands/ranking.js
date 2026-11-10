const { escapeMarkdown } = require("discord.js");
const db = require("../utils/db");
const { sendV2, notice, rankingMessage, commandRef } = require("../utils/ui");

const MEDALS = ["🥇", "🥈", "🥉"];

module.exports = {
  name: "ranking",
  aliases: ["top", "rank"],
  description: "top 10 do servidor (na DM, ranking global)",
  usage: "ranking",

  async execute({ message, client }) {
    const rows = db.top(message.guildId, 10);
    if (rows.length === 0) {
      const how = commandRef(client, Boolean(message.guildId), "desafio");
      return sendV2(message.channel, notice(`Ninguém pontuou ainda. Comece com ${how}!`));
    }

    const lines = await Promise.all(
      rows.map(async (row, i) => {
        const member = await message.guild?.members.fetch(row.userId).catch(() => null);
        const name =
          member?.displayName ??
          (await client.users.fetch(row.userId).catch(() => null))?.username ??
          `usuário ${row.userId}`;
        return `${MEDALS[i] ?? `${i + 1}.`} **${escapeMarkdown(name)}** — ${row.xp} XP`;
      })
    );

    const title = message.guildId ? "🏆 Ranking do servidor" : "🏆 Ranking global";
    return sendV2(message.channel, rankingMessage(title, lines));
  },
};
