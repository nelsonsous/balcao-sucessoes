// Importação do protótipo original (página HTML única com localStorage):
// chaves "balcao_sucessoes_v2" (dossiers) e "balcao_sucessoes_v5_notes" (cliente, notas e contactos).
import { PHASES } from '../engine/phases';
import { createCase, saveMember } from './actions';
import { db, newAsset, newParty, newTask } from './db';
import type { Answers, AssetType, Channel, ContactLogRecord, NoteRecord, PartyRole, PhaseId, Status, TaskRecord } from './types';
import { normalize, nowIso, parseAmount, uid } from './utils';

interface LegacyCase {
  id?: string;
  name?: string;
  death?: string;
  responsible?: string;
  answers?: Record<string, unknown>;
  tasks?: Record<string, string>;
  info?: Record<string, { phase?: number; text?: string; critical?: boolean }>;
  interested?: Array<Record<string, string>>;
  assetsData?: Array<Record<string, string>>;
}

interface LegacyNotes {
  client?: Record<string, string>;
  important?: string;
  general?: string;
  logs?: Array<Record<string, string>>;
}

export interface LegacyPayload {
  cases: LegacyCase[];
  notes?: LegacyNotes;
}

/** Aceita o conteúdo da chave "balcao_sucessoes_v2" ou um objeto { cases, notes }. */
export function parseLegacy(text: string): LegacyPayload {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O texto não é um JSON válido.');
  }
  const d = data as Partial<LegacyPayload> & { cases?: unknown };
  if (!d || !Array.isArray(d.cases)) throw new Error('Não encontrei a lista "cases" do protótipo.');
  const cases = (d.cases as LegacyCase[]).filter((c) => c && typeof c === 'object' && c.answers && typeof c.answers === 'object');
  if (!cases.length) throw new Error('A lista de dossiers está vazia ou tem um formato desconhecido.');
  return { cases, notes: d.notes && typeof d.notes === 'object' ? (d.notes as LegacyNotes) : undefined };
}

const TRI: Record<string, 'sim' | 'nao' | 'desconhecido'> = { sim: 'sim', nao: 'nao', desconhecido: 'desconhecido' };
const key = (v: unknown) => normalize(String(v ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();

export function mapAnswers(a: Record<string, unknown>, base: Answers): Answers {
  const out: Answers = { ...base, assets: [...base.assets], foreignCountries: [...base.foreignCountries] };
  const k = (f: string) => key(a[f]);
  out.deathPlace = ({ portugal: 'portugal', estrangeiro: 'estrangeiro' } as const)[k('deathPlace')] ?? '';
  out.nationality = ({ portuguesa: 'portuguesa', francesa: 'francesa', outra: 'outra' } as const)[k('nationality')] ?? '';
  out.habitualResidence = ({ portugal: 'portugal', franca: 'franca', desconhecida: 'desconhecida' } as const)[k('residence')] ?? '';
  out.spouse = ({ sim: 'casado', nao: 'nao', desconhecido: 'desconhecido' } as const)[k('spouse')] ?? '';
  out.descendants = TRI[k('descendants')] ?? '';
  out.ascendants = TRI[k('ascendants')] ?? '';
  out.will = TRI[k('will')] ?? '';
  out.others = ({ sim: 'sim', nao: 'nao', 'a confirmar': 'a_confirmar' } as const)[k('others')] ?? '';
  out.habilitation = ({ necessaria: 'necessaria', 'nao necessaria': 'nao_necessaria', 'a confirmar': 'a_confirmar' } as const)[k('habilitation')] ?? '';
  out.liabilities = ({ sim: 'sim', nao: 'nao', 'a confirmar': 'a_confirmar' } as const)[k('liabilities')] ?? '';
  out.partition =
    ({ 'acordo alcancado': 'acordo', 'boas perspetivas de acordo': 'boas_perspetivas', 'acordo em negociacao': 'negociacao', 'sem acordo conflito': 'conflito', 'ainda nao determinado': 'indeterminado' } as const)[k('partition')] ?? '';
  const ASSETS: Record<string, Answers['assets'][number]> = {
    imoveis: 'imoveis',
    'contas bancarias': 'contas',
    'participacoes sociais': 'participacoes',
    veiculos: 'veiculos',
    outro: 'outro',
    'patrimonio no estrangeiro': 'estrangeiro',
    'ainda nao sabemos': 'desconhecido',
  };
  const raw = Array.isArray(a.assets) ? a.assets : typeof a.assets === 'string' ? String(a.assets).split('|') : [];
  out.assets = [...new Set(raw.map((x) => ASSETS[key(x)]).filter((x): x is Answers['assets'][number] => Boolean(x)))];
  if (out.habitualResidence === 'franca' || k('residence') === 'franca') out.foreignCountries = ['França'];
  if (out.deathPlace === 'estrangeiro' && k('residence') === 'franca') out.deathCountry = 'França';
  return out;
}

const STATUS: Record<string, Status> = { red: 'pendente', orange: 'em_curso', green: 'concluido', grey: 'na' };
const ROLES: Record<string, PartyRole> = { herdeiro: 'herdeiro', legatario: 'legatario', conjuge: 'conjuge', credor: 'credor', beneficiario: 'beneficiario', 'outro interessado': 'outro', 'a confirmar': 'a_confirmar' };
const ASSET_TYPES: Record<string, AssetType> = { imoveis: 'imoveis', 'contas bancarias': 'contas', 'participacoes sociais': 'participacoes', veiculos: 'veiculos', outro: 'outro', 'patrimonio no estrangeiro': 'outro' };
const CHANNELS: Record<string, Channel> = { email: 'email', telefone: 'telefone', reuniao: 'reuniao', carta: 'carta', videochamada: 'videochamada' };

function poa(v: string): 'na' | 'a_pedir' | 'pedida' | 'recebida' {
  const s = normalize(v ?? '');
  if (/receb|assinad|ok/.test(s)) return 'recebida';
  if (/pedid|enviad|aguard/.test(s)) return 'pedida';
  if (/pedir|falta|necess/.test(s)) return 'a_pedir';
  return 'na';
}

const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'os', 'as', 'em', 'no', 'na', 'nos', 'nas', 'com', 'para', 'por', 'ao', 'aos', 'um', 'uma', 'ou', 'que', 'se', 'sem', 'sobre', 'cada', 'todos', 'todas']);
const tokens = (s: string): Set<string> => new Set(key(s).split(' ').filter((w) => w.length >= 3 && !STOP.has(w)));

