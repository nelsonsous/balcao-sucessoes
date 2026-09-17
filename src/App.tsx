import { Suspense, lazy, useEffect } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { FileQuestion } from 'lucide-react';
import { applyTheme, getSetting } from './lib/db';
import { initLock } from './lib/lock';
import { LockScreen } from './components/LockScreen';
import { Onboarding } from './components/Onboarding';
import { Reminders } from './components/Reminders';
import { AutoBackupRunner } from './components/AutoBackupRunner';
import { PwaPrompts } from './components/PwaPrompts';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { Button, Card, ConfirmProvider, Empty } from './components/ui';
import { Dashboard } from './features/dashboard/Dashboard';
import { DossierList } from './features/dossiers/DossierList';
import { DossierView } from './features/dossiers/DossierView';

// Páginas menos frequentes carregam à parte (divisão de código): a app arranca mais depressa.
const AgendaPage = lazy(() => import('./features/agenda/AgendaPage').then((m) => ({ default: m.AgendaPage })));
const CalculatorPage = lazy(() => import('./features/calculator/CalculatorPage').then((m) => ({ default: m.CalculatorPage })));
const TemplatesPage = lazy(() => import('./features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const MyTasksPage = lazy(() => import('./features/tasks/MyTasksPage').then((m) => ({ default: m.MyTasksPage })));
const TasksPage = lazy(() => import('./features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const NewCaseWizard = lazy(() => import('./features/wizard/NewCaseWizard').then((m) => ({ default: m.NewCaseWizard })));
const PrazosPage = lazy(() => import('./features/prazos/PrazosPage').then((m) => ({ default: m.PrazosPage })));
const ReceivedPage = lazy(() => import('./features/inbox/ReceivedPage').then((m) => ({ default: m.ReceivedPage })));

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
              <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Shell>
          <Reminders />
          <AutoBackupRunner />
        </Router>
        <Onboarding />
        <PwaPrompts />
        <LockScreen />
      </ConfirmProvider>
    </ToastProvider>
  );
}
