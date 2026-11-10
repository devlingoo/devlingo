const db = require("../utils/db");
const study = require("../utils/study");
const { sendV2, profileMessage } = require("../utils/ui");

module.exports = {
  name: "perfil",
  aliases: ["profile", "xp"],
  description: "seu XP, nível, sequência de dias e trilha",
  usage: "perfil",

  async execute({ message }) {
    const user = db.getUser(message.author.id);
    return sendV2(
      message.channel,
      profileMessage({
        name: message.member?.displayName ?? message.author.displayName,
        avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 128 }),
        user,
        prefs: study.preferencesOf(message.author.id),
      })
    );
  },
};
