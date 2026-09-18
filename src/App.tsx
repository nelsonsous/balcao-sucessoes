import { Suspense, lazy, useEffect } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { FileQuestion } from 'lucide-react';
import { applyTheme, getSetting, useSettings } from './lib/db';
import { initLock } from './lib/lock';
import { LockScreen } from './components/LockScreen';
import { Onboarding } from './components/Onboarding';
import { Reminders } from './components/Reminders';
import { UndoToasts } from './components/UndoToasts';
import { purgeTrash } from './lib/recycle';
import { watchVirtualKeyboard } from './lib/keyboard';
import { PwaPrompts } from './components/PwaPrompts';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { Button, Card, ConfirmProvider, Empty } from './components/ui';
// Todas as páginas carregam à parte (divisão de código): a app arranca só com o essencial
// (React, base de dados e moldura) e o resto chega quando é preciso.
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const DossierList = lazy(() => import('./features/dossiers/DossierList').then((m) => ({ default: m.DossierList })));
const DossierView = lazy(() => import('./features/dossiers/DossierView').then((m) => ({ default: m.DossierView })));

/** Os ecrãs mais usados carregam-se assim que o navegador fica livre: a navegação continua instantânea. */
const PREFETCH = [() => import('./features/dashboard/Dashboard'), () => import('./features/dossiers/DossierList'), () => import('./features/dossiers/DossierView')];

function prefetchWhenIdle(): void {
  const run = () => PREFETCH.forEach((load) => void load().catch(() => undefined));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
const AgendaPage = lazy(() => import('./features/agenda/AgendaPage').then((m) => ({ default: m.AgendaPage })));
const CalculatorPage = lazy(() => import('./features/calculator/CalculatorPage').then((m) => ({ default: m.CalculatorPage })));
const TemplatesPage = lazy(() => import('./features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const MyTasksPage = lazy(() => import('./features/tasks/MyTasksPage').then((m) => ({ default: m.MyTasksPage })));
const TasksPage = lazy(() => import('./features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const NewCaseWizard = lazy(() => import('./features/wizard/NewCaseWizard').then((m) => ({ default: m.NewCaseWizard })));
const PrazosPage = lazy(() => import('./features/prazos/PrazosPage').then((m) => ({ default: m.PrazosPage })));
const ReceivedPage = lazy(() => import('./features/inbox/ReceivedPage').then((m) => ({ default: m.ReceivedPage })));
const RecyclePage = lazy(() => import('./features/recycle/RecyclePage').then((m) => ({ default: m.RecyclePage })));
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const RulesPage = lazy(() => import('./features/rules/RulesPage').then((m) => ({ default: m.RulesPage })));
/** As cópias automáticas (cifra, ficheiros, pasta local) só carregam quando estão ativas. */
const AutoBackupRunner = lazy(() => import('./components/AutoBackupRunner').then((m) => ({ default: m.AutoBackupRunner })));

function AutoBackupWhenEnabled() {
  const { autoBackupEnabled } = useSettings();
  return autoBackupEnabled ? (
    <Suspense fallback={null}>
      <AutoBackupRunner />
    </Suspense>
  ) : null;
}

const DiagnosticsPage = lazy(() => import('./features/diagnostics/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage })));

const Loading = () => <div className="skeleton" style={{ height: 320 }} aria-busy="true" aria-label="A carregar" />;

function NotFound() {
  return (
    <Card>
      <Empty
        icon={FileQuestion}
        title="Página não encontrada"
        action={
          <Button variant="primary" onClick={() => (location.hash = '#/')}>
            Ir para o início
          </Button>
        }
      />
    </Card>
  );
}

export default function App() {
  useEffect(() => {
    void getSetting('theme').then(applyTheme);
    void initLock();
    void getSetting('privacyMode').then((on) => document.body.classList.toggle('privacy', on));
    void purgeTrash().catch(() => undefined);
    prefetchWhenIdle();
    return watchVirtualKeyboard();
  }, []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router hook={useHashLocation}>
          <Shell>
            <Suspense fallback={<Loading />}>
              <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/dossiers" component={DossierList} />
              <Route path="/dossiers/novo" component={NewCaseWizard} />
              <Route path="/dossiers/:id/:tab?" component={DossierView} />
              <Route path="/tarefas" component={TasksPage} />
              <Route path="/minhas" component={MyTasksPage} />
              <Route path="/agenda" component={AgendaPage} />
              <Route path="/calculadora" component={CalculatorPage} />
              <Route path="/prazos" component={PrazosPage} />
              <Route path="/minutas" component={TemplatesPage} />
              <Route path="/definicoes" component={SettingsPage} />
              <Route path="/recebidos" component={ReceivedPage} />
              <Route path="/reciclagem" component={RecyclePage} />
              <Route path="/analise" component={AnalyticsPage} />
              <Route path="/regras" component={RulesPage} />
              <Route path="/diagnostico" component={DiagnosticsPage} />
              <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Shell>
          <Reminders />
          <AutoBackupWhenEnabled />
          <UndoToasts />
        </Router>
        <Onboarding />
        <PwaPrompts />
        <LockScreen />
      </ConfirmProvider>
    </ToastProvider>
  );
}
