// Aplica o tema escolhido antes da primeira pintura, para a página não piscar. Arquivo externo e do próprio domínio
// (a CSP não aceita script inline). A lógica do botão está em src/scripts/theme.ts.
try {
  var saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
} catch (e) {
  /* sem armazenamento: segue o tema do sistema */
}
