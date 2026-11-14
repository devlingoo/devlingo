// Demo interativo da página inicial: mostra como o bot responde, com perguntas REAIS do banco do Devlingo.
// Regras de segurança: nada de innerHTML, eval ou criação de script. Tudo é montado com createElement e textContent, o que
// também satisfaz a regra de Trusted Types da CSP (require-trusted-types-for 'script').

interface DemoChallenge {
  id: string;
  topic: string;
  level: [string, string];
  question: string;
  code: string;
  options: string[];
  answer: number;
  explanation: string;
}

const LETTERS = "ABCD";
const GOAL = 5;

const root = document.getElementById("demo");
if (root?.dataset["challenges"]) {
  start(root, JSON.parse(root.dataset["challenges"]) as DemoChallenge[]);
}

function part<T extends HTMLElement = HTMLElement>(root: HTMLElement, name: string): T {
  const found = root.querySelector<T>(`[data-role="${name}"]`);
  if (!found) throw new Error(`demo: elemento ausente: ${name}`);
  return found;
}

// Texto com `código` e **negrito** (o que o Discord mostra), montado sem innerHTML.
function inline(target: HTMLElement, text: string): void {
  target.replaceChildren();
  for (const piece of text.split(/(`[^`]+`|\*\*[^*]+\*\*)/)) {
    if (!piece) continue;
    if (piece.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = piece.slice(1, -1);
      target.append(code);
    } else if (piece.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = piece.slice(2, -2);
      target.append(strong);
    } else {
      target.append(piece);
    }
  }
}

const bar = (value: number, max: number, size: number): string => {
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return "▰".repeat(filled) + "▱".repeat(size - filled);
};

function start(root: HTMLElement, challenges: DemoChallenge[]): void {
  if (challenges.length === 0) return;
  const el = {
    card: part(root, "card"),
    title: part(root, "title"),
    level: part(root, "level"),
    question: part(root, "question"),
    code: part(root, "code"),
    options: part(root, "options"),
    hint: part(root, "hint"),
    result: part(root, "result"),
    verdict: part(root, "verdict"),
    explanation: part(root, "explanation"),
    party: part(root, "party"),
    footer: part(root, "footer"),
    next: part<HTMLButtonElement>(root, "next"),
  };
  const state = { index: 0, answered: 0, xp: 0, streak: 1, done: false, goalPaid: false };
  const current = (): DemoChallenge => challenges[state.index % challenges.length] as DemoChallenge;

  function show(): void {
    const challenge = current();
    state.done = false;
    el.title.textContent = `🧩 ${challenge.topic}`;
    el.level.textContent = `Nível: ${challenge.level[0]} ${challenge.level[1]}`;
    inline(el.question, challenge.question);
    el.code.textContent = challenge.code;
    (el.code.parentElement as HTMLElement).hidden = challenge.code === "";
    el.options.replaceChildren(
      ...challenge.options.map((text, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "opt";
        button.textContent = `${LETTERS[index]}) ${text}`;
        button.setAttribute("aria-keyshortcuts", LETTERS[index] ?? "");
        button.addEventListener("click", () => answer(index));
        return button;
      }),
    );
    el.card.className = "card";
    el.result.hidden = true;
    el.hint.hidden = false;
  }

  function answer(chosen: number): void {
    if (state.done) return;
    state.done = true;
    const challenge = current();
    const correct = chosen === challenge.answer;
    state.answered++;
    if (correct) state.xp += 10;

    const goalNow = state.answered >= GOAL && !state.goalPaid;
    if (goalNow) {
      state.goalPaid = true;
      state.xp += 15;
    }

    el.options.querySelectorAll("button").forEach((button, index) => {
      button.disabled = true;
      if (index === challenge.answer) button.classList.add("right");
      else if (index === chosen) button.classList.add("wrong");
    });
    el.card.className = `card ${goalNow ? "gold" : correct ? "ok" : "bad"}`;

    el.verdict.replaceChildren();
    if (correct) {
      el.verdict.append("✅ ", Object.assign(document.createElement("strong"), { textContent: "Acertou!" }), " +10 XP");
    } else {
      el.verdict.append("❌ ", Object.assign(document.createElement("strong"), { textContent: "Errou!" }), " A resposta certa era ", Object.assign(document.createElement("strong"), { textContent: LETTERS[challenge.answer] ?? "" }), ".");
    }
    inline(el.explanation, `💡 ${challenge.explanation}`);

    el.party.replaceChildren();
    el.party.hidden = !goalNow;
    if (goalNow) el.party.append("🎯 ", Object.assign(document.createElement("strong"), { textContent: "Meta do dia cumprida!" }), " +15 XP");

    const level = Math.floor(state.xp / 100) + 1;
    const done = Math.min(state.answered, GOAL);
    const line = (text: string): HTMLSpanElement => Object.assign(document.createElement("span"), { textContent: text });
    el.footer.replaceChildren(line(`⭐ ${state.xp} XP • 🌱 Nível ${level} • 🔥 ${state.streak} dia`), line(`🎯 Meta do dia: ${bar(done, GOAL, 5)} ${done}/${GOAL}${done >= GOAL ? " ✅" : ""}`));

    el.result.hidden = false;
    el.hint.hidden = true;
    el.next.focus({ preventScroll: true });
  }

  el.next.addEventListener("click", () => {
    state.index++;
    show();
  });

  // Atalho de teclado: A, B, C ou D escolhem a alternativa (como os botões do Discord, mas pelo teclado).
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || state.done) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const index = LETTERS.indexOf(event.key.toUpperCase());
    if (index >= 0 && index < current().options.length && event.key.length === 1) answer(index);
  });

  show();
}
