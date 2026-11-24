// Editor animado da página inicial: "digita", linha por linha e com cursor, os trechos de código que o HTML já traz COMPLETOS
// e coloridos (o colorizador roda no build: veja lib/highlight.ts).
//
// Segurança: só mexe em textContent e em classes. Nada de innerHTML, eval, estilo inline nem timer com texto: é o que a CSP
// com Trusted Types exige (e a auditoria do build confere).
// Acessibilidade: o texto da tela é aria-hidden (quem usa leitor de tela lê a cópia .sr, que não muda); há um botão para parar a
// animação; quem pede menos movimento não vê nada digitando sozinho; a digitação pausa quando o editor sai da tela ou a aba é
// escondida; passa pelos arquivos uma vez só e para; e o cursor para de piscar uns segundos depois de terminar.

interface Piece {
  el: HTMLElement;
  text: string;
  line: number;
  start: number;
}
// Um passo = uma letra digitada. `enter` é quantas linhas foram puladas antes dela (uma pausa de "Enter" por linha).
interface Step {
  pos: number;
  line: number;
  enter: number;
}
interface Panel {
  tab: HTMLButtonElement;
  panel: HTMLElement;
  lines: HTMLElement[];
  pieces: Piece[];
  steps: Step[];
  total: number;
}

const HOLD_MS = 4200; // o código pronto fica na tela antes de passar ao próximo arquivo
const START_MS = 500; // pausa antes da primeira letra
const CARET_MS = 5000; // o cursor pisca por este tempo depois de terminar, e então fica parado

const root = document.getElementById("editor");
if (root) setup(root);

function part<T extends HTMLElement = HTMLElement>(from: HTMLElement, name: string): T {
  const found = from.querySelector<T>(`[data-role="${name}"]`);
  if (!found) throw new Error(`editor: elemento ausente: ${name}`);
  return found;
}

function build(tab: HTMLButtonElement): Panel {
  const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
  if (!panel) throw new Error("editor: painel ausente");
  const lines = Array.from(panel.querySelectorAll<HTMLElement>(".line"));
  let start = 0;
  const pieces = Array.from(panel.querySelectorAll<HTMLElement>(".tk")).map((el): Piece => {
    const text = el.textContent ?? "";
    const piece = { el, text, line: lines.indexOf(el.parentElement as HTMLElement), start };
    start += text.length;
    return piece;
  });

  // O recuo do começo da linha (classe w) entra de uma vez, como o recuo automático de uma IDE; o resto, letra por letra.
  const steps: Step[] = [];
  let lastLine = -1;
  for (const piece of pieces) {
    const enter = piece.line === lastLine ? 0 : piece.line - lastLine;
    lastLine = piece.line;
    if (piece.el.classList.contains("w")) {
      steps.push({ pos: piece.start + piece.text.length, line: piece.line, enter });
      continue;
    }
    for (let n = 1; n <= piece.text.length; n++) steps.push({ pos: piece.start + n, line: piece.line, enter: n === 1 ? enter : 0 });
  }
  return { tab, panel, lines, pieces, steps, total: start };
}

