import { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  BellRing,
  CalendarDays,
  Database,
  Download,
  HardDrive,
  Info,
  Monitor,
  Moon,
  Palette,
  Pencil,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import { deleteCaseTemplate, deleteMember, saveMember } from '../../lib/actions';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { answeredCount } from '../../lib/caseTemplates';
import { attachmentsSize, downloadBackup, importBackup, parseBackup, storageEstimate, wipeAll } from '../../lib/backup';
import { formatBytes } from '../../lib/documents';
import { requestPersistence, setSetting, useSettings, type AppSettings } from '../../lib/db';
import { loadDemoData, removeDemoData } from '../../lib/demo';
import { useInstall, useMembers } from '../../lib/hooks';
import type { MemberRecord } from '../../lib/types';
import { MUNICIPAL_HOLIDAYS, resolveMunicipal } from '../../engine/calendar';
import { notificationsSupported, showSystemNotification } from '../../components/Reminders';
import { useToast } from '../../components/Toast';
import { Avatar, Button, Card, CardHead, Field, Segmented, Sheet, useConfirm } from '../../components/ui';

export function SettingsPage() {
  const settings = useSettings();
  const members = useMembers();
  const toast = useToast();
  const confirm = useConfirm();
  const install = useInstall();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({ userName: '', firmName: '', tagline: '', firmCity: '', firmAddress: '', firmEmail: '', firmPhone: '' });
  const [includeFiles, setIncludeFiles] = useState(true);
  const [attachments, setAttachments] = useState<{ count: number; bytes: number } | null>(null);
  const [member, setMember] = useState<Partial<MemberRecord> | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    setProfile({
      userName: settings.userName,
      firmName: settings.firmName,
      tagline: settings.tagline,
      firmCity: settings.firmCity,
      firmAddress: settings.firmAddress,
      firmEmail: settings.firmEmail,
      firmPhone: settings.firmPhone,
    });
  }, [settings.userName, settings.firmName, settings.tagline, settings.firmCity, settings.firmAddress, settings.firmEmail, settings.firmPhone]);

  useEffect(() => {
    void storageEstimate().then(setStorage);
    void attachmentsSize().then(setAttachments);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const saveProfile = async () => {
    await setSetting('userName', profile.userName.trim());
    await setSetting('firmName', profile.firmName.trim());
    await setSetting('tagline', profile.tagline.trim());
    await setSetting('firmCity', profile.firmCity.trim());
    await setSetting('firmAddress', profile.firmAddress.trim());
    await setSetting('firmEmail', profile.firmEmail.trim());
    await setSetting('firmPhone', profile.firmPhone.trim());
    toast({ tone: 'success', title: 'Perfil guardado' });
  };

  async function onImport(file: File) {
    try {
      const parsed = parseBackup(await file.text());
      const n = parsed.tables.cases?.length ?? 0;
      const replace = await confirm({
        title: 'Importar cópia de segurança',
        message: `A cópia contém ${n} dossier(s). Substituir todos os dados atuais por esta cópia? (Escolha “Cancelar” para juntar sem apagar.)`,
        confirmLabel: 'Substituir tudo',
        danger: true,
      });
      await importBackup(parsed, replace ? 'replace' : 'merge');
      toast({ tone: 'success', title: 'Cópia importada', description: `${n} dossier(s) · ${replace ? 'dados substituídos' : 'dados juntos'}` });
    } catch (e) {
      toast({ tone: 'error', title: 'Não foi possível importar', description: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Escritório</div>
          <h1>Definições</h1>
          <p className="lede">Perfil, equipa, aparência e gestão dos dados guardados neste dispositivo.</p>
        </div>
      </div>

      <div className="settings-grid">
        <Card>
          <CardHead icon={UserRound} title="Perfil" subtitle="Usado na saudação e no histórico dos dossiers." />
          <div className="card-body stack">
            <Field label="O seu nome" htmlFor="s-user">
              <input id="s-user" className="input" value={profile.userName} onChange={(e) => setProfile({ ...profile, userName: e.target.value })} />
            </Field>
            <Field label="Escritório" htmlFor="s-firm">
              <input id="s-firm" className="input" value={profile.firmName} onChange={(e) => setProfile({ ...profile, firmName: e.target.value })} />
            </Field>
            <Field label="Assinatura" htmlFor="s-tag" hint="Mostrada no painel e na barra lateral.">
              <input id="s-tag" className="input" value={profile.tagline} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label="Localidade" htmlFor="s-city" hint="Usada nas cartas (“Lisboa, 17 de setembro…”).">
                <input id="s-city" className="input" value={profile.firmCity} onChange={(e) => setProfile({ ...profile, firmCity: e.target.value })} />
              </Field>
              <Field label="Telefone" htmlFor="s-phone">
                <input id="s-phone" className="input" value={profile.firmPhone} onChange={(e) => setProfile({ ...profile, firmPhone: e.target.value })} />
              </Field>
              <Field label="Morada" htmlFor="s-addr" className="span-2">
                <input id="s-addr" className="input" value={profile.firmAddress} onChange={(e) => setProfile({ ...profile, firmAddress: e.target.value })} />
              </Field>
              <Field label="Email" htmlFor="s-email" className="span-2">
                <input id="s-email" type="email" className="input" value={profile.firmEmail} onChange={(e) => setProfile({ ...profile, firmEmail: e.target.value })} />
              </Field>
            </div>
            <Field label="Na equipa, eu sou" htmlFor="s-me" hint="Liga o seu perfil a uma pessoa da equipa para “As minhas tarefas”.">
              <select id="s-me" className="select" value={settings.meId} onChange={(e) => void setSetting('meId', e.target.value)}>
                <option value="">— não definido —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <Button variant="primary" onClick={() => void saveProfile()}>
                Guardar perfil
              </Button>
            </div>
          </div>
        </Card>

        <CaseTemplatesCard />

        <Card>
          <CardHead
            icon={Users}
            title="Equipa"
            subtitle="Responsáveis por dossiers e tarefas."
            actions={
              <Button size="sm" icon={UserPlus} onClick={() => setMember({ name: '', role: 'Advogado(a)' })}>
                Adicionar
              </Button>
            }
          />
          <div className="card-body">
            {members.length === 0 ? (
              <p className="subtle small">Ainda sem pessoas na equipa.</p>
            ) : (
              <div className="list">
                {members.map((m) => (
                  <div key={m.id} className="list-item">
                    <Avatar member={m} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="li-title">{m.name}</div>
                      <div className="li-sub">{m.role}</div>
                    </div>
                    <Button variant="ghost" size="sm" iconOnly icon={Pencil} aria-label={`Editar ${m.name}`} onClick={() => setMember(m)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon={Trash2}
                      aria-label={`Remover ${m.name}`}
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `Remover ${m.name} da equipa?`,
                            message: 'Os dossiers e tarefas atribuídos ficam sem responsável.',
                            confirmLabel: 'Remover',
                            danger: true,
                          })
                        )
                          await deleteMember(m);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHead icon={Palette} title="Aparência" />
          <div className="card-body stack">
            <Segmented<AppSettings['theme']>
              label="Tema"
              value={settings.theme}
              onChange={(t) => void setSetting('theme', t)}
              options={[
                { value: 'system', label: 'Sistema', icon: Monitor },
                { value: 'light', label: 'Claro', icon: Sun },
                { value: 'dark', label: 'Escuro', icon: Moon },
              ]}
            />
            <p className="subtle small">O tema escuro reduz o cansaço visual em sessões longas.</p>
          </div>
        </Card>

        <AgendaSettings />

        <Card>
          <CardHead icon={Smartphone} title="Aplicação" subtitle="Instalável em computador, tablet e telemóvel." />
          <div className="card-body stack">
            {install.standalone ? (
              <div className="callout success">
                <ShieldCheck aria-hidden />
                <div>A aplicação está instalada e funciona sem ligação à internet.</div>
              </div>
            ) : install.canPrompt ? (
              <Button variant="primary" icon={Download} onClick={() => void install.install()}>
                Instalar o Balcão das Sucessões
              </Button>
            ) : (
              <div className="callout">
                <Info aria-hidden />
                <div>
                  {install.ios
                    ? 'No iPhone/iPad: abra no Safari, toque em Partilhar e escolha “Adicionar ao ecrã principal”.'
                    : 'No Chrome ou Edge: use o ícone de instalação na barra de endereço (ou Menu → Instalar aplicação).'}
                </div>
              </div>
            )}
            <p className="subtle small">Versão {__APP_VERSION__} · funciona offline depois da primeira visita.</p>
          </div>
        </Card>

        <Card className="span-2">
          <CardHead icon={Database} title="Dados e privacidade" subtitle="Tudo fica guardado apenas neste navegador/dispositivo (IndexedDB)." />
          <div className="card-body stack" style={{ gap: 16 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <span className="badge">
                <HardDrive aria-hidden /> {storage ? `${mb(storage.usage)} usados` : 'Espaço: —'}
              </span>
              <span className={persisted ? 'badge ok' : 'badge warn'}>
                <ShieldCheck aria-hidden /> {persisted ? 'Armazenamento persistente' : 'Armazenamento não persistente'}
              </span>
              {!persisted && (
                <Button
                  size="sm"
                  variant="soft"
                  onClick={async () => {
                    const ok = await requestPersistence();
                    setPersisted(ok);
                    toast({ tone: ok ? 'success' : 'info', title: ok ? 'Armazenamento protegido' : 'O navegador não concedeu persistência', description: ok ? undefined : 'Instale a aplicação e faça cópias de segurança regulares.' });
                  }}
                >
                  Proteger dados
                </Button>
              )}
            </div>
            <div className="callout warn">
              <Info aria-hidden />
              <div>
                <strong>Faça cópias de segurança regulares.</strong> Limpar os dados do navegador apaga os dossiers. A cópia é um ficheiro
                JSON com dados pessoais — guarde-o em local seguro.
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Button
                variant="primary"
                icon={Download}
                onClick={async () => {
                  const n = await downloadBackup({ includeFiles });
                  toast({ tone: 'success', title: 'Cópia de segurança exportada', description: `${n} dossier(s)` });
                }}
              >
                Exportar cópia de segurança
              </Button>
              <Button icon={Upload} onClick={() => fileRef.current?.click()}>
                Importar cópia
              </Button>
              <label className="checkbox small">
                <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
                Incluir anexos{attachments ? ` (${attachments.count} · ${formatBytes(attachments.bytes)})` : ''}
              </label>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImport(f);
                }}
              />
            </div>
            <hr className="divider" />
            <div className="row wrap" style={{ gap: 8 }}>
              <Button
                icon={Sparkles}
                onClick={async () => {
                  const n = await loadDemoData();
                  toast({ tone: 'success', title: 'Dados de demonstração carregados', description: `${n} dossiers fictícios` });
                }}
              >
                Carregar dados de demonstração
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await removeDemoData();
                  toast({ title: 'Dados de demonstração removidos' });
                }}
              >
                Remover dados de demonstração
              </Button>
              <span className="spacer" />
              <Button
                variant="danger-soft"
                icon={Trash2}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Apagar todos os dados?',
                    message: 'Todos os dossiers, tarefas, interessados, património, notas, equipa e definições deste dispositivo serão apagados. Exporte uma cópia antes.',
                    confirmLabel: 'Apagar tudo',
                    danger: true,
                  });
                  if (!ok) return;
                  await wipeAll();
                  toast({ title: 'Todos os dados foram apagados' });
                }}
              >
                Apagar todos os dados
              </Button>
            </div>
          </div>
        </Card>

        <Card className="span-2">
          <CardHead icon={Info} title="Sobre" />
          <div className="card-body stack small muted">
            <p>
              <strong>Balcão das Sucessões</strong> — nasceu de uma ideia simples: “neste país há balcões para tudo… porque não um para as
              sucessões?”. Organizar, acompanhar e identificar o próximo passo de cada dossier, com menos dispersão e uma visão global em
              tempo real.
            </p>
            <p>
              Ferramenta de apoio à gestão de processos sucessórios. As tarefas, referências legais e prazos sugeridos são indicativos e não
              substituem a análise jurídica do caso concreto — devem ser validados pela equipa. Use apenas dados fictícios em demonstrações.
            </p>
          </div>
        </Card>
      </div>

      <MemberSheet member={member} onClose={() => setMember(null)} />
    </div>
  );
}

function AgendaSettings() {
  const settings = useSettings();
  const toast = useToast();
  const isKnown = settings.municipalHoliday === '' || settings.municipalHoliday in MUNICIPAL_HOLIDAYS;
  const [custom, setCustom] = useState(isKnown ? '' : settings.municipalHoliday);
  const [mode, setMode] = useState<string>(isKnown ? settings.municipalHoliday : 'custom');
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    notificationsSupported() ? Notification.permission : 'unsupported',
  );
  useEffect(() => {
    const known = settings.municipalHoliday === '' || settings.municipalHoliday in MUNICIPAL_HOLIDAYS;
    setMode(known ? settings.municipalHoliday : 'custom');
    if (!known) setCustom(settings.municipalHoliday);
  }, [settings.municipalHoliday]);

  const customValid = resolveMunicipal(custom) !== null;

  async function enableNotifications() {
    if (!notificationsSupported()) return;
    const p = await Notification.requestPermission();
    setPerm(p);
    await setSetting('notifications', p === 'granted');
    if (p === 'granted') {
      await showSystemNotification('Balcão das Sucessões', 'Notificações ativas: receberá o resumo diário de prazos e compromissos.');
      toast({ tone: 'success', title: 'Notificações ativadas' });
    } else {
      toast({ tone: 'error', title: 'Permissão recusada', description: 'Pode alterá-la nas definições do navegador.' });
    }
  }

  return (
    <Card>
      <CardHead icon={CalendarDays} title="Agenda e lembretes" subtitle="Feriados, férias judiciais e avisos." />
      <div className="card-body stack">
        <Field label="Feriado municipal" htmlFor="s-mun" hint="Conta como dia não útil nos avisos de prazos e no calendário.">
          <div className="row wrap">
            <select
              id="s-mun"
              className="select"
              style={{ flex: '1 1 180px' }}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                if (e.target.value !== 'custom') void setSetting('municipalHoliday', e.target.value);
              }}
            >
              <option value="">Nenhum</option>
              {Object.entries(MUNICIPAL_HOLIDAYS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} — {v.day}/{String(v.month).padStart(2, '0')}
                </option>
              ))}
              <option value="custom">Outro (dia-mês)…</option>
            </select>
            {mode === 'custom' && (
              <>
                <input
                  className={custom && !customValid ? 'input invalid' : 'input'}
                  style={{ width: 110 }}
                  placeholder="DD-MM"
                  aria-label="Dia e mês do feriado municipal"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
                <Button size="sm" disabled={!customValid} onClick={() => void setSetting('municipalHoliday', custom)}>
                  Aplicar
                </Button>
              </>
            )}
          </div>
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={settings.showJudicialHolidays} onChange={(e) => void setSetting('showJudicialHolidays', e.target.checked)} />
          Mostrar férias judiciais no calendário
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={settings.appBadge} onChange={(e) => void setSetting('appBadge', e.target.checked)} />
          Contador de pendentes no ícone da aplicação instalada
        </label>
        <div className="row wrap" style={{ gap: 8 }}>
          {perm === 'unsupported' ? (
            <span className="subtle small">Este navegador não suporta notificações.</span>
          ) : perm === 'granted' ? (
            <>
              <label className="checkbox">
                <input type="checkbox" checked={settings.notifications} onChange={(e) => void setSetting('notifications', e.target.checked)} />
                Resumo diário por notificação
              </label>
              <Button
                size="sm"
                variant="ghost"
                icon={BellRing}
                onClick={() => void showSystemNotification('Balcão das Sucessões', 'Assim aparecem os lembretes de prazos e compromissos.')}
              >
                Testar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="soft" icon={BellRing} onClick={() => void enableNotifications()} disabled={perm === 'denied'}>
              {perm === 'denied' ? 'Notificações bloqueadas no navegador' : 'Ativar notificações'}
            </Button>
          )}
        </div>
        <p className="subtle small">
          Os lembretes aparecem ao abrir a aplicação (uma vez por dia). Para avisos no Outlook, exporte a agenda em .ics.
        </p>
      </div>
    </Card>
  );
}

