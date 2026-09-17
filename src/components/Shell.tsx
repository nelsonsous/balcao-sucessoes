import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calculator,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Command,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Lock,
  LockKeyhole,
  Moon,
  Plus,
  Search,
  Settings,
  Smartphone,
  Sun,
  UserCheck,
  Wand2,
  WifiOff,
} from 'lucide-react';
import { Inbox, Recycle, TrendingUp } from 'lucide-react';
import { db, setSetting, useSettings } from '../lib/db';
import { useInboxCount } from '../lib/shareInbox';
import { useTrashCount } from '../lib/recycle';
import { useAgendaItems } from '../lib/agenda';
import { isActiveCase, useInstall, useOnline, useOverviews } from '../lib/hooks';
import { todayIso } from '../lib/utils';
import { cx, normalize } from '../lib/utils';
import { groupMyTasks } from '../lib/myTasks';
import { lockNow } from '../lib/lock';
import { ErrorBoundary } from './ErrorBoundary';

const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));
import { Avatar, Button, Sheet } from './ui';

function NavLink({ href, icon: Icon, children, count, alert, exact }: {
  href: string;
  icon: typeof LayoutDashboard;
  children: ReactNode;
  count?: number;
  alert?: boolean;
  exact?: boolean;
}) {
  const [loc] = useLocation();
  const active = exact ? loc === href : loc === href || loc.startsWith(href + '/');
  return (
    <Link href={href} className={cx('nav-link', active && 'active')} aria-current={active ? 'page' : undefined}>
      <Icon aria-hidden />
      <span>{children}</span>
      {count !== undefined && count > 0 && <span className={cx('nav-count', alert && 'alert')}>{count}</span>}
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const overviews = useOverviews();
  const install = useInstall();
  const online = useOnline();
  const [loc, navigate] = useLocation();
  const [iosHelp, setIosHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const agenda = useAgendaItems();
  const inbox = useInboxCount();
  const trash = useTrashCount();
  const myCount = useMemo(() => {
    if (!settings.meId) return 0;
    const g = groupMyTasks((overviews ?? []).map((o) => ({ c: o.c, tasks: o.tasks })), settings.meId);
    return g.filter((x) => x.id === 'atrasadas' || x.id === 'hoje').reduce((n, x) => n + x.tasks.length, 0);
  }, [overviews, settings.meId]);
  const todayCount = useMemo(() => {
    const t = todayIso();
    return (agenda ?? []).filter((i) => !i.done && i.date === t).length;
  }, [agenda]);

  const counts = useMemo(() => {
    const active = (overviews ?? []).filter((o) => isActiveCase(o.c));
    return {
      active: active.length,
      blocking: active.filter((o) => o.c.stage === 'ativo' && o.blockers.overdue.length + o.blockers.criticalPending.length > 0).length,
      overdue: active.reduce((n, o) => n + (o.c.stage === 'ativo' ? o.blockers.overdue.length : 0), 0),
    };
  }, [overviews]);

  // Atalhos globais: N = nova sucessão, / = pesquisa
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable], dialog')) return;
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      } else if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        navigate('/dossiers/novo');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  useEffect(() => {
    document.body.classList.toggle('privacy', settings.privacyMode);
  }, [settings.privacyMode]);

  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            BS
          </span>
          <span>
            <span className="brand-name">Balcão das Sucessões</span>
            <span className="brand-tag" style={{ display: 'block' }}>
              {settings.tagline}
            </span>
          </span>
        </Link>

        <Button className="sidebar-new" icon={Plus} block onClick={() => navigate('/dossiers/novo')}>
          Nova sucessão
        </Button>

        <nav className="nav">
          <span className="nav-label">Trabalho</span>
          <NavLink href="/" icon={LayoutDashboard} exact>
            Visão geral
          </NavLink>
          <NavLink href="/dossiers" icon={FolderOpen} count={counts.active}>
            Dossiers
          </NavLink>
          <NavLink href="/agenda" icon={CalendarDays} count={todayCount}>
            Agenda
          </NavLink>
          <NavLink href="/tarefas" icon={ListChecks} count={counts.blocking} alert>
            O que está a bloquear?
          </NavLink>
          <NavLink href="/minhas" icon={UserCheck} count={myCount} alert>
            As minhas tarefas
          </NavLink>
          <span className="nav-label">Ferramentas</span>
          <NavLink href="/calculadora" icon={Calculator}>
            Calculadora sucessória
          </NavLink>
          <NavLink href="/prazos" icon={CalendarClock}>
            Calculadora de prazos
          </NavLink>
          <NavLink href="/minutas" icon={Wand2}>
            Minutas
          </NavLink>
          {inbox > 0 && (
            <NavLink href="/recebidos" icon={Inbox} count={inbox} alert>
              Recebidos
            </NavLink>
          )}
          <span className="nav-label">Escritório</span>
          <NavLink href="/analise" icon={TrendingUp}>
            Análise da equipa
          </NavLink>
          <NavLink href="/definicoes" icon={Settings}>
            Definições
          </NavLink>
          {trash > 0 && (
            <NavLink href="/reciclagem" icon={Recycle} count={trash}>
              Reciclagem
            </NavLink>
          )}
        </nav>

        <div className="sidebar-foot">
          {!online && (
            <div className="sidebar-card">
              <strong>
                <WifiOff size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Sem ligação
              </strong>
              Continua a trabalhar normalmente: os dados estão neste dispositivo.
            </div>
          )}
          {install.canPrompt && !install.standalone && (
            <div className="sidebar-card">
              <strong>Instalar a aplicação</strong>
              Abre como app, funciona sem internet e fica no ecrã inicial.
              <Button size="sm" icon={Download} block onClick={() => void install.install()}>
                Instalar
              </Button>
            </div>
          )}
          <div className="sidebar-user">
            <Avatar name={settings.userName || 'Equipa'} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="truncate strong" style={{ fontSize: 13 }}>
                {settings.userName || 'Utilizador'}
              </div>
              <div className="truncate" style={{ fontSize: 11, opacity: 0.6 }}>
                {settings.firmName}
              </div>
            </div>
            <button
              type="button"
              className="btn ghost sm icon"
              style={{ color: settings.privacyMode ? '#ffd166' : '#dfe4f5' }}
              aria-pressed={settings.privacyMode}
              aria-label={settings.privacyMode ? 'Desligar o modo privacidade' : 'Ligar o modo privacidade (oculta nomes)'}
              title={settings.privacyMode ? 'Modo privacidade ligado — nomes ocultos' : 'Modo privacidade: ocultar nomes para partilhar o ecrã'}
              onClick={() => void setSetting('privacyMode', !settings.privacyMode)}
            >
              {settings.privacyMode ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </button>
            {settings.pinJson && (
              <button type="button" className="btn ghost sm icon" style={{ color: '#dfe4f5' }} aria-label="Bloquear agora" title="Bloquear agora (pede o PIN)" onClick={() => lockNow()}>
                <LockKeyhole aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="btn ghost sm icon"
              style={{ color: '#dfe4f5' }}
              aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              onClick={() => void setSetting('theme', isDark ? 'light' : 'dark')}
            >
              {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
            </button>
          </div>
          <div className="privacy-note">
            <Lock aria-hidden /> Dados guardados apenas neste dispositivo
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/" className="topbar-mobile-brand">
            <span className="brand-mark" aria-hidden>
              BS
            </span>
            Balcão
          </Link>
          <GlobalSearch />
          <button type="button" className="btn ghost sm palette-btn" onClick={() => setPalette(true)} title="Paleta de comandos (⌘K / Ctrl+K)" aria-label="Paleta de comandos">
            <Command aria-hidden />
            <span className="kbd desktop-only">⌘K</span>
          </button>
          <span className="spacer" />
          {!online && (
            <span className="badge warn" title="Sem ligação à internet — a aplicação continua a funcionar">
              <WifiOff aria-hidden /> Offline
            </span>
          )}
          {counts.overdue > 0 && (
            <Button
              variant="danger-soft"
              size="sm"
              icon={CircleAlert}
              className="desktop-only"
              title="Tarefas com prazo ultrapassado em dossiers ativos"
              onClick={() => navigate('/tarefas')}
            >
              {counts.overdue} {counts.overdue === 1 ? 'prazo ultrapassado' : 'prazos ultrapassados'}
            </Button>
          )}
          <Button variant="primary" icon={Plus} className="desktop-only" onClick={() => navigate('/dossiers/novo')}>
            Nova sucessão
          </Button>
          <Link href="/definicoes" className="btn ghost icon mobile-only" aria-label="Definições">
            <Settings aria-hidden />
          </Link>
          {install.ios && !install.standalone && (
            <Button
              variant="ghost"
              size="sm"
              icon={Smartphone}
              iconOnly
              aria-label="Como instalar no iPhone"
              title="No Safari: menu (≡) ou Partilhar → Adicionar ao ecrã principal"
              onClick={() => setIosHelp(true)}
            />
          )}
        </header>

        <main className="content" key={loc.split('/').slice(0, 3).join('/')}>
          <ErrorBoundary resetKey={loc}>{children}</ErrorBoundary>
        </main>
      </div>

      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} variant="modal" title="Instalar no iPhone ou iPad" icon={Smartphone}>
        <ol className="stack" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Abra o Balcão das Sucessões no <strong>Safari</strong>.</li>
          <li>
            Toque no botão <strong>Partilhar</strong> (quadrado com seta para cima). Na barra compacta do Safari mais recente não está sempre visível: toque no ícone de <strong>menu (≡)</strong> dentro da barra de endereço, ou toque na barra para a expandir.
          </li>
          <li>
            Escolha <strong>Adicionar ao ecrã principal</strong> (no menu ≡ aparece diretamente) e confirme.
          </li>
        </ol>
        <p className="subtle small" style={{ marginTop: 12 }}>
          A aplicação passa a abrir em ecrã inteiro e funciona sem ligação à internet.
        </p>
      </Sheet>

      {palette && (
        <Suspense fallback={null}>
          <CommandPalette open={palette} onClose={() => setPalette(false)} />
        </Suspense>
      )}

      <nav className="mobile-nav" aria-label="Navegação">
        <MobileLink href="/" icon={LayoutDashboard} label="Início" exact />
        <MobileLink href="/dossiers" icon={FolderOpen} label="Dossiers" />
        <Link href="/dossiers/novo" className="new" aria-label="Nova sucessão">
          <span className="new-bubble">
            <Plus aria-hidden />
          </span>
          <span>Nova</span>
        </Link>
        <MobileLink href="/agenda" icon={CalendarDays} label="Agenda" badge={todayCount} tone="info" />
        <MobileLink href="/tarefas" icon={ListChecks} label="Bloqueios" badge={counts.blocking} />
      </nav>
    </div>
  );
}

function MobileLink({
  href,
  icon: Icon,
  label,
  exact,
  badge,
  tone,
}: {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  exact?: boolean;
  badge?: number;
  tone?: 'info';
}) {
  const [loc] = useLocation();
  const active = exact ? loc === href : loc === href || (loc.startsWith(href + '/') && !loc.startsWith('/dossiers/novo'));
  return (
    <Link href={href} className={cx(active && 'active')} aria-current={active ? 'page' : undefined}>
      <Icon aria-hidden />
      <span>{label}</span>
      {badge ? <span className={cx('badge-dot', tone)}>{badge}</span> : null}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Pesquisa global: dossiers, falecidos, clientes e interessados.

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [, navigate] = useLocation();
  const wrap = useRef<HTMLDivElement>(null);
  const data = useLiveQuery(async () => {
    const [cases, parties] = await Promise.all([db.cases.toArray(), db.parties.toArray()]);
    return { cases, parties };
  }, []);

  const results = useMemo(() => {
    const n = normalize(q);
    if (!n || !data) return [];
    const caseName = new Map(data.cases.map((c) => [c.id, c.name]));
    const out: Array<{ id: string; title: string; sub: string; href: string }> = [];
    for (const c of data.cases) {
      const hay = normalize([c.name, c.ref, c.deceased.name, c.client.name, c.tags.join(' ')].join(' '));
      if (hay.includes(n)) out.push({ id: c.id, title: c.name, sub: `${c.ref} · ${c.deceased.name || 'De cujus por indicar'}`, href: `/dossiers/${c.id}` });
    }
    for (const p of data.parties) {
      if (normalize(`${p.name} ${p.email} ${p.nif}`).includes(n))
        out.push({ id: p.id, title: p.name, sub: `Interessado · ${caseName.get(p.caseId) ?? ''}`, href: `/dossiers/${p.caseId}/interessados` });
    }
    return out.slice(0, 8);
  }, [q, data]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (href: string) => {
    navigate(href);
    setOpen(false);
    setQ('');
  };

  return (
    <div className="search" ref={wrap} style={{ position: 'relative' }}>
      <div className="input-group">
        <Search aria-hidden />
        <input
          id="global-search"
          className="input"
          type="search"
          placeholder="Pesquisar dossiers, falecidos, clientes, interessados…"
          autoComplete="off"
          value={q}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="global-search-results"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              const r = results[active];
              if (r) go(r.href);
            } else if (e.key === 'Escape') {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {!q && <span className="kbd" aria-hidden>/</span>}
      </div>
      {open && q && (
        <div className="menu align-left" id="global-search-results" role="listbox" style={{ width: '100%' }}>
          {results.length === 0 ? (
            <div className="subtle small" style={{ padding: '10px 12px' }}>
              Sem resultados para “{q}”.
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className="menu-item"
                style={i === active ? { background: 'var(--surface-3)' } : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.href)}
              >
                <FolderOpen aria-hidden />
                <span style={{ minWidth: 0 }}>
                  <span className="truncate" style={{ display: 'block' }}>
                    {r.title}
                  </span>
                  <span className="menu-desc truncate">{r.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
