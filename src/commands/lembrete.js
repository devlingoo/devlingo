const views = require("../utils/views");
const reminders = require("../utils/reminders");
const { normalizeName } = require("../utils/parse");
const { sendV2, notice, commandRef } = require("../utils/ui");

const ON = new Set(["ligar", "ativar", "on"]);
const OFF = new Set(["desligar", "parar", "off"]);

module.exports = {
  name: "lembrete",
  aliases: ["lembretes", "reminder"],
  description: "um lembrete por dia por DM, só se você ligar (`lembrete ligar 20`, `lembrete desligar`)",
  usage: "lembrete [ligar [hora]|desligar]",
  category: "voce",
  order: 6,

  async execute({ message, args, client }) {
    // O que a pessoa quer: ver a tela (sem argumentos), ligar (com a hora opcional, ou só a hora) ou desligar.
    let action = null;
    let hour = null;
    let valid = true;

    if (args.length > 0) {
      const word = normalizeName(args[0]);
      if (ON.has(word) && args.length <= 2) {
        action = "on";
        if (args.length === 2) {
          hour = reminders.parseHour(args[1]);
          valid = hour !== null;
        }
      } else if (OFF.has(word) && args.length === 1) {
        action = "off";
      } else if (args.length === 1 && reminders.parseHour(args[0]) !== null) {
        action = "on";
        hour = reminders.parseHour(args[0]);
      } else {
        valid = false;
      }
    }

    if (!valid) {
      const lembrete = commandRef(client, Boolean(message.guildId), "lembrete");
      return sendV2(
        message.channel,
        notice(`Use ${lembrete} para ver os lembretes, \`ligar 20\` para ligar às 20h (qualquer hora de 0 a 23) ou \`desligar\`.`)
      );
    }

    const components = await views.reminder({
      ownerId: message.author.id,
      user: message.author,
      inGuild: Boolean(message.guildId),
      action,
      hour,
    });
    return sendV2(message.channel, components);
  },
};
