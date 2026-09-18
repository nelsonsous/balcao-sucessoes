// Verificação de integridade dos dados: registos de dossiers que já não existem, anexos
// perdidos ou soltos, referências a pessoas e interessados removidos, tarefas duplicadas,
// questionários incompletos e definições órfãs. A verificação é pura (sobre uma fotografia
// da base); a reparação relê a base, corrige tudo numa só transação e fica no histórico.
import { validateRule } from '../engine/officeRules';
import { CASE_TABLES, db, emptyAnswers, logActivity } from './db';
import { TRASH_RETENTION_DAYS } from './recycle';
import type { ActiveTimer, CaseRecord, DocumentRecord, EventRecord, MemberRecord, OfficeRuleRecord, Status, TaskRecord, TimeEntryRecord } from './types';
import { formatDate, nowIso, todayIso } from './utils';

export type CaseTable = (typeof CASE_TABLES)[number];

export interface IntegritySnapshot {
  cases: CaseRecord[];
  members: MemberRecord[];
  /** Registos de cada tabela ligada aos dossiers (todos têm id e caseId). */
  tables: Record<CaseTable, Array<{ id: string; caseId: string }>>;
  files: Array<{ id: string; size: number }>;
  trash: Array<{ id: string; deletedAt: string }>;
  settings: { meId: string; activeTimer: ActiveTimer | null };
  officeRules: OfficeRuleRecord[];
}

export type IssueId =
  | 'orfaos'
  | 'anexos-perdidos'
  | 'ficheiros-soltos'
  | 'pessoas-removidas'
  | 'interessados-removidos'
  | 'tarefas-duplicadas'
  | 'questionario-incompleto'
  | 'definicoes-orfas'
  | 'reciclagem-expirada'
  | 'regras-invalidas';

export type Severity = 'erro' | 'aviso' | 'info';

export interface IntegrityIssue {
  id: IssueId;
  severity: Severity;
  title: string;
  detail: string;
  count: number;
  /** Até três exemplos legíveis. */
  examples: string[];
  /** Rótulo do botão de reparação (ausente = só aviso, corrige-se à mão). */
  repair?: string;
}

export interface IntegrityReport {
  checkedAt: string;
  totals: { cases: number; records: number; files: number };
  issues: IntegrityIssue[];
}

export const TABLE_NAMES: Record<CaseTable, [string, string]> = {
  tasks: ['tarefa', 'tarefas'],
  parties: ['interessado', 'interessados'],
  assets: ['bem', 'bens'],
  debts: ['dívida', 'dívidas'],
  notes: ['nota', 'notas'],
  contacts: ['contacto', 'contactos'],
  activity: ['entrada do histórico', 'entradas do histórico'],
  events: ['evento', 'eventos'],
  documents: ['documento', 'documentos'],
  timeEntries: ['registo de tempo', 'registos de tempo'],
  expenses: ['despesa', 'despesas'],
  provisions: ['provisão', 'provisões'],
};

const n = (count: number, [one, many]: [string, string]) => `${count} ${count === 1 ? one : many}`;
const SEVERITY_ORDER: Record<Severity, number> = { erro: 0, aviso: 1, info: 2 };

/** Os eventos gerais da agenda não pertencem a nenhum dossier; os outros registos têm de pertencer. */
const isOrphan = (t: CaseTable, r: { caseId: string }, caseIds: Set<string>) => (r.caseId ? !caseIds.has(r.caseId) : t !== 'events');

const STATUS_WEIGHT: Record<Status, number> = { concluido: 4, na: 3, aguarda: 3, em_curso: 2, pendente: 0 };

/** Das tarefas repetidas (mesma regra no mesmo dossier), fica a que tem mais trabalho feito. */
export function pickKeeper(group: TaskRecord[]): TaskRecord {
  const score = (t: TaskRecord) => STATUS_WEIGHT[t.status] * 10 + (t.notes.trim() ? 4 : 0) + (t.assigneeId ? 2 : 0) + (t.dueSource === 'manual' ? 1 : 0);
  return [...group].sort((a, b) => score(b) - score(a) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]!;
}

