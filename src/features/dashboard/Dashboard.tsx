import { useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowRight,
  Calculator,
  CalendarDays,
  Siren,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  FolderOpen,
  Gauge,
  Hourglass,
  Layers,
  MessageSquare,
  Plus,
  Sparkles,
  TriangleAlert,
  Users,
  Wand2,
} from 'lucide-react';
import { useAgendaItems } from '../../lib/agenda';
import { db, useSettings } from '../../lib/db';
import { loadDemoData } from '../../lib/demo';
import { isActiveCase, useMemberMap, useOverviews, type CaseOverview } from '../../lib/hooks';
import type { MemberRecord, TaskRecord } from '../../lib/types';
import { cx, formatDate, greeting, relativeDays, todayIso } from '../../lib/utils';
import { dueState } from '../../engine/deadlines';
import { rankOpenTasks } from '../../engine/insights';
import { PHASES, phaseLabel } from '../../engine/phases';
import { PHASE_ICONS } from '../../components/icons';
import { WeekStrip } from '../agenda/WeekStrip';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Card, CardHead, DueChip, HealthBadge, KpiCard, Progress } from '../../components/ui';

export function Dashboard() {
  const settings = useSettings();
  const overviews = useOverviews();
  const members = useMemberMap();
  const [, navigate] = useLocation();
  const toast = useToast();
  const agenda = useAgendaItems();
  const followUps = useLiveQuery(
    () => db.contacts.filter((c) => Boolean(c.followUp) && !c.followUpDone).toArray(),
    [],
  );

  const m = useMemo(() => {
    const all = overviews ?? [];
    const active = all.filter((o) => isActiveCase(o.c));
    const attention = active.filter((o) => o.health.level === 'vermelho');
    const moving = active.filter((o) => o.health.level === 'laranja' || o.health.level === 'azul');
    const done = all.filter((o) => o.c.stage === 'concluido' || o.c.stage === 'arquivado' || (o.health.level === 'verde' && o.stats.total > 0));
    const caseById = new Map(all.map((o) => [o.c.id, o]));

    const openTasks: TaskRecord[] = active.flatMap((o) => o.tasks);
    const nextActions = rankOpenTasks(openTasks).slice(0, 6);
    const overdue = openTasks.filter((t) => !t.obsolete && dueState(t.dueDate, t.status) === 'atrasado').length;
    const soon = openTasks.filter((t) => {
      const s = dueState(t.dueDate, t.status);
      return !t.obsolete && (s === 'hoje' || s === 'urgente' || s === 'proximo');
    }).length;

    const buckets = [
      active.filter((o) => o.stats.pct < 40).length,
      active.filter((o) => o.stats.pct >= 40 && o.stats.pct < 70).length,
      active.filter((o) => o.stats.pct >= 70).length,
    ];

    const pipeline = PHASES.map((p) => ({ p, list: active.filter((o) => o.phase === p.id) }));

    const load = new Map<string, { active: number; open: number; overdue: number }>();
    for (const o of active) {
      const k = o.c.responsibleId || '';
      const cur = load.get(k) ?? { active: 0, open: 0, overdue: 0 };
      cur.active += 1;
      cur.open += o.stats.open;
      cur.overdue += o.stats.overdue;
      load.set(k, cur);
    }

    const needAttention = [...attention, ...moving]
      .sort((a, b) => (a.health.level === 'vermelho' ? -1 : 0) - (b.health.level === 'vermelho' ? -1 : 0) || a.stats.pct - b.stats.pct)
      .slice(0, 5);

    return { all, active, attention, moving, done, nextActions, overdue, soon, buckets, pipeline, load, caseById, needAttention };
  }, [overviews]);

  if (overviews === undefined) return <div className="skeleton" style={{ height: 420 }} />;

  const today = new Date();
  const limit30 = todayIso(new Date(Date.now() + 30 * 86_400_000));
  const upcoming = (agenda ?? []).filter((i) => !i.done && i.date <= limit30 && i.source !== 'contacto').slice(0, 7);
  const dueFollowUps = (followUps ?? [])
    .filter((f) => {
      const s = dueState(f.followUp, 'pendente');
      return s === 'atrasado' || s === 'hoje' || s === 'urgente';
    })
    .sort((a, b) => a.followUp.localeCompare(b.followUp))
    .slice(0, 5);

  if (m.all.length === 0) {
    return (
      <div className="welcome">
        <div className="welcome-mark" aria-hidden>
          BS
        </div>
        <h1>{settings.userName ? `${greeting()}, ${settings.userName.split(' ')[0]}.` : 'Boas-vindas ao Balcão das Sucessões.'}</h1>
        <p className="lede">
          Um balcão só vosso para organizar, acompanhar e identificar o próximo passo de cada sucessão. <em>{settings.tagline}</em>
        </p>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 10, marginTop: 8 }}>
          <Button variant="primary" size="lg" icon={Plus} onClick={() => navigate('/dossiers/novo')}>
            Criar a primeira sucessão
          </Button>
          <Button
            size="lg"
            icon={Sparkles}
            onClick={async () => {
              const n = await loadDemoData();
              toast({ tone: 'success', title: 'Dados de demonstração carregados', description: `${n} dossiers fictícios` });
            }}
          >
            Explorar com dados fictícios
          </Button>
        </div>
        <div className="welcome-steps">
          {[
            ['1', 'Começar pelo essencial', 'Perguntas certas → dossier certo.'],
            ['2', 'A checklist é o motor', 'Cada resposta faz aparecer o trabalho aplicável.'],
            ['3', 'Ver o que está a bloquear', 'E perceber logo a próxima ação.'],
            ['4', 'Pessoas, património e memória', 'Tudo no lugar certo, com prazos calculados.'],
          ].map(([n, t, d]) => (
            <div key={n} className="welcome-step">
              <span>{n}</span>
              <strong>{t}</strong>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(today)}
          </div>
          <h1>
            {greeting()}
            {settings.userName ? `, ${settings.userName.split(' ')[0]}` : ''}.
          </h1>
          <p className="lede">
            <em>{settings.tagline}</em> Uma visão global dos dossiers, em tempo real.
          </p>
        </div>
        <div className="page-actions">
          <Button icon={FolderOpen} onClick={() => navigate('/dossiers')}>
            Ver dossiers
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => navigate('/dossiers/novo')}>
            Nova sucessão
          </Button>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Dossiers em curso" value={m.active.length} icon={FolderOpen} tone="brand" onClick={() => navigate('/dossiers')} foot={`${m.all.length} no total`} />
        <KpiCard label="A precisar de atenção" value={m.attention.length} icon={CircleAlert} tone="red" onClick={() => navigate('/tarefas')} foot="Prazos ou tarefas críticas" />
        <KpiCard label="Em andamento" value={m.moving.length} icon={Hourglass} tone="orange" foot="Trabalho a decorrer" />
        <KpiCard label="Concluídos" value={m.done.length} icon={CircleCheck} tone="green" foot="Encerrados ou 100%" />
        <KpiCard
          label="Prazos (30 dias)"
          value={m.soon}
          icon={CalendarClock}
          tone={m.overdue ? 'red' : 'blue'}
          onClick={() => navigate('/tarefas')}
          foot={m.overdue ? `${m.overdue} ultrapassado(s)` : 'Nenhum ultrapassado'}
        />
      </div>

      <WeekStrip />

      <div className="dash-grid">
        <Card className="span-7">
          <CardHead icon={ArrowRight} title="Próximas ações" subtitle="O que fazer a seguir, ordenado por urgência em todos os dossiers." />
          <div className="card-body">
            {m.nextActions.length === 0 ? (
              <p className="subtle small">Sem ações em aberto. 🎉</p>
            ) : (
              <div className="list">
                {m.nextActions.map((t) => {
                  const o = m.caseById.get(t.caseId);
                  const Icon = PHASE_ICONS[t.phase];
                  return (
                    <Link key={t.id} href={`/dossiers/${t.caseId}`} className="list-item action-item">
                      <span className={cx('dot', t.status)} aria-hidden />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="li-title">
                          {t.critical && <TriangleAlert size={13} className="crit-icon" aria-label="Crítica" />} {t.title}
                        </div>
                        <div className="li-sub row" style={{ gap: 6 }}>
                          <Icon size={12} aria-hidden /> {phaseLabel(t.phase)} · <span className="truncate">{o?.c.name}</span>
                        </div>
                      </div>
                      <DueChip date={t.dueDate} status={t.status} withRelative={false} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <Card className="span-5">
          <CardHead
            icon={CalendarClock}
            title="Agenda próxima"
            subtitle="Prazos, escrituras e reuniões — ultrapassados e próximos 30 dias"
            actions={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('/agenda')}>
                Agenda
              </Button>
            }
          />
          <div className="card-body">
            {upcoming.length === 0 ? (
              <p className="subtle small">Nada agendado nos próximos 30 dias.</p>
            ) : (
              <div className="list">
                {upcoming.map((i) => (
                  <Link
                    key={i.key}
                    href={i.source === 'prazo' ? `/dossiers/${i.caseId}?tarefa=${i.id}` : i.source === 'evento' ? `/agenda?dia=${i.date}` : `/dossiers/${i.caseId}/notas`}
                    className="list-item deadline-item"
                  >
                    <div className={cx('date-tile', i.source === 'evento' ? 'evento' : i.state)}>
                      <span>{formatDate(i.date, 'daymonth').split(' ')[0]}</span>
                      <small>{formatDate(i.date, 'daymonth').split(' ').slice(1).join(' ')}</small>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-title truncate">
                        {i.time && <span className="time-tag">{i.time}</span>}
                        {i.title}
                      </div>
                      <div className="li-sub truncate">
                        {i.source === 'prazo' ? 'Prazo' : i.source === 'evento' ? i.subtitle : 'Contacto'}
                        {i.caseName ? ` · ${i.caseName}` : ''} · {relativeDays(i.date)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="span-7">
          <CardHead
            icon={CircleAlert}
            title="Dossiers que precisam de atenção"
            subtitle="Uma vista rápida dos dossiers com trabalho por acompanhar."
            actions={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => navigate('/dossiers')}>
                Todos
              </Button>
            }
          />
          <div className="card-body">
            {m.needAttention.length === 0 ? (
              <p className="subtle small">Nenhum dossier com trabalho em aberto.</p>
            ) : (
              <div className="list">
                {m.needAttention.map((o) => (
                  <CaseLine key={o.c.id} o={o} member={members.get(o.c.responsibleId)} />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="span-5">
          <CardHead icon={Gauge} title="Evolução global" subtitle="Dossiers ativos por nível de conclusão." />
          <div className="card-body">
            {[
              ['0–39%', m.buckets[0]!, 'low'],
              ['40–69%', m.buckets[1]!, 'mid'],
              ['70–100%', m.buckets[2]!, 'high'],
            ].map(([label, n, cls]) => (
              <div key={label as string} className="dist-row">
                <span>{label}</span>
                <div className="dist-bar">
                  <i className={cls as string} style={{ width: `${(Number(n) / Math.max(1, ...m.buckets)) * 100}%` }} />
                </div>
                <strong className="tabular">{n}</strong>
              </div>
            ))}
            <div className={cx('callout', m.attention.length ? 'danger' : 'success')} style={{ marginTop: 14 }}>
              {m.attention.length ? <TriangleAlert aria-hidden /> : <CircleCheck aria-hidden />}
              <div>
                {m.attention.length ? (
                  <>
                    <strong>{m.attention.length}</strong> dossier(s) com prazos ultrapassados ou tarefas críticas por iniciar.{' '}
                    <Link href="/tarefas">Ver bloqueios →</Link>
                  </>
                ) : (
                  'Nenhum dossier bloqueado neste momento.'
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="span-12">
          <CardHead icon={Layers} title="Onde estão os dossiers" subtitle="Fase atual de cada dossier ativo (primeira fase com trabalho em aberto)." />
          <div className="card-body">
            <div className="pipeline">
              {m.pipeline.map(({ p, list }) => {
                const Icon = PHASE_ICONS[p.id];
                return (
                  <div key={p.id} className={cx('pipe-col', list.length > 0 && 'has')}>
                    <div className="pipe-head">
                      <Icon aria-hidden />
                      <span className="truncate">{p.label}</span>
                      <span className="pipe-count">{list.length}</span>
                    </div>
                    <div className="pipe-items">
                      {list.slice(0, 4).map((o) => (
                        <Link key={o.c.id} href={`/dossiers/${o.c.id}`} className={cx('pipe-item', o.health.level)}>
                          <span className={cx('dot', o.health.level)} aria-hidden />
                          <span className="truncate">{o.c.name}</span>
                        </Link>
                      ))}
                      {list.length > 4 && <span className="tiny subtle">+{list.length - 4}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="span-6">
          <CardHead icon={Users} title="Carga por responsável" subtitle="Dossiers ativos, tarefas em aberto e prazos ultrapassados." />
          <div className="card-body">
            {m.load.size === 0 ? (
              <p className="subtle small">Sem dossiers ativos.</p>
            ) : (
              <div className="list">
                {[...m.load.entries()]
                  .sort((a, b) => b[1].open - a[1].open)
                  .map(([id, l]) => {
                    const mem = members.get(id);
                    const maxOpen = Math.max(1, ...[...m.load.values()].map((x) => x.open));
                    return (
                      <div key={id || 'none'} className="list-item">
                        <Avatar member={mem} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <span className="li-title">{mem?.name ?? 'Sem responsável'}</span>
                            <span className="small subtle tabular">
                              {l.active} dossier(s) · {l.open} tarefas
                              {l.overdue > 0 && <span className="warn-text"> · {l.overdue} em atraso</span>}
                            </span>
                          </div>
                          <Progress pct={(l.open / maxOpen) * 100} thin label={`Carga de ${mem?.name ?? 'sem responsável'}`} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </Card>

        <Card className="span-6">
          <CardHead icon={MessageSquare} title="Contactos a retomar" subtitle="Lembretes do registo de contactos (até 7 dias)." />
          <div className="card-body">
            {dueFollowUps.length === 0 ? (
              <p className="subtle small">Sem contactos a retomar nos próximos dias.</p>
            ) : (
              <div className="list">
                {dueFollowUps.map((f) => (
                  <Link key={f.id} href={`/dossiers/${f.caseId}/notas`} className="list-item">
                    <span className={cx('due', dueState(f.followUp, 'pendente'))}>{formatDate(f.followUp, 'daymonth')}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-title truncate">{f.person || 'Contacto'}</div>
                      <div className="li-sub truncate">
                        {m.caseById.get(f.caseId)?.c.name} · {f.summary}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
      <div className="tool-links">
        <Link href="/calculadora" className="card interactive tool-link">
          <span className="icon-tile brand">
            <Calculator aria-hidden />
          </span>
          <span>
            <strong>Calculadora sucessória</strong>
            <span className="li-sub">Quotas, legítima, quota disponível e árvore genealógica</span>
          </span>
        </Link>
        <Link href="/minutas" className="card interactive tool-link">
          <span className="icon-tile brand">
            <Wand2 aria-hidden />
          </span>
          <span>
            <strong>Minutas</strong>
            <span className="li-sub">Cartas, emails e procurações preenchidos automaticamente</span>
          </span>
        </Link>
        <Link href="/agenda" className="card interactive tool-link">
          <span className="icon-tile brand">
            <CalendarDays aria-hidden />
          </span>
          <span>
            <strong>Agenda</strong>
            <span className="li-sub">Prazos, escrituras, reuniões e feriados</span>
          </span>
        </Link>
        <Link href="/tarefas" className="card interactive tool-link">
          <span className="icon-tile red">
            <Siren aria-hidden />
          </span>
          <span>
            <strong>O que está a bloquear?</strong>
            <span className="li-sub">Prazos ultrapassados e críticas por iniciar</span>
          </span>
        </Link>
      </div>
      <p className="footnote">
        Ferramenta de apoio à gestão — as referências legais e prazos são indicativos e devem ser validados pela equipa em cada caso.
      </p>
    </div>
  );
}

export function CaseLine({ o, member }: { o: CaseOverview; member?: MemberRecord }) {
  return (
    <Link href={`/dossiers/${o.c.id}`} className="list-item case-line">
      <Avatar member={member} size="sm" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
          <span className="li-title truncate">{o.c.name}</span>
          <span className="strong tabular">{o.stats.pct}%</span>
        </div>
        <Progress pct={o.stats.pct} thin label={`Progresso de ${o.c.name}`} />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 4, gap: 8 }}>
          <span className="li-sub truncate">{o.next ? `➡ ${o.next.title}` : 'Sem ações em aberto'}</span>
          <HealthBadge health={o.health} />
        </div>
      </div>
    </Link>
  );
}
