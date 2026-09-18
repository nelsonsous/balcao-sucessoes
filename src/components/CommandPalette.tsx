import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calculator,
  CalendarDays,
  CircleCheck,
  Database,
  Download,
  EyeOff,
  FolderOpen,
  Lock,
  LayoutDashboard,
  ListChecks,
  Moon,
  Plus,
  Search,
  Settings,
  UserCheck,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { FileText, Inbox, Keyboard, MessageSquare, NotebookPen, Recycle, Stethoscope, TrendingUp, Workflow } from 'lucide-react';
import { openShortcutsHelp } from '../lib/shortcuts';
import { CHANNEL_LABELS } from '../lib/labels';
import { DOC_STATUS } from '../lib/documents';
import { formatDate } from '../lib/utils';
import { undoLast } from '../lib/undo';
import { BUILTIN_TEMPLATES } from '../engine/templates';
import { isOpen } from '../engine/phases';
import { downloadBackup } from '../lib/backup';
import { db, setSetting, useSettings } from '../lib/db';
import { useInstall } from '../lib/hooks';
import { lockNow } from '../lib/lock';
import { GROUP_LABELS, loadRecent, pushRecent, rankItems, type PaletteGroup, type PaletteItem } from '../lib/palette';
import { cx } from '../lib/utils';
import { useToast } from './Toast';

const GROUP_ICONS: Record<PaletteGroup, LucideIcon> = {
  recentes: Search,
  navegacao: LayoutDashboard,
  acoes: Plus,
  dossiers: FolderOpen,
  tarefas: CircleCheck,
  minutas: Wand2,
  notas: NotebookPen,
  contactos: MessageSquare,
  documentos: FileText,
};

const NAV_ICONS: Record<string, LucideIcon> = {
  'nav-/': LayoutDashboard,
  'nav-/dossiers': FolderOpen,
  'nav-/agenda': CalendarDays,
  'nav-/tarefas': ListChecks,
  'nav-/minhas': UserCheck,
  'nav-/calculadora': Calculator,
  'nav-/prazos': CalendarDays,
  'nav-/minutas': Wand2,
  'nav-/recebidos': Inbox,
  'nav-/reciclagem': Recycle,
  'nav-/analise': TrendingUp,
  'nav-/regras': Workflow,
  'nav-/diagnostico': Stethoscope,
  'act-atalhos': Keyboard,
  'nav-/definicoes': Settings,
  'act-nova': Plus,
  'act-backup': Database,
  'act-tema': Moon,
  'act-instalar': Download,
  'act-bloquear': Lock,
  'act-privacidade': EyeOff,
};

