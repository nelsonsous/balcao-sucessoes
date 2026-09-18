import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Activity, CircleAlert, CircleCheck, ClipboardCopy, Database, Download, HardDrive, Info, MonitorSmartphone, RefreshCw, ShieldCheck, Stethoscope, TriangleAlert, Wrench } from 'lucide-react';
import { downloadBackup } from '../../lib/backup';
import { requestPersistence } from '../../lib/db';
import { collectDiagnostics, diagnosticsText, mb, type Diagnostics } from '../../lib/diagnostics';
import { isRepairable, repairIntegrity, runIntegrityCheck, type IntegrityIssue, type IntegrityReport, type Severity } from '../../lib/integrity';
import { cx, downloadFile, formatDateTime, todayIso } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Button, Card, CardHead, Progress, useConfirm } from '../../components/ui';

const SEVERITY: Record<Severity, { label: string; badge: string; icon: typeof CircleAlert }> = {
  erro: { label: 'Erro', badge: 'critical', icon: CircleAlert },
  aviso: { label: 'Aviso', badge: 'warn', icon: TriangleAlert },
  info: { label: 'Informação', badge: 'info', icon: Info },
};

const SW_TEXT: Record<Diagnostics['sw']['state'], string> = {
  ativo: 'Ativo — a aplicação funciona sem internet',
  'a instalar': 'A instalar…',
  'à espera': 'À espera de ativar',
  'sem registo': 'Sem registo (abra a aplicação com ligação à internet)',
  'não suportado': 'Não suportado neste navegador',
};

