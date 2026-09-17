import { useEffect } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { FileQuestion } from 'lucide-react';
import { applyTheme, getSetting } from './lib/db';
import { Onboarding } from './components/Onboarding';
import { Reminders } from './components/Reminders';
import { PwaPrompts } from './components/PwaPrompts';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
import { Button, Card, ConfirmProvider, Empty } from './components/ui';
import { AgendaPage } from './features/agenda/AgendaPage';
import { CalculatorPage } from './features/calculator/CalculatorPage';
import { TemplatesPage } from './features/templates/TemplatesPage';
import { Dashboard } from './features/dashboard/Dashboard';
import { DossierList } from './features/dossiers/DossierList';
import { DossierView } from './features/dossiers/DossierView';
import { SettingsPage } from './features/settings/SettingsPage';
import { TasksPage } from './features/tasks/TasksPage';
import { NewCaseWizard } from './features/wizard/NewCaseWizard';

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
  }, []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router hook={useHashLocation}>
          <Shell>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/dossiers" component={DossierList} />
              <Route path="/dossiers/novo" component={NewCaseWizard} />
              <Route path="/dossiers/:id/:tab?" component={DossierView} />
              <Route path="/tarefas" component={TasksPage} />
              <Route path="/agenda" component={AgendaPage} />
              <Route path="/calculadora" component={CalculatorPage} />
              <Route path="/minutas" component={TemplatesPage} />
              <Route path="/definicoes" component={SettingsPage} />
              <Route component={NotFound} />
            </Switch>
          </Shell>
          <Reminders />
        </Router>
        <Onboarding />
        <PwaPrompts />
      </ConfirmProvider>
    </ToastProvider>
  );
}
