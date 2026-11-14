// Botão de tema: alterna entre automático (segue o sistema), claro e escuro. A escolha fica só no navegador (localStorage).
// A aplicação inicial do tema, antes da primeira pintura, é feita por public/theme-init.js.
type Choice = "auto" | "light" | "dark";
const ORDER: Choice[] = ["auto", "light", "dark"];
const LABEL: Record<Choice, string> = { auto: "automático", light: "claro", dark: "escuro" };

const button = document.getElementById("theme-toggle");

function read(): Choice {
  try {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? saved : "auto";
  } catch {
    return "auto"; // navegação privada ou armazenamento bloqueado
  }
}

function apply(choice: Choice): void {
  if (choice === "auto") delete document.documentElement.dataset["theme"];
  else document.documentElement.dataset["theme"] = choice;
  // O nome acessível é o próprio texto visível (WCAG 2.5.3, rótulo no nome): sem aria-label diferente dele.
  if (button) button.textContent = `Tema: ${LABEL[choice]}`;
}

let choice = read();
apply(choice);

button?.addEventListener("click", () => {
  choice = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? "auto";
  apply(choice);
  try {
    if (choice === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", choice);
  } catch {
    /* sem armazenamento: o tema vale só até recarregar */
  }
});