/** Semelhança entre títulos: palavras significativas em comum sobre o mais curto (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const w of ta) if (tb.has(w)) common += 1;
  return common / Math.min(ta.size, tb.size);
}

/** Casa uma tarefa do protótipo com a tarefa gerada mais parecida (título exato ou ≥ 60 % de palavras em comum). */
export function matchTask(text: string, tasks: TaskRecord[]): TaskRecord | undefined {
  const n = key(text);
  if (!n) return undefined;
  const exact = tasks.find((t) => key(t.title) === n);
  if (exact) return exact;
  let best: TaskRecord | undefined;
  let bestScore = 0;
  for (const t of tasks) {
    const s = titleSimilarity(text, t.title);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  return bestScore >= 0.6 ? best : undefined;
}

export interface LegacyImportResult {
  cases: number;
  tasksMatched: number;
  tasksAdded: number;
  parties: number;
  assets: number;
  contacts: number;
}

export async function importLegacy(payload: LegacyPayload): Promise<LegacyImportResult> {
  const res: LegacyImportResult = { cases: 0, tasksMatched: 0, tasksAdded: 0, parties: 0, assets: 0, contacts: 0 };
  const members = await db.members.toArray();
  const memberByName = new Map(members.map((m) => [normalize(m.name), m.id]));
  const { emptyAnswers } = await import('./db');
  let first = true;

  for (const lc of payload.cases) {
    const respName = (lc.responsible ?? '').trim();
    let responsibleId = '';
    if (respName) {
      responsibleId = memberByName.get(normalize(respName)) ?? '';
      if (!responsibleId) {
        const m = await saveMember({ name: respName });
        memberByName.set(normalize(respName), m.id);
        responsibleId = m.id;
      }
    }
    const answers = mapAnswers(lc.answers ?? {}, emptyAnswers());
    const name = (lc.name ?? '').trim() || 'Sucessão importada';
    const notes = payload.notes;
    const { c } = await createCase({
      name,
      responsibleId,
      tags: ['Importado'],
      deceased: { name: '', nif: '', birthDate: '', deathDate: /^\d{4}-\d{2}-\d{2}$/.test(lc.death ?? '') ? String(lc.death) : '', deathCity: '', lastAddress: '' },
      client: first && notes?.client ? { name: notes.client.name ?? '', email: notes.client.email ?? '', phone: notes.client.phone ?? '', country: notes.client.country ?? '', preferred: (({ email: 'email', telefone: 'telefone', reuniao: 'reuniao' } as const)[normalize(notes.client.preferred ?? '')] ?? 'email'), address: notes.client.address ?? '' } : undefined,
      generalNotes: first ? (notes?.general ?? '') : '',
      answers,
    });
    res.cases += 1;

    // Estados das tarefas do protótipo → tarefas geradas (ou tarefas próprias quando não há correspondência)
    const generated = await db.tasks.where('caseId').equals(c.id).toArray();
    const used = new Set<string>();
    let order = 10_000;
    for (const [tid, color] of Object.entries(lc.tasks ?? {})) {
      const info = lc.info?.[tid];
      const text = info?.text ?? '';
      const status = STATUS[color] ?? 'pendente';
      const hit = matchTask(text, generated.filter((t) => !used.has(t.id)));
      if (hit) {
        used.add(hit.id);
        if (hit.status !== status) await db.tasks.update(hit.id, { status, completedAt: status === 'concluido' ? nowIso() : '', updatedAt: nowIso() });
        res.tasksMatched += 1;
      } else if (text.trim()) {
        const phase: PhaseId = PHASES[Math.max(0, Math.min(PHASES.length - 1, Number(info?.phase ?? 0)))]!.id;
        await db.tasks.add(newTask(c.id, { title: text.trim(), phase, status, critical: Boolean(info?.critical), reason: 'Importada do protótipo', order: order++, completedAt: status === 'concluido' ? nowIso() : '' }));
        res.tasksAdded += 1;
      }
    }

    for (const p of lc.interested ?? []) {
      if (!(p.name ?? '').trim()) continue;
      const role = ROLES[key(p.quality)] ?? 'a_confirmar';
      await db.parties.add(
        newParty(c.id, {
          name: p.name!.trim(),
          roles: [role],
          kinship: role === 'conjuge' ? 'conjuge' : '',
          nationality: p.nationality ?? '',
          birth: p.birth ?? '',
          civilStatus: p.civil ?? '',
          regime: p.regime ?? '',
          nif: p.nif ?? '',
          idDoc: p.id ?? '',
          address: p.address ?? '',
          email: p.email ?? '',
          phone: p.phone ?? '',
          poa: poa(p.poa ?? ''),
          notes: p.notes ?? '',
        }),
      );
      res.parties += 1;
    }

    for (const a of lc.assetsData ?? []) {
      const type = ASSET_TYPES[key(a.type)] ?? 'outro';
      await db.assets.add(
        newAsset(c.id, {
          type,
          description: (a.description ?? '').trim() || (a.type ?? 'Bem'),
          holder: a.holder ?? '',
          country: a.country ?? (key(a.type) === 'patrimonio no estrangeiro' ? 'Estrangeiro' : ''),
          value: parseAmount(a.value ?? ''),
          valueBasis: parseAmount(a.value ?? '') === null ? '' : 'estimado',
          ownership: 'desconhecido',
          notes: a.notes ?? '',
        }),
      );
      res.assets += 1;
    }

    if (first && notes) {
      if ((notes.important ?? '').trim()) {
        const ts = nowIso();
        const note: NoteRecord = { id: uid(), caseId: c.id, text: notes.important!.trim(), pinned: true, createdAt: ts, updatedAt: ts };
        await db.notes.add(note);
      }
      for (const l of notes.logs ?? []) {
        const log: ContactLogRecord = {
          id: uid(),
          caseId: c.id,
          date: /^\d{4}-\d{2}-\d{2}$/.test(l.date ?? '') ? String(l.date) : nowIso().slice(0, 10),
          person: l.person ?? '',
          role: ROLES[key(l.role)] ?? 'a_confirmar',
          channel: CHANNELS[key(l.channel)] ?? 'outro',
          summary: l.note ?? '',
          followUp: '',
          followUpDone: false,
          createdAt: nowIso(),
        };
        await db.contacts.add(log);
        res.contacts += 1;
      }
    }
    first = false;
  }
  return res;
}

/** Instruções para extrair os dados do protótipo (colar na consola do navegador onde ele foi usado). */
export const LEGACY_SNIPPET =
  "copy(JSON.stringify({cases:(JSON.parse(localStorage.getItem('balcao_sucessoes_v2')||'{\"cases\":[]}')).cases,notes:JSON.parse(localStorage.getItem('balcao_sucessoes_v5_notes')||'{}')}))";
