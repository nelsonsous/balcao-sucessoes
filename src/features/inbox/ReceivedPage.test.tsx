// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, newCase } from '../../lib/db';
import { addInbox, clearInbox, inboxCount } from '../../lib/shareInbox';
import { renderApp, resetDb } from '../../test/render';
import { ReceivedPage } from './ReceivedPage';

describe('Recebidos (Web Share Target)', () => {
  beforeEach(async () => {
    await resetDb();
    await clearInbox();
  });

  it('mostra o estado vazio com instruções', async () => {
    renderApp(<ReceivedPage />);
    expect(await screen.findByText('Nada recebido')).toBeInTheDocument();
    expect(screen.getByText(/Partilhar → Balcão das Sucessões/)).toBeInTheDocument();
  });

  it('anexa um ficheiro recebido como documento e guarda uma ligação como nota', async () => {
    await db.cases.add(newCase({ id: 'c-rx', name: 'Sucessão Recebida', ref: 'BS-R-1' }));
    await addInbox({ title: 'Certidão de óbito', text: '', url: '', at: '2026-09-17T10:00:00.000Z', files: [{ name: 'certidao-obito.pdf', type: 'application/pdf', size: 12, blob: new Blob(['%PDF-1.4 abc'], { type: 'application/pdf' }) }] });
    await addInbox({ title: '', text: 'Artigo sobre habilitação de herdeiros', url: 'https://exemplo.pt/artigo', at: '2026-09-17T10:05:00.000Z', files: [] });
    renderApp(<ReceivedPage />);
    expect(await screen.findByText('2 itens por tratar')).toBeInTheDocument();
    expect(screen.getByText(/certidao-obito\.pdf · 12 B/)).toBeInTheDocument();
    const attachBtn = screen.getByRole('button', { name: 'Anexar ao dossier' });
    expect(attachBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Dossier de destino'), { target: { value: 'c-rx' } });
    expect(attachBtn).toBeEnabled();
    fireEvent.click(attachBtn);
    await waitFor(async () => expect(await db.documents.where('caseId').equals('c-rx').count()).toBe(1));
    const doc = (await db.documents.where('caseId').equals('c-rx').first())!;
    expect(doc.fileName).toBe('certidao-obito.pdf');
    expect(doc.status).toBe('recebido');
    expect(doc.source).toBe('anexo');
    // (o conteúdo binário não é verificável no jsdom: Blobs de realms diferentes; o E2E no Chrome cobre-o)
    const stored = (await db.files.get(doc.fileId))!;
    expect(stored.name).toBe('certidao-obito.pdf');
    expect(stored.type).toBe('application/pdf');
    expect(await screen.findByText('1 item por tratar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar como nota' }));
    await waitFor(async () => expect(await db.notes.where('caseId').equals('c-rx').count()).toBe(1));
    expect((await db.notes.where('caseId').equals('c-rx').first())!.text).toContain('https://exemplo.pt/artigo');
    expect(await screen.findByText('Nada recebido')).toBeInTheDocument();
    expect(await inboxCount()).toBe(0);
  });

  it('ignorar remove o item sem tocar nos dossiers', async () => {
    await addInbox({ title: 'Lixo', text: '', url: '', at: '2026-09-17T10:00:00.000Z', files: [] });
    renderApp(<ReceivedPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ignorar' }));
    expect(await screen.findByText('Nada recebido')).toBeInTheDocument();
    expect(await db.notes.count()).toBe(0);
    expect(await inboxCount()).toBe(0);
  });
});