function duplicateGroups(tasks: TaskRecord[]): TaskRecord[][] {
  const by = new Map<string, TaskRecord[]>();
  for (const t of tasks) {
    if (!t.ruleKey) continue;
    const k = `${t.caseId}|${t.ruleKey}`;
    const list = by.get(k);
    if (list) list.push(t);
    else by.set(k, [t]);
  }
  return [...by.values()].filter((g) => g.length > 1);
}

function incompleteAnswers(c: CaseRecord): boolean {
  const a = c.answers as unknown as Record<string, unknown> | undefined;
  if (!a || typeof a !== 'object') return true;
  return Object.keys(emptyAnswers()).some((k) => !(k in a)) || !Array.isArray(a.assets) || !Array.isArray(a.foreignCountries);
}

/** Tudo o que a verificação encontra, com as listas necessárias para reparar. */
function analyse(s: IntegritySnapshot, now: Date) {
  const caseIds = new Set(s.cases.map((c) => c.id));
  const memberIds = new Set(s.members.map((m) => m.id));
  const fileIds = new Set(s.files.map((f) => f.id));
  const live = <T extends { caseId: string }>(t: CaseTable) => (s.tables[t] as unknown as T[]).filter((r) => !isOrphan(t, r, caseIds));

  const orphans = {} as Record<CaseTable, string[]>;
  for (const t of CASE_TABLES) orphans[t] = (s.tables[t] ?? []).filter((r) => isOrphan(t, r, caseIds)).map((r) => r.id);

  const docs = live<DocumentRecord>('documents');
  const tasks = live<TaskRecord>('tasks');
  const events = live<EventRecord>('events');
  const time = live<TimeEntryRecord>('timeEntries');
  const partyIds = new Set(live<{ id: string; caseId: string }>('parties').map((p) => p.id));
  const referenced = new Set(docs.map((d) => d.fileId).filter(Boolean));
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  return {
    orphans,
    lostFiles: docs.filter((d) => d.fileId && !fileIds.has(d.fileId)),
    looseFiles: s.files.filter((f) => !referenced.has(f.id)),
    memberRefs: {
      tasks: tasks.filter((t) => t.assigneeId && !memberIds.has(t.assigneeId)),
      events: events.filter((e) => e.assigneeId && !memberIds.has(e.assigneeId)),
      cases: s.cases.filter((c) => c.responsibleId && !memberIds.has(c.responsibleId)),
      time: time.filter((e) => e.memberId && !memberIds.has(e.memberId)),
    },
    partyRefs: docs.filter((d) => d.partyId && !partyIds.has(d.partyId)),
    duplicates: duplicateGroups(tasks),
    incomplete: s.cases.filter(incompleteAnswers),
    timerOrphan: Boolean(s.settings.activeTimer && !caseIds.has(s.settings.activeTimer.caseId)),
    meOrphan: Boolean(s.settings.meId && !memberIds.has(s.settings.meId)),
    expired: s.trash.filter((t) => t.deletedAt < cutoff),
    badRules: s.officeRules.filter((r) => validateRule(r).length > 0),
  };
}

