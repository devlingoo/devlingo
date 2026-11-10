const views = require("../utils/views");
const { sendV2, notice } = require("../utils/ui");

module.exports = {
  name: "verificar",
  aliases: ["verify", "validar", "conferir"],
  description: "confere se um código de certificado é verdadeiro",
  usage: "verificar DVL-XXXX-XXXX",
  category: "voce",
  order: 5,

  async execute({ message, args }) {
    if (args.length === 0) {
      return sendV2(message.channel, notice("Escreva o código do certificado depois do comando. Exemplo: `verificar DVL-7K3M-9QXA`."));
    }
    // O código pode vir com espaços ("DVL 7K3M 9QXA"): junta tudo.
    return sendV2(message.channel, views.verify(args.join(" ")));
  },
};
