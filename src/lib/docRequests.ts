// Pedidos de documentos por interessado: quem tem de entregar o quê, texto do pedido
// (e-mail ou carta) e ligação mailto. Os documentos que o escritório obtém por si
// (fiscais, certidões pedidas às conservatórias…) não se pedem aos interessados.
import { clientCanProvide } from './documents';
import { validMonthsOf } from './docValidity';
import type { DocumentRecord, PartyRecord } from './types';
import { formatDate } from './utils';

export interface RequestTarget {
  id: string;
  name: string;
  email: string;
  isClient: boolean;
  docs: DocumentRecord[];
}

const pendingOf = (docs: DocumentRecord[]) => docs.filter((d) => d.status === 'em_falta' || d.status === 'pedido');

/** Interessados com documentos por entregar: os seus próprios e, para o cliente, os genéricos que só ele pode fornecer. */
export function requestTargets(docs: DocumentRecord[], parties: PartyRecord[], client?: { name: string; email: string }): RequestTarget[] {
  const pending = pendingOf(docs);
  const generic = pending.filter((d) => !d.partyId && clientCanProvide(d));
  const out: RequestTarget[] = [];
  let clientCovered = false;
  for (const p of parties) {
    if (p.kind !== 'singular' || !p.name.trim()) continue;
    const own = pending.filter((d) => d.partyId === p.id);
    const list = p.isClient ? [...generic, ...own] : own;
    if (p.isClient) clientCovered = true;
    if (list.length) out.push({ id: p.id, name: p.name, email: p.email, isClient: p.isClient, docs: list });
  }
  if (!clientCovered && client?.name.trim() && generic.length) out.unshift({ id: 'cliente', name: client.name, email: client.email, isClient: true, docs: generic });
  return out;
}

export interface RequestInput {
  target: RequestTarget;
  /** Subconjunto escolhido (por omissão, todos os do destinatário). */
  docs?: DocumentRecord[];
  deceasedName: string;
  firmName: string;
  userName: string;
  /** Data limite sugerida (AAAA-MM-DD), opcional. */
  until?: string;
}

/** Texto do pedido em português, pronto a copiar ou enviar por e-mail. */
export function buildDocumentRequest(i: RequestInput): { subject: string; body: string } {
  const docs = i.docs ?? i.target.docs;
  const subject = `Documentos necessários — sucessão de ${i.deceasedName || '(nome do falecido)'}`;
  const lines = docs.map((d) => {
    const months = validMonthsOf(d);
    const note = months ? ` (certidão recente — validade habitual de ${months} meses)` : '';
    return `• ${d.name}${note}`;
  });
  const until = i.until ? ` Se possível, agradecemos a receção até ${formatDate(i.until)}.` : '';
  const body = [
    `Exmo.(a) Sr.(a) ${i.target.name},`,
    '',
    `No âmbito do processo sucessório por óbito de ${i.deceasedName || '(nome do falecido)'}, agradecemos o envio dos seguintes documentos:`,
    '',
    ...lines,
    '',
    `Pode enviar fotografia legível ou PDF por e-mail, ou entregar no escritório. Sempre que se trate de certidões, pedimos versões recentes.${until}`,
    '',
    'Ficamos ao dispor para qualquer esclarecimento.',
    '',
    'Com os melhores cumprimentos,',
    i.userName || 'A equipa',
    i.firmName,
  ].join('\n');
  return { subject, body };
}

/** Ligação mailto com assunto e corpo codificados (vazio se não houver e-mail). */
export function mailtoLink(email: string, subject: string, body: string): string {
  if (!email.trim()) return '';
  return `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
