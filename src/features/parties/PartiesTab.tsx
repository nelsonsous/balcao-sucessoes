import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Baby,
  Building,
  Crown,
  FileSignature,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import { deleteParty, saveParty } from '../../lib/actions';
import { db, newParty } from '../../lib/db';
import { ACCEPTANCE_LABELS, KINSHIP_LABELS, POA_LABELS, ROLE_LABELS } from '../../lib/labels';
import { checkNif } from '../../lib/nif';
import type { CaseRecord, Kinship, PartyRecord, PartyRole } from '../../lib/types';
import { cx } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Card, Empty, Field, Sheet, useConfirm } from '../../components/ui';

interface Suggestion {
  label: string;
  preset: Partial<PartyRecord>;
}

function suggestions(c: CaseRecord, parties: PartyRecord[]): Suggestion[] {
  const a = c.answers;
  const out: Suggestion[] = [];
  const count = (k: Kinship) => parties.filter((p) => p.kinship === k).length;
  if (a.spouse === 'casado' && count('conjuge') === 0)
    out.push({ label: 'Adicionar cônjuge', preset: { kinship: 'conjuge', roles: ['conjuge', 'herdeiro'] } });
  if (a.spouse === 'uniao_facto' && count('unido_facto') === 0)
    out.push({ label: 'Adicionar unido(a) de facto', preset: { kinship: 'unido_facto', roles: ['unido_facto'] } });
  if (a.descendants === 'sim') {
    const expected = Number(a.descendantsCount) || 0;
    const have = count('filho');
    if (have < Math.max(1, expected))
      out.push({
        label: expected > have ? `Adicionar filho(a) · ${expected - have} em falta` : 'Adicionar filho(a)',
        preset: { kinship: 'filho', roles: ['herdeiro'] },
      });
    if (a.representation === 'sim' && count('neto') === 0)
      out.push({ label: 'Adicionar neto(a) por representação', preset: { kinship: 'neto', roles: ['herdeiro'] } });
  }
  if (a.descendants !== 'sim' && a.ascendants === 'sim' && count('progenitor') + count('avo') === 0)
    out.push({ label: 'Adicionar ascendente', preset: { kinship: 'progenitor', roles: ['herdeiro'] } });
  if (a.others === 'sim' && parties.every((p) => !p.roles.some((r) => r === 'legatario' || r === 'credor' || r === 'beneficiario')))
    out.push({ label: 'Adicionar outro interessado', preset: { roles: ['outro'], kinship: 'sem_parentesco' } });
  return out;
}