/** Diagnóstico: estado da aplicação neste dispositivo e verificação da integridade dos dados. */
export function DiagnosticsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const refresh = useCallback(async () => setDiag(await collectDiagnostics()), []);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setReport(await runIntegrityCheck());
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    void check();
  }, [refresh, check]);

  const repairable = (report?.issues ?? []).filter(isRepairable);

  const repair = async (issues: IntegrityIssue[]) => {
    if (!issues.length) return;
    const ok = await confirm({
      title: issues.length === 1 ? `${issues[0]!.repair}?` : `Reparar ${issues.length} problemas?`,
      message: (
        <>
          {issues.map((i) => (
            <div key={i.id}>
              • {i.title} ({i.count})
            </div>
          ))}
          <p style={{ marginTop: 10 }}>Recomendamos exportar antes uma cópia de segurança. As correções nos dossiers ficam registadas no histórico de cada um.</p>
        </>
      ),
      confirmLabel: 'Reparar',
    });
    if (!ok) return;
    setRepairing(true);
    try {
      const fixed = await repairIntegrity(issues.map((i) => i.id));
      const total = Object.values(fixed).reduce((s, v) => s + (v ?? 0), 0);
      toast({ tone: 'success', title: `Reparado: ${total} ${total === 1 ? 'registo' : 'registos'}`, description: 'A verificação foi repetida.' });
      await check();
      await refresh();
    } finally {
      setRepairing(false);
    }
  };

  const copy = async () => {
    if (!diag) return;
    try {
      await navigator.clipboard.writeText(diagnosticsText(diag, report));
      toast({ tone: 'success', title: 'Diagnóstico copiado', description: 'Só dados técnicos e contagens — sem nomes nem conteúdos.' });
    } catch {
      toast({ tone: 'error', title: 'Não foi possível copiar', description: 'Use «Descarregar».' });
    }
  };

  const usagePct = diag?.storage.usage && diag.storage.quota ? Math.round((diag.storage.usage / diag.storage.quota) * 1000) / 10 : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Stethoscope size={14} aria-hidden /> Escritório
          </div>
          <h1>Diagnóstico</h1>
          <p className="lede">Estado da aplicação neste dispositivo e verificação da integridade dos dados — útil antes de uma cópia de segurança, depois de importar dados ou para pedir ajuda.</p>
        </div>
        <div className="page-actions">
          <Button icon={ClipboardCopy} disabled={!diag} onClick={() => void copy()}>
            Copiar diagnóstico
          </Button>
          <Button icon={Download} disabled={!diag} onClick={() => diag && downloadFile(`diagnostico-balcao-${todayIso()}.txt`, diagnosticsText(diag, report), 'text/plain;charset=utf-8')}>
            Descarregar
          </Button>
        </div>
      </div>

      <div className="settings-grid">
        <Card className="span-2">
          <CardHead
            icon={Wrench}
            title="Integridade dos dados"
            subtitle={report ? `Verificado ${formatDateTime(report.checkedAt)} · ${report.totals.cases} dossiers · ${report.totals.records} registos · ${report.totals.files} anexos` : 'A verificar…'}
            actions={
              <div className="row wrap" style={{ gap: 8 }}>
                <Button size="sm" icon={RefreshCw} disabled={checking || repairing} onClick={() => void check()}>
                  Verificar de novo
                </Button>
                {repairable.length > 1 && (
                  <Button size="sm" variant="primary" icon={Wrench} disabled={repairing} onClick={() => void repair(repairable)}>
                    Reparar tudo ({repairable.length})
                  </Button>
                )}
              </div>
            }
          />
          <div className="card-body stack" style={{ gap: 12 }} data-testid="integrity">
            {!report ? (
              <div className="skeleton" style={{ height: 80 }} />
            ) : report.issues.length === 0 ? (
              <div className="callout success" role="status">
                <CircleCheck aria-hidden />
                <div>
                  <strong>Tudo em ordem.</strong> Nenhum registo órfão, anexo perdido, referência partida ou tarefa repetida em {report.totals.records} registos.
                </div>
              </div>
            ) : (
              <>
                <ul className="integrity-list">
                  {report.issues.map((i) => {
                    const S = SEVERITY[i.severity];
                    return (
                      <li key={i.id} className={cx('integrity-item', `sev-${i.severity}`)} data-issue={i.id}>
                        <S.icon className="integrity-icon" aria-hidden />
                        <div className="integrity-main">
                          <div className="row wrap" style={{ gap: 8 }}>
                            <strong>{i.title}</strong>
                            <span className={`badge ${S.badge}`}>
                              {S.label} · {i.count}
                            </span>
                          </div>
                          <p className="small muted">{i.detail}</p>
                          {i.examples.length > 0 && (
                            <ul className="integrity-examples tiny subtle">
                              {i.examples.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                          )}
                          {i.id === 'regras-invalidas' && (
                            <Link href="/regras" className="small">
                              Abrir as regras do escritório
                            </Link>
                          )}
                        </div>
                        {i.repair && (
                          <Button size="sm" disabled={repairing} onClick={() => void repair([i])}>
                            {i.repair}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="callout">
                  <Database aria-hidden />
                  <div>
                    Antes de reparar,{' '}
                    <button type="button" className="link-btn" onClick={() => void downloadBackup().then(() => toast({ tone: 'success', title: 'Cópia de segurança exportada' }))}>
                      exporte uma cópia de segurança
                    </button>
                    . As reparações apagam apenas o que já não se consegue ver na aplicação ou limpam referências partidas.
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHead icon={Activity} title="Aplicação" subtitle={diag ? `Versão ${diag.version} · base de dados v${diag.dbVersion}` : 'A recolher…'} />
          <div className="card-body">
            {diag && (
              <dl className="diag-list">
                <dt>Service worker</dt>
                <dd>
                  {SW_TEXT[diag.sw.state]}
                  {diag.sw.updateWaiting ? ' · nova versão à espera (feche e volte a abrir a aplicação)' : ''}
                </dd>
                <dt>Ligação</dt>
                <dd>{diag.online ? 'Com internet' : 'Sem internet — a trabalhar com os dados deste dispositivo'}</dd>
                <dt>Instalada</dt>
                <dd>{diag.standalone ? 'Sim, como aplicação' : 'Não — aberta no navegador'}</dd>
                <dt>Ficheiros guardados para uso offline</dt>
                <dd>{diag.caches.length ? diag.caches.map((c) => `${c.entries} em ${c.name}`).join(' · ') : 'Nenhum'}</dd>
                <dt>Ambiente</dt>
                <dd>
                  {diag.env.language} · {diag.env.timeZone} · {diag.env.screen}
                  {diag.env.touch ? ' · ecrã tátil' : ''}
                </dd>
              </dl>
            )}
          </div>
        </Card>

        <Card>
          <CardHead icon={HardDrive} title="Armazenamento" subtitle={diag ? `${mb(diag.storage.usage)} usados de ${mb(diag.storage.quota)} disponíveis` : 'A recolher…'} />
          <div className="card-body stack" style={{ gap: 12 }}>
            {diag && (
              <>
                <Progress pct={usagePct} label="Espaço usado" />
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={diag.storage.persisted ? 'badge ok' : 'badge warn'}>
                    <ShieldCheck aria-hidden /> {diag.storage.persisted ? 'Persistente — o navegador não apaga os dados' : 'Não persistente'}
                  </span>
                  {!diag.storage.persisted && (
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={async () => {
                        const ok = await requestPersistence();
                        toast({ tone: ok ? 'success' : 'info', title: ok ? 'Armazenamento protegido' : 'O navegador não concedeu persistência', description: ok ? undefined : 'Instale a aplicação e faça cópias de segurança regulares.' });
                        await refresh();
                      }}
                    >
                      Proteger dados
                    </Button>
                  )}
                </div>
                <table className="table diag-counts">
                  <caption className="sr-only">Registos guardados neste dispositivo</caption>
                  <tbody>
                    {diag.counts.map((c) => (
                      <tr key={c.table}>
                        <th scope="row">{c.label}</th>
                        <td className="tabular">{c.count}</td>
                      </tr>
                    ))}
                    <tr>
                      <th scope="row">Tamanho dos anexos</th>
                      <td className="tabular">{mb(diag.attachments.bytes)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </div>
        </Card>

        <Card className="span-2">
          <CardHead icon={MonitorSmartphone} title="Navegador e funcionalidades" subtitle="O que este navegador permite fazer na aplicação." />
          <div className="card-body">
            {diag && (
              <ul className="feature-list">
                {diag.features.map((f) => (
                  <li key={f.id} className={cx('feature', f.ok ? 'ok' : 'off')}>
                    {f.ok ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}
                    <span>
                      <strong>{f.label}</strong>
                      <span className="sr-only">{f.ok ? ' — disponível' : ' — indisponível'}</span>
                      <span className="tiny subtle"> · {f.why}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