/** Verifica a fotografia da base e devolve os problemas encontrados (do mais grave para o menos grave). */
export function checkIntegrity(s: IntegritySnapshot, now: Date = new Date()): IntegrityReport {
  const a = analyse(s, now);
  const issues: IntegrityIssue[] = [];
  const caseName = new Map(s.cases.map((c) => [c.id, `${c.ref} · ${c.name}`]));

  const orphanParts = CASE_TABLES.filter((t) => a.orphans[t].length).map((t) => n(a.orphans[t].length, TABLE_NAMES[t]));
  const orphanCount = CASE_TABLES.reduce((sum, t) => sum + a.orphans[t].length, 0);
  if (orphanCount)
    issues.push({
      id: 'orfaos',
      severity: 'aviso',
      title: 'Registos de dossiers que já não existem',
      detail: `${orphanParts.join(', ')} sem dossier — não aparecem em lado nenhum e ocupam espaço.`,
      count: orphanCount,
      examples: [],
      repair: 'Apagar estes registos',
    });

  if (a.lostFiles.length)
    issues.push({
      id: 'anexos-perdidos',
      severity: 'erro',
      title: 'Documentos com anexo em falta',
      detail: 'O documento indica um ficheiro que já não está neste dispositivo. A reparação tira a indicação do anexo e deixa uma nota para voltar a anexar.',
      count: a.lostFiles.length,
      examples: a.lostFiles.slice(0, 3).map((d) => `${d.name}${d.fileName ? ` («${d.fileName}»)` : ''} — ${caseName.get(d.caseId) ?? ''}`),
      repair: 'Limpar e deixar nota',
    });

  if (a.duplicates.length) {
    const extra = a.duplicates.reduce((sum, g) => sum + g.length - 1, 0);
    issues.push({
      id: 'tarefas-duplicadas',
      severity: 'erro',
      title: 'Tarefas repetidas na checklist',
      detail: 'A mesma tarefa da biblioteca (ou de uma regra do escritório) aparece mais do que uma vez no mesmo dossier. Fica a que tem mais trabalho feito; as notas das outras passam para ela.',
      count: extra,
      examples: a.duplicates.slice(0, 3).map((g) => `${g[0]!.title} (${g.length}×) — ${caseName.get(g[0]!.caseId) ?? ''}`),
      repair: 'Juntar as repetidas',
    });
  }

  if (a.incomplete.length)
    issues.push({
      id: 'questionario-incompleto',
      severity: 'erro',
      title: 'Questionários com campos em falta',
      detail: 'Dossiers criados por versões antigas ou importados sem todas as perguntas; o motor da checklist precisa de todas. A reparação acrescenta as que faltam, sem resposta.',
      count: a.incomplete.length,
      examples: a.incomplete.slice(0, 3).map((c) => `${c.ref} · ${c.name}`),
      repair: 'Completar os questionários',
    });

  const memberCount = a.memberRefs.tasks.length + a.memberRefs.events.length + a.memberRefs.cases.length + a.memberRefs.time.length;
  if (memberCount) {
    const parts = [
      a.memberRefs.cases.length ? n(a.memberRefs.cases.length, ['dossier', 'dossiers']) : '',
      a.memberRefs.tasks.length ? n(a.memberRefs.tasks.length, ['tarefa', 'tarefas']) : '',
      a.memberRefs.events.length ? n(a.memberRefs.events.length, ['evento', 'eventos']) : '',
      a.memberRefs.time.length ? n(a.memberRefs.time.length, ['registo de tempo', 'registos de tempo']) : '',
    ].filter(Boolean);
    issues.push({
      id: 'pessoas-removidas',
      severity: 'aviso',
      title: 'Atribuídos a pessoas que já não estão na equipa',
      detail: `${parts.join(', ')} ainda indicam uma pessoa removida da equipa. A reparação deixa-os «por atribuir».`,
      count: memberCount,
      examples: [...a.memberRefs.cases.map((c) => `${c.ref} · ${c.name}`), ...a.memberRefs.tasks.map((t) => t.title)].slice(0, 3),
      repair: 'Deixar por atribuir',
    });
  }

  if (a.partyRefs.length)
    issues.push({
      id: 'interessados-removidos',
      severity: 'aviso',
      title: 'Documentos pedidos a interessados removidos',
      detail: 'O documento continua associado a um interessado que já não existe no dossier.',
      count: a.partyRefs.length,
      examples: a.partyRefs.slice(0, 3).map((d) => `${d.name} — ${caseName.get(d.caseId) ?? ''}`),
      repair: 'Tirar a associação',
    });

  if (a.timerOrphan || a.meOrphan)
    issues.push({
      id: 'definicoes-orfas',
      severity: 'aviso',
      title: 'Definições a apontar para o que já não existe',
      detail: [a.timerOrphan ? 'o cronómetro em curso é de um dossier eliminado' : '', a.meOrphan ? '«quem usa este dispositivo» é uma pessoa removida da equipa' : ''].filter(Boolean).join('; ') + '.',
      count: Number(a.timerOrphan) + Number(a.meOrphan),
      examples: [],
      repair: 'Limpar',
    });

  if (a.badRules.length)
    issues.push({
      id: 'regras-invalidas',
      severity: 'aviso',
      title: 'Regras do escritório incompletas',
      detail: 'Abra cada regra em Regras do escritório e corrija o que falta (nome, títulos das tarefas, valores das condições ou prazos).',
      count: a.badRules.length,
      examples: a.badRules.slice(0, 3).map((r) => `${r.name || 'Sem nome'}: ${validateRule(r)[0]}`),
    });

  if (a.looseFiles.length) {
    const bytes = a.looseFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    issues.push({
      id: 'ficheiros-soltos',
      severity: 'info',
      title: 'Anexos que nenhum documento usa',
      detail: `${n(a.looseFiles.length, ['ficheiro', 'ficheiros'])} (${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB) sem documento associado — não se conseguem abrir na aplicação.`,
      count: a.looseFiles.length,
      examples: [],
      repair: 'Libertar o espaço',
    });
  }

  if (a.expired.length)
    issues.push({
      id: 'reciclagem-expirada',
      severity: 'info',
      title: `Itens com mais de ${TRASH_RETENTION_DAYS} dias na reciclagem`,
      detail: 'Normalmente são apagados ao abrir a aplicação; estes ficaram para trás.',
      count: a.expired.length,
      examples: [],
      repair: 'Apagar definitivamente',
    });

  const records = CASE_TABLES.reduce((sum, t) => sum + (s.tables[t]?.length ?? 0), 0) + s.cases.length + s.members.length;
  return {
    checkedAt: nowIso(),
    totals: { cases: s.cases.length, records, files: s.files.length },
    issues: issues.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]),
  };
}

