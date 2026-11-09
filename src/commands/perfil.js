const db = require("../utils/db");
const { sendV2, profileMessage } = require("../utils/ui");

module.exports = {
  name: "perfil",
  aliases: ["profile", "xp"],
  description: "seu XP, nível e sequência de dias",
  usage: "perfil",

  async execute({ message }) {
    const user = db.getUser(message.author.id);
    return sendV2(
      message.channel,
      profileMessage({
        name: message.member?.displayName ?? message.author.displayName,
        avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 128 }),
        user,
      })
    );
  },
};
