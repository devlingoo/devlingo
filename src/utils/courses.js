// Cursos e certificados.
//
// Um curso é uma lista de módulos (os assuntos de src/data/courses.json). Para cada NÍVEL do curso
// (Iniciante, Intermediário...), a pessoa conclui um módulo ao acertar pelo menos
// config.coursePassPercent das perguntas diferentes dele; concluindo todos os módulos do nível,
// ganha o certificado daquele curso e nível, com um código único que dá para verificar.
const crypto = require("crypto");
const config = require("../config");
const db = require("./db");
const challenges = require("./challenges");
const list = require("../data/courses.json");

// ---------- validação (como a dos desafios: dado inválido impede o bot de iniciar) ----------

const MAX_COURSES = 10;
const MAX_MODULES = 8;
const ID_PATTERN = /^[a-z0-9-]{1,12}$/;
const knownTopics = new Set(challenges.list.map((c) => c.topic.id));
const seen = new Set();

if (!Array.isArray(list) || list.length === 0 || list.length > MAX_COURSES) {
  throw new Error(`courses.json: precisa ter de 1 a ${MAX_COURSES} cursos`);
}
for (const course of list) {
  const where = `courses.json (${course.id ?? "sem id"})`;
  if (!ID_PATTERN.test(course.id ?? "") || seen.has(course.id)) {
    throw new Error(`${where}: id inválido ou repetido (até 12 caracteres: a-z, 0-9 e hífen)`);
  }
  seen.add(course.id);
  if (!course.name || course.name.length > 50 || !course.emoji || !course.description || course.description.length > 100) {
    throw new Error(`${where}: faltam name (até 50), emoji ou description (até 100)`);
  }
  if (!Array.isArray(course.modules) || course.modules.length === 0 || course.modules.length > MAX_MODULES) {
    throw new Error(`${where}: modules precisa ter de 1 a ${MAX_MODULES} assuntos`);
  }
  if (new Set(course.modules).size !== course.modules.length) throw new Error(`${where}: módulo repetido`);
  for (const topicId of course.modules) {
    if (!knownTopics.has(topicId)) throw new Error(`${where}: o assunto "${topicId}" não existe em challenges.json`);
  }
}

// ---------- consulta ----------

const get = (id) => list.find((c) => c.id === id) ?? null;
const topicLabel = (topicId) => challenges.list.find((c) => c.topic.id === topicId)?.topic.label ?? topicId;
const pool = (topicId, level) => challenges.list.filter((c) => c.topic.id === topicId && c.difficulty === level);

// Quantas perguntas diferentes é preciso acertar num módulo de `poolSize` perguntas.
const needed = (poolSize) => Math.max(1, Math.ceil((poolSize * config.coursePassPercent) / 100));

// Níveis em que TODOS os módulos do curso têm perguntas: só esses geram certificado.
function levelsOf(course) {
  return challenges.DIFFICULTIES.filter((level) => course.modules.every((topicId) => pool(topicId, level.id).length > 0));
}

// Progresso da pessoa no curso, nível a nível:
// [{ level, modules: [{ topicId, label, pool, solved, needed, done }], doneModules, total, done, certificate }]
function progress(userId, course, solved = db.getSolved(userId)) {
  return levelsOf(course).map((level) => {
    const modules = course.modules.map((topicId) => {
      const ids = pool(topicId, level.id).map((c) => c.id);
      const got = ids.filter((id) => solved.has(id)).length;
      const need = needed(ids.length);
      return { topicId, label: topicLabel(topicId), pool: ids.length, solved: got, needed: need, done: got >= need };
    });
    return {
      level,
      modules,
      doneModules: modules.filter((m) => m.done).length,
      total: modules.length,
      done: modules.every((m) => m.done),
      certificate: db.getCertificate(userId, course.id, level.id),
    };
  });
}

// ---------- certificados ----------

