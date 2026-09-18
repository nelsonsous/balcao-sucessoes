import { describe, expect, it } from 'vitest';
import { analyze, isOnTime, median, membersCsv, monthLabel, monthRange, monthsCsv, pct, daysLabel } from './analytics';
import { newCase, newTask } from './db';
import type { MemberRecord } from './types';

const NOW = new Date(2026, 8, 17, 12); // 17/09/2026
const members: MemberRecord[] = [
  { id: 'ana', name: 'Ana', role: 'Advogada', color: '#111', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'rui', name: 'Rui', role: 'Solicitador', color: '#222', createdAt: '2026-01-01T00:00:00.000Z' },
];

function fixture() {
  const c1 = newCase({ id: 'c1', name: 'Um', ref: 'R1', responsibleId: 'ana', stage: 'ativo', createdAt: '2026-06-10T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z' });
  const c2 = newCase({ id: 'c2', name: 'Dois', ref: 'R2', responsibleId: 'rui', stage: 'concluido', createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z' });
  const c3 = newCase({ id: 'c3', name: 'Três', ref: 'R3', responsibleId: 'ana', stage: 'ativo', createdAt: '2025-11-05T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' });
  const tasks = [
    // c1 (Ana): abertura concluída dentro do prazo em julho; património em atraso
    newTask('c1', { id: 't1', phase: 'abertura', title: 'A', status: 'concluido', dueDate: '2026-07-20', createdAt: '2026-06-10T10:00:00.000Z', completedAt: '2026-07-15T10:00:00.000Z' }),
    newTask('c1', { id: 't2', phase: 'abertura', title: 'B', status: 'concluido', dueDate: '2026-07-01', createdAt: '2026-06-10T10:00:00.000Z', completedAt: '2026-07-05T10:00:00.000Z' }), // falhado
    newTask('c1', { id: 't3', phase: 'patrimonio', title: 'C', status: 'pendente', dueDate: '2026-09-01', createdAt: '2026-06-10T10:00:00.000Z' }), // em atraso
    newTask('c1', { id: 't4', phase: 'patrimonio', title: 'D', status: 'em_curso', dueDate: '2026-12-01', createdAt: '2026-06-10T10:00:00.000Z', assigneeId: 'rui' }), // atribuída ao Rui
    newTask('c1', { id: 't5', phase: 'fiscal', title: 'E', status: 'na', createdAt: '2026-06-10T10:00:00.000Z' }),
    // c2 (Rui, encerrado em agosto): tudo concluído
    newTask('c2', { id: 't6', phase: 'abertura', title: 'F', status: 'concluido', dueDate: '2026-03-20', createdAt: '2026-03-01T10:00:00.000Z', completedAt: '2026-03-10T10:00:00.000Z' }),
    newTask('c2', { id: 't7', phase: 'fiscal', title: 'G', status: 'concluido', dueDate: '2026-06-01', createdAt: '2026-03-01T10:00:00.000Z', completedAt: '2026-08-15T10:00:00.000Z' }), // falhado, no período
    // c3 (Ana, antigo): concluída sem prazo em setembro; uma obsoleta ignorada
    newTask('c3', { id: 't8', phase: 'abertura', title: 'H', status: 'concluido', createdAt: '2025-11-05T10:00:00.000Z', completedAt: '2026-09-02T10:00:00.000Z' }),
    newTask('c3', { id: 't9', phase: 'abertura', title: 'I', status: 'pendente', obsolete: true, createdAt: '2025-11-05T10:00:00.000Z' }),
  ];
  return { cases: [c1, c2, c3], tasks };
}

describe('análise da equipa', () => {
  it('utilitários de meses, percentagens e medianas', () => {
    expect(monthLabel('2026-09')).toBe('set 2026');
    expect(monthRange('2026-07', NOW)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(monthRange('2025-11', new Date(2026, 1, 3))).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(pct(null)).toBe('—');
    expect(pct(0.6667)).toBe('67%');
    expect(daysLabel(null)).toBe('—');
    expect(daysLabel(3.4)).toBe('3.4 dias');
    expect(daysLabel(35.4)).toBe('35 dias');
    expect(isOnTime({ dueDate: '2026-07-20', completedAt: '2026-07-20T23:00:00.000Z' })).toBe(true);
    expect(isOnTime({ dueDate: '2026-07-20', completedAt: '2026-07-21T00:00:00.000Z' })).toBe(false);
    expect(isOnTime({ dueDate: '', completedAt: '2026-07-21T00:00:00.000Z' })).toBe(false);
  });

  it('agrega por mês no período escolhido', () => {
    const { cases, tasks } = fixture();
    const a = analyze({ cases, tasks, members, period: 6, now: NOW });
    expect(a.since).toBe('2026-04-01');
    expect(a.months.map((m) => m.key)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    const jul = a.months.find((m) => m.key === '2026-07')!;
    expect(jul).toMatchObject({ tasksDone: 2, onTime: 1, late: 1, opened: 0, closed: 0 });
    expect(a.months.find((m) => m.key === '2026-06')!.opened).toBe(1);
    expect(a.months.find((m) => m.key === '2026-08')!).toMatchObject({ closed: 1, tasksDone: 1, onTime: 0, late: 1 });
    expect(a.months.find((m) => m.key === '2026-09')!).toMatchObject({ tasksDone: 1, onTime: 0, late: 0 }); // sem prazo não conta nos prazos
    // «Tudo» começa no mês do dossier mais antigo
    const all = analyze({ cases, tasks, members, period: 0, now: NOW });
    expect(all.months[0]!.key).toBe('2025-11');
    expect(all.months.at(-1)!.key).toBe('2026-09');
    expect(monthsCsv(all).rows[0]).toEqual(['nov 2025', 1, 0, 0, 0, 0]);
  });

  it('calcula indicadores globais, fases e tempos até concluir', () => {
    const { cases, tasks } = fixture();
    const a = analyze({ cases, tasks, members, period: 12, now: NOW });
    expect(a.kpis.activeCases).toBe(2);
    expect(a.kpis.closedCases).toBe(1);
    expect(a.kpis.openTasks).toBe(2); // t3, t4 (t9 obsoleta e t5 N/A ignoradas)
    expect(a.kpis.overdueOpen).toBe(1); // t3
    expect(a.kpis.tasksDone).toBe(5);
    expect(a.kpis.onTimeRate).toBe(0.5); // t1, t6 cumpridos; t2, t7 falhados
    expect(a.kpis.meanCloseDays).toBe(172); // c2: 1/3 → 20/8
    const abertura = a.phases.find((p) => p.id === 'abertura')!;
    expect(abertura).toMatchObject({ total: 4, done: 4, open: 0, overdue: 0, casesCompleted: 3 });
    // c1: 10/6 → 15/7 = 35 dias; c2: 1/3 → 10/3 = 9; c3: 5/11/25 → 2/9/26 ≈ 301
    expect(abertura.medianDays).toBe(35);
    expect(abertura.meanDays).toBe(115);
    const patrimonio = a.phases.find((p) => p.id === 'patrimonio')!;
    expect(patrimonio).toMatchObject({ total: 2, open: 2, overdue: 1, casesCompleted: 0, medianDays: null });
    expect(a.phases.find((p) => p.id === 'fiscal')!).toMatchObject({ total: 1, done: 1, casesCompleted: 1 });
  });

  it('agrega por pessoa: responsável ou tarefa atribuída, e permite filtrar por pessoa', () => {
    const { cases, tasks } = fixture();
    const a = analyze({ cases, tasks, members, period: 12, now: NOW });
    const ana = a.members.find((m) => m.id === 'ana')!;
    const rui = a.members.find((m) => m.id === 'rui')!;
    expect(ana).toMatchObject({ activeCases: 2, openTasks: 1, overdue: 1, doneRecent: 1 }); // t3 em aberto/atraso; t8 concluída há 15 dias
    expect(ana.onTimeRate).toBe(0.5); // t1 cumprida, t2 falhada (t8 sem prazo)
    expect(rui).toMatchObject({ activeCases: 0, openTasks: 1, overdue: 0, doneRecent: 0 }); // t4 atribuída no c1 (ativo)
    expect(rui.onTimeRate).toBe(0.5); // t6 cumprida, t7 falhada
    expect(rui.meanCompletionDays).toBe(88); // t6: 9 dias; t7: 167 dias
    const soRui = analyze({ cases, tasks, members, period: 12, memberId: 'rui', now: NOW });
    expect(soRui.members.map((m) => m.id)).toEqual(['rui']);
    expect(soRui.kpis.activeCases).toBe(0);
    expect(soRui.kpis.closedCases).toBe(1);
    expect(soRui.kpis.tasksDone).toBe(2);
    const csv = membersCsv(a);
    expect(csv.header[0]).toBe('Pessoa');
    expect(csv.rows.find((r) => r[0] === 'Rui')).toEqual(['Rui', 0, 1, 0, 0, 50, 88, 0]);
  });

  it('soma o tempo registado (honorários) por pessoa e no âmbito, dentro do período', () => {
    const { cases, tasks } = fixture();
    const mk = (id: string, caseId: string, memberId: string, date: string, minutes: number) => ({ id, caseId, memberId, date, minutes, description: '', billable: true, rate: null, createdAt: '', updatedAt: '' });
    const timeEntries = [mk('e1', 'c1', 'ana', '2026-09-10', 90), mk('e2', 'c2', 'rui', '2026-08-01', 60), mk('e3', 'c1', 'rui', '2025-01-01', 600), mk('e4', 'fora', 'ana', '2026-09-10', 30)];
    const a = analyze({ cases, tasks, members, timeEntries, period: 3, now: NOW });
    expect(a.members.find((m) => m.id === 'ana')!.minutesLogged).toBe(90); // e4 é de um dossier inexistente
    expect(a.members.find((m) => m.id === 'rui')!.minutesLogged).toBe(60); // e3 fora do período
    expect(a.kpis.minutesLogged).toBe(150);
    expect(analyze({ cases, tasks, members, timeEntries, period: 3, memberId: 'rui', now: NOW }).kpis.minutesLogged).toBe(60);
    expect(membersCsv(a).rows.find((r) => r[0] === 'Ana')!.at(-1)).toBe(1.5);
  });

  it('sem dados devolve zeros e nulos sem falhar', () => {
    const a = analyze({ cases: [], tasks: [], members: [], period: 3, now: NOW });
    expect(a.months).toHaveLength(3);
    expect(a.kpis).toEqual({ activeCases: 0, closedCases: 0, openTasks: 0, overdueOpen: 0, tasksDone: 0, onTimeRate: null, meanCloseDays: null, minutesLogged: 0 });
    expect(a.phases.every((p) => p.total === 0 && p.medianDays === null)).toBe(true);
    expect(a.members).toEqual([]);
  });
});
