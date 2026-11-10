const db = require("../utils/db");
const courses = require("../utils/courses");
const views = require("../utils/views");
const { normalizeName } = require("../utils/parse");
const { safeText } = require("../utils/text");
const { sendV2, notice } = require("../utils/ui");

module.exports = {
  name: "certificados",
  aliases: ["certificado", "diploma", "diplomas", "certificates"],
  description: "seus certificados; use `certificados nome Seu Nome` para escolher o nome que aparece neles",
  usage: "certificados [nome Seu Nome]",
  category: "voce",
  order: 4,

  async execute({ message, args }) {
    const ownerId = message.author.id;
    const discordName = message.member?.displayName ?? message.author.displayName;

    // "certificados nome Ana Beatriz Almeida": a pessoa escolhe como o nome sai nos certificados.
    if (normalizeName(args[0]) === "nome") {
      const clean = courses.cleanName(args.slice(1).join(" "));
      if (!clean) {
        return sendV2(
          message.channel,
          notice("Escreva o seu nome completo depois de `nome`, só com letras. Exemplo: `certificados nome Ana Beatriz Almeida`.")
        );
      }
      db.setCertificateName(ownerId, clean);
      // Mostra o nome como ficou (emoji, números e símbolos são removidos), para a pessoa conferir.
      return sendV2(message.channel, notice(`✅ Pronto! Seus certificados agora saem com o nome **${safeText(clean, { max: 40 })}**.`));
    }

    return sendV2(message.channel, views.certificates(ownerId, discordName));
  },
};
