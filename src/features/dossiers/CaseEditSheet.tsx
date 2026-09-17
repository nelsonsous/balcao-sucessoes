import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { saveCaseDetails } from '../../lib/actions';
import { useMembers } from '../../lib/hooks';
import { checkNif } from '../../lib/nif';
import type { CaseRecord, ClientInfo, Deceased, Priority } from '../../lib/types';
import { cx } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Field, Sheet } from '../../components/ui';

export function CaseEditSheet({ open, c, onClose }: { open: boolean; c: CaseRecord; onClose: () => void }) {
  const members = useMembers();
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [ref, setRef] = useState(c.ref);
  const [responsibleId, setResponsibleId] = useState(c.responsibleId);
  const [priority, setPriority] = useState<Priority>(c.priority);
  const [tags, setTags] = useState(c.tags.join(', '));
  const [deceased, setDeceased] = useState<Deceased>(c.deceased);
  const [client, setClient] = useState<ClientInfo>(c.client);

  useEffect(() => {
    if (!open) return;
    setName(c.name);
    setRef(c.ref);
    setResponsibleId(c.responsibleId);
    setPriority(c.priority);
    setTags(c.tags.join(', '));
    setDeceased(c.deceased);
    setClient(c.client);
  }, [open, c]);

  const nif = deceased.nif ? checkNif(deceased.nif) : null;

  async function save() {
    await saveCaseDetails(c, {
      name: name.trim() || c.name,
      ref: ref.trim() || c.ref,
      responsibleId,
      priority,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      deceased,
      client,
    });
    toast({
      tone: 'success',
      title: 'Dados guardados',
      description: deceased.deathDate !== c.deceased.deathDate ? 'Os prazos legais foram recalculados.' : undefined,
    });
    onClose();
  }

  const dz = (p: Partial<Deceased>) => setDeceased((d) => ({ ...d, ...p }));
  const cl = (p: Partial<ClientInfo>) => setClient((d) => ({ ...d, ...p }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar dossier"
      subtitle={c.ref}
      icon={Pencil}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-section">
        <h3>Dossier</h3>
        <div className="form-grid">
          <Field label="Nome" htmlFor="e-name" className="span-2">
            <input id="e-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Referência interna" htmlFor="e-ref">
            <input id="e-ref" className="input" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
          <Field label="Prioridade" htmlFor="e-prio">
            <select id="e-prio" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </Field>
          <Field label="Responsável" htmlFor="e-resp">
            <select id="e-resp" className="select" value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
              <option value="">Sem responsável</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Etiquetas" htmlFor="e-tags" hint="Separadas por vírgulas">
            <input id="e-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h3>De cujus e óbito</h3>
        <div className="form-grid">
          <Field label="Nome completo" htmlFor="e-dname" className="span-2">
            <input id="e-dname" className="input" value={deceased.name} onChange={(e) => dz({ name: e.target.value })} />
          </Field>
          <Field label="Data do óbito" htmlFor="e-ddate" hint="Alterar recalcula os prazos automáticos.">
            <input id="e-ddate" type="date" className="input" value={deceased.deathDate} onChange={(e) => dz({ deathDate: e.target.value })} />
          </Field>
          <Field label="Localidade do óbito" htmlFor="e-dcity">
            <input id="e-dcity" className="input" value={deceased.deathCity} onChange={(e) => dz({ deathCity: e.target.value })} />
          </Field>
          <Field label="NIF" htmlFor="e-dnif" error={nif && !nif.valid ? nif.reason : undefined} ok={nif?.valid ? `NIF válido · ${nif.kind}` : undefined}>
            <input
              id="e-dnif"
              className={cx('input', nif && !nif.valid && 'invalid')}
              inputMode="numeric"
              maxLength={9}
              value={deceased.nif}
              onChange={(e) => dz({ nif: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Data de nascimento" htmlFor="e-dbirth">
            <input id="e-dbirth" type="date" className="input" value={deceased.birthDate} onChange={(e) => dz({ birthDate: e.target.value })} />
          </Field>
          <Field label="Último domicílio" htmlFor="e-daddr" className="span-2">
            <input id="e-daddr" className="input" value={deceased.lastAddress} onChange={(e) => dz({ lastAddress: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="form-section">
        <h3>Contacto do cliente</h3>
        <div className="form-grid">
          <Field label="Nome" htmlFor="e-cname">
            <input id="e-cname" className="input" value={client.name} onChange={(e) => cl({ name: e.target.value })} />
          </Field>
          <Field label="País" htmlFor="e-ccountry">
            <input id="e-ccountry" className="input" value={client.country} onChange={(e) => cl({ country: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="e-cemail">
            <input id="e-cemail" type="email" className="input" value={client.email} onChange={(e) => cl({ email: e.target.value })} />
          </Field>
          <Field label="Telefone" htmlFor="e-cphone">
            <input id="e-cphone" type="tel" className="input" value={client.phone} onChange={(e) => cl({ phone: e.target.value })} />
          </Field>
          <Field label="Contacto preferencial" htmlFor="e-cpref">
            <select id="e-cpref" className="select" value={client.preferred} onChange={(e) => cl({ preferred: e.target.value as ClientInfo['preferred'] })}>
              <option value="email">Email</option>
              <option value="telefone">Telefone</option>
              <option value="reuniao">Reunião</option>
              <option value="outro">Outro</option>
            </select>
          </Field>
          <Field label="Morada" htmlFor="e-caddr">
            <input id="e-caddr" className="input" value={client.address} onChange={(e) => cl({ address: e.target.value })} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