function setup(root: HTMLElement): void {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = tabs.map(build);
  if (panels.length === 0) return;
  const toggle = part<HTMLButtonElement>(root, "toggle");
  const position = part(root, "pos");
  const language = part(root, "lang");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  let current = 0;
  let step = 0;
  let timer = 0;
  let phase: "idle" | "typing" | "holding" = "idle";
  let animate = !reduce.matches; // o botão liga e desliga
  let auto = true; // passa sozinho de um arquivo ao outro (até a pessoa escolher um)
  let started = false; // só começa a digitar quando o editor aparece na tela
  let visible = false;
  const shown = new Set<number>();
  let caret: HTMLElement | null = null;
  let active: HTMLElement | null = null;

  const here = (): Panel => panels[current] as Panel;
  const stop = (): void => {
    window.clearTimeout(timer);
    timer = 0;
  };
  const later = (fn: () => void, ms: number): void => {
    stop();
    timer = window.setTimeout(fn, ms);
  };
  const label = (): void => {
    toggle.textContent = animate ? "Parar animação" : "Reproduzir animação";
  };

  function mark(next: HTMLElement | null, line: HTMLElement | null): void {
    if (caret !== next) {
      caret?.classList.remove("caret");
      next?.classList.add("caret");
      caret = next;
    }
    if (active !== line) {
      active?.classList.remove("on");
      line?.classList.add("on");
      active = line;
    }
  }

  // Mostra as primeiras `upTo` letras do arquivo, com o cursor logo depois da última.
  function paint(p: Panel, upTo: number, withCaret: boolean): void {
    let last: Piece | undefined;
    for (const piece of p.pieces) {
      const n = Math.max(0, Math.min(piece.text.length, upTo - piece.start));
      const text = n === piece.text.length ? piece.text : piece.text.slice(0, n);
      if (piece.el.textContent !== text) piece.el.textContent = text;
      if (n > 0) last = piece;
    }
    const line = last ? last.line : 0;
    const col = p.pieces.filter((piece) => piece.line === line).reduce((sum, piece) => sum + Math.max(0, Math.min(piece.text.length, upTo - piece.start)), 0) + 1;
    position.textContent = `Ln ${line + 1}, Col ${col}`;
    mark(withCaret ? (last ? last.el : (p.lines[0] ?? null)) : null, withCaret ? (p.lines[line] ?? null) : null);
  }

  const rest = (): void => {
    stop();
    phase = "idle";
    paint(here(), here().total, false);
  };

  function finish(): void {
    const p = here();
    phase = "holding";
    shown.add(current);
    p.panel.classList.add("done");
    paint(p, p.total, true);
    if (auto && animate && shown.size < panels.length) {
      later(() => select((current + 1) % panels.length, false), HOLD_MS);
    } else {
      later(() => {
        phase = "idle";
        mark(null, null);
      }, CARET_MS);
    }
  }

  function tick(): void {
    const p = here();
    const now = p.steps[step];
    if (!now) return finish();
    step++;
    paint(p, now.pos, true);
    const next = p.steps[step];
    if (!next) return later(finish, 380);
    let wait = 24 + Math.random() * 34;
    if (next.enter > 0) {
      wait += next.enter * (170 + Math.random() * 110);
      mark(p.lines[next.line] ?? null, p.lines[next.line] ?? null); // o cursor vai para a linha nova enquanto a pessoa "pensa"
    }
    later(tick, wait);
  }

  function type(): void {
    const p = here();
    p.panel.classList.remove("done");
    started = true;
    phase = "typing";
    step = 0;
    paint(p, 0, true);
    later(tick, START_MS);
  }

  function select(index: number, user: boolean): void {
    stop();
    current = index;
    if (user) auto = false;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      const panel = panels[i];
      if (panel) panel.panel.hidden = i !== index;
    });
    language.textContent = tabs[index]?.dataset["label"] ?? "";
    if (animate) type();
    else rest();
  }

  // Digitando só enquanto dá para ver: fora da tela ou com a aba escondida, tudo fica parado.
  function sync(): void {
    stop();
    if (!animate || !visible || document.hidden) return;
    if (!started) type();
    else if (phase === "typing") later(tick, 150);
    else if (phase === "holding") later(finish, 600);
  }

  tabs.forEach((tab, i) => tab.addEventListener("click", () => select(i, true)));
  root.querySelector('[role="tablist"]')?.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    const last = tabs.length - 1;
    const from = tabs.findIndex((tab) => tab.tabIndex === 0);
    const to = key === "ArrowRight" ? (from + 1) % tabs.length : key === "ArrowLeft" ? (from + last) % tabs.length : key === "Home" ? 0 : key === "End" ? last : -1;
    if (to < 0) return;
    event.preventDefault();
    select(to, true);
    tabs[to]?.focus();
  });

  toggle.addEventListener("click", () => {
    animate = !animate;
    label();
    visible = true;
    if (animate) {
      auto = false;
      type();
    } else {
      rest();
    }
  });
  reduce.addEventListener("change", () => {
    if (reduce.matches && animate) toggle.click();
  });
  document.addEventListener("visibilitychange", sync);

  label();
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    }, { threshold: 0.3 }).observe(root);
  } else {
    visible = true;
    sync();
  }
}
