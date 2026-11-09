const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "../../data");
const FILE = path.join(DIR, "data.json");

// Formato: { users: { [userId]: { xp, streak, lastDay } }, guilds: { [guildId]: { [userId]: xp } } }
function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return { users: data.users ?? {}, guilds: data.guilds ?? {} };
  } catch {
    return { users: {}, guilds: {} };
  }
}

function save(data) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Data local no formato YYYY-MM-DD
const dayString = (date) => date.toLocaleDateString("sv-SE");

function today() {
  return dayString(new Date());
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayString(d);
}

function userFrom(data, userId) {
  const user = data.users[userId] ?? { xp: 0, streak: 0, lastDay: null };
  if (user.lastDay !== today() && user.lastDay !== yesterday()) {
    return { ...user, streak: 0 }; // perdeu a sequência
  }
  return user;
}

function getUser(userId) {
  return userFrom(load(), userId);
}

// Registra uma resposta. guildId é null quando vem de DM.
// Devolve { xp, streak } (XP e sequência globais da pessoa).
function recordAnswer(userId, guildId, correct, xpReward) {
  const data = load();
  const user = userFrom(data, userId);
  const gained = correct ? xpReward : 0;

  const streak = user.lastDay === today() ? user.streak : user.streak + 1;
  const xp = user.xp + gained;
  data.users[userId] = { xp, streak, lastDay: today() };

  if (guildId && gained > 0) {
    data.guilds[guildId] ??= {};
    data.guilds[guildId][userId] = (data.guilds[guildId][userId] ?? 0) + gained;
  }

  save(data);
  return { xp, streak };
}

// Ranking do servidor (guildId) ou global (guildId nulo, usado em DM)
function top(guildId, limit = 10) {
  const data = load();
  const entries = guildId
    ? Object.entries(data.guilds[guildId] ?? {})
    : Object.entries(data.users).map(([id, u]) => [id, u.xp]);

  return entries
    .map(([userId, xp]) => ({ userId, xp }))
    .filter((e) => e.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

module.exports = { getUser, recordAnswer, top };