/** Fotografia atual da base (os anexos só com id e tamanho). */
export async function loadSnapshot(): Promise<IntegritySnapshot> {
  const tables = {} as IntegritySnapshot['tables'];
  for (const t of CASE_TABLES) tables[t] = (await db.table(t).toArray()) as Array<{ id: string; caseId: string }>;
  const [cases, members, files, trash, settingRows, officeRules] = await Promise.all([
    db.cases.toArray(),
    db.members.toArray(),
    db.files.toArray(),
    db.trash.toArray(),
    db.settings.bulkGet(['meId', 'activeTimer']),
    db.officeRules.toArray(),
  ]);
  return {
    cases,
    members,
    tables,
    files: files.map((f) => ({ id: f.id, size: f.size || f.blob?.size || 0 })),
    trash: trash.map((t) => ({ id: t.id, deletedAt: t.deletedAt })),
    settings: { meId: (settingRows[0]?.value as string) ?? '', activeTimer: (settingRows[1]?.value as ActiveTimer | null) ?? null },
    officeRules,
  };
}

export async function runIntegrityCheck(now: Date = new Date()): Promise<IntegrityReport> {
  return checkIntegrity(await loadSnapshot(), now);
}

export const isRepairable = (i: IntegrityIssue): boolean => Boolean(i.repair);

