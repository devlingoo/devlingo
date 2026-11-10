const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite"); // embutido no Node 22.13+, sem dependência extra
const config = require("../config");
const logger = require("./logger");
const { dayKey, shiftDay } = require("./time");
const { levelOf } = require("./progress");
const achievements = require("./achievements");

// Cada item é uma migração; a posição + 1 é a versão gravada em PRAGMA user_version.
// Para mudar o esquema, acrescente uma migração nova no fim (nunca edite as antigas).
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id        TEXT PRIMARY KEY,
    xp        INTEGER NOT NULL DEFAULT 0,
    streak    INTEGER NOT NULL DEFAULT 0,
    last_day  TEXT,
    daily_day TEXT,
    daily_xp  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX users_xp ON users (xp DESC);

  CREATE TABLE guild_xp (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    xp       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX guild_xp_rank ON guild_xp (guild_id, xp DESC);
  `,
  // v2: configuração inicial da pessoa (nível e áreas escolhidos no comando "configurar").
  // `areas` guarda os ids separados por vírgula, por exemplo "frontend,backend".
  `
  ALTER TABLE users ADD COLUMN level TEXT;
  ALTER TABLE users ADD COLUMN areas TEXT;
  `,
  // v3: estatísticas, combo, meta diária e conquistas (estímulos de hábito).
  `
  ALTER TABLE users ADD COLUMN best_streak    INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN answered       INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN correct        INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN expert_correct INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN combo          INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN best_combo     INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN goal_day       TEXT;
  ALTER TABLE users ADD COLUMN goal_count     INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN goal_done_days INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE achievements (
    user_id     TEXT NOT NULL,
    key         TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  `,
];

let db = null;

function migrate(conn) {
  const { user_version: current } = conn.prepare("PRAGMA user_version").get();
  for (let version = current; version < MIGRATIONS.length; version++) {
    conn.exec("BEGIN");
    try {
      conn.exec(MIGRATIONS[version]);
      conn.exec(`PRAGMA user_version = ${version + 1}`);
      conn.exec("COMMIT");
    } catch (error) {
      conn.exec("ROLLBACK");
      throw error;
    }
  }
}

// O SQLite do Node é síncrono e o bot roda em um processo só, então uma transação aqui
// nunca é interrompida por outra resposta no meio.
function transaction(fn) {
  const conn = connection();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (error) {
    conn.exec("ROLLBACK");
    throw error;
  }
}

// Importa o antigo data/data.json (formato da versão com arquivo JSON) uma única vez,
// quando o banco novo ainda está vazio. O arquivo vira data.json.migrated como backup.
function importLegacyJson(file) {
  if (!fs.existsSync(file)) return;
  if (db.prepare("SELECT 1 FROM users LIMIT 1").get()) return;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    logger.warn(`Não consegui ler ${file}; importação ignorada:`, error.message);
    return;
  }

  let users = 0;
  transaction(() => {
    const insertUser = db.prepare("INSERT INTO users (id, xp, streak, last_day) VALUES (?, ?, ?, ?)");
    for (const [id, u] of Object.entries(data.users ?? {})) {
      insertUser.run(id, Number(u?.xp) || 0, Number(u?.streak) || 0, u?.lastDay ?? null);
      users++;
    }
    const insertGuild = db.prepare("INSERT INTO guild_xp (guild_id, user_id, xp) VALUES (?, ?, ?)");
    for (const [guildId, members] of Object.entries(data.guilds ?? {})) {
      for (const [userId, xp] of Object.entries(members ?? {})) {
        insertGuild.run(guildId, userId, Number(xp) || 0);
      }
    }
  });

  fs.renameSync(file, `${file}.migrated`);
  logger.info(`Importei ${users} pessoa(s) de ${path.basename(file)} para o SQLite (backup: ${path.basename(file)}.migrated).`);
}

// Abre (e cria, se preciso) o banco. É chamado sozinho no primeiro uso; os testes
// usam open(":memory:") para ter um banco novo e descartável.
function open(file = config.dbPath) {
  close();
  const inMemory = file === ":memory:";
  if (!inMemory) fs.mkdirSync(path.dirname(file), { recursive: true });

  db = new DatabaseSync(file);
  // busy_timeout: com outro processo usando o mesmo arquivo (duas instâncias do bot, reinício do
  // `npm run dev`), espera até 5 s pelo travamento em vez de falhar na hora com "database is locked".
  if (!inMemory) db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  migrate(db);
  if (!inMemory) importLegacyJson(path.join(path.dirname(file), "data.json"));
  return db;
}

function close() {
  db?.close();
  db = null;
}

function connection() {
  return db ?? open();
}

// ---------- dias e sequência ----------

const todayKey = (now) => dayKey(now, config.timezone);

// A sequência vale se a última atividade foi hoje ou ontem; senão, zerou.
function currentStreak(row, today) {
  if (!row) return 0;
  return row.last_day === today || row.last_day === shiftDay(today, -1) ? row.streak : 0;
}

const dailyXpOf = (row, today) => (row?.daily_day === today ? row.daily_xp : 0);

// ---------- API usada pelos comandos ----------

// { xp, streak, lastDay, dailyXp } da pessoa (zerado se ela ainda não jogou).
function getUser(userId, now = new Date()) {
  const row = connection().prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const today = todayKey(now);
  return {
    xp: row?.xp ?? 0,
    streak: currentStreak(row, today),
    lastDay: row?.last_day ?? null,
    dailyXp: dailyXpOf(row, today),
  };
}

// Configuração inicial da pessoa: { level, areas: [ids] }, ou null se ainda não configurou.
function getPreferences(userId) {
  const row = connection().prepare("SELECT level, areas FROM users WHERE id = ?").get(userId);
  if (!row?.level || !row?.areas) return null;
  return { level: row.level, areas: row.areas.split(",").filter(Boolean) };
}

// Guarda (ou troca) o nível e as áreas. Cria a pessoa se ela ainda não existir; XP e sequência não mudam.
function setPreferences(userId, { level, areas }) {
  connection()
    .prepare(
      `INSERT INTO users (id, level, areas) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET level = excluded.level, areas = excluded.areas`
    )
    .run(userId, level, areas.join(","));
}

// Registra uma resposta. guildId é null quando vem de DM. `extra.difficulty` (opcional) é o nível
// do desafio e serve para as conquistas.
//
// Devolve tudo o que a mensagem de resposta precisa mostrar:
//   xp, streak, level, dailyXp
//   gained        XP da resposta que realmente entrou (o limite diário pode segurar parte ou tudo)
//   capped        true se o limite diário segurou parte ou todo o XP desta resposta
//   bonus         { combo, goal, streak, total }: XP extra, FORA do limite diário
//   combo         acertos seguidos agora; comboBroken = combo (>= 3) que acabou de ser perdido, ou 0
//   goal          { count, target, completed }: meta do dia (completed = acabou de ser cumprida)
//   milestone     { days, bonus } se um marco de sequência foi atingido hoje, senão null
//   levelUp       { from, to } se subiu de nível, senão null
//   achievements  conquistas desbloqueadas agora (objetos de achievements.js)
function recordAnswer(userId, guildId, correct, xpReward, now = new Date(), extra = {}) {
  const today = todayKey(now);

  return transaction(() => {
    const conn = connection();
    const row = conn.prepare("SELECT * FROM users WHERE id = ?").get(userId);

    // Sequência: responder já conta como atividade do dia e ela cresce na primeira resposta de cada dia.
    const firstOfDay = row?.last_day !== today;
    const streak = firstOfDay ? currentStreak(row, today) + 1 : row.streak;
    const bestStreak = Math.max(row?.best_streak ?? 0, streak);
    const milestoneBonus = firstOfDay ? config.streakMilestones[streak] ?? 0 : 0;

    // XP da resposta, respeitando o limite diário.
    const dailyBefore = dailyXpOf(row, today);
    let gained = correct ? xpReward : 0;
    let capped = false;
    if (config.dailyXpCap > 0 && gained > 0) {
      const room = Math.max(0, config.dailyXpCap - dailyBefore);
      if (gained > room) {
        gained = room;
        capped = true;
      }
    }

    // Combo: acertos seguidos. O bônus só vem quando o XP da resposta entrou (não no limite diário).
    const comboBefore = row?.combo ?? 0;
    const combo = correct ? comboBefore + 1 : 0;
    const comboBroken = !correct && comboBefore >= 3 ? comboBefore : 0;
    const comboBonus = correct && gained > 0 && combo % config.comboEvery === 0 ? config.comboBonusXp : 0;

    // Meta do dia: conta respostas (certas ou erradas). O bônus sai uma vez, quando a contagem a alcança.
    const goalBefore = row?.goal_day === today ? row.goal_count : 0;
    const goalCount = goalBefore + 1;
    const goalCompleted = config.dailyGoal > 0 && goalBefore < config.dailyGoal && goalCount >= config.dailyGoal;
    const goalBonus = goalCompleted ? config.goalBonusXp : 0;

    const bonusTotal = comboBonus + goalBonus + milestoneBonus;
    const xpBefore = row?.xp ?? 0;
    const xp = xpBefore + gained + bonusTotal;
    const dailyXp = dailyBefore + gained; // bônus não gasta o limite diário
    const levelBefore = levelOf(xpBefore);
    const level = levelOf(xp);

    const stats = {
      answered: (row?.answered ?? 0) + 1,
      correct: (row?.correct ?? 0) + (correct ? 1 : 0),
      expertCorrect: (row?.expert_correct ?? 0) + (correct && extra.difficulty === "expert" ? 1 : 0),
      bestCombo: Math.max(row?.best_combo ?? 0, combo),
      goalDoneDays: (row?.goal_done_days ?? 0) + (goalCompleted ? 1 : 0),
      streak,
      bestStreak,
      level,
    };

    conn
      .prepare(
        `INSERT INTO users (id, xp, streak, best_streak, last_day, daily_day, daily_xp, answered, correct,
                            expert_correct, combo, best_combo, goal_day, goal_count, goal_done_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           xp = excluded.xp, streak = excluded.streak, best_streak = excluded.best_streak,
           last_day = excluded.last_day, daily_day = excluded.daily_day, daily_xp = excluded.daily_xp,
           answered = excluded.answered, correct = excluded.correct, expert_correct = excluded.expert_correct,
           combo = excluded.combo, best_combo = excluded.best_combo, goal_day = excluded.goal_day,
           goal_count = excluded.goal_count, goal_done_days = excluded.goal_done_days`
      )
      .run(
        userId, xp, streak, bestStreak, today, today, dailyXp, stats.answered, stats.correct,
        stats.expertCorrect, combo, stats.bestCombo, today, goalCount, stats.goalDoneDays
      );

    if (guildId && gained + bonusTotal > 0) {
      conn
        .prepare(
          `INSERT INTO guild_xp (guild_id, user_id, xp) VALUES (?, ?, ?)
           ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp`
        )
        .run(guildId, userId, gained + bonusTotal);
    }

    // Conquistas: grava as que a pessoa passou a merecer e devolve só as novas.
    const unlocked = [];
    for (const key of achievements.earned(stats)) {
      const { changes } = conn
        .prepare("INSERT OR IGNORE INTO achievements (user_id, key, unlocked_at) VALUES (?, ?, ?)")
        .run(userId, key, now.getTime());
      if (changes > 0) unlocked.push(achievements.get(key));
    }

    return {
      xp,
      level,
      streak,
      gained,
      capped,
      dailyXp,
      bonus: { combo: comboBonus, goal: goalBonus, streak: milestoneBonus, total: bonusTotal },
      combo,
      comboBroken,
      goal: { count: goalCount, target: config.dailyGoal, completed: goalCompleted },
      milestone: milestoneBonus > 0 ? { days: streak, bonus: milestoneBonus } : null,
      levelUp: level > levelBefore ? { from: levelBefore, to: level } : null,
      achievements: unlocked,
    };
  });
}

// Estatísticas da pessoa para o perfil (tudo zerado se ela ainda não jogou).
function getStats(userId, now = new Date()) {
  const row = connection().prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const today = todayKey(now);
  const answered = row?.answered ?? 0;
  const correct = row?.correct ?? 0;
  const streak = currentStreak(row, today);
  return {
    answered,
    correct,
    accuracy: answered > 0 ? Math.round((correct / answered) * 100) : 0,
    streak,
    bestStreak: Math.max(row?.best_streak ?? 0, streak),
    combo: row?.combo ?? 0,
    bestCombo: row?.best_combo ?? 0,
    goalCount: row?.goal_day === today ? row.goal_count : 0,
    goalDoneDays: row?.goal_done_days ?? 0,
  };
}

// Chaves das conquistas desbloqueadas, da mais antiga para a mais nova.
function getAchievements(userId) {
  return connection()
    .prepare("SELECT key FROM achievements WHERE user_id = ? ORDER BY unlocked_at, key")
    .all(userId)
    .map((r) => r.key);
}

// Posição da pessoa no ranking do servidor (guildId) ou global (guildId nulo): { position, xp },
// ou null se ela ainda não tem XP. Empates dividem a mesma posição.
function rankOf(userId, guildId) {
  const conn = connection();
  const mine = guildId
    ? conn.prepare("SELECT xp FROM guild_xp WHERE guild_id = ? AND user_id = ?").get(guildId, userId)
    : conn.prepare("SELECT xp FROM users WHERE id = ?").get(userId);
  if (!mine || mine.xp <= 0) return null;

  const { n } = guildId
    ? conn.prepare("SELECT COUNT(*) AS n FROM guild_xp WHERE guild_id = ? AND xp > ?").get(guildId, mine.xp)
    : conn.prepare("SELECT COUNT(*) AS n FROM users WHERE xp > ?").get(mine.xp);
  return { position: n + 1, xp: mine.xp };
}

// Ranking do servidor (guildId) ou global (guildId nulo, usado em DM)
function top(guildId, limit = 10) {
  const rows = guildId
    ? connection()
        .prepare(
          `SELECT user_id AS userId, xp FROM guild_xp
           WHERE guild_id = ? AND xp > 0 ORDER BY xp DESC, user_id LIMIT ?`
        )
        .all(guildId, limit)
    : connection()
        .prepare("SELECT id AS userId, xp FROM users WHERE xp > 0 ORDER BY xp DESC, id LIMIT ?")
        .all(limit);
  return rows.map((r) => ({ userId: r.userId, xp: r.xp }));
}

module.exports = {
  getUser,
  getPreferences,
  setPreferences,
  recordAnswer,
  getStats,
  getAchievements,
  rankOf,
  top,
  open,
  close,
};