// Código legível e difícil de confundir (sem I, L, O, 0 e 1): DVL-7K3M-9QXA
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `DVL-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// Normaliza o que a pessoa digitou como código ("dvl 7k3m 9qxa" -> "DVL-7K3M-9QXA").
function normalizeCode(input) {
  const raw = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("DVL") ? raw.slice(3) : raw;
  return body.length === 8 ? `DVL-${body.slice(0, 4)}-${body.slice(4)}` : null;
}

// Emite os certificados que a pessoa já merece e ainda não tem. É idempotente: pode ser chamada
// quantas vezes quiser (depois de cada acerto, ao abrir a tela de cursos). Devolve só os novos:
// [{ course, level, code }]. `courseIds` limita a conferência a alguns cursos.
function sync(userId, { courseIds = null, now = new Date() } = {}) {
  const issued = [];
  const solved = db.getSolved(userId);
  for (const course of list) {
    if (courseIds && !courseIds.includes(course.id)) continue;
    for (const row of progress(userId, course, solved)) {
      if (!row.done || row.certificate) continue;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        if (db.addCertificate({ code, userId, courseId: course.id, level: row.level.id, now })) {
          issued.push({ course, level: row.level, code });
          break;
        }
        // addCertificate também devolve false se a pessoa já tem esse certificado (corrida entre
        // duas respostas); nesse caso não há o que emitir.
        if (db.getCertificate(userId, course.id, row.level.id)) break;
      }
    }
  }
  return issued;
}

// Certificados da pessoa já com o curso e o nível (ignora os de cursos que deixaram de existir).
function certificatesOf(userId) {
  return db
    .getCertificates(userId)
    .map((cert) => ({ ...cert, course: get(cert.courseId), level: challenges.DIFFICULTIES.find((l) => l.id === cert.level) }))
    .filter((cert) => cert.course && cert.level);
}

// ---------- nome no certificado ----------

// Só letras (com acento), espaço, ponto, apóstrofo e hífen; até 40 caracteres. Devolve "" se sobrar menos de 2.
function cleanName(raw) {
  const name = String(raw ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\s.'’-]/gu, "") // remove o que não é letra (emoji, números, símbolos), sem deixar buraco
    .replace(/\s+/g, " ")
    .trim();
  const cut = [...name].slice(0, 40).join("").trim();
  return [...cut].length >= 2 ? cut : "";
}

// Nome que sai no certificado: o que a pessoa definiu; se ainda não definiu, o do Discord
// (limpo), que fica guardado para ela poder trocar depois. Nunca vazio.
function nameFor(userId, discordName) {
  const saved = db.getCertificateName(userId);
  if (saved) return saved;
  const fallback = cleanName(discordName);
  if (fallback) db.setCertificateName(userId, fallback);
  return fallback || "Estudante";
}

// Nomes dos módulos, na ordem do curso (aparecem no certificado).
const moduleLabels = (course) => course.modules.map(topicLabel);

// O próximo módulo a praticar: o primeiro ainda não concluído do menor nível ainda não concluído.
function nextStep(rows) {
  const row = rows.find((r) => !r.done);
  const mod = row?.modules.find((m) => !m.done);
  return row && mod ? { levelId: row.level.id, levelLabel: row.level.label, topicId: mod.topicId, label: mod.label } : null;
}

// Cursos que têm o assunto como módulo.
const byTopic = (topicId) => list.filter((c) => c.modules.includes(topicId));

// Uma linha de progresso para mostrar junto da resposta: o primeiro curso que contém o desafio,
// no nível dele. null se o assunto não faz parte de nenhum curso.
function hint(userId, challenge) {
  const course = byTopic(challenge.topic.id)[0];
  if (!course) return null;
  const row = progress(userId, course).find((r) => r.level.id === challenge.difficulty);
  if (!row) return null;
  const mod = row.modules.find((m) => m.topicId === challenge.topic.id);
  return { course, level: row.level, doneModules: row.doneModules, total: row.total, module: mod, certified: Boolean(row.certificate) };
}

module.exports = {
  list,
  get,
  needed,
  levelsOf,
  progress,
  sync,
  certificatesOf,
  newCode,
  normalizeCode,
  cleanName,
  nameFor,
  moduleLabels,
  nextStep,
  byTopic,
  hint,
};
