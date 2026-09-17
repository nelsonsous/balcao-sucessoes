// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptText } from '../../lib/crypto';
import { db, newCase, newTask } from '../../lib/db';
import { exportDossier } from '../../lib/share';
import { renderApp, resetDb } from '../../test/render';
import { ImportDossierSheet, ShareDossierSheet } from './ShareSheets';

vi.mock('../../lib/utils', async (orig) => ({ ...(await orig<typeof import('../../lib/utils')>()), downloadFile: vi.fn() }));

async function sharedPackageJson(): Promise<string> {
  const c = newCase({ id: 'c-shared', name: 'Sucessão Colega', ref: 'BS-X-9' });
  await db.cases.add(c);
  await db.tasks.add(newTask(c.id, { id: 't-shared', title: 'Tarefa partilhada', phase: 'abertura' }));
  const json = JSON.stringify(await exportDossier(c.id));
  await resetDb();
  return json;
}

describe('ImportDossierSheet', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('analisa um ficheiro colado, mostra a pré-visualização e importa', async () => {
    const json = await sharedPackageJson();
    const onImported = vi.fn();
    renderApp(<ImportDossierSheet open onClose={() => {}} onImported={onImported} />);
    fireEvent.change(screen.getByLabelText('Conteúdo (JSON)'), { target: { value: json } });
    fireEvent.click(screen.getByRole('button', { name: 'Analisar' }));
    await screen.findByText(/Dossier novo neste dispositivo/);
    expect(screen.getByText(/BS-X-9 · Sucessão Colega/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Tarefas/ })).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith('c-shared'));
    expect((await db.cases.get('c-shared'))!.name).toBe('Sucessão Colega');
    expect(await db.tasks.count()).toBe(1);
  });

  it('pede a palavra-passe de um ficheiro cifrado e oferece as estratégias quando o dossier já existe', async () => {
    const json = await sharedPackageJson();
    const env = JSON.stringify(await encryptText(json, 'chave-do-colega', { hint: 'a do escritório', iterations: 1000 }));
    // O dossier já existe localmente (versão diferente)
    const parsed = JSON.parse(json) as { case: Parameters<typeof newCase>[0] };
    await db.cases.add(newCase({ ...parsed.case, generalNotes: 'nota local', updatedAt: '2030-01-01T00:00:00.000Z' }));
    renderApp(<ImportDossierSheet open onClose={() => {}} onImported={() => {}} />);
    fireEvent.change(screen.getByLabelText('Conteúdo (JSON)'), { target: { value: env } });
    fireEvent.click(screen.getByRole('button', { name: 'Analisar' }));
    const passInput = await screen.findByLabelText('Palavra-passe do ficheiro');
    expect(screen.getByText(/Pista: a do escritório/)).toBeInTheDocument();
    fireEvent.change(passInput, { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decifrar' }));
    await screen.findByText(/incorreta/);
    fireEvent.change(passInput, { target: { value: 'chave-do-colega' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decifrar' }));
    await screen.findByText(/O dossier já existe neste dispositivo/);
    expect(screen.getByRole('radio', { name: /Manter o mais recente/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Preferir o ficheiro/ }));
    await waitFor(() => expect(screen.getByText(/vai substituir a local|será substituída pela do ficheiro/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Juntar' }));
    await waitFor(async () => expect((await db.cases.get('c-shared'))!.generalNotes).toBe(''));
    expect(await db.tasks.count()).toBe(1);
  });

  it('recusa ficheiros que não são dossiers partilhados', async () => {
    renderApp(<ImportDossierSheet open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Conteúdo (JSON)'), { target: { value: '{"app":"balcao-das-sucessoes","tables":{}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analisar' }));
    await screen.findByText(/cópia de segurança completa/);
    expect(screen.getByRole('button', { name: 'Importar' })).toBeDisabled();
  });
});

describe('ShareDossierSheet', () => {
  it('exporta cifrado só quando as palavras-passe coincidem e regista no histórico', async () => {
    await resetDb();
    const c = newCase({ id: 'c-out', name: 'Sucessão Saída', ref: 'BS-S-1' });
    await db.cases.add(c);
    const onClose = vi.fn();
    renderApp(<ShareDossierSheet c={c} open onClose={onClose} />);
    const btn = screen.getByRole('button', { name: 'Exportar ficheiro' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Palavra-passe'), { target: { value: 'segredo-forte' } });
    fireEvent.change(screen.getByLabelText('Repetir a palavra-passe'), { target: { value: 'segredo-forte' } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const { downloadFile } = await import('../../lib/utils');
    expect(downloadFile).toHaveBeenCalledWith(expect.stringMatching(/^dossier-bs-s-1-\d{4}-\d{2}-\d{2}\.cifrado\.json$/), expect.stringContaining('"format":"balcao-das-sucessoes/encrypted"'), 'application/json');
    const log = await db.activity.where('caseId').equals(c.id).toArray();
    expect(log.some((a) => /exportado para partilha/.test(a.text) && /cifrado/.test(a.text))).toBe(true);
  }, 15_000);
});
