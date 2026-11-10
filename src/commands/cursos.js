const views = require("../utils/views");
const { sendV2 } = require("../utils/ui");

module.exports = {
  name: "cursos",
  aliases: ["curso", "courses"],
  description: "cursos com certificado: veja seu progresso em cada módulo e nível",
  usage: "cursos",
  category: "estudar",
  order: 4,

  async execute({ message }) {
    return sendV2(message.channel, views.courses(message.author.id));
  },
};
