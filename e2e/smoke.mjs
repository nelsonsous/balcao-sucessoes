// Testes ponta a ponta (smoke) com o Chrome do sistema: `npm run e2e`.
// Arranca o `vite preview` sobre a pasta dist/, percorre os fluxos principais e sai com código ≠ 0 em caso de falha.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = Number(process.env.E2E_PORT || 4187);
const BASE = `http://localhost:${PORT}/`;
const CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('E2E: Chrome não encontrado (defina CHROME_PATH).');
  process.exit(process.env.CI ? 1 : 0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const results = [];
// Depois de um passo falhado: volta ao ecrã de computador e fecha menus/folhas, para a falha não contaminar os passos seguintes.
let afterFailure = async () => {};
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failures += 1;
    results.push(`✗ ${name}: ${e.message}`);
    try {
      await afterFailure();
    } catch {
      /* ignora */
    }
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// 1) servidor de pré-visualização
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
const ready = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* ainda não */
    }
    await sleep(500);
  }
  throw new Error('vite preview não arrancou');
};

let browser;
try {
  await ready();
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--no-first-run', '--lang=pt-PT'], defaultViewport: { width: 1366, height: 900 } });
  const page = await browser.newPage();
  // Movimento reduzido: deslocamentos instantâneos (sem «scroll» suave), para os cliques não caírem a meio de uma animação.
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  // E2E_THROTTLE=4 simula uma máquina lenta (como os runners do CI) para apanhar testes instáveis.
  if (process.env.E2E_THROTTLE) await page.emulateCPUThrottling(Number(process.env.E2E_THROTTLE));
  afterFailure = async () => {
    await page.setViewport({ width: 1366, height: 900 });
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await sleep(150);
    }
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const go = async (hash, settle = 800) => {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await sleep(settle);
  };
  // Espera que o elemento deixe de se mexer (posição igual em duas leituras seguidas) antes de clicar por coordenadas.
  const settle = (sel) =>
    page.waitForFunction(
      (s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const key = `${Math.round(r.top)}:${Math.round(r.left)}:${Math.round(scrollY)}`;
        const same = window.__e2eSettle === key;
        window.__e2eSettle = key;
        return same;
      },
      { polling: 120, timeout: 8000 },
      sel,
    );
  const clickText = (sel, text) =>
    page.evaluate(
      (s, t) => {
        const el = [...document.querySelectorAll(s)].find((b) => (b.textContent || '').trim().includes(t));
        if (!el) return false;
        el.click();
        return true;
      },
      sel,
      text,
    );

  await step('Boas-vindas e dados fictícios', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#ob-name', { timeout: 20000 });
    await page.type('#ob-name', 'Ana');
    assert(await clickText('button', 'Explorar com dados fictícios'), 'botão de dados fictícios');
    await page.waitForFunction(() => !document.querySelector('#ob-name'), { timeout: 20000 });
    await sleep(1500);
    const kpis = await page.$$eval('.kpi', (els) => els.map((e) => e.textContent || ''));
    assert(kpis.some((t) => t.includes('Dossiers em curso')), 'KPI "Dossiers em curso" no painel');
  });

  let caseId = '';
  await step('Filtros avançados no endereço e vista guardada', async () => {
    await go('#/dossiers', 1000);
    const total = await page.$$eval('.case-card, .table tbody tr, .board-card', (r) => r.length);
    assert(total >= 3, `lista com dossiers (${total})`);
    assert(await clickText('main button', 'Filtros'), 'botão Filtros');
    await page.waitForSelector('dialog[open] #f-prio', { timeout: 5000 });
    await page.select('#f-prio', 'urgente');
    await sleep(500);
    const href1 = await page.evaluate(() => location.href);
    assert(/prio=urgente/.test(href1), `filtro no endereço (${href1})`);
    assert(await clickText('dialog[open] button', 'Guardar como vista'), 'botão Guardar como vista');
    await page.waitForSelector('dialog[open] #view-name', { timeout: 5000 });
    await page.type('#view-name', 'Urgentes E2E');
    assert(await clickText('dialog[open] button', 'Guardar vista'), 'botão Guardar vista');
    await sleep(600);
    const savedText = await page.$eval('[data-testid="saved-views"]', (e) => e.textContent || '');
    assert(savedText.includes('Urgentes E2E'), 'vista guardada listada');
    await page.keyboard.press('Escape');
    await sleep(400);
    const filtered = await page.$$eval('.case-card, .table tbody tr, .board-card', (r) => r.length);
    assert(filtered < total, `lista filtrada (${filtered} < ${total})`);
    assert(await clickText('main .chip', 'Limpar filtros'), 'chip Limpar filtros');
    await sleep(500);
    assert(!/prio=/.test(await page.evaluate(() => location.href)), 'endereço sem filtros');
    assert(await clickText('main button', 'Vistas'), 'botão Vistas');
    await page.waitForSelector('dialog[open] [data-testid="saved-views"]', { timeout: 5000 });
    assert(await clickText('dialog[open] [data-testid="saved-views"] button', 'Urgentes E2E'), 'aplicar a vista guardada');
    await sleep(600);
    assert(/prio=urgente/.test(await page.evaluate(() => location.href)), 'vista aplicada pelo endereço');
    await go('#/dossiers', 800);
  });

  await step('Lista de dossiers e abertura de um dossier', async () => {
    await go('#/dossiers');
    const hrefs = await page.$$eval('a[href^="#/dossiers/"]', (as) => as.map((a) => a.getAttribute('href')));
    const first = hrefs.find((h) => h && !h.endsWith('/novo'));
    assert(first, 'há dossiers na lista');
    caseId = first.split('/')[2];
    await go(first, 1500);
    const h1 = await page.$eval('main h1', (e) => e.textContent || '');
    assert(h1.trim().length > 3, 'cabeçalho do dossier');
    const rows = await page.$$('.task-row');
    assert(rows.length >= 3, `checklist com tarefas (${rows.length})`);
  });

  await step('Gaveta da tarefa abre e fecha', async () => {
    await page.click('.task-main');
    await page.waitForSelector('dialog[open]', { timeout: 5000 });
    const title = await page.$eval('dialog[open]', (d) => d.textContent || '');
    assert(title.includes('Tarefa'), 'gaveta com título');
    await page.keyboard.press('Escape');
    await sleep(400);
    assert(!(await page.$('dialog[open]')), 'gaveta fechada com Esc');
  });

  await step('Mudar o estado de uma tarefa persiste após recarregar', async () => {
    const before = await page.$$eval('.task-row.st-concluido', (r) => r.length);
    await page.click('.task-row .status-pill');
    await sleep(300);
    assert(await clickText('.menu-item', 'Concluída'), 'opção Concluída no menu');
    await sleep(600);
    const after = await page.$$eval('.task-row.st-concluido', (r) => r.length);
    assert(after >= before, 'estado alterado');
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(1200);
    const activity = await page.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('balcao-das-sucessoes');
          r.onsuccess = () => {
            const q = r.result.transaction('activity').objectStore('activity').getAll();
            q.onsuccess = () => res(q.result.filter((a) => /Concluída/.test(a.text)).length);
          };
        }),
    );
    assert(activity >= 1, 'histórico regista a mudança');
  });

  await step('Anular a última ação (estado da tarefa) pelo aviso', async () => {
    const cls = await page.$eval('.task-row', (e) => e.className);
    const target = /st-em_curso/.test(cls) ? 'A aguardar' : 'Em curso';
    const targetCls = target === 'Em curso' ? 'st-em_curso' : 'st-aguarda';
    const before = await page.$$eval(`.task-row.${targetCls}`, (r) => r.length);
    await page.click('.task-row .status-pill');
    await sleep(300);
    assert(await clickText('.menu-item', target), `opção ${target} no menu`);
    await sleep(600);
    const after = await page.$$eval(`.task-row.${targetCls}`, (r) => r.length);
    assert(after === before + 1, `estado alterado (${before} → ${after})`);
    await page.waitForFunction(() => [...document.querySelectorAll('.toast button')].some((b) => /Anular/.test(b.textContent || '')), { timeout: 5000 });
    assert(await clickText('.toast button', 'Anular'), 'botão Anular no aviso');
    await sleep(800);
    const undone = await page.$$eval(`.task-row.${targetCls}`, (r) => r.length);
    assert(undone === before, `estado anulado (${before} → ${after} → ${undone})`);
    const log = await page.evaluate(
      () =>
        new Promise((res) => {
          const r = indexedDB.open('balcao-das-sucessoes');
          r.onsuccess = () => {
            const q = r.result.transaction('activity').objectStore('activity').getAll();
            q.onsuccess = () => res(q.result.filter((a) => /^Anulado:/.test(a.text)).length);
          };
        }),
    );
    assert(log >= 1, 'histórico regista a anulação');
  });

  await step('Menus nunca ficam cortados (checklist, fundo do ecrã, cabeçalho, folha e telemóvel)', async () => {
    const check = () =>
      page.evaluate(() => {
        const m = document.querySelector('[role="menu"]');
        if (!m) return { ok: false, why: 'sem menu aberto' };
        const r = m.getBoundingClientRect();
        const inside = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 100 && r.height > 40;
        const d = 12;
        const pts = [
          [r.left + d, r.top + d],
          [r.right - d, r.top + d],
          [r.left + d, r.bottom - d],
          [r.right - d, r.bottom - d],
          [r.left + r.width / 2, r.top + r.height / 2],
        ];
        const hits = pts.map(([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return Boolean(el && m.contains(el));
        });
        return { ok: inside && hits.every(Boolean), inside, hits, side: m.getAttribute('data-side'), topLayer: m.matches(':popover-open'), rect: [r.left, r.top, r.right, r.bottom].map(Math.round) };
      });
    const expectVisible = async (label) => {
      await sleep(300);
      const r = await check();
      assert(r.ok, `${label}: menu cortado ou tapado ${JSON.stringify(r)}`);
      assert(r.topLayer, `${label}: menu fora da camada superior`);
      return r;
    };
    const closeMenu = async () => {
      await page.keyboard.press('Escape');
      await sleep(250);
      assert(!(await page.$('[role="menu"]')), 'Esc fecha o menu');
    };
    // 1) Caso reportado: semáforo da primeira tarefa da checklist
    await go(`#/dossiers/${caseId}/checklist`, 1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle('.task-row .status-pill');
    await page.click('.task-row .status-pill');
    await expectVisible('semáforo da checklist');
    await closeMenu();
    // 2) Semáforo encostado ao fundo do ecrã: abre para cima
    await page.evaluate(() => {
      const pills = [...document.querySelectorAll('.task-row .status-pill')];
      pills[Math.min(pills.length - 1, 6)].scrollIntoView({ block: 'end' });
      window.scrollBy(0, 4);
    });
    await sleep(300);
    await page.evaluate(() => {
      const pills = [...document.querySelectorAll('.task-row .status-pill')];
      const vis = pills.filter((p) => {
        const r = p.getBoundingClientRect();
        return r.bottom <= innerHeight && r.top >= 0;
      });
      vis[vis.length - 1].click();
    });
    const low = await expectVisible('semáforo junto ao fundo');
    assert(low.side === 'top', `abre para cima junto ao fundo (${low.side})`);
    await closeMenu();
    // 3) Menu «Mais ações» do cabeçalho, junto à borda direita
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('button[aria-label="Mais ações"]');
    await expectVisible('mais ações');
    await closeMenu();
    // 4) Dentro de uma folha modal: gaveta da tarefa → Calcular… → Prazos frequentes; Esc fecha só o menu
    await page.click('.task-main');
    await page.waitForSelector('dialog[open]', { timeout: 5000 });
    assert(await clickText('dialog[open] button', 'Calcular'), 'botão Calcular… na gaveta');
    await page.waitForFunction(() => document.querySelectorAll('dialog[open]').length >= 2, { timeout: 5000 });
    assert(await clickText('dialog[open] button', 'Prazos frequentes'), 'menu Prazos frequentes');
    await expectVisible('menu dentro de folha modal');
    await closeMenu();
    const dialogs = await page.$$eval('dialog[open]', (d) => d.length);
    assert(dialogs === 2, `Esc no menu não fecha a folha (${dialogs} folhas abertas)`);
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(400);
    // 5) Telemóvel
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await go(`#/dossiers/${caseId}/checklist`, 1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.querySelector('.task-row .status-pill').scrollIntoView({ block: 'center' }));
    await settle('.task-row .status-pill');
    await page.click('.task-row .status-pill');
    await expectVisible('semáforo no telemóvel');
    await closeMenu();
    await page.setViewport({ width: 1366, height: 900 });
    await go(`#/dossiers/${caseId}`, 800);
  });

  await step('Paleta de comandos navega para a agenda', async () => {
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyK');
    await page.keyboard.up('Control');
    await page.waitForSelector('dialog.palette[open]', { timeout: 5000 });
    await page.keyboard.type('agenda');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(800);
    const hash = await page.evaluate(() => location.hash);
    assert(hash === '#/agenda', `navegou para a agenda (${hash})`);
    assert(await page.$('.cal-day, .agenda-main'), 'agenda renderizada');
  });

  await step('Relatório do dossier abre com pré-visualização', async () => {
    await go(`#/dossiers/${caseId}`, 1200);
    assert(await clickText('button', 'Relatório'), 'botão Relatório');
    await page.waitForSelector('dialog[open] .paper h1', { timeout: 8000 });
    const t = await page.$eval('dialog[open] .paper h1', (e) => e.textContent || '');
    assert(t.includes('Relatório do dossier'), `título do relatório (${t})`);
    await page.keyboard.press('Escape');
    await sleep(400);
  });

  await step('Importar dossier partilhado por um colega', async () => {
    await go('#/dossiers', 1000);
    assert(await clickText('button', 'Importar dossier'), 'botão Importar dossier');
    await page.waitForSelector('dialog[open] #share-json', { timeout: 5000 });
    const now = new Date().toISOString();
    const pkg = {
      app: 'balcao-das-sucessoes/dossier',
      version: 1,
      exportedAt: now,
      exportedBy: 'Rui',
      includesFiles: false,
      case: { id: 'e2e-shared-1', ref: 'BS-E2E-1', name: 'Sucessão E2E Partilhada', stage: 'ativo', priority: 'normal', tags: ['e2e'], createdAt: now, updatedAt: now },
      tables: { tasks: [{ id: 'e2e-t1', caseId: 'e2e-shared-1', title: 'Tarefa partilhada pelo colega', phase: 'abertura', status: 'pendente', createdAt: now, updatedAt: now }] },
      members: [],
      files: [],
    };
    await page.evaluate((json) => {
      const el = document.querySelector('dialog[open] #share-json');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, json);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, JSON.stringify(pkg));
    assert(await clickText('dialog[open] button', 'Analisar'), 'botão Analisar');
    await page.waitForFunction(() => /Dossier novo neste dispositivo/.test(document.querySelector('dialog[open]')?.textContent || ''), { timeout: 5000 });
    assert(await clickText('dialog[open] button', 'Importar'), 'botão Importar');
    await page.waitForFunction(() => location.hash.includes('e2e-shared-1'), { timeout: 5000 });
    await sleep(1000);
    const h1 = await page.$eval('main h1', (e) => e.textContent || '');
    assert(h1.includes('Sucessão E2E Partilhada'), `dossier importado aberto (${h1.trim()})`);
    const rows = await page.$$eval('.task-row', (r) => r.map((x) => x.textContent || ''));
    assert(rows.some((t) => t.includes('Tarefa partilhada pelo colega')), 'tarefa do colega na checklist');
  });

  await step('Recebidos (Web Share Target): manifesto e anexar ao dossier', async () => {
    const manifest = await page.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
    assert(manifest.share_target && /share-target$/.test(manifest.share_target.action) && manifest.share_target.method === 'POST', 'manifesto com share_target');
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('balcao-share-inbox', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
          r.onsuccess = () => {
            const tx = r.result.transaction('items', 'readwrite');
            tx.objectStore('items').add({ title: 'Certidão E2E', text: '', url: '', files: [{ name: 'certidao-e2e.pdf', type: 'application/pdf', size: 12, blob: new Blob(['%PDF-1.4 e2e'], { type: 'application/pdf' }) }], at: new Date().toISOString() });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          };
          r.onerror = () => reject(r.error);
        }),
    );
    await go('#/recebidos', 1500);
    const main = await page.$eval('main', (e) => e.textContent || '');
    assert(main.includes('certidao-e2e.pdf'), 'ficheiro recebido listado');
    await page.select('#rx-case', caseId);
    assert(await clickText('main button', 'Anexar ao dossier'), 'botão Anexar ao dossier');
    await page.waitForFunction(() => /Nada recebido/.test(document.querySelector('main')?.textContent || ''), { timeout: 5000 });
    const docs = await page.evaluate(
      (cid) =>
        new Promise((res) => {
          const r = indexedDB.open('balcao-das-sucessoes');
          r.onsuccess = () => {
            const q = r.result.transaction('documents').objectStore('documents').getAll();
            q.onsuccess = () => res(q.result.filter((d) => d.caseId === cid && d.fileName === 'certidao-e2e.pdf').length);
          };
        }),
      caseId,
    );
    assert(docs === 1, 'documento criado com o anexo recebido');
  });

  await step('Análise da equipa: gráficos acessíveis com tabela alternativa', async () => {
    await go('#/analise', 1500);
    const h1 = await page.$eval('main h1', (e) => e.textContent || '');
    assert(h1.includes('Análise da equipa'), 'página de análise');
    const charts = await page.$$eval('svg[role="img"]', (els) => els.map((e) => e.querySelector('title')?.textContent || ''));
    assert(charts.length >= 4, `gráficos SVG (${charts.length})`);
    assert(charts.some((t) => /Dossiers por mês/.test(t)), 'gráfico de dossiers por mês');
    const bars = await page.$$eval('svg[role="img"] rect[fill]', (r) => r.length);
    assert(bars > 0, 'barras desenhadas com os dados de demonstração');
    assert(await clickText('.chart-head button', 'Tabela'), 'botão Tabela');
    await sleep(300);
    const rows = await page.$$eval('.chart table tbody tr', (r) => r.length);
    assert(rows >= 3, `tabela alternativa com linhas (${rows})`);
    const people = await page.$$eval('[data-testid="members-table"] tbody tr', (r) => r.length);
    assert(people >= 2, `tabela por pessoa (${people})`);
  });

  await step('Documentos: seleção em lote, pedido por interessado e validade', async () => {
    await go(`#/dossiers/${caseId}/documentos`, 1500);
    await page.waitForSelector('.doc-row', { timeout: 8000 });
    if ((await page.$$eval('.doc-row', (r) => r.length)) < 3) {
      // O passo dos «Recebidos» já criou um documento: a lista não se gera sozinha, pede-se a partir da checklist.
      assert(await clickText('main button', 'Atualizar da checklist'), 'botão Atualizar da checklist');
      await page.waitForFunction(() => document.querySelectorAll('.doc-row').length >= 3, { timeout: 8000 });
    }
    const rows = await page.$$eval('.doc-row', (r) => r.length);
    assert(rows >= 3, `documentos gerados (${rows})`);
    assert(await clickText('main button', 'Selecionar'), 'botão Selecionar');
    await sleep(300);
    assert(await clickText('[data-testid="doc-bulk"] button', 'Todos os visíveis'), 'botão Todos os visíveis');
    await sleep(300);
    assert(await clickText('[data-testid="doc-bulk"] button', 'Estado'), 'menu Estado');
    await sleep(300);
    assert(await clickText('.menu-item', 'Pedido / a aguardar'), 'estado Pedido no menu');
    await sleep(900);
    const pedidos = await page.$$eval('.doc-row.ds-pedido', (r) => r.length);
    assert(pedidos >= 3, `documentos marcados como pedidos (${pedidos})`);
    assert(await clickText('main button', 'Pedir documentos'), 'botão Pedir documentos');
    await sleep(300);
    assert(await clickText('.menu-item', 'Pedir a '), 'pedido por interessado no menu');
    await page.waitForSelector('dialog[open] #rq-body', { timeout: 5000 });
    const body = await page.$eval('#rq-body', (e) => e.value);
    assert(/agradecemos o envio/.test(body), 'texto do pedido gerado');
    assert(await clickText('dialog[open] button', 'Marcar como pedidos'), 'botão Marcar como pedidos');
    await sleep(600);
    assert(!(await page.$('dialog[open] #rq-body')), 'pedido registado e folha fechada');
  });

  await step('Honorários: tempo, cronómetro na barra superior e nota de honorários', async () => {
    await go(`#/dossiers/${caseId}/honorarios`, 1500);
    await page.waitForSelector('[data-testid="fees-kpis"]', { timeout: 8000 });
    const count = () => page.$$eval('[data-testid="time-table"] tbody tr', (r) => r.length).catch(() => 0);
    const before = await count();
    await page.type('#te-dur', '1:30');
    await page.type('#te-desc', 'Reunião E2E');
    assert(await clickText('main button', 'Registar tempo'), 'botão Registar tempo');
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="time-table"] tbody tr').length > n, { timeout: 5000 }, before);
    await page.type('#tm-desc', 'Cronómetro E2E');
    assert(await clickText('main button', 'Iniciar cronómetro'), 'botão Iniciar cronómetro');
    await page.waitForSelector('[data-testid="timer-chip"]', { timeout: 5000 });
    await page.click('[data-testid="timer-chip"] button');
    await page.waitForFunction(() => !document.querySelector('[data-testid="timer-chip"]'), { timeout: 5000 });
    await sleep(500);
    const rows = await page.$$eval('[data-testid="time-table"] tbody tr', (r) => r.map((x) => x.textContent || ''));
    assert(rows.some((t) => t.includes('Cronómetro E2E')), 'tempo do cronómetro registado');
    assert(await clickText('main button', 'Nota de honorários'), 'botão Nota de honorários');
    await page.waitForFunction(() => /Nota de honorários e despesas/.test(document.querySelector('dialog[open]')?.textContent || ''), { timeout: 8000 });
    const txt = await page.$eval('dialog[open]', (d) => d.textContent || '');
    assert(/Reunião E2E/.test(txt) && /(Total a pagar|Saldo a favor do cliente)/.test(txt), 'nota com o tempo e o total');
    await page.keyboard.press('Escape');
    await sleep(400);
  });

  await step('Regras do escritório: criar, aplicar aos dossiers e ver a tarefa na checklist', async () => {
    await go('#/regras', 1500);
    const h1 = await page.$eval('main h1', (e) => e.textContent || '');
    assert(h1.includes('Regras do escritório'), 'página das regras');
    const demo = await page.$$eval('[data-testid="rule-item"]', (r) => r.length);
    assert(demo >= 3, `regras de exemplo da demonstração (${demo})`);
    assert(await clickText('main button', 'Nova regra'), 'botão Nova regra');
    await page.waitForSelector('dialog[open] #rule-name', { timeout: 5000 });
    await page.type('#rule-name', 'Regra E2E');
    await page.type('dialog[open] input[id$="-title"]', 'Tarefa própria E2E');
    assert(await clickText('dialog[open] button', 'Guardar regra'), 'botão Guardar regra');
    await page.waitForSelector('[data-testid="rules-drift"]', { timeout: 5000 });
    assert(await clickText('[data-testid="rules-drift"] button', 'Aplicar aos dossiers'), 'botão Aplicar aos dossiers');
    await page.waitForFunction(() => /Aplicar as regras/.test(document.querySelector('dialog[open]')?.textContent || ''), { timeout: 5000 });
    assert(await clickText('dialog[open] .sheet-foot button', 'Aplicar'), 'confirmar Aplicar');
    await page.waitForFunction(() => !document.querySelector('[data-testid="rules-drift"]'), { timeout: 8000 });
    await go(`#/dossiers/${caseId}/checklist`, 1500);
    const row = await page.$$eval('.task-row', (rs) => rs.map((r) => r.textContent || '').find((t) => t.includes('Tarefa própria E2E')) || '');
    assert(row, 'tarefa da regra na checklist do dossier');
    assert(row.includes('Escritório'), 'marca «Escritório» na tarefa');
  });

  await step('Importar interessados de uma folha de cálculo (colar do Excel)', async () => {
    await go(`#/dossiers/${caseId}/interessados`, 1500);
    assert(await clickText('main button', 'Importar'), 'botão Importar');
    await page.waitForSelector('dialog[open] #imp-text', { timeout: 5000 });
    const tsv = 'Nome\tNIF\tParentesco\tE-mail\nPessoa Importada Um\t123456789\tFilha\tum@exemplo.pt\nPessoa Importada Dois\t123456788\tFilho\t';
    await page.evaluate((v) => {
      const ta = document.querySelector('#imp-text');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, v);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, tsv);
    await page.waitForSelector('[data-testid="import-summary"]', { timeout: 5000 });
    const summary = await page.$eval('[data-testid="import-summary"]', (e) => e.textContent || '');
    assert(/2 a importar/.test(summary) && /1 com avisos/.test(summary), `resumo da pré-visualização (${summary})`);
    assert(await clickText('dialog[open] .sheet-foot button', 'Importar 2'), 'botão Importar 2 interessados');
    await page.waitForFunction(() => !document.querySelector('dialog[open] #imp-text'), { timeout: 5000 });
    await sleep(600);
    const text = await page.$eval('main', (m) => m.textContent || '');
    assert(text.includes('Pessoa Importada Um') && text.includes('Pessoa Importada Dois'), 'interessados importados na lista');
  });

  await step('Impressão: checklist completa em papel branco e resumo do dossier numa só página', async () => {
    await go(`#/dossiers/${caseId}/checklist`, 1500);
    const total = await page.$$eval('.task-row', (r) => r.length);
    await page.click('.phase-head');
    await sleep(300);
    const shown = await page.$$eval('.task-row', (r) => r.length);
    assert(shown < total, 'fase recolhida no ecrã');
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.emulateMediaType('print');
    await sleep(400);
    const paper = await page.evaluate(() => ({
      rows: document.querySelectorAll('.task-row').length,
      sidebar: getComputedStyle(document.querySelector('.sidebar')).display,
      topbar: getComputedStyle(document.querySelector('.topbar')).display,
      bg: getComputedStyle(document.body).backgroundColor,
      header: getComputedStyle(document.querySelector('.print-header')).display,
      aside: getComputedStyle(document.querySelector('.case-aside')).display,
    }));
    await page.emulateMediaType(null);
    await page.evaluate((t) => (t ? document.documentElement.setAttribute('data-theme', t) : document.documentElement.removeAttribute('data-theme')), theme);
    await page.click('.phase-head');
    assert(paper.rows === total, `no papel, as fases recolhidas abrem-se (${paper.rows}/${total})`);
    assert(paper.sidebar === 'none' && paper.topbar === 'none' && paper.aside === 'none', 'sem barras nem cartões laterais no papel');
    assert(paper.bg === 'rgb(255, 255, 255)', `papel branco mesmo no tema escuro (${paper.bg})`);
    assert(paper.header !== 'none', 'cabeçalho do escritório no papel');
    // Resumo: a impressão real é substituída para gerar o PDF sem diálogo
    await page.evaluate(() => {
      window.__print = window.print;
      window.print = () => undefined;
    });
    await go(`#/dossiers/${caseId}`, 1000);
    assert(await clickText('main button', 'Relatório'), 'botão Relatório');
    await page.waitForSelector('dialog[open] .report-kinds', { timeout: 5000 });
    assert(await clickText('dialog[open] .report-kinds button', 'Resumo'), 'tipo «Resumo (1 página)»');
    await page.waitForFunction(() => /Resumo do dossier/.test(document.querySelector('dialog[open] .composer-preview')?.textContent || ''), { timeout: 8000 });
    assert(await clickText('dialog[open] .sheet-foot button', 'PDF'), 'botão PDF');
    await page.waitForSelector('.print-doc[data-kind="resumo"]', { timeout: 5000 });
    const pdf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true })).toString('latin1');
    const pages = Number(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/.exec(pdf)?.[1] ?? (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('afterprint'));
      window.print = window.__print;
    });
    await page.keyboard.press('Escape');
    await sleep(400);
    assert(pages === 1, `resumo numa só página A4 (${pages})`);
  });

  await step('Diagnóstico: integridade em ordem e reparação de avarias', async () => {
    await go('#/diagnostico', 1500);
    await page.waitForFunction(() => /Tudo em ordem|problema|Registos|Anexos|Documentos/.test(document.querySelector('[data-testid="integrity"]')?.textContent || ''), { timeout: 8000 });
    const first = await page.$eval('[data-testid="integrity"]', (e) => e.textContent || '');
    assert(/Tudo em ordem/.test(first), `dados de demonstração sem problemas de integridade (${first.slice(0, 160)})`);
    // Avarias escritas diretamente na base (fora da aplicação): uma tarefa órfã e um documento com anexo inexistente.
    await page.evaluate(
      (cid) =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('balcao-das-sucessoes');
          r.onsuccess = () => {
            const tx = r.result.transaction(['tasks', 'documents'], 'readwrite');
            const ts = new Date().toISOString();
            tx.objectStore('tasks').put({ id: 'e2e-orfa', caseId: 'nao-existe', title: 'Órfã E2E', status: 'pendente', ruleKey: '', notes: '', assigneeId: '', phase: 'abertura', createdAt: ts, updatedAt: ts });
            tx.objectStore('documents').put({ id: 'e2e-doc', caseId: cid, name: 'Documento E2E', category: 'outros', status: 'recebido', source: 'manual', key: 'e2e', partyId: '', requestedAt: '', receivedAt: '', notes: '', fileId: 'e2e-sem-ficheiro', fileName: 'perdido.pdf', fileType: 'application/pdf', fileSize: 10, createdAt: ts, updatedAt: ts });
            tx.oncomplete = () => {
              r.result.close();
              resolve(true);
            };
            tx.onerror = () => reject(tx.error);
          };
          r.onerror = () => reject(r.error);
        }),
      caseId,
    );
    assert(await clickText('main button', 'Verificar de novo'), 'botão Verificar de novo');
    await page.waitForSelector('[data-issue="orfaos"]', { timeout: 5000 });
    assert(await page.$('[data-issue="anexos-perdidos"]'), 'anexo perdido detetado');
    assert(await clickText('main button', 'Reparar tudo'), 'botão Reparar tudo');
    await page.waitForFunction(() => /Reparar/.test(document.querySelector('dialog[open]')?.textContent || ''), { timeout: 5000 });
    assert(await clickText('dialog[open] .sheet-foot button', 'Reparar'), 'confirmar Reparar');
    await page.waitForFunction(() => /Tudo em ordem/.test(document.querySelector('[data-testid="integrity"]')?.textContent || ''), { timeout: 8000 });
  });

  await step('PIN: definir, bloquear e desbloquear', async () => {
    await go('#/definicoes', 1200);
    assert(await clickText('button', 'Definir PIN'), 'botão Definir PIN');
    await page.waitForSelector('#pin-new', { timeout: 5000 });
    await page.type('#pin-new', '2580');
    await page.type('#pin-again', '2580');
    assert(await clickText('button', 'Guardar PIN'), 'guardar PIN');
    await sleep(1200);
    assert(await clickText('button', 'Bloquear agora'), 'bloquear agora');
    await page.waitForSelector('.lock-screen', { timeout: 5000 });
    await page.type('.lock-input', '0000');
    await page.keyboard.press('Enter');
    await sleep(800);
    assert(await page.$('.lock-screen'), 'PIN errado mantém bloqueio');
    await page.type('.lock-input', '2580');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.lock-screen'), { timeout: 5000 });
  });

  await step('Telemóvel (360 e 390 px): sem deslocamento lateral, nada fora do ecrã ou do cartão, campos a 16 px e alvos de toque ≥ 24 px', async () => {
    const tabs = ['checklist', 'interessados', 'patrimonio', 'documentos', 'quotas', 'internacional', 'agenda', 'honorarios', 'notas', 'questionario'];
    const routes = ['#/', '#/dossiers', '#/dossiers/novo', ...tabs.map((t) => `#/dossiers/${caseId}/${t}`), '#/agenda', '#/tarefas', '#/minhas', '#/calculadora', '#/prazos', '#/minutas', '#/analise', '#/regras', '#/diagnostico', '#/definicoes'];
    const problems = [];
    for (const [w, h] of [
      [360, 780],
      [390, 844],
    ]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await go('#/', 1200);
      const nav = await page.$eval('.mobile-nav', (e) => getComputedStyle(e).display);
      assert(nav !== 'none', `barra inferior visível no telemóvel (${w} px)`);
      for (const r of routes) {
        await go(r, 1100);
        const res = await page.evaluate(() => {
          const vw = innerWidth;
          const visible = (el) => {
            const s = getComputedStyle(el);
            if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
            const b = el.getBoundingClientRect();
            return b.width > 0 && b.height > 0;
          };
          const clipsX = (el) => ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX);
          const name = (el) => `${el.tagName.toLowerCase()}«${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}»`;
          const out = [];
          if (document.documentElement.scrollWidth > vw + 1) out.push(`deslocamento lateral ${document.documentElement.scrollWidth - vw}px`);
          for (const el of document.querySelectorAll('main *')) {
            if (!visible(el)) continue;
            const b = el.getBoundingClientRect();
            if (b.right <= vw + 1 && b.left >= -1) continue;
            let p = el.parentElement;
            let contained = false;
            while (p && p !== document.body) {
              if (clipsX(p)) {
                contained = true;
                break;
              }
              p = p.parentElement;
            }
            if (!contained) out.push(`sai do ecrã: ${name(el)}`);
          }
          // Controlos que saem do cartão onde estão (sem deslocamento horizontal pelo meio).
          for (const el of document.querySelectorAll('main button, main a[href], main select, main input:not([type=hidden]), main textarea')) {
            if (!visible(el)) continue;
            const b = el.getBoundingClientRect();
            if (b.width <= 1 || b.height <= 1) continue;
            for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === 'auto' || ox === 'scroll') break;
              if (p.classList.contains('card')) {
                const pb = p.getBoundingClientRect();
                if (b.right > pb.right + 1 || b.left < pb.left - 1) out.push(`fora do cartão: ${name(el)}`);
                break;
              }
            }
          }
          for (const el of document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), main select, main textarea')) {
            if (visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`letra < 16 px: ${name(el)}`);
          }
          for (const el of document.querySelectorAll('main button, main a[href], main [role=button], main input[type=checkbox], main input[type=radio], main select, .mobile-nav a')) {
            if (!visible(el) || getComputedStyle(el).pointerEvents === 'none' || (el.tagName === 'A' && el.closest('p'))) continue;
            const b = el.getBoundingClientRect();
            if (b.width < 24 || b.height < 24) out.push(`alvo pequeno ${Math.round(b.width)}×${Math.round(b.height)}: ${name(el)}`);
          }
          return out.slice(0, 5);
        });
        for (const x of res) problems.push(`${w}px ${r} → ${x}`);
      }
    }
    await page.setViewport({ width: 1366, height: 900 });
    assert(problems.length === 0, problems.slice(0, 8).join(' | '));
  });
  await step('Desempenho: 300 dossiers e 18 000 tarefas continuam fluidos', async () => {
    // Um escritório grande, escrito diretamente na base a partir de um dossier e de uma tarefa reais.
    const inject = (count) =>
      page.evaluate(
        (n) =>
          new Promise((resolve, reject) => {
            const r = indexedDB.open('balcao-das-sucessoes');
            r.onerror = () => reject(r.error);
            r.onsuccess = () => {
              const db = r.result;
              const read = db.transaction(['cases', 'tasks'], 'readonly');
              const caseReq = read.objectStore('cases').getAll();
              const taskReq = read.objectStore('tasks').getAll();
              read.oncomplete = () => {
                const [c0] = caseReq.result;
                const [t0] = taskReq.result;
                const tx = db.transaction(['cases', 'tasks', 'settings'], 'readwrite');
                // Sem PIN: mede-se o arranque a frio real (o PIN já foi testado no passo anterior).
                tx.objectStore('settings').put({ key: 'pinJson', value: '' });
                for (let i = 0; i < n; i++) {
                  const id = `perf-${i}`;
                  tx.objectStore('cases').put({ ...c0, id, ref: `PERF-${String(i).padStart(3, '0')}`, name: `Herança Desempenho ${i}`, stage: 'ativo', demo: true });
                  for (let j = 0; j < 60; j++) tx.objectStore('tasks').put({ ...t0, id: `${id}-t${j}`, caseId: id, title: `Tarefa de desempenho ${j}`, ruleKey: `perf-${j}`, status: j % 3 ? 'pendente' : 'concluido', order: j });
                }
                tx.oncomplete = () => {
                  db.close();
                  resolve(true);
                };
                tx.onerror = () => reject(tx.error);
              };
            };
          }),
        count,
      );
    await inject(300);
    await page.evaluate(() => localStorage.setItem('bs-list-prefs', JSON.stringify({ view: 'cards', sort: 'recentes' })));
    // A base mudou por fora da aplicação: arranque a frio (como no dia seguinte), a desbloquear se houver PIN.
    // Arranque a frio: do recarregar até o conteúdo estar pronto, sem contar o tempo de escrever o PIN
    // (se o ecrã de bloqueio aparecer, desbloqueia-se; a lista pode ir-se preparando por trás).
    const coldStart = async (hash, ready) => {
      // Endereço limpo: os filtros da lista vivem na parte «?…» e um passo anterior pode tê-los deixado.
      await page.evaluate((h) => history.replaceState(null, '', location.pathname + h), hash);
      const t = Date.now();
      let pin = 0;
      await page.reload({ waitUntil: 'domcontentloaded' });
      for (let i = 0; i < 300; i++) {
        const st = await page.evaluate(`({ ready: Boolean((${ready})()), lock: Boolean(document.querySelector('.lock-screen')) })`);
        if (st.ready && !st.lock) return Date.now() - t - pin;
        if (st.lock) {
          const u = Date.now();
          await page.type('.lock-input', '2580');
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => !document.querySelector('.lock-screen'), { timeout: 5000 });
          pin += Date.now() - u;
          continue;
        }
        await sleep(50);
      }
      throw new Error('conteúdo não ficou pronto em 15 s');
    };
    const phase = async (name, run) => {
      try {
        return await run();
      } catch (e) {
        const st = await page.evaluate(() => ({ cards: document.querySelectorAll('.case-card').length, rows: document.querySelectorAll('.task-row').length, lock: Boolean(document.querySelector('.lock-screen')), h1: document.querySelector('main h1')?.textContent, hash: location.hash })).catch(() => ({}));
        throw new Error(`${name}: ${e.message} ${JSON.stringify(st)}`);
      }
    };
    const listMs = await phase('arranque com 300 dossiers', () => coldStart('#/dossiers', '() => document.querySelectorAll(".case-card").length >= 300'));
    let t0 = Date.now();
    await phase('pesquisa', async () => {
      await page.type('input[aria-label="Pesquisar dossiers"]', 'Desempenho 173');
      await page.waitForFunction(() => document.querySelectorAll('.case-card').length === 1 && /Desempenho 173/.test(document.querySelector('.case-card')?.textContent || ''), { timeout: 8000 });
    });
    const searchMs = Date.now() - t0;
    t0 = Date.now();
    await phase('dossier com 60 tarefas', async () => {
      await go('#/dossiers/perf-7/checklist', 0);
      await page.waitForFunction(() => document.querySelectorAll('.task-row').length >= 40, { timeout: 10000 });
    });
    const caseMs = Date.now() - t0;
    // limpeza (e novo arranque, para a aplicação deixar de ver o escritório grande)
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const r = indexedDB.open('balcao-das-sucessoes');
          r.onsuccess = () => {
            const db = r.result;
            const tx = db.transaction(['cases', 'tasks'], 'readwrite');
            tx.objectStore('cases').delete(IDBKeyRange.bound('perf-', 'perf-~'));
            tx.objectStore('tasks').delete(IDBKeyRange.bound('perf-', 'perf-~'));
            tx.oncomplete = () => {
              db.close();
              resolve(true);
            };
          };
        }),
    );
    await phase('arranque depois da limpeza', () => coldStart('#/', '() => Boolean(document.querySelector("main h1"))'));
    await sleep(800);
    results.push(`  (lista de 300 dossiers: ${listMs} ms · pesquisa: ${searchMs} ms · dossier com 60 tarefas: ${caseMs} ms)`);
    assert(listMs < 6000, `lista de 300 dossiers em ${listMs} ms`);
    assert(searchMs < 3000, `pesquisa em ${searchMs} ms`);
    assert(caseMs < 4000, `dossier em ${caseMs} ms`);
  });

  await step('Funciona offline (service worker)', async () => {
    const sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported';
      for (let i = 0; i < 20; i++) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.active) return 'active';
        await new Promise((r) => setTimeout(r, 500));
      }
      return 'none';
    });
    if (sw !== 'active') {
      results.push(`  (service worker: ${sw} — teste offline ignorado)`);
      return;
    }
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const ok = await page.evaluate(() => Boolean(document.querySelector('.lock-screen, .shell')));
    await page.setOfflineMode(false);
    assert(ok, 'aplicação renderiza sem rede');
  });

  const realErrors = errors.filter((e) => !/ResizeObserver/.test(e));
  await step('Sem erros de JavaScript', async () => assert(realErrors.length === 0, realErrors.join(' | ')));
} finally {
  await browser?.close();
  server.kill();
}
console.log(results.join('\n'));
console.log(failures ? `\n${failures} passo(s) falharam` : '\nE2E: tudo a passar');
process.exit(failures ? 1 : 0);
