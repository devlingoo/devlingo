// Regras da trilha de estudo que juntam banco, áreas e desafios.
// Os comandos (aprender, desafio) e os botões usam daqui para não repetir a lógica.
const config = require("../config");
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

// Nível de dificuldade logo acima do atual, entre os que têm desafios (null se já está no último).
function nextLevel(levelId) {
  const levels = challenges.availableDifficulties();
  const at = levels.findIndex((d) => d.id === levelId);
  return at >= 0 ? (levels[at + 1] ?? null) : null;
}

// Decide se vale convidar a pessoa a subir de nível depois de uma resposta CERTA. `progress` é o
// `levelProgress` devolvido por db.recordAnswer. Só sugere com a janela cheia (levelUpWindow respostas
// no nível atual), pelo menos levelUpPercent% de acerto e um nível acima para ir. Ao sugerir, recomeça a
// contagem: quem ignora o convite só o recebe de novo depois de outra janela cheia.
// Devolve { from, to, answered, correct } (from e to são níveis de challenges.DIFFICULTIES) ou null.
function levelSuggestion(userId, progress) {
  if (!progress || config.levelUpWindow <= 0) return null;
  if (progress.answered < config.levelUpWindow) return null;
  if (progress.correct * 100 < progress.answered * config.levelUpPercent) return null;

  const prefs = preferencesOf(userId);
  const to = prefs && nextLevel(prefs.level);
  if (!to) return null;

  db.clearRecent(userId);
  return { from: challenges.DIFFICULTIES.find((d) => d.id === prefs.level), to, ...progress };
}

// Passa a pessoa para o nível `levelId`, mantendo as áreas. Só aceita o nível logo acima do atual (é o
// que o botão da sugestão oferece). Devolve { status, prefs }: "ok", "already" (já está nele) ou
// "invalid" (sem configuração ou a sugestão não vale mais).
function promote(userId, levelId) {
  const prefs = preferencesOf(userId);
  if (!prefs) return { status: "invalid", prefs: null };
  if (prefs.level === levelId) return { status: "already", prefs };
  if (nextLevel(prefs.level)?.id !== levelId) return { status: "invalid", prefs };

  const updated = { level: levelId, areas: prefs.areas };
  db.setPreferences(userId, updated);
  return { status: "ok", prefs: updated };
}

module.exports = { preferencesOf, topicMenu, levelSuggestion, promote };
