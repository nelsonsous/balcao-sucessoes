// Contexto das minutas: dados do dossier já formatados na língua do modelo.
import { rankOpenTasks, taskStats } from '../engine/insights';
import { isOpen } from '../engine/phases';
import { bulletList, type TemplateContext } from '../engine/templates';
import { DEFAULT_SETTINGS, db, type AppSettings } from './db';
import { byCategoryThenName, clientCanProvide } from './documents';
import { KINSHIP_LABELS, ROLE_LABELS } from './labels';
import type { CaseRecord, TemplateLanguage } from './types';
import { parseIsoDate, todayIso } from './utils';

const LOCALES: Record<TemplateLanguage, string> = { pt: 'pt-PT', fr: 'fr-FR', en: 'en-GB' };

const EMPTY: Record<TemplateLanguage, { none: string; docs: string; actions: string; deadlines: string }> = {
  pt: { none: '(sem registos)', docs: '(não há documentos em falta)', actions: '(sem ações em aberto)', deadlines: '(sem prazos próximos)' },
  fr: { none: '(aucun)', docs: '(aucun document manquant)', actions: '(aucune action en cours)', deadlines: '(aucun délai proche)' },
  en: { none: '(none)', docs: '(no outstanding documents)', actions: '(no open actions)', deadlines: '(no upcoming deadlines)' },
};

export function longDate(iso: string, lang: TemplateLanguage): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  return new Intl.DateTimeFormat(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function money(v: number, lang: TemplateLanguage): string {
  return new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency: 'EUR' }).format(v);
}

async function loadSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) (out as unknown as Record<string, unknown>)[r.key] = r.value;
  return out;
}

/** Contexto sem dossier (minutas gerais). */
export async function baseContext(lang: TemplateLanguage): Promise<TemplateContext> {
  const s = await loadSettings();
  return {
    hoje: longDate(todayIso(), lang),
    'escritorio.nome': s.firmName,
    'escritorio.local': s.firmCity,
    'escritorio.morada': s.firmAddress,
    'escritorio.email': s.firmEmail,
    'escritorio.telefone': s.firmPhone,
    'responsavel.nome': s.userName,
  };
}

export interface ContextExtras {
  suggestions: Record<string, string[]>;
}

export async function caseContext(c: CaseRecord, lang: TemplateLanguage): Promise<{ ctx: TemplateContext } & ContextExtras> {
  const [base, parties, assets, debts, tasks, docs, events, members] = await Promise.all([
    baseContext(lang),
    db.parties.where('caseId').equals(c.id).toArray(),
    db.assets.where('caseId').equals(c.id).toArray(),
    db.debts.where('caseId').equals(c.id).toArray(),
    db.tasks.where('caseId').equals(c.id).toArray(),
    db.documents.where('caseId').equals(c.id).toArray(),
    db.events.where('caseId').equals(c.id).toArray(),
    db.members.toArray(),
  ]);
  const empty = EMPTY[lang];
  const responsible = members.find((m) => m.id === c.responsibleId);
  const spouse = parties.find((p) => p.kinship === 'conjuge');
  const head = parties.find((p) => p.isHeadOfEstate);
  const task = (key: string) => tasks.find((t) => t.ruleKey === key && !t.obsolete);
  const stats = taskStats(tasks);
  const today = todayIso();

  const heirs = parties.filter((p) => p.roles.includes('herdeiro') || p.roles.includes('conjuge'));
  const nextEscritura = events
    .filter((e) => e.kind === 'escritura' && !e.done && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const banks = [...new Set(assets.map((a) => a.bank.trim()).filter(Boolean))];
  const activeDebts = debts.filter((d) => d.status !== 'pago');
  const upcoming = tasks
    .filter((t) => !t.obsolete && isOpen(t.status) && t.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const ctx: TemplateContext = {
    ...base,
    'responsavel.nome': responsible?.name || base['responsavel.nome'] || '',
    'dossier.ref': c.ref,
    'dossier.nome': c.name,
    'falecido.nome': c.deceased.name,
    'falecido.nif': c.deceased.nif,
    'falecido.data_obito': longDate(c.deceased.deathDate, lang),
    'falecido.local_obito': c.deceased.deathCity,
    'falecido.ultimo_domicilio': c.deceased.lastAddress,
    'falecido.data_nascimento': longDate(c.deceased.birthDate, lang),
    'cliente.nome': c.client.name,
    'cliente.email': c.client.email,
    'cliente.telefone': c.client.phone,
    'cliente.morada': c.client.address,
    'cliente.pais': c.client.country,
    'conjuge.nome': spouse?.name ?? '',
    'cabeca_casal.nome': head?.name ?? '',
    'prazo.imposto_selo': longDate(task('imposto-selo')?.dueDate ?? '', lang),
    'prazo.irs': longDate(task('irs-falecido')?.dueDate ?? '', lang),
    'progresso.percentagem': `${stats.pct}%`,
    'valor.ativo': money(assets.reduce((s, a) => s + (a.value ?? 0), 0), lang),
    'valor.passivo': money(activeDebts.reduce((s, d) => s + (d.amount ?? 0), 0), lang),
    'escritura.data': nextEscritura ? longDate(nextEscritura.date, lang) : '',
    'escritura.hora': nextEscritura?.time ?? '',
    'escritura.local': nextEscritura?.location ?? '',
    'lista.herdeiros': bulletList(
      heirs.map((p) => `${p.name}${p.kinship ? ` — ${KINSHIP_LABELS[p.kinship]}` : ''}`),
      empty.none,
    ),
    'lista.interessados': bulletList(
      parties.map((p) => `${p.name} — ${p.roles.map((r) => ROLE_LABELS[r]).join(', ')}${p.isHeadOfEstate ? ' (cabeça-de-casal)' : ''}`),
      empty.none,
    ),
    'lista.bens': bulletList(
      assets.map((a) => `${a.description || a.type}${a.country && a.country !== 'Portugal' ? ` (${a.country})` : ''}${a.value !== null ? ` — ${money(a.value, lang)}` : ''}`),
      empty.none,
    ),
    'lista.bancos': bulletList(banks, empty.none),
    'lista.dividas': bulletList(
      activeDebts.map((d) => `${d.creditor}${d.description ? ` — ${d.description}` : ''}${d.amount !== null ? ` (${money(d.amount, lang)})` : ''}`),
      empty.none,
    ),
    'lista.documentos_em_falta': bulletList(
      docs
        .filter((d) => (d.status === 'em_falta' || d.status === 'pedido') && clientCanProvide(d))
        .sort(byCategoryThenName)
        .map((d) => d.name),
      empty.docs,
    ),
    'lista.proximas_acoes': bulletList(rankOpenTasks(tasks).slice(0, 5).map((t) => t.title), empty.actions),
    'lista.prazos': bulletList(
      upcoming.map((t) => `${longDate(t.dueDate, lang)} — ${t.title}`),
      empty.deadlines,
    ),
  };

  return {
    ctx,
    suggestions: {
      bancos: banks,
      interessados: parties.map((p) => p.name).filter(Boolean),
    },
  };
}
