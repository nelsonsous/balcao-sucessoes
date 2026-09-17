// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, emptyClient, emptyDeceased, newCase, newDocument, newParty } from '../../lib/db';
import { renderApp, resetDb } from '../../test/render';
import { DocumentsTab } from './DocumentsTab';

const c = newCase({ id: 'c-doc', name: 'Sucessão Docs', ref: 'BS-D', client: { ...emptyClient(), name: 'Maria Silva', email: 'maria@exemplo.pt' }, deceased: { ...emptyDeceased(), name: 'António Silva' } });

describe('Documentos: validade, lote e pedidos por interessado', () => {
  beforeEach(async () => {
    await resetDb();
    await db.settings.put({ key: 'userName', value: 'Ana' });
    await db.cases.add(c);
    await db.parties.bulkAdd([
      newParty(c.id, { id: 'p1', name: 'Maria Silva', email: 'maria@exemplo.pt', isClient: true, roles: ['herdeiro'] }),
      newParty(c.id, { id: 'p2', name: 'João Silva', roles: ['herdeiro'] }),
    ]);
    await db.documents.bulkAdd([
      newDocument(c.id, { id: 'd1', name: 'Certidão de óbito', category: 'obito', status: 'em_falta', key: 'certidao de obito|' }),
      newDocument(c.id, { id: 'd2', name: 'Certidão de nascimento — João Silva', category: 'familia', status: 'recebido', receivedAt: '2026-01-10', partyId: 'p2', key: 'x|p2' }),
      newDocument(c.id, { id: 'd3', name: 'Documento de identificação e NIF — Maria Silva', category: 'identificacao', status: 'em_falta', partyId: 'p1', key: 'y|p1' }),
    ]);
  });

  it('assinala certidões expiradas e oferece o filtro «A expirar»', async () => {
    renderApp(<DocumentsTab c={c} />);
    expect(await screen.findByText(/Expirada há \d+ dia\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('1 expirada(s)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /A expirar/ }));
    await waitFor(() => expect(screen.queryByText('Certidão de óbito')).not.toBeInTheDocument());
    expect(screen.getByText('Certidão de nascimento — João Silva')).toBeInTheDocument();
  });

  it('seleciona todos os visíveis e muda o estado em lote', async () => {
    renderApp(<DocumentsTab c={c} />);
    await screen.findByText('Certidão de óbito');
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar' }));
    const bar = await screen.findByTestId('doc-bulk');
    fireEvent.click(within(bar).getByRole('button', { name: 'Todos os visíveis' }));
    expect(within(bar).getByText('3 selecionado(s)')).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole('button', { name: /Mudar o estado dos selecionados/ }));
    fireEvent.click(await screen.findByText('Pedido / a aguardar'));
    await waitFor(async () => expect((await db.documents.toArray()).every((d) => d.status === 'pedido')).toBe(true));
    expect((await db.documents.get('d1'))!.requestedAt).not.toBe('');
    await waitFor(() => expect(screen.queryByTestId('doc-bulk')).not.toBeInTheDocument());
  });

  it('pede documentos a um interessado, mostra o texto e marca-os como pedidos', async () => {
    renderApp(<DocumentsTab c={c} />);
    await screen.findByText('Certidão de óbito');
    fireEvent.click(screen.getByRole('button', { name: 'Pedir documentos' }));
    fireEvent.click(await screen.findByText(/Pedir a Maria Silva/));
    const body = (await screen.findByLabelText('Texto do pedido')) as HTMLTextAreaElement;
    expect(body.value).toContain('Exmo.(a) Sr.(a) Maria Silva,');
    expect(body.value).toContain('• Certidão de óbito (certidão recente — validade habitual de 6 meses)');
    expect(body.value).toContain('• Documento de identificação e NIF — Maria Silva');
    expect(body.value).toContain('sucessão de António Silva');
    expect(screen.getByRole('link', { name: /Abrir no e-mail/ }).getAttribute('href')).toContain('mailto:maria%40exemplo.pt');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como pedidos' }));
    await waitFor(async () => expect((await db.documents.get('d1'))!.status).toBe('pedido'));
    expect((await db.documents.get('d3'))!.status).toBe('pedido');
    expect((await db.documents.get('d2'))!.status).toBe('recebido');
    await waitFor(async () => expect((await db.activity.where('caseId').equals(c.id).toArray()).some((a) => /Pedido de 2 documento\(s\) a Maria Silva/.test(a.text))).toBe(true));
  });
});