/** Paleta de comandos (⌘K / Ctrl+K): ir para qualquer sítio, abrir dossiers, tarefas e minutas, executar ações. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const settings = useSettings();
  const install = useInstall();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const data = useLiveQuery(async () => {
    if (!open) return undefined;
    const [cases, tasks, custom, notes, contacts, documents] = await Promise.all([db.cases.toArray(), db.tasks.toArray(), db.templates.toArray(), db.notes.toArray(), db.contacts.toArray(), db.documents.toArray()]);
    return { cases, tasks, custom, notes, contacts, documents };
  }, [open]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ('');
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    } else if (!open && d.open) d.close();
  }, [open]);

  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [
      { id: 'nav-/', group: 'navegacao', title: 'Visão geral', href: '/' },
      { id: 'nav-/dossiers', group: 'navegacao', title: 'Dossiers', keywords: 'lista processos sucessões', href: '/dossiers' },
      { id: 'nav-/agenda', group: 'navegacao', title: 'Agenda', keywords: 'calendário prazos eventos', href: '/agenda' },
      { id: 'nav-/tarefas', group: 'navegacao', title: 'O que está a bloquear?', keywords: 'bloqueios atrasos críticas', href: '/tarefas' },
      { id: 'nav-/minhas', group: 'navegacao', title: 'As minhas tarefas', keywords: 'minhas pessoal', href: '/minhas' },
      { id: 'nav-/calculadora', group: 'navegacao', title: 'Calculadora sucessória', keywords: 'quotas legítima herdeiros', href: '/calculadora' },
      { id: 'nav-/prazos', group: 'navegacao', title: 'Calculadora de prazos', keywords: 'dias úteis férias judiciais contagem termo', href: '/prazos' },
      { id: 'nav-/minutas', group: 'navegacao', title: 'Minutas', keywords: 'cartas emails modelos', href: '/minutas' },
      { id: 'nav-/analise', group: 'navegacao', title: 'Análise da equipa', subtitle: 'Métricas por mês, fase e pessoa', keywords: 'estatísticas gráficos indicadores painel equipa desempenho', href: '/analise' },
      { id: 'nav-/regras', group: 'navegacao', title: 'Regras do escritório', subtitle: 'Tarefas próprias geradas pelo questionário', keywords: 'regras condições automatização checklist práticas escritório tarefas próprias', href: '/regras' },
      { id: 'nav-/diagnostico', group: 'navegacao', title: 'Diagnóstico', subtitle: 'Estado da aplicação e integridade dos dados', keywords: 'integridade verificar reparar erros armazenamento service worker versão apoio suporte', href: '/diagnostico' },
      { id: 'nav-/definicoes', group: 'navegacao', title: 'Definições', keywords: 'equipa tema cópias segurança', href: '/definicoes' },
      { id: 'nav-/recebidos', group: 'navegacao', title: 'Recebidos', subtitle: 'Ficheiros partilhados para a aplicação', keywords: 'partilha telemóvel recebidos anexar inbox', href: '/recebidos' },
      { id: 'nav-/reciclagem', group: 'navegacao', title: 'Reciclagem', subtitle: 'Itens apagados nos últimos 30 dias', keywords: 'lixo apagados repor restaurar', href: '/reciclagem' },
      { id: 'act-nova', group: 'acoes', title: 'Nova sucessão', subtitle: 'Assistente com questionário', shortcut: 'N', href: '/dossiers/novo' },
      { id: 'act-importar', group: 'acoes', title: 'Importar dossier partilhado', subtitle: 'Ficheiro enviado por um colega', keywords: 'partilha juntar colega importar', href: '/dossiers?importar=1' },
      { id: 'act-atalhos', group: 'acoes', title: 'Atalhos de teclado', subtitle: '«?» em qualquer ecrã', keywords: 'teclado atalhos ajuda acessibilidade', run: () => openShortcutsHelp() },
      { id: 'act-anular', group: 'acoes', title: 'Anular a última ação', subtitle: 'Ctrl/⌘+Z fora dos campos de texto', keywords: 'undo desfazer voltar atrás', run: () => void undoLast() },
      {
        id: 'act-backup',
        group: 'acoes',
        title: 'Exportar cópia de segurança',
        subtitle: 'Ficheiro .json com todos os dossiers',
        run: async () => {
          await downloadBackup();
          toast({ tone: 'success', title: 'Cópia de segurança exportada' });
        },
      },
      {
        id: 'act-tema',
        group: 'acoes',
        title: isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro',
        keywords: 'tema escuro claro aparência',
        run: () => void setSetting('theme', isDark ? 'light' : 'dark'),
      },
    ];
    if (install.canPrompt && !install.standalone) out.push({ id: 'act-instalar', group: 'acoes', title: 'Instalar a aplicação', subtitle: 'Abre como app e funciona offline', run: () => void install.install() });
    if (settings.pinJson) out.push({ id: 'act-bloquear', group: 'acoes', title: 'Bloquear agora', subtitle: 'Pede o PIN para continuar', keywords: 'pin bloqueio sair', run: () => lockNow() });
    out.push({
      id: 'act-privacidade',
      group: 'acoes',
      title: settings.privacyMode ? 'Desligar o modo privacidade' : 'Ligar o modo privacidade',
      subtitle: 'Oculta nomes nas listas e no painel (partilha de ecrã)',
      keywords: 'privacidade ocultar nomes discreto',
      run: () => void setSetting('privacyMode', !settings.privacyMode),
    });
    if (data) {
      const caseName = new Map(data.cases.map((c) => [c.id, c]));
      for (const c of data.cases.filter((x) => x.stage !== 'arquivado')) {
        out.push({ id: `case-${c.id}`, group: 'dossiers', title: c.name, subtitle: `${c.ref} · ${c.deceased.name || 'De cujus por indicar'}`, keywords: `${c.client.name} ${c.tags.join(' ')}`, href: `/dossiers/${c.id}` });
      }
      for (const t of [...(data.custom ?? []).map((r) => ({ id: r.id, title: r.title, category: r.category })), ...BUILTIN_TEMPLATES.map((b) => ({ id: b.id, title: b.title, category: b.category }))]) {
        out.push({ id: `tpl-${t.id}`, group: 'minutas', title: t.title, subtitle: `Minuta · ${t.category}`, href: `/minutas?usar=${encodeURIComponent(t.id)}` });
      }
      for (const t of data.tasks) {
        const c = caseName.get(t.caseId);
        if (!c || c.stage !== 'ativo' || t.obsolete || !isOpen(t.status)) continue;
        out.push({ id: `task-${t.id}`, group: 'tarefas', title: t.title, subtitle: `Tarefa · ${c.name}`, keywords: c.ref, href: `/dossiers/${t.caseId}?tarefa=${t.id}` });
      }
      // Pesquisa global: notas, contactos e documentos (só aparecem com pesquisa).
      const firstLine = (s: string) => (s.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 80) || 'Nota';
      for (const n of data.notes) {
        const c = caseName.get(n.caseId);
        if (!c || c.stage === 'arquivado') continue;
        out.push({ id: `note-${n.id}`, group: 'notas', title: firstLine(n.text), subtitle: `Nota · ${c.ref} ${c.name}`, keywords: n.text.slice(0, 500), href: `/dossiers/${n.caseId}/notas` });
      }
      for (const k of data.contacts) {
        const c = caseName.get(k.caseId);
        if (!c || c.stage === 'arquivado') continue;
        out.push({ id: `contact-${k.id}`, group: 'contactos', title: `${k.person || 'Contacto'} — ${CHANNEL_LABELS[k.channel]}`, subtitle: `Contacto · ${formatDate(k.date)} · ${c.ref} ${c.name}`, keywords: `${k.summary} ${k.followUp}`, href: `/dossiers/${k.caseId}/notas` });
      }
      for (const d of data.documents) {
        const c = caseName.get(d.caseId);
        if (!c || c.stage === 'arquivado') continue;
        out.push({ id: `doc-${d.id}`, group: 'documentos', title: d.name, subtitle: `Documento · ${DOC_STATUS.find((s) => s.id === d.status)?.label ?? d.status} · ${c.ref} ${c.name}`, keywords: `${d.fileName} ${d.category} ${d.notes}`, href: `/dossiers/${d.caseId}/documentos` });
      }
    }
    const recent = loadRecent();
    const recents = recent.map((id) => out.find((i) => i.id === id)).filter((i): i is PaletteItem => Boolean(i)).map((i) => ({ ...i, id: `recent-${i.id}`, group: 'recentes' as PaletteGroup }));
    return [...recents, ...out];
  }, [data, isDark, install, toast, settings.pinJson, settings.privacyMode]);

  const results = useMemo(() => rankItems(items, q), [items, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item: PaletteItem) => {
    pushRecent(item.id.replace(/^recent-/, ''));
    onClose();
    if (item.href) navigate(item.href);
    else if (item.run) void item.run();
  };

  // Agrupar mantendo a ordem
  const grouped: Array<{ group: PaletteGroup; items: Array<{ item: PaletteItem; index: number }> }> = [];
  results.forEach((item, index) => {
    const last = grouped[grouped.length - 1];
    if (last && last.group === item.group) last.items.push({ item, index });
    else grouped.push({ group: item.group, items: [{ item, index }] });
  });

  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label="Paleta de comandos"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="palette-panel">
        <div className="palette-input">
          <Search aria-hidden />
          <input
            ref={input}
            className="input"
            placeholder="Ir para, abrir um dossier, uma tarefa ou uma minuta…"
            value={q}
            autoComplete="off"
            aria-label="Pesquisar comandos"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                const r = results[active];
                if (r) run(r);
              }
            }}
          />
          <span className="kbd" aria-hidden>
            Esc
          </span>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 ? (
            <div className="subtle small" style={{ padding: '14px 16px' }}>
              Sem resultados para “{q}”.
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.group} className="palette-group">
                <div className="palette-group-label">{GROUP_LABELS[g.group]}</div>
                {g.items.map(({ item, index }) => {
                  const Icon = NAV_ICONS[item.id.replace(/^recent-/, '')] ?? GROUP_ICONS[item.group];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      data-index={index}
                      data-group={item.group}
                      className={cx('palette-item', index === active && 'active')}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(item)}
                    >
                      <Icon aria-hidden />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="truncate" style={{ display: 'block' }}>
                          {item.title}
                        </span>
                        {item.subtitle && <span className="palette-sub truncate">{item.subtitle}</span>}
                      </span>
                      {item.shortcut && <span className="kbd">{item.shortcut}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="palette-foot">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> navegar
          </span>
          <span>
            <span className="kbd">Enter</span> abrir
          </span>
          <span>
            <span className="kbd">⌘K</span> / <span className="kbd">Ctrl K</span> abrir a paleta
          </span>
        </div>
      </div>
    </dialog>
  );
}