export function PartiesTab({ c }: { c: CaseRecord }) {
  const parties = useLiveQuery(() => db.parties.where('caseId').equals(c.id).sortBy('createdAt'), [c.id]);
  const [editing, setEditing] = useState<{ p: PartyRecord; isNew: boolean } | null>(null);

  const list = parties ?? [];
  const sugg = useMemo(() => suggestions(c, list), [c, list]);
  const heirs = list.filter((p) => p.roles.includes('herdeiro'));
  const poaDone = list.filter((p) => p.poa === 'recebida').length;
  const poaNeeded = list.filter((p) => p.poa !== 'na').length;
  const accepted = heirs.filter((p) => p.acceptance === 'aceitou' || p.acceptance === 'beneficio_inventario').length;
  const head = list.find((p) => p.isHeadOfEstate);

  const openNew = (preset: Partial<PartyRecord> = {}) => setEditing({ p: newParty(c.id, preset), isNew: true });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="toolbar">
        <div>
          <h2>Interessados na sucessão</h2>
          <p className="subtle small">Quem são? Qual a qualidade? Como contactar?</p>
        </div>
        <span className="spacer" />
        <Button variant="primary" icon={UserPlus} onClick={() => openNew()}>
          Adicionar interessado
        </Button>
      </div>

      {list.length > 0 && (
        <div className="mini-stats">
          <div>
            <span className="tabular strong">{list.length}</span> interessados
          </div>
          <div>
            <span className="tabular strong">{heirs.length}</span> herdeiros
          </div>
          <div>
            Procurações <span className="tabular strong">{poaDone}/{poaNeeded}</span>
          </div>
          <div>
            Aceitações <span className="tabular strong">{accepted}/{heirs.length}</span>
          </div>
          <div className={cx(!head && 'warn-text')}>
            Cabeça-de-casal: <span className="strong">{head?.name ?? 'por identificar'}</span>
          </div>
        </div>
      )}

      {sugg.length > 0 && (
        <div className="suggestions">
          <Sparkles size={15} aria-hidden />
          <span className="small subtle">Sugestões a partir do questionário:</span>
          {sugg.map((s) => (
            <button key={s.label} type="button" className="btn soft sm" onClick={() => openNew(s.preset)}>
              <Plus aria-hidden /> {s.label}
            </button>
          ))}
        </div>
      )}

      {parties === undefined ? (
        <div className="skeleton" style={{ height: 160 }} />
      ) : list.length === 0 ? (
        <Card>
          <Empty
            icon={Users}
            title="Ainda não há interessados"
            text="Registe herdeiros, cônjuge, legatários e credores — com qualidade, contactos, procuração e posição quanto à aceitação."
            action={
              <Button variant="primary" icon={UserPlus} onClick={() => openNew()}>
                Adicionar interessado
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="people-grid">
          {list.map((p) => (
            <PersonCard key={p.id} p={p} onOpen={() => setEditing({ p, isNew: false })} />
          ))}
        </div>
      )}

      <PartySheet state={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PersonCard({ p, onOpen }: { p: PartyRecord; onOpen: () => void }) {
  const nif = p.nif ? checkNif(p.nif) : null;
  return (
    <button type="button" className="card interactive person-card" onClick={onOpen}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        {p.kind === 'coletiva' ? (
          <span className="icon-tile brand">
            <Building aria-hidden />
          </span>
        ) : (
          <Avatar name={p.name || '?'} size="lg" />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="person-name truncate">{p.name || 'Sem nome'}</div>
          <div className="subtle small truncate">
            {p.kinship ? KINSHIP_LABELS[p.kinship] : 'Relação por indicar'}
            {p.nationality ? ` · ${p.nationality}` : ''}
          </div>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {p.roles.map((r) => (
          <span key={r} className={cx('badge', r === 'herdeiro' ? 'brand' : r === 'a_confirmar' ? 'warn' : '')}>
            {ROLE_LABELS[r]}
          </span>
        ))}
        {p.isHeadOfEstate && (
          <span className="badge ok">
            <Crown aria-hidden /> Cabeça-de-casal
          </span>
        )}
        {p.isClient && (
          <span className="badge info">
            <ShieldCheck aria-hidden /> Cliente
          </span>
        )}
        {p.isMinor && (
          <span className="badge critical">
            <Baby aria-hidden /> Menor
          </span>
        )}
        {p.isIncapacitated && <span className="badge critical">Maior acompanhado</span>}
      </div>
      <div className="person-facts">
        <span>
          <FileSignature aria-hidden /> Procuração: <strong>{POA_LABELS[p.poa]}</strong>
        </span>
        <span>
          <UserRound aria-hidden /> {ACCEPTANCE_LABELS[p.acceptance]}
        </span>
        {p.email && (
          <span className="truncate">
            <Mail aria-hidden /> {p.email}
          </span>
        )}
        {p.phone && (
          <span>
            <Phone aria-hidden /> {p.phone}
          </span>
        )}
        {nif && !nif.valid && <span className="warn-text">NIF inválido ({nif.reason})</span>}
      </div>
    </button>
  );
}

const ROLE_OPTIONS: PartyRole[] = ['herdeiro', 'conjuge', 'unido_facto', 'legatario', 'beneficiario', 'credor', 'representante', 'outro', 'a_confirmar'];

function PartySheet({ state, onClose }: { state: { p: PartyRecord; isNew: boolean } | null; onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState<PartyRecord | null>(state?.p ?? null);
  useEffect(() => setP(state?.p ?? null), [state]);

  if (!state || !p) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const set = (patch: Partial<PartyRecord>) => setP((x) => (x ? { ...x, ...patch } : x));
  const nif = p.nif ? checkNif(p.nif) : null;

  const toggleRole = (r: PartyRole) => {
    const has = p.roles.includes(r);
    let roles = has ? p.roles.filter((x) => x !== r) : [...p.roles.filter((x) => x !== 'a_confirmar'), r];
    if (r === 'a_confirmar' && !has) roles = ['a_confirmar'];
    if (!roles.length) roles = ['a_confirmar'];
    set({ roles });
  };

  async function save() {
    if (!p) return;
    if (!p.name.trim()) {
      toast({ tone: 'error', title: 'Indique o nome do interessado' });
      return;
    }
    await saveParty({ ...p, name: p.name.trim() }, state!.isNew);
    toast({ tone: 'success', title: state!.isNew ? 'Interessado adicionado' : 'Interessado atualizado' });
    onClose();
  }

  async function remove() {
    if (!p) return;
    const ok = await confirm({ title: `Remover ${p.name || 'este interessado'}?`, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    await deleteParty(p);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={state.isNew ? 'Novo interessado' : p.name || 'Interessado'}
      subtitle="Identificação, qualidade sucessória e contactos"
      icon={UserRound}
      footer={
        <>
          {!state.isNew && (
            <Button variant="ghost" icon={Trash2} onClick={() => void remove()}>
              Remover
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-section">
        <h3>Identificação</h3>
        <div className="form-grid">
          <Field label="Nome completo *" htmlFor="p-name" className="span-2">
            <input id="p-name" className="input" data-autofocus value={p.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Tipo" htmlFor="p-kind">
            <select id="p-kind" className="select" value={p.kind} onChange={(e) => set({ kind: e.target.value as PartyRecord['kind'] })}>
              <option value="singular">Pessoa singular</option>
              <option value="coletiva">Pessoa coletiva</option>
            </select>
          </Field>
          <Field label="Relação com o de cujus" htmlFor="p-kin">
            <select id="p-kin" className="select" value={p.kinship} onChange={(e) => set({ kinship: e.target.value as Kinship })}>
              <option value="">Por indicar</option>
              {Object.entries(KINSHIP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="NIF"
            htmlFor="p-nif"
            error={nif && !nif.valid ? nif.reason : undefined}
            ok={nif?.valid ? `NIF válido · ${nif.kind}` : undefined}
          >
            <input
              id="p-nif"
              className={cx('input', nif && !nif.valid && 'invalid')}
              inputMode="numeric"
              maxLength={9}
              value={p.nif}
              onChange={(e) => set({ nif: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Documento de identificação" htmlFor="p-id">
            <input id="p-id" className="input" value={p.idDoc} placeholder="CC / passaporte n.º…" onChange={(e) => set({ idDoc: e.target.value })} />
          </Field>
          {p.kind === 'singular' && (
            <>
              <Field label="Nacionalidade" htmlFor="p-nat">
                <input id="p-nat" className="input" value={p.nationality} onChange={(e) => set({ nationality: e.target.value })} />
              </Field>
              <Field label="Data e local de nascimento" htmlFor="p-birth">
                <input id="p-birth" className="input" value={p.birth} onChange={(e) => set({ birth: e.target.value })} />
              </Field>
              <Field label="Estado civil" htmlFor="p-civil">
                <input id="p-civil" className="input" value={p.civilStatus} onChange={(e) => set({ civilStatus: e.target.value })} />
              </Field>
              <Field label="Regime de bens" htmlFor="p-regime">
                <input id="p-regime" className="input" value={p.regime} onChange={(e) => set({ regime: e.target.value })} />
              </Field>
            </>
          )}
        </div>
      </div>

      <div className="form-section">
        <h3>Qualidade na sucessão</h3>
        <div className="choices">
          {ROLE_OPTIONS.map((r) => (
            <button key={r} type="button" className="choice" role="checkbox" aria-checked={p.roles.includes(r)} onClick={() => toggleRole(r)}>
              <span className="tick">
                <ShieldCheck aria-hidden />
              </span>
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 18 }}>
          <label className="checkbox">
            <input type="checkbox" checked={p.isHeadOfEstate} onChange={(e) => set({ isHeadOfEstate: e.target.checked })} />
            Cabeça-de-casal
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={p.isClient} onChange={(e) => set({ isClient: e.target.checked })} />
            Cliente do escritório
          </label>
          {p.kind === 'singular' && (
            <>
              <label className="checkbox">
                <input type="checkbox" checked={p.isMinor} onChange={(e) => set({ isMinor: e.target.checked })} />
                Menor
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={p.isIncapacitated} onChange={(e) => set({ isIncapacitated: e.target.checked })} />
                Maior acompanhado
              </label>
            </>
          )}
        </div>
        <div className="form-grid">
          <Field label="Procuração" htmlFor="p-poa">
            <select id="p-poa" className="select" value={p.poa} onChange={(e) => set({ poa: e.target.value as PartyRecord['poa'] })}>
              {Object.entries(POA_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aceitação da herança" htmlFor="p-acc">
            <select id="p-acc" className="select" value={p.acceptance} onChange={(e) => set({ acceptance: e.target.value as PartyRecord['acceptance'] })}>
              {Object.entries(ACCEPTANCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h3>Contactos</h3>
        <div className="form-grid">
          <Field label="Email" htmlFor="p-email">
            <input id="p-email" type="email" className="input" value={p.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Telefone" htmlFor="p-phone">
            <input id="p-phone" type="tel" className="input" value={p.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Morada" htmlFor="p-addr" className="span-2">
            <input id="p-addr" className="input" value={p.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Observações" htmlFor="p-notes" className="span-2">
            <textarea id="p-notes" className="textarea" value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
