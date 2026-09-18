import { beforeEach, describe, expect, it } from 'vitest';
import { wipeAll } from './backup';
import { db, getSetting, newCase, newExpense, newProvision, newTimeEntry } from './db';
import {
  DEFAULT_FEES,
  addExpense,
  addProvision,
  addTimeEntry,
  deleteExpense,
  deleteProvision,
  deleteTimeEntry,
  discardTimer,
  elapsedMinutes,
  feeSummary,
  feesCsv,
  formatDuration,
  parseDuration,
  readFees,
  resolveRate,
  roundUp,
  saveFees,
  startTimer,
  stopTimer,
} from './fees';
import { buildReport, loadCaseBundle } from './reports';
import { exportDossier } from './share';
import type { MemberRecord } from './types';
import { clearUndo, undoLast } from './undo';

const settings = { hourlyRate: 120, vatRate: 23, timeRounding: 6, withholdingRate: 25 };
const members: MemberRecord[] = [
  { id: 'ana', name: 'Ana', role: 'Advogada', color: '#111', hourlyRate: 150, createdAt: '' },
  { id: 'rui', name: 'Rui', role: 'Solicitador', color: '#222', hourlyRate: null, createdAt: '' },
];

function sample() {
  const entries = [
    newTimeEntry('c', { id: 'e1', date: '2026-09-01', minutes: 50, memberId: 'ana', description: 'Reunião' }), // 54 min × 150 = 135
    newTimeEntry('c', { id: 'e2', date: '2026-09-02', minutes: 30, memberId: 'rui', description: 'Pedidos' }), // 30 min × 120 = 60
    newTimeEntry('c', { id: 'e3', date: '2026-09-03', minutes: 60, memberId: 'ana', description: 'Habilitação', rate: 200 }), // 60 × 200 = 200
    newTimeEntry('c', { id: 'e4', date: '2026-09-04', minutes: 45, memberId: 'rui', description: 'Interno', billable: false }),
  ];
  const expenses = [
    newExpense('c', { id: 'x1', category: 'certidoes', amount: 40, billable: true }),
    newExpense('c', { id: 'x2', category: 'emolumentos', amount: 150, billable: true }),
    newExpense('c', { id: 'x3', category: 'deslocacoes', amount: 18.6, billable: false }),
  ];
  const provisions = [newProvision('c', { id: 'p1', amount: 500 })];
  return { entries, expenses, provisions };
}

