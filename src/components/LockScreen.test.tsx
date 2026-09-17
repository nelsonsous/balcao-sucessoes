// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPin } from '../lib/crypto';
import { setSetting } from '../lib/db';
import { initLock, lockNow, useLock } from '../lib/lock';
import { renderApp, resetDb } from '../test/render';
import { LockScreen } from './LockScreen';

function LockProbe() {
  const l = useLock();
  return <span data-testid="locked">{String(l.locked)}</span>;
}

describe('Ecrã de bloqueio', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
    await setSetting('pinJson', JSON.stringify(await hashPin('2580', 1000)));
    await initLock();
  });
  afterEach(resetDb);

  it('abre bloqueado, recusa o PIN errado e desbloqueia com o PIN certo', async () => {
    renderApp(
      <>
        <LockScreen />
        <LockProbe />
      </>,
    );
    const input = await screen.findByLabelText('PIN');
    expect(screen.getByTestId('locked')).toHaveTextContent('true');
    fireEvent.change(input, { target: { value: '0000' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('PIN incorreto');
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '2580' } });
    fireEvent.submit(screen.getByLabelText('PIN').closest('form')!);
    await waitFor(() => expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument());
    expect(screen.getByTestId('locked')).toHaveTextContent('false');
  });

  it('«Bloquear agora» volta a mostrar o ecrã', async () => {
    renderApp(<LockScreen />);
    const input = await screen.findByLabelText('PIN');
    fireEvent.change(input, { target: { value: '2580' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument());
    lockNow();
    expect(await screen.findByLabelText('PIN')).toBeInTheDocument();
  });
});
