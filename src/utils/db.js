const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite"); // embutido no Node 22.13+, sem dependência extra
const config = require("../config");
const logger = require("./logger");
const { dayKey, shiftDay } = require("./time");

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
  if (!inMemory) db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
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

// Registra uma resposta. guildId é null quando vem de DM.
// Devolve { xp, streak, gained, capped, dailyXp }:
//   gained = XP que realmente entrou (pode ser menor que o prêmio por causa do limite diário)
//   capped = true se o limite diário segurou parte ou todo o XP desta resposta
function recordAnswer(userId, guildId, correct, xpReward, now = new Date()) {
  const today = todayKey(now);

  return transaction(() => {
    const row = connection().prepare("SELECT * FROM users WHERE id = ?").get(userId);

    // Responder já conta como atividade do dia; a sequência cresce no primeiro desafio de cada dia.
    const streak = row?.last_day === today ? row.streak : currentStreak(row, today) + 1;

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

    const xp = (row?.xp ?? 0) + gained;
    const dailyXp = dailyBefore + gained;
    connection()
      .prepare(
        `INSERT INTO users (id, xp, streak, last_day, daily_day, daily_xp)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           xp = excluded.xp, streak = excluded.streak, last_day = excluded.last_day,
           daily_day = excluded.daily_day, daily_xp = excluded.daily_xp`
      )
      .run(userId, xp, streak, today, today, dailyXp);

    if (guildId && gained > 0) {
      connection()
        .prepare(
          `INSERT INTO guild_xp (guild_id, user_id, xp) VALUES (?, ?, ?)
           ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp`
        )
        .run(guildId, userId, gained);
    }

    return { xp, streak, gained, capped, dailyXp };
  });
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

module.exports = { getUser, getPreferences, setPreferences, recordAnswer, top, open, close };