/** Corrige os problemas pedidos (relendo a base). Devolve quantos registos mudaram por problema. */
export async function repairIntegrity(ids: IssueId[], now: Date = new Date()): Promise<Partial<Record<IssueId, number>>> {
  const want = new Set(ids);
  const s = await loadSnapshot();
  const a = analyse(s, now);
  const fixed: Partial<Record<IssueId, number>> = {};
  const caseLog = new Map<string, string[]>();
  const log = (caseId: string, msg: string) => {
    if (!caseId) return;
    const list = caseLog.get(caseId);
    if (list) list.push(msg);
    else caseLog.set(caseId, [msg]);
  };
  const ts = nowIso();
  const today = formatDate(todayIso(now));

  await db.transaction('rw', db.tables, async () => {
    if (want.has('orfaos')) {
      let total = 0;
      for (const t of CASE_TABLES) {
        if (!a.orphans[t].length) continue;
        await db.table(t).bulkDelete(a.orphans[t]);
        total += a.orphans[t].length;
      }
      fixed.orfaos = total;
    }
    if (want.has('anexos-perdidos')) {
      for (const d of a.lostFiles) {
        const note = `Anexo «${d.fileName || 'sem nome'}» em falta neste dispositivo (verificação de integridade de ${today}) — voltar a anexar.`;
        await db.documents.update(d.id, { fileId: '', fileName: '', fileType: '', fileSize: 0, notes: d.notes.trim() ? `${d.notes.trim()}\n${note}` : note, updatedAt: ts });
        log(d.caseId, `anexo em falta limpo em «${d.name}»`);
      }
      fixed['anexos-perdidos'] = a.lostFiles.length;
    }
    if (want.has('tarefas-duplicadas')) {
      let removed = 0;
      for (const g of a.duplicates) {
        const keep = pickKeeper(g);
        const others = g.filter((t) => t.id !== keep.id);
        const notes = [keep.notes.trim(), ...others.map((t) => t.notes.trim())].filter(Boolean);
        if (notes.length > (keep.notes.trim() ? 1 : 0)) await db.tasks.update(keep.id, { notes: [...new Set(notes)].join('\n'), updatedAt: ts });
        await db.tasks.bulkDelete(others.map((t) => t.id));
        removed += others.length;
        log(keep.caseId, `«${keep.title}» estava repetida (${g.length}×) e ficou uma só`);
      }
      fixed['tarefas-duplicadas'] = removed;
    }
    if (want.has('questionario-incompleto')) {
      for (const c of a.incomplete) {
        const cur = (c.answers ?? {}) as unknown as Record<string, unknown>;
        const answers = { ...emptyAnswers(), ...cur, assets: Array.isArray(cur.assets) ? cur.assets : [], foreignCountries: Array.isArray(cur.foreignCountries) ? cur.foreignCountries : [] };
        await db.cases.update(c.id, { answers: answers as CaseRecord['answers'] });
        log(c.id, 'questionário completado com as perguntas em falta');
      }
      fixed['questionario-incompleto'] = a.incomplete.length;
    }
    if (want.has('pessoas-removidas')) {
      const m = a.memberRefs;
      for (const t of m.tasks) await db.tasks.update(t.id, { assigneeId: '', updatedAt: ts });
      for (const e of m.events) await db.events.update(e.id, { assigneeId: '' });
      for (const c of m.cases) await db.cases.update(c.id, { responsibleId: '' });
      for (const e of m.time) await db.timeEntries.update(e.id, { memberId: '' });
      const perCase = new Map<string, number>();
      for (const r of [...m.tasks, ...m.events, ...m.time]) perCase.set(r.caseId, (perCase.get(r.caseId) ?? 0) + 1);
      for (const c of m.cases) perCase.set(c.id, (perCase.get(c.id) ?? 0) + 1);
      for (const [caseId, count] of perCase) log(caseId, `${count} atribuição(ões) a pessoa removida da equipa deixada(s) por atribuir`);
      fixed['pessoas-removidas'] = m.tasks.length + m.events.length + m.cases.length + m.time.length;
    }
    if (want.has('interessados-removidos')) {
      for (const d of a.partyRefs) {
        await db.documents.update(d.id, { partyId: '', updatedAt: ts });
        log(d.caseId, `«${d.name}» deixou de estar associado a um interessado removido`);
      }
      fixed['interessados-removidos'] = a.partyRefs.length;
    }
    if (want.has('definicoes-orfas')) {
      if (a.timerOrphan) await db.settings.put({ key: 'activeTimer', value: null });
      if (a.meOrphan) await db.settings.put({ key: 'meId', value: '' });
      fixed['definicoes-orfas'] = Number(a.timerOrphan) + Number(a.meOrphan);
    }
    if (want.has('ficheiros-soltos')) {
      await db.files.bulkDelete(a.looseFiles.map((f) => f.id));
      fixed['ficheiros-soltos'] = a.looseFiles.length;
    }
    if (want.has('reciclagem-expirada')) {
      await db.trash.bulkDelete(a.expired.map((t) => t.id));
      fixed['reciclagem-expirada'] = a.expired.length;
    }
  });

  for (const [caseId, msgs] of caseLog) await logActivity(caseId, 'dossier', `Verificação de integridade: ${msgs.join('; ')}`);
  return fixed;
}