function MemberSheet({ member, onClose }: { member: Partial<MemberRecord> | null; onClose: () => void }) {
  const [m, setM] = useState<Partial<MemberRecord>>({});
  useEffect(() => setM(member ?? {}), [member]);
  return (
    <Sheet
      open={Boolean(member)}
      onClose={onClose}
      variant="modal"
      title={member?.id ? 'Editar pessoa' : 'Nova pessoa na equipa'}
      footer={
        <>
          <span className="spacer" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!m.name?.trim()}
            onClick={async () => {
              await saveMember({ ...m, name: m.name ?? '' });
              onClose();
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nome" htmlFor="m-name">
          <input id="m-name" className="input" data-autofocus value={m.name ?? ''} onChange={(e) => setM({ ...m, name: e.target.value })} />
        </Field>
        <Field label="Função" htmlFor="m-role">
          <input id="m-role" className="input" value={m.role ?? ''} onChange={(e) => setM({ ...m, role: e.target.value })} />
        </Field>
        <Field label="Cor" htmlFor="m-color">
          <input id="m-color" type="color" className="input" style={{ padding: 4 }} value={m.color ?? '#2d39b9'} onChange={(e) => setM({ ...m, color: e.target.value })} />
        </Field>
      </div>
    </Sheet>
  );
}


function CaseTemplatesCard() {
  const confirm = useConfirm();
  const toast = useToast();
  const templates = useLiveQuery(() => db.caseTemplates.toArray(), []);
  return (
    <Card>
      <CardHead icon={BookmarkPlus} title="Modelos de dossier" subtitle="Guardados a partir de dossiers (menu ⋯ → Guardar como modelo). Os modelos-base estão sempre disponíveis em “Nova sucessão”." />
      <div className="card-body stack">
        {!templates?.length ? (
          <p className="small subtle">Ainda sem modelos do escritório.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {templates.map((t) => (
              <div key={t.id} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="strong">{t.name}</div>
                  <div className="tiny subtle">
                    {answeredCount(t.answers)} respostas · {t.tags.length} etiqueta(s) · {t.tasks.length} tarefa(s) própria(s){t.description ? ` — ${t.description}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn ghost sm icon"
                  aria-label={`Remover ${t.name}`}
                  onClick={async () => {
                    const ok = await confirm({ title: `Remover o modelo “${t.name}”?`, message: 'Os dossiers criados a partir dele não são afetados.', confirmLabel: 'Remover' });
                    if (!ok) return;
                    await deleteCaseTemplate(t.id);
                    toast({ tone: 'success', title: 'Modelo removido' });
                  }}
                >
                  <Trash2 aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