describe('honorários: cálculo', () => {
  it('lê durações escritas à mão e formata h:mm', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1h30')).toBe(90);
    expect(parseDuration('2h')).toBe(120);
    expect(parseDuration('45m')).toBe(45);
    expect(parseDuration('90 min')).toBe(90);
    expect(parseDuration('1,5')).toBe(90);
    expect(parseDuration('0.25')).toBe(15);
    for (const bad of ['', 'abc', '0', '25:00', '1:75', '-1']) expect(parseDuration(bad)).toBeNull();
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(5)).toBe('0:05');
    expect(roundUp(7, 6)).toBe(12);
    expect(roundUp(12, 6)).toBe(12);
    expect(roundUp(7, 0)).toBe(7);
  });

  it('taxa: a da entrada, a do dossier, a da pessoa e, por fim, a do escritório', () => {
    const map = new Map(members.map((m) => [m.id, m]));
    expect(resolveRate({ rate: 200, memberId: 'ana' }, DEFAULT_FEES, map, 120)).toBe(200);
    expect(resolveRate({ rate: null, memberId: 'ana' }, { ...DEFAULT_FEES, rate: 90 }, map, 120)).toBe(90);
    expect(resolveRate({ rate: null, memberId: 'ana' }, DEFAULT_FEES, map, 120)).toBe(150);
    expect(resolveRate({ rate: null, memberId: 'rui' }, DEFAULT_FEES, map, 120)).toBe(120);
    expect(resolveRate({ rate: null, memberId: 'x' }, DEFAULT_FEES, map, 120)).toBe(120);
  });

  it('por hora: arredonda a blocos, aplica IVA, soma despesas a debitar e desconta provisões', () => {
    const s = feeSummary({ ...sample(), cfg: DEFAULT_FEES, members, settings });
    expect(s.minutes).toBe(185);
    expect(s.billableMinutes).toBe(140);
    expect(s.billedMinutes).toBe(144);
    expect(s.lines.map((l) => [l.entry.id, l.billedMinutes, l.rate, l.amount])).toEqual([
      ['e1', 54, 150, 135],
      ['e2', 30, 120, 60],
      ['e3', 60, 200, 200],
    ]);
    expect(s.feesNet).toBe(395);
    expect(s.vat).toBe(90.85);
    expect(s.withholding).toBe(0);
    expect(s.expensesTotal).toBe(208.6);
    expect(s.expensesBillable).toBe(190);
    expect(s.provisions).toBe(500);
    expect(s.due).toBe(175.85);
    expect(s.byMember).toEqual([
      { memberId: 'ana', name: 'Ana', minutes: 110, amount: 335 },
      { memberId: 'rui', name: 'Rui', minutes: 75, amount: 60 },
    ]);
    expect(s.byCategory[0]).toMatchObject({ category: 'emolumentos', amount: 150 });
    // retenção na fonte (25%)
    const w = feeSummary({ ...sample(), cfg: { ...DEFAULT_FEES, withholding: true }, members, settings });
    expect(w.withholding).toBe(98.75);
    expect(w.due).toBe(77.1);
  });

  it('valor fixo: honorários acordados, com valor por hora efetivo; saldo a favor do cliente', () => {
    const s = feeSummary({ ...sample(), cfg: { ...DEFAULT_FEES, mode: 'fixo', fixedFee: 1500 }, members, settings });
    expect(s.feesNet).toBe(1500);
    expect(s.vat).toBe(345);
    expect(s.timeValue).toBe(395);
    expect(s.effectiveRate).toBe(486.49);
    const refund = feeSummary({ entries: [], expenses: [], provisions: [newProvision('c', { amount: 300 })], cfg: { ...DEFAULT_FEES, mode: 'fixo', fixedFee: 100 }, members, settings });
    expect(refund.due).toBe(-177);
    expect(refund.effectiveRate).toBeNull();
    const csv = feesCsv(feeSummary({ ...sample(), cfg: DEFAULT_FEES, members, settings }), sample().expenses, sample().provisions, members);
    expect(csv.header[0]).toBe('Tipo');
    expect(csv.rows).toHaveLength(3 + 3 + 1 + 1);
    expect(csv.rows.at(-1)).toEqual(['Total a pagar', '', 'Honorários por hora', '', '3:05', 2.4, null, 175.85]);
  });

  it('acordo guardado no dossier e leitura tolerante', () => {
    expect(readFees({})).toEqual(DEFAULT_FEES);
    expect(readFees({ feesJson: '{estragado' })).toEqual(DEFAULT_FEES);
    expect(readFees({ feesJson: JSON.stringify({ mode: 'fixo', fixedFee: '12', rate: 90, withholding: 'sim' }) })).toEqual({ mode: 'fixo', fixedFee: null, rate: 90, withholding: false, notes: '' });
  });
});

