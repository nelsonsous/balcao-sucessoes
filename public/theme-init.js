// Aplica o tema guardado antes do primeiro render (evita o "flash").
// Ficheiro externo para cumprir a Content Security Policy (sem scripts inline).
try {
  var t = localStorage.getItem('bs-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
