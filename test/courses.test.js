const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ChannelType, MessageFlags } = require("discord.js");
const { TYPE, flatten, customIds, fakeInteraction, assertWithinDiscordLimits } = require("./helpers");

const config = require("../src/config");
const db = require("../src/utils/db");
const challenges = require("../src/utils/challenges");
const courses = require("../src/utils/courses");
const courseUi = require("../src/utils/courseUi");
const views = require("../src/utils/views");
const certificate = require("../src/utils/certificate");
const loadCommands = require("../src/handlers/commandHandler");
const buttonHandler = require("../src/handlers/buttonHandler");
const messageCreate = require("../src/events/messageCreate");

const client = Object.assign(new EventEmitter(), {
  user: { id: "1", toString: () => "<@1>" },
  users: { fetch: async (id) => ({ username: `usuario-${id}` }) },
});
loadCommands(client);
buttonHandler.load(client);

const OWNER = "800";
const originalCooldown = config.cooldownMs;
test.beforeEach(() => {
  config.coursePassPercent = 75;
  config.cooldownMs = 0; // os testes mandam vários comandos seguidos da mesma pessoa
  db.open(":memory:");
});
test.after(() => {
  config.cooldownMs = originalCooldown;
  db.close();
});

const ids = (topicId, level) => challenges.list.filter((c) => c.topic.id === topicId && c.difficulty === level).map((c) => c.id);
const solveEnough = (userId, topicId, level, extra = 0) => {
  const pool = ids(topicId, level);
  pool.slice(0, courses.needed(pool.length) + extra).forEach((id) => db.markSolved(userId, id));
};
const textOf = (components) => flatten(components).filter((n) => n.type === TYPE.TextDisplay).map((n) => n.content).join("\n");
const CODE = /^DVL-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
const png = (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

// ---------- dados dos cursos ----------

test("todos os cursos têm módulos que existem e geram certificado nos quatro níveis", () => {
  assert.ok(courses.list.length >= 4);
  for (const course of courses.list) {
    assert.deepEqual(courses.levelsOf(course).map((l) => l.id), ["beginner", "intermediate", "advanced", "expert"], course.id);
    for (const topicId of course.modules) assert.ok(challenges.list.some((c) => c.topic.id === topicId), `${course.id}/${topicId}`);
  }
});

test("todo assunto com desafios faz parte de pelo menos um curso (senão ninguém ganharia certificado dele)", () => {
  const inCourses = new Set(courses.list.flatMap((c) => c.modules));
  for (const topicId of new Set(challenges.list.map((c) => c.topic.id))) {
    assert.ok(inCourses.has(topicId), `o assunto "${topicId}" não está em nenhum curso de src/data/courses.json`);
  }
});

// ---------- progresso ----------

test("um módulo conclui com 75% das perguntas DIFERENTES: repetir a mesma ou errar não conta", () => {
  const course = courses.get("git");
  const pool = ids("git-versioning", "beginner");
  const need = courses.needed(pool.length);
  assert.equal(need, Math.ceil(pool.length * 0.75));
  const row = () => courses.progress(OWNER, course)[0];

  // Acertar a MESMA pergunta várias vezes vale uma só.
  for (let i = 0; i < 6; i++) db.recordAnswer(OWNER, null, true, 10, new Date(), { challengeId: pool[0] });
  assert.equal(row().modules[0].solved, 1);

  // Errar não conta (e não desfaz o que já foi acertado).
  db.recordAnswer(OWNER, null, false, 10, new Date(), { challengeId: pool[1] });
  db.recordAnswer(OWNER, null, false, 10, new Date(), { challengeId: pool[0] });
  assert.equal(row().modules[0].solved, 1);

  // Até faltar uma para o mínimo: ainda não concluiu.
  pool.slice(1, need - 1).forEach((id) => db.markSolved(OWNER, id));
  assert.equal(row().modules[0].done, false);
  db.markSolved(OWNER, pool[need - 1]);
  assert.equal(row().modules[0].done, true);
  assert.equal(row().done, true, "curso de um módulo só: o nível fecha junto");
});

test("COURSE_PASS_PERCENT muda o mínimo; 100% exige todas as perguntas", () => {
  config.coursePassPercent = 100;
  assert.equal(courses.needed(4), 4);
  config.coursePassPercent = 50;
  assert.equal(courses.needed(5), 3);
  assert.equal(courses.needed(1), 1, "nunca menos de uma pergunta");
});

test("curso com vários módulos só fecha o nível quando TODOS passam", () => {
  const course = courses.get("javascript");
  solveEnough(OWNER, "javascript-fundamentals", "beginner");
  solveEnough(OWNER, "javascript-functions", "beginner");
  assert.deepEqual(courses.sync(OWNER), [], "falta o módulo de arrays");
  solveEnough(OWNER, "javascript-arrays", "beginner");

  const issued = courses.sync(OWNER);
  assert.equal(issued.length, 1);
  assert.equal(issued[0].course.id, "javascript");
  assert.equal(issued[0].level.id, "beginner");
  assert.match(issued[0].code, CODE);
  assert.equal(courses.progress(OWNER, course)[0].done, true);
  assert.equal(courses.progress(OWNER, course)[1].done, false, "o intermediário continua aberto");
});

// ---------- emissão de certificados ----------

test("sync é idempotente, gera um certificado por curso e nível, e códigos únicos", () => {
  solveEnough(OWNER, "git-versioning", "beginner");
  solveEnough(OWNER, "git-versioning", "intermediate");
  const first = courses.sync(OWNER);
  assert.deepEqual(first.map((c) => c.level.id).sort(), ["beginner", "intermediate"]);
  assert.deepEqual(courses.sync(OWNER), [], "chamar de novo não emite nada");
  assert.equal(courses.certificatesOf(OWNER).length, 2);
  assert.equal(new Set(first.map((c) => c.code)).size, 2);

  const codes = new Set();
  for (let i = 0; i < 3000; i++) codes.add(courses.newCode());
  assert.equal(codes.size, 3000, "sem colisão em 3 mil códigos");
  assert.ok([...codes].every((c) => CODE.test(c)));
});

test("courseIds limita a conferência; certificados de outra pessoa não se misturam", () => {
  solveEnough(OWNER, "git-versioning", "beginner");
  solveEnough("outra", "sql-queries", "beginner");
  assert.deepEqual(courses.sync(OWNER, { courseIds: ["sql"] }), []);
  assert.equal(courses.sync(OWNER, { courseIds: ["git"] }).length, 1);
  assert.equal(courses.sync("outra").length, 1);
  assert.equal(courses.certificatesOf(OWNER).length, 1);
  assert.equal(courses.certificatesOf("outra")[0].course.id, "sql");
});

test("colisão de código: tenta outro, e quem já tem o certificado não ganha um segundo", () => {
  solveEnough(OWNER, "git-versioning", "beginner");
  const real = db.addCertificate;
  let calls = 0;
  const seen = [];
  db.addCertificate = (args) => {
    calls++;
    seen.push(args.code);
    return calls === 1 ? false : real(args); // a 1ª tentativa "colide"
  };
  try {
    const issued = courses.sync(OWNER);
    assert.equal(issued.length, 1);
    assert.equal(calls, 2);
    assert.notEqual(seen[0], seen[1], "o segundo código é outro");
  } finally {
    db.addCertificate = real;
  }
  assert.deepEqual(courses.sync(OWNER), []);
});

test("verificar: normaliza o que a pessoa digita e acha o certificado", () => {
  solveEnough(OWNER, "git-versioning", "beginner");
  const [{ code }] = courses.sync(OWNER);
  for (const typed of [code, code.toLowerCase(), code.replaceAll("-", " "), code.replace("DVL-", ""), `  ${code}  `]) {
    assert.equal(courses.normalizeCode(typed), code, typed);
    assert.equal(db.findCertificate(courses.normalizeCode(typed)).userId, OWNER);
  }
  assert.equal(courses.normalizeCode("xx"), null);
  assert.equal(courses.normalizeCode(""), null);
  assert.equal(courses.normalizeCode(undefined), null);
  assert.equal(db.findCertificate("DVL-0000-0000"), null);
});

// ---------- nome no certificado ----------

test("o nome do certificado só tem letras, sem emoji nem números, e a pessoa pode trocá-lo", () => {
  assert.equal(courses.cleanName("  Ana  Maria 🎮 d4rk_  "), "Ana Maria drk");
  assert.equal(courses.cleanName("José da Silva-Sauro Jr."), "José da Silva-Sauro Jr.");
  assert.equal(courses.cleanName("🎮🎮"), "");
  assert.equal(courses.cleanName("a"), "");
  assert.equal([...courses.cleanName("A".repeat(100))].length, 40);

  assert.equal(courses.nameFor(OWNER, "xX_Dark_Xx 🎮"), "xXDarkXx", "usa o nome do Discord (limpo) enquanto ela não escolheu");
  db.setCertificateName(OWNER, "Ana Beatriz Almeida");
  assert.equal(courses.nameFor(OWNER, "outro apelido"), "Ana Beatriz Almeida", "o que ela escolheu vence");
  assert.equal(courses.nameFor("sem-nome", "🎮"), "Estudante", "nunca fica vazio");
});

// ---------- memória de perguntas e sorteio ----------

test("o banco lembra cada pergunta: quando foi vista e se já foi acertada, sem desfazer o acerto", () => {
  const [a, b] = ids("git-versioning", "beginner");
  db.recordAnswer(OWNER, null, false, 10, new Date(1000), { challengeId: a });
  db.recordAnswer(OWNER, null, true, 10, new Date(2000), { challengeId: b });
  db.recordAnswer(OWNER, null, true, 10, new Date(3000), { challengeId: a });
  db.recordAnswer(OWNER, null, false, 10, new Date(4000), { challengeId: a });

  assert.deepEqual([...db.getSeen(OWNER)], [[a, { lastAt: 4000, solved: true }], [b, { lastAt: 2000, solved: true }]]);
  assert.deepEqual([...db.getSolved(OWNER)].sort(), [a, b].sort());
});

test("sorteio evita repetir: nunca vistas, depois as não acertadas, por fim as acertadas há mais tempo", () => {
  const filters = { difficulty: "beginner", topic: "git-versioning" };
  const pool = ids("git-versioning", "beginner");
  const pick = (history, exclude) => Array.from({ length: 200 }, () => challenges.random(filters, exclude, history).id);

  // Só a primeira foi vista (e acertada): nunca sai de novo enquanto houver outra nunca vista.
  const history = new Map([[pool[0], { lastAt: 1, solved: true }]]);
  assert.ok(!pick(history).includes(pool[0]));

  // Todas vistas: as não acertadas vêm antes das acertadas.
  const mixed = new Map(pool.map((id, i) => [id, { lastAt: 100 + i, solved: i !== 1 }]));
  assert.deepEqual([...new Set(pick(mixed))], [pool[1]]);

  // Todas acertadas: só a metade vista há mais tempo (revisão), nunca a mais recente.
  const allSolved = new Map(pool.map((id, i) => [id, { lastAt: 100 + i, solved: true }]));
  const picked = new Set(pick(allSolved));
  assert.ok(!picked.has(pool[pool.length - 1]), "a mais recente fica de fora");
  assert.ok(picked.has(pool[0]), "a mais antiga volta");

  // A que acabou de sair é excluída, e sem histórico continua sorteando tudo.
  assert.ok(!pick(allSolved, pool[0]).includes(pool[0]));
  assert.equal(new Set(pick(undefined)).size, pool.length);
});

// ---------- migração ----------

test("banco da versão 3 é migrado para a 4 sem perder dados", () => {
  const { DatabaseSync } = require("node:sqlite");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devlingo-mig-"));
  const file = path.join(dir, "devlingo.db");
  try {
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
        last_day TEXT, daily_day TEXT, daily_xp INTEGER NOT NULL DEFAULT 0, level TEXT, areas TEXT,
        best_streak INTEGER NOT NULL DEFAULT 0, answered INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0,
        expert_correct INTEGER NOT NULL DEFAULT 0, combo INTEGER NOT NULL DEFAULT 0, best_combo INTEGER NOT NULL DEFAULT 0,
        goal_day TEXT, goal_count INTEGER NOT NULL DEFAULT 0, goal_done_days INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE guild_xp (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, user_id));
      CREATE TABLE achievements (user_id TEXT NOT NULL, key TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY (user_id, key));
      INSERT INTO users (id, xp, streak, last_day, level, areas, answered, correct) VALUES ('velha', 90, 3, '2026-11-09', 'beginner', 'devops', 12, 9);
      INSERT INTO achievements VALUES ('velha', 'first', 1);
      PRAGMA user_version = 3;
    `);
    old.close();

    db.open(file);
    assert.equal(db.getUser("velha").xp, 90);
    assert.deepEqual(db.getPreferences("velha"), { level: "beginner", areas: ["devops"] });
    assert.deepEqual(db.getAchievements("velha"), ["first"]);
    assert.equal(db.getStats("velha").answered, 12);
    assert.equal(db.getSeen("velha").size, 0, "o histórico de perguntas começa vazio");
    assert.deepEqual(db.getCertificates("velha"), []);
    assert.equal(db.getCertificateName("velha"), null);
    db.recordAnswer("velha", null, true, 10, new Date(), { challengeId: ids("git-versioning", "beginner")[0] });
    assert.equal(db.getSolved("velha").size, 1);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- a imagem ----------

test("o certificado é um PNG 1600x1131, diferente para cada nome, e protege contra nomes estranhos", () => {
  const base = { courseName: "Git na prática", levelId: "beginner", levelLabel: "Iniciante", modules: ["Git e versionamento"], issuedAt: new Date("2026-11-10T15:00:00Z"), code: "DVL-7K3M-9QXA" };
  const a = certificate.renderCertificate({ ...base, name: "Ana Beatriz Almeida" });
  const b = certificate.renderCertificate({ ...base, name: "Bruno Carvalho" });
  assert.ok(png(a) && png(b));
  assert.equal(a.readUInt32BE(16), certificate.WIDTH);
  assert.equal(a.readUInt32BE(20), certificate.HEIGHT);
  assert.notDeepEqual(a, b);
  assert.deepEqual(a, certificate.renderCertificate({ ...base, name: "Ana Beatriz Almeida" }), "mesma entrada, mesma imagem");

  // Nomes e cursos absurdos não quebram nem estouram.
  for (const name of ["", "🎮🎮🎮", "家族", "A".repeat(500), "Maria Fernanda de Albuquerque Cavalcanti Nascimento Souza"]) {
    assert.ok(png(certificate.renderCertificate({ ...base, name })), JSON.stringify(name));
  }
  assert.ok(png(certificate.renderCertificate({ ...base, name: "Ana", courseName: "X".repeat(300), modules: Array(8).fill("Um módulo com nome bem comprido") })));
  for (const levelId of ["intermediate", "advanced", "expert", "inexistente"]) {
    assert.ok(png(certificate.renderCertificate({ ...base, name: "Ana", levelId, levelLabel: "Nível" })));
  }
});

test("o texto do certificado só usa caracteres que a fonte sabe desenhar", () => {
  const { black } = certificate.loadFonts();
  assert.equal(certificate.drawable(black, "João 🎮 Pereira"), "João Pereira");
  assert.equal(certificate.drawable(black, "Ação  de   verão"), "Ação de verão");
  assert.equal(certificate.drawable(black, "🎮"), "");
  const svg = certificate.certificateSvg({ name: "<script>alert(1)</script> & Cia", courseName: "A&B", levelId: "expert", levelLabel: "Especialista", modules: ["x"], issuedAt: new Date(), code: "DVL-AAAA-BBBB" });
  assert.ok(!svg.includes("<script"), "o nome vira curva: nunca entra como texto no SVG");
  assert.match(svg, /<title>Certificado: A&#38;B \(Especialista\)<\/title>/, "o título escapa & e < para o XML continuar válido");
  // E a imagem sai mesmo com `&` e `<` no nome do curso.
  const tricky = { name: "Ana", levelId: "expert", levelLabel: "Especialista", modules: ["x"], issuedAt: new Date(), code: "DVL-AAAA-BBBB" };
  assert.ok(png(certificate.renderCertificate({ ...tricky, courseName: "R&D <b>\"aspas\"</b> 'x'" })));
});

// ---------- telas ----------

test("as telas de cursos e certificados respeitam os limites do Discord, vazias e cheias", () => {
  const empty = views.courses(OWNER);
  assertWithinDiscordLimits(empty, "cursos (vazio)", assert);
  for (const course of courses.list) {
    const detail = views.courseDetail(OWNER, course.id);
    assertWithinDiscordLimits(detail, `curso ${course.id}`, assert);
  }
  assertWithinDiscordLimits(views.certificates(OWNER, "Ana"), "certificados (vazio)", assert);
  assert.equal(views.courseDetail(OWNER, "inexistente"), null);

  // Cheio: todos os cursos, todos os níveis.
  for (const c of challenges.list) db.markSolved(OWNER, c.id);
  const issued = courses.sync(OWNER);
  assert.equal(issued.length, courses.list.length * 4);
  assertWithinDiscordLimits(views.courses(OWNER), "cursos (cheio)", assert);
  assertWithinDiscordLimits(views.certificates(OWNER, "Ana"), "certificados (cheio)", assert);
  for (const course of courses.list) assertWithinDiscordLimits(views.courseDetail(OWNER, course.id), `curso ${course.id} (cheio)`, assert);

  const menu = flatten(views.certificates(OWNER, "Ana")).find((n) => n.type === TYPE.StringSelect);
  assert.ok(menu.options.length <= 25, "o menu cabe 25 opções");
});

test("a tela de um curso aponta o próximo módulo a praticar e some quando tudo foi concluído", () => {
  const first = views.courseDetail(OWNER, "javascript");
  assert.ok(customIds(first).includes(`learn:go:${OWNER}:beginner:javascript-fundamentals`));

  solveEnough(OWNER, "javascript-fundamentals", "beginner");
  assert.ok(customIds(views.courseDetail(OWNER, "javascript")).includes(`learn:go:${OWNER}:beginner:javascript-functions`));

  for (const c of challenges.list.filter((x) => courses.get("javascript").modules.includes(x.topic.id))) db.markSolved(OWNER, c.id);
  courses.sync(OWNER);
  const done = views.courseDetail(OWNER, "javascript");
  assert.ok(!customIds(done).some((id) => id.startsWith("learn:go:")));
  assert.match(textOf(done), /concluiu todos os níveis/);
});

test("a mensagem do certificado traz a imagem em anexo, o código e como verificar", () => {
  solveEnough(OWNER, "git-versioning", "beginner");
  const [{ code }] = courses.sync(OWNER);
  const view = views.certificateView(OWNER, code, "Ana Souza");
  assert.equal(view.files.length, 1);
  assert.ok(png(view.files[0].attachment));
  assert.equal(view.files[0].name, "certificado-git-beginner.png");
  assert.ok(flatten(view.components).some((n) => n.type === 12 && n.items[0].media.url === `attachment://${view.files[0].name}`));
  assert.match(textOf(view.components), new RegExp(`verificar ${code}`));
  assert.equal(views.certificateView("outra-pessoa", code, "X"), null, "ninguém vê o certificado de outra pessoa");
  assert.equal(views.certificateView(OWNER, "DVL-0000-0000", "X"), null);
});

test("nome malicioso nunca vira link nem menção nas telas de certificado", () => {
  const evil = "[Ganhe Nitro](https://golpe.example)";
  db.setCertificateName(OWNER, "Ana");
  const card = courseUi.verifyCard({ cert: { course: courses.get("git"), level: challenges.DIFFICULTIES[0], issuedAt: Date.now(), code: "DVL-AAAA-BBBB" }, code: "x", name: evil });
  assert.doesNotMatch(textOf(card), /(?<!\\)\[[^\]]*\]\(/);
  const bad = courseUi.verifyCard({ cert: null, code: "<@123> [x](https://golpe.example)", name: null });
  assert.doesNotMatch(textOf(bad), /(?<!\\)\[[^\]]*\]\(|(?<!\\)<@/);
});

// ---------- do acerto ao certificado, pelos botões ----------

async function answerCorrectly(userId, topicId, level, messageId) {
  const solved = db.getSolved(userId);
  const ch = challenges.list.find((c) => c.topic.id === topicId && c.difficulty === level && !solved.has(c.id));
  const i = fakeInteraction({ customId: `ch:${ch.id}:${ch.answer}:${userId}:${Date.now().toString(36)}:s`, userId, kind: "button", messageId });
  await buttonHandler.handle(client, i);
  return i.calls.at(-1);
}

test("a resposta que fecha o nível comemora o certificado e oferece o botão para ver", async () => {
  const pool = ids("git-versioning", "beginner");
  const need = courses.needed(pool.length);
  pool.slice(0, need - 1).forEach((id) => db.markSolved(OWNER, id));

  const call = await answerCorrectly(OWNER, "git-versioning", "beginner", "m-cert");
  const text = textOf(call.payload.components);
  assert.match(text, /Certificado conquistado:\*\* 🔀 Git na prática — Iniciante/);
  assert.match(text, /Git na prática · Iniciante: certificado conquistado ✅/);
  assert.equal(call.payload.components[0].toJSON().accent_color, config.colors.gold);

  const [cert] = courses.certificatesOf(OWNER);
  assert.ok(customIds(call.payload.components).includes(`cert:show:${OWNER}:${cert.code}`));
  assert.equal(db.getCertificateName(OWNER), "Ana", "o primeiro certificado grava o nome do Discord (limpo): quem verifica depois vê o mesmo nome");
});

test("antes de fechar o nível, a resposta mostra o progresso do curso sem certificado", async () => {
  const call = await answerCorrectly(OWNER, "javascript-functions", "intermediate", "m-prog");
  const text = textOf(call.payload.components);
  assert.match(text, /JavaScript do zero · Intermediário: 0\/3 módulos \(neste: 1\/3 perguntas diferentes\)/);
  assert.doesNotMatch(text, /Certificado conquistado/);
  assert.ok(!customIds(call.payload.components).some((id) => id.startsWith("cert:")));
});

test("botão 'Ver meu certificado' manda a imagem só para o dono, e o menu e as listas funcionam", async () => {
  solveEnough(OWNER, "git-versioning", "beginner");
  const [{ code }] = courses.sync(OWNER);

  const mine = fakeInteraction({ customId: `cert:show:${OWNER}:${code}`, userId: OWNER, kind: "button" });
  await buttonHandler.handle(client, mine);
  const reply = mine.calls[0];
  assert.equal(reply.method, "reply");
  assert.ok(reply.payload.flags & MessageFlags.Ephemeral);
  assert.ok(reply.payload.flags & MessageFlags.IsComponentsV2);
  assert.ok(png(reply.payload.files[0].attachment));

  const stranger = fakeInteraction({ customId: `cert:show:${OWNER}:${code}`, userId: "intruso", kind: "button" });
  await buttonHandler.handle(client, stranger);
  assert.equal(stranger.calls[0].payload.files, undefined, "outra pessoa não recebe a imagem");

  const fake = fakeInteraction({ customId: `cert:show:${OWNER}:DVL-0000-0000`, userId: OWNER, kind: "button" });
  await buttonHandler.handle(client, fake);
  assert.equal(fake.calls[0].payload.files, undefined);

  const pick = fakeInteraction({ customId: `cert:pick:${OWNER}`, userId: OWNER, kind: "menu", values: [code] });
  await buttonHandler.handle(client, pick);
  assert.ok(png(pick.calls[0].payload.files[0].attachment));

  const list = fakeInteraction({ customId: `cert:list:${OWNER}`, userId: OWNER, kind: "button" });
  await buttonHandler.handle(client, list);
  assert.equal(list.calls[0].method, "update");
  assert.match(textOf(list.calls[0].payload.components), /Meus certificados/);
});

test("telas de cursos: abrir um curso, voltar à lista, praticar o módulo e atalho", async () => {
  const open = fakeInteraction({ customId: `course:open:${OWNER}`, userId: OWNER, kind: "menu", values: ["sql"] });
  await buttonHandler.handle(client, open);
  assert.match(textOf(open.calls[0].payload.components), /SQL essencial/);

  const gone = fakeInteraction({ customId: `course:open:${OWNER}`, userId: OWNER, kind: "menu", values: ["inexistente"] });
  await buttonHandler.handle(client, gone);
  assert.equal(gone.calls[0].method, "reply");

  const back = fakeInteraction({ customId: `course:list:${OWNER}`, userId: OWNER, kind: "button" });
  await buttonHandler.handle(client, back);
  assert.match(textOf(back.calls[0].payload.components), /## 🎓 Cursos/);

  const other = fakeInteraction({ customId: `course:list:${OWNER}`, userId: "intruso", kind: "button" });
  await buttonHandler.handle(client, other);
  assert.equal(other.calls[0].method, "reply");

  // "Praticar" leva a uma pergunta do módulo e nível pedidos, preferindo as que ainda não foram vistas.
  const pool = ids("sql-queries", "beginner");
  pool.slice(0, pool.length - 1).forEach((id) => db.markSolved(OWNER, id));
  for (let i = 0; i < 20; i++) {
    const go = fakeInteraction({ customId: `learn:go:${OWNER}:beginner:sql-queries`, userId: OWNER, kind: "button" });
    await buttonHandler.handle(client, go);
    const chId = customIds(go.calls[0].payload.components).find((id) => id.startsWith("ch:")).split(":")[1];
    assert.equal(chId, pool[pool.length - 1], "só sobrou uma nunca vista");
  }

  const nav = fakeInteraction({ customId: `nav:${OWNER}:cursos`, userId: OWNER, kind: "button" });
  await buttonHandler.handle(client, nav);
  assert.match(textOf(nav.calls.at(-1).payload.components), /## 🎓 Cursos/);
});

// ---------- comandos ----------

function dm(authorId, content) {
  const sent = [];
  return {
    sent,
    author: { id: authorId, bot: false, displayName: "Ana Souza" },
    content,
    guildId: null,
    channel: { id: "c", type: ChannelType.DM, send: async (p) => sent.push(p) },
    react: async () => {},
  };
}

test("comandos cursos, certificados e verificar", async () => {
  solveEnough(OWNER, "git-versioning", "beginner");
  const [{ code }] = courses.sync(OWNER);

  const list = dm(OWNER, "cursos");
  await messageCreate.execute(client, list);
  assert.match(textOf(list.sent[0].components), /Git na prática/);

  const certs = dm("801", "certificados");
  await messageCreate.execute(client, certs);
  assert.match(textOf(certs.sent[0].components), /ainda não tem certificados/);

  const mine = dm("802", "certificados");
  solveEnough("802", "sql-queries", "beginner");
  courses.sync("802");
  await messageCreate.execute(client, mine);
  assert.match(textOf(mine.sent[0].components), /SQL essencial/);
  assert.match(textOf(mine.sent[0].components), /Nome nos certificados: \*\*AnaSouza\*\*|Nome nos certificados: \*\*Ana Souza\*\*/);

  const name = dm("802", "certificados nome Ana Beatriz 🎮 Almeida");
  await messageCreate.execute(client, name);
  assert.match(textOf(name.sent[0].components), /agora saem com o nome \*\*Ana Beatriz Almeida\*\*/);
  assert.equal(db.getCertificateName("802"), "Ana Beatriz Almeida");

  const emptyName = dm("802", "certificados nome 🎮🎮");
  await messageCreate.execute(client, emptyName);
  assert.match(textOf(emptyName.sent[0].components), /só com letras/);
  assert.equal(db.getCertificateName("802"), "Ana Beatriz Almeida", "nome inválido não troca o atual");

  const ok = dm("803", `verificar ${code.toLowerCase()}`);
  await messageCreate.execute(client, ok);
  assert.match(textOf(ok.sent[0].components), /Certificado válido/);
  assert.match(textOf(ok.sent[0].components), /Git na prática/);

  const bad = dm("803", "verificar DVL-0000-0000");
  await messageCreate.execute(client, bad);
  assert.match(textOf(bad.sent[0].components), /Código não encontrado/);

  const none = dm("803", "verificar");
  await messageCreate.execute(client, none);
  assert.match(textOf(none.sent[0].components), /Escreva o código/);
});

test("a ajuda lista os comandos novos e tem atalho para os cursos", async () => {
  const msg = dm("804", "ajuda");
  await messageCreate.execute(client, msg);
  const text = textOf(msg.sent[0].components);
  for (const cmd of ["cursos", "certificados", "verificar"]) assert.match(text, new RegExp(`\`${cmd}`), cmd);
  assert.ok(customIds(msg.sent[0].components).includes("nav:804:cursos"));
});
