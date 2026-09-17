// Utilitários para testes de componentes: fornece os mesmos contextos da aplicação.
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { ToastProvider } from '../components/Toast';
import { ConfirmProvider } from '../components/ui';
import { db } from '../lib/db';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router hook={useHashLocation}>{children}</Router>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export function renderApp(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: Providers, ...options });
}

/** Limpa todas as tabelas entre testes. */
export async function resetDb(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  location.hash = '';
}
