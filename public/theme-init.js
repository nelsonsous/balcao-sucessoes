// Aplica o tema guardado antes do primeiro render (evita o "flash").
// Ficheiro externo para cumprir a Content Security Policy (sem scripts inline).
try {
  var t = localStorage.getItem('bs-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
// Acessibilidade: animações reduzidas e alto contraste escolhidos nas Definições.
try {
  var a = JSON.parse(localStorage.getItem('bs-a11y') || '{}');
  if (a.motion === 'reduzido') document.documentElement.classList.add('reduce-motion');
  if (a.contrast === 'alto') document.documentElement.dataset.contrast = 'more';
} catch (e) {}