describe('honorários: registo, reciclagem, cronómetro e integração', () => {
  beforeEach(async () => {
    await wipeAll();
    clearUndo();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.settings.put({ key: 'meId', value: 'ana' });
    await db.members.bulkAdd(members);
    await db.cases.add(newCase({ id: 'c1', name: 'Sucessão Honorários', ref: 'BS-H-1', responsibleId: 'ana' }));
  });

  it('regista tempo, despesas e provisões com histórico, e remove para a reciclagem com «anular»', async () => {
    await expect(addTimeEntry('c1', { minutes: 0 })).rejects.toThrow(/duração/);
    await expect(addExpense('c1', { amount: 0 })).rejects.toThrow(/valor/);
    await expect(addProvision('c1', { amount: -5 })).rejects.toThrow(/valor/);
    const e = await addTimeEntry('c1', { minutes: 90, memberId: 'ana', description: 'Reunião com herdeiros' });
    const x = await addExpense('c1', { amount: 40, category: 'certidoes', description: 'Certidões' });
    const p = await addProvision('c1', { amount: 500, description: 'Provisão inicial' });
    const log = (await db.activity.where('caseId').equals('c1').toArray()).map((a) => a.text.replace(/\s/g, ' '));
    expect(log).toContain('Tempo registado: 1:30 — Reunião com herdeiros');
    expect(log).toContain('Despesa registada: 40,00 € — Certidões');
    expect(log).toContain('Provisão recebida: 500,00 € — Provisão inicial');
    await deleteTimeEntry(e);
    expect(await db.timeEntries.count()).toBe(0);
    expect((await db.trash.toArray())[0]!.table).toBe('timeEntries');
    await undoLast();
    expect(await db.timeEntries.count()).toBe(1);
    await deleteExpense(x);
    await deleteProvision(p);
    expect(await db.expenses.count()).toBe(0);
    expect(await db.provisions.count()).toBe(0);
    expect(await db.trash.count()).toBe(2);
    await saveFees('c1', { ...DEFAULT_FEES, mode: 'fixo', fixedFee: 1200, withholding: true });
    expect(readFees((await db.cases.get('c1'))!)).toMatchObject({ mode: 'fixo', fixedFee: 1200, withholding: true });
    const last = (await db.activity.where('caseId').equals('c1').toArray()).map((a) => a.text.replace(/\s/g, ' '));
    expect(last).toContain('Acordo de honorários: valor fixo de 1200,00 €, com retenção na fonte');
  });

  it('cronómetro: inicia, para (mínimo 1 min) e regista; iniciar noutro dossier regista o anterior', async () => {
    await db.cases.add(newCase({ id: 'c2', name: 'Outra', ref: 'BS-H-2' }));
    const t0 = new Date('2026-09-18T09:00:00.000Z');
    const { timer, stopped } = await startTimer('c1', 'Análise do testamento', '', t0);
    expect(stopped).toBeNull();
    expect(timer.memberId).toBe('ana'); // «eu» na equipa
    expect((await getSetting('activeTimer'))?.caseId).toBe('c1');
    expect(elapsedMinutes(timer, new Date('2026-09-18T09:00:20.000Z'))).toBe(1);
    const r = await startTimer('c2', 'Outro trabalho', 'rui', new Date('2026-09-18T09:25:00.000Z'));
    expect(r.stopped?.minutes).toBe(25);
    expect(r.stopped?.caseId).toBe('c1');
    expect(r.stopped?.description).toBe('Análise do testamento');
    const e = await stopTimer(new Date('2026-09-18T09:40:10.000Z'));
    expect(e).toMatchObject({ caseId: 'c2', minutes: 16, memberId: 'rui' });
    expect(await getSetting('activeTimer')).toBeNull();
    expect(await stopTimer()).toBeNull();
    await startTimer('c1');
    await discardTimer();
    expect(await getSetting('activeTimer')).toBeNull();
    // dossier apagado entretanto: não cria registo
    await startTimer('c2');
    await db.cases.delete('c2');
    expect(await stopTimer()).toBeNull();
  });

  it('nota de honorários nos relatórios e tempo/despesas na partilha do dossier', async () => {
    await addTimeEntry('c1', { minutes: 90, memberId: 'ana', description: 'Reunião com herdeiros', date: '2026-09-10' });
    await addExpense('c1', { amount: 40, category: 'certidoes', description: 'Certidões', date: '2026-09-11' });
    await addProvision('c1', { amount: 100, description: 'Provisão inicial', date: '2026-09-01' });
    const b = await loadCaseBundle((await db.cases.get('c1'))!);
    const r = buildReport('honorarios', b);
    const text = r.blocks.map((x) => [...x.lines.flat().map((l) => l.text), ...(x.rows ?? []).flat(2).map((l) => l.text)].join(' ')).join('\n').replace(/\s/g, ' ');
    expect(r.title).toBe('Nota de honorários e despesas');
    expect(r.fileBase).toMatch(/^nota-de-honorarios-bs-h-1-/);
    expect(text).toContain('Reunião com herdeiros');
    expect(text).toContain('225,00 €'); // 1,5 h × 150 €
    expect(text).toContain('IVA (23%)');
    expect(text).toContain('Provisões já recebidas');
    expect(text).toContain('Total a pagar');
    expect(text).toContain('não substitui a fatura');
    // 225 + 51,75 + 40 − 100 = 216,75
    expect(text).toContain('216,75 €');
    const pkg = await exportDossier('c1');
    expect(pkg.tables.timeEntries).toHaveLength(1);
    expect(pkg.tables.expenses).toHaveLength(1);
    expect(pkg.tables.provisions).toHaveLength(1);
  });
});
