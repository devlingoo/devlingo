// Regras da trilha de estudo que juntam banco, áreas e desafios.
// Os comandos (aprender, desafio) e os botões usam daqui para não repetir a lógica.
const db = require("./db");
const areas = require("./areas");
const challenges = require("./challenges");
const { learningTopicMenu } = require("./ui");

// Preferências da pessoa, já conferidas com o conteúdo de hoje: áreas que sumiram ou um nível
// que ficou sem desafios são descartados. Devolve null se não sobrou nada utilizável, e aí o
// bot pede a configuração de novo (é o "setup inicial" obrigatório).
function preferencesOf(userId) {
  const raw = db.getPreferences(userId);
  if (!raw) return null;

  const areaIds = areas.parse(raw.areas.join(","));
  const level = challenges.availableDifficulties().find((d) => d.id === raw.level);
  return areaIds.length > 0 && level ? { level: level.id, areas: areaIds } : null;
}

// Menu de assuntos de um nível. Por padrão mostra só os assuntos das áreas da pessoa;
// `showAll` mostra todos. Devolve null se o nível não tem nenhum desafio.
function topicMenu(userId, difficulty, { showAll = false } = {}) {
  const prefs = preferencesOf(userId);
  let filtered = Boolean(prefs) && !showAll;
  let note = null;

  let list = challenges.topics(difficulty, filtered ? areas.topicIdsFor(prefs.areas) : undefined);
  if (list.length === 0 && filtered) {
    // As áreas da pessoa não têm nada nesse nível: melhor mostrar tudo do que um menu vazio.
    list = challenges.topics(difficulty);
    filtered = false;
    note = "Ainda não há perguntas das suas áreas nesse nível, então estou mostrando todas as áreas.";
  }
  if (list.length === 0) return null;

  return learningTopicMenu(userId, difficulty, list, { prefs, filtered, note });
}

module.exports = { preferencesOf, topicMenu };
