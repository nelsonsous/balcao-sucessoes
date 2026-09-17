// Minutas: modelos com campos automáticos ({{campo}}) e um markdown mínimo
// (# título, ## subtítulo, - item, **negrito**). Conteúdo-base a rever antes de enviar.
import type { DocBlock, DocRun } from '../lib/docx';
import type { TemplateLanguage } from '../lib/types';

export interface TemplateParam {
  key: string;
  label: string;
  /** Lista de sugestões do contexto (ex.: "bancos"). */
  suggest?: string;
  placeholder?: string;
}

export interface TemplateDef {
  id: string;
  title: string;
  category: string;
  language: TemplateLanguage;
  description: string;
  /** Assunto (emails e cartas). */
  subject: string;
  body: string;
  params?: TemplateParam[];
  /** Pode ser enviado como email (abre o cliente de email). */
  email?: boolean;
  builtin?: boolean;
}

export const TEMPLATE_CATEGORIES = ['Cliente', 'Bancos', 'Registos e notariado', 'Procurações', 'Internacional', 'Interno', 'Outras'];

export const LANGUAGE_LABELS: Record<TemplateLanguage, string> = { pt: 'Português', fr: 'Français', en: 'English' };

/** Campos disponíveis (mostrados no editor de minutas). */
export const PLACEHOLDERS: Array<{ key: string; label: string }> = [
  { key: 'hoje', label: 'Data de hoje' },
  { key: 'escritorio.nome', label: 'Nome do escritório' },
  { key: 'escritorio.local', label: 'Localidade do escritório' },
  { key: 'escritorio.morada', label: 'Morada do escritório' },
  { key: 'escritorio.email', label: 'Email do escritório' },
  { key: 'escritorio.telefone', label: 'Telefone do escritório' },
  { key: 'responsavel.nome', label: 'Responsável pelo dossier' },
  { key: 'dossier.ref', label: 'Referência do dossier' },
  { key: 'dossier.nome', label: 'Nome do dossier' },
  { key: 'falecido.nome', label: 'Nome do falecido' },
  { key: 'falecido.nif', label: 'NIF do falecido' },
  { key: 'falecido.data_obito', label: 'Data do óbito' },
  { key: 'falecido.local_obito', label: 'Local do óbito' },
  { key: 'falecido.ultimo_domicilio', label: 'Último domicílio' },
  { key: 'cliente.nome', label: 'Nome do cliente' },
  { key: 'cliente.email', label: 'Email do cliente' },
  { key: 'cliente.morada', label: 'Morada do cliente' },
  { key: 'conjuge.nome', label: 'Cônjuge' },
  { key: 'cabeca_casal.nome', label: 'Cabeça-de-casal' },
  { key: 'prazo.imposto_selo', label: 'Prazo do Imposto do Selo' },
  { key: 'prazo.irs', label: 'Prazo do IRS do falecido' },
  { key: 'progresso.percentagem', label: 'Progresso do dossier (%)' },
  { key: 'valor.ativo', label: 'Ativo registado (€)' },
  { key: 'valor.passivo', label: 'Passivo registado (€)' },
  { key: 'escritura.data', label: 'Data da próxima escritura' },
  { key: 'escritura.hora', label: 'Hora da próxima escritura' },
  { key: 'escritura.local', label: 'Local da próxima escritura' },
  { key: 'lista.herdeiros', label: 'Lista de herdeiros' },
  { key: 'lista.interessados', label: 'Lista de interessados' },
  { key: 'lista.bens', label: 'Lista de bens' },
  { key: 'lista.bancos', label: 'Lista de bancos' },
  { key: 'lista.dividas', label: 'Lista de dívidas' },
  { key: 'lista.documentos_em_falta', label: 'Documentos em falta' },
  { key: 'lista.proximas_acoes', label: 'Próximas ações' },
  { key: 'lista.prazos', label: 'Próximos prazos' },
];

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  {
    id: 'email-documentos-falta',
    title: 'Email ao cliente — documentos em falta',
    category: 'Cliente',
    language: 'pt',
    description: 'Lista automaticamente os documentos ainda em falta no dossier.',
    subject: 'Sucessão de {{falecido.nome}} — documentos em falta',
    email: true,
    body: `Caro(a) {{cliente.nome}},

No seguimento do processo relativo à sucessão de {{falecido.nome}}, para podermos avançar agradecemos que nos faça chegar, logo que possível, os seguintes documentos:

{{lista.documentos_em_falta}}

Os documentos podem ser enviados em cópia digitalizada por email; os originais serão necessários para a habilitação e a partilha.

Ficamos ao dispor para qualquer esclarecimento.

Com os melhores cumprimentos,
{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'email-ponto-situacao',
    title: 'Email ao cliente — ponto de situação',
    category: 'Cliente',
    language: 'pt',
    description: 'Progresso, próximas ações e prazos do dossier.',
    subject: 'Sucessão de {{falecido.nome}} — ponto de situação',
    email: true,
    body: `Caro(a) {{cliente.nome}},

Partilhamos o ponto de situação do processo de sucessão de {{falecido.nome}} (ref.ª {{dossier.ref}}).

**Estado geral:** {{progresso.percentagem}} das tarefas aplicáveis concluídas.

## Próximos passos
{{lista.proximas_acoes}}

## Prazos a acompanhar
{{lista.prazos}}

## Documentos ainda em falta
{{lista.documentos_em_falta}}

Voltaremos ao contacto logo que haja novidades.

Com os melhores cumprimentos,
{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'carta-cabeca-casal',
    title: 'Carta ao cabeça-de-casal — obrigações e prazos',
    category: 'Cliente',
    language: 'pt',
    description: 'Explica as obrigações do cabeça-de-casal e os prazos fiscais.',
    subject: 'Herança de {{falecido.nome}} — obrigações do cabeça-de-casal',
    email: true,
    body: `{{escritorio.nome}}
{{escritorio.local}}, {{hoje}}

Exmo(a). Senhor(a) {{cabeca_casal.nome}}

**Assunto:** Herança aberta por óbito de {{falecido.nome}} — funções de cabeça-de-casal

Na qualidade de cabeça-de-casal, cabe-lhe a administração da herança até à sua liquidação e partilha. Chamamos a atenção para as seguintes obrigações:

- **Participação às Finanças (Modelo 1 do Imposto do Selo)**, acompanhada da relação de bens, até {{prazo.imposto_selo}}, mesmo que os herdeiros estejam isentos de imposto;
- **Declaração de IRS** dos rendimentos do falecido relativos ao ano do óbito, até {{prazo.irs}};
- **Pagamento do IMI** e de outros encargos dos bens da herança enquanto esta se mantiver indivisa;
- **Prestação de contas** aos restantes herdeiros relativamente à administração dos bens.

Trataremos destas obrigações em articulação consigo. Para o efeito, agradecemos que nos envie a documentação ainda em falta.

Com os melhores cumprimentos,

{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'email-marcacao-escritura',
    title: 'Email ao cliente — marcação de escritura',
    category: 'Cliente',
    language: 'pt',
    description: 'Confirma data, hora e local, e lista o que levar.',
    subject: 'Sucessão de {{falecido.nome}} — escritura marcada para {{escritura.data}}',
    email: true,
    params: [
      { key: 'escritura.data', label: 'Data da escritura' },
      { key: 'escritura.hora', label: 'Hora' },
      { key: 'escritura.local', label: 'Local' },
    ],
    body: `Caro(a) {{cliente.nome}},

Confirmamos que a escritura relativa à sucessão de {{falecido.nome}} ficou marcada para **{{escritura.data}}, às {{escritura.hora}}**, em {{escritura.local}}.

Pedimos que compareçam todos os intervenientes (ou os respetivos procuradores), munidos de:

- documento de identificação válido e cartão de contribuinte;
- originais dos documentos já enviados, se ainda não os tiver entregue;
- procurações, no caso de algum interessado se fazer representar.

Se algum interveniente não puder comparecer, agradecemos que nos avise com antecedência.

Com os melhores cumprimentos,
{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'carta-banco-saldos',
    title: 'Carta ao banco — saldos à data do óbito',
    category: 'Bancos',
    language: 'pt',
    description: 'Pedido de informação de contas, saldos, titularidade e responsabilidades.',
    subject: 'Pedido de informação — {{falecido.nome}} (NIF {{falecido.nif}})',
    params: [{ key: 'banco.nome', label: 'Banco', suggest: 'bancos', placeholder: 'Nome do banco' }],
    body: `{{escritorio.nome}}
{{escritorio.morada}}
{{escritorio.local}}, {{hoje}}

Exmos. Senhores
{{banco.nome}}

**Assunto:** Pedido de informação — contas e responsabilidades de {{falecido.nome}}, NIF {{falecido.nif}}

Exmos. Senhores,

Na qualidade de mandatários de {{cliente.nome}}, interessado(a) na herança aberta por óbito de {{falecido.nome}}, ocorrido em {{falecido.data_obito}}, vimos solicitar a V. Exas. que nos informem sobre:

- a existência de contas de depósito, aplicações financeiras, cofres e outros produtos titulados ou cotitulados pelo(a) falecido(a);
- os respetivos saldos e valores à data do óbito, com indicação da titularidade (singular ou coletiva) e dos juros vencidos;
- os empréstimos, cartões de crédito, garantias e demais responsabilidades existentes à mesma data.

Juntamos cópia da certidão de óbito, da habilitação de herdeiros e da procuração forense.

Agradecendo desde já a atenção dispensada, apresentamos os melhores cumprimentos,

{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'pedido-bdp',
    title: 'Pedido ao Banco de Portugal — contas do falecido',
    category: 'Bancos',
    language: 'pt',
    description: 'Carta de acompanhamento do pedido à Base de Dados de Contas.',
    subject: 'Pedido de informação sobre contas bancárias — {{falecido.nome}}',
    body: `{{escritorio.nome}}
{{escritorio.local}}, {{hoje}}

Exmos. Senhores
Banco de Portugal

**Assunto:** Pedido de informação sobre as instituições onde {{falecido.nome}} (NIF {{falecido.nif}}) era titular de contas

Exmos. Senhores,

Em representação de {{cliente.nome}}, interessado(a) na herança aberta por óbito de {{falecido.nome}}, falecido(a) em {{falecido.data_obito}}, vimos solicitar a informação constante da Base de Dados de Contas relativamente às instituições em que o(a) falecido(a) era titular de contas de depósito ou de pagamento.

Para o efeito, juntamos:

- certidão de óbito;
- documento comprovativo da qualidade de herdeiro (habilitação de herdeiros);
- procuração forense.

Com os melhores cumprimentos,

{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'pedido-testamento',
    title: 'Pedido de informação sobre existência de testamento',
    category: 'Registos e notariado',
    language: 'pt',
    description: 'Pedido dirigido aos serviços de registo.',
    subject: 'Pedido de informação sobre testamento — {{falecido.nome}}',
    params: [{ key: 'entidade.nome', label: 'Entidade', placeholder: 'Serviços de registo / Cartório' }],
    body: `{{escritorio.nome}}
{{escritorio.local}}, {{hoje}}

Exmos. Senhores
{{entidade.nome}}

**Assunto:** Pedido de informação sobre a existência de testamento ou outra disposição de última vontade

Exmos. Senhores,

Na qualidade de mandatários de {{cliente.nome}}, solicitamos informação sobre a existência de testamento, escritura de doação por morte ou outra disposição de última vontade outorgada por:

- **Nome:** {{falecido.nome}}
- **NIF:** {{falecido.nif}}
- **Data do óbito:** {{falecido.data_obito}}
- **Último domicílio:** {{falecido.ultimo_domicilio}}

Juntamos certidão de óbito e procuração forense.

Com os melhores cumprimentos,

{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'procuracao-forense',
    title: 'Procuração forense — processo sucessório',
    category: 'Procurações',
    language: 'pt',
    description: 'Poderes forenses gerais e especiais para os atos da sucessão.',
    subject: 'Procuração',
    params: [
      { key: 'mandante.nome', label: 'Mandante', suggest: 'interessados', placeholder: 'Nome do mandante' },
      { key: 'mandante.identificacao', label: 'Identificação do mandante', placeholder: 'estado civil, NIF, morada' },
      { key: 'mandatario.nome', label: 'Advogado(a) mandatário(a)' },
      { key: 'mandatario.cedula', label: 'Cédula profissional' },
    ],
    body: `# PROCURAÇÃO

**{{mandante.nome}}**, {{mandante.identificacao}}, constitui seu bastante procurador(a) **{{mandatario.nome}}**, advogado(a), com a cédula profissional n.º {{mandatario.cedula}}, com domicílio profissional em {{escritorio.morada}}, a quem confere os mais amplos poderes forenses em direito permitidos, incluindo os especiais para confessar, desistir e transigir.

Confere ainda poderes especiais para, relativamente à herança aberta por óbito de **{{falecido.nome}}**, falecido(a) em {{falecido.data_obito}}:

- requerer e outorgar a habilitação de herdeiros e o Certificado Sucessório Europeu;
- representar o(a) mandante perante a Autoridade Tributária, a Segurança Social, bancos, conservatórias, cartórios notariais e demais entidades públicas ou privadas, requerendo e obtendo informações, certidões e documentos;
- apresentar a participação do óbito e a relação de bens para efeitos de Imposto do Selo;
- requerer inventário e nele intervir, bem como negociar os termos da partilha.

{{escritorio.local}}, {{hoje}}

______________________________
{{mandante.nome}}`,
  },
  {
    id: 'relacao-interna',
    title: 'Nota interna — herdeiros, bens e dívidas',
    category: 'Interno',
    language: 'pt',
    description: 'Resumo do dossier para reunião de equipa ou arquivo.',
    subject: 'Nota interna — {{dossier.nome}}',
    body: `# {{dossier.nome}}
Ref.ª {{dossier.ref}} · Responsável: {{responsavel.nome}} · {{hoje}}

## De cujus
- **Nome:** {{falecido.nome}}
- **Óbito:** {{falecido.data_obito}}, {{falecido.local_obito}}
- **Cabeça-de-casal:** {{cabeca_casal.nome}}

## Interessados
{{lista.interessados}}

## Património registado ({{valor.ativo}})
{{lista.bens}}

## Passivo ({{valor.passivo}})
{{lista.dividas}}

## Próximas ações
{{lista.proximas_acoes}}

## Prazos
{{lista.prazos}}`,
  },
  {
    id: 'lettre-notaire',
    title: 'Lettre au notaire (France) — coordination de la succession',
    category: 'Internacional',
    language: 'fr',
    description: 'Carta em francês ao notaire francês: acte de notoriété, déclaration de succession, CSE.',
    subject: 'Succession de {{falecido.nome}} — demande d’informations',
    params: [{ key: 'notaire.nome', label: 'Notaire', placeholder: 'Maître …' }],
    body: `{{escritorio.nome}}
{{escritorio.local}}, le {{hoje}}

{{notaire.nome}}

**Objet :** Succession de {{falecido.nome}} — demande d’informations et coordination

Maître,

Nous avons l’honneur de vous informer que notre cabinet représente {{cliente.nome}} dans le cadre de la succession de {{falecido.nome}}, décédé(e) le {{falecido.data_obito}} à {{falecido.local_obito}}.

Afin d’assurer une bonne coordination entre nos deux études, nous vous serions reconnaissants de bien vouloir nous indiquer :

- si vous êtes chargé(e) du règlement de la succession en France et si un acte de notoriété a déjà été établi ;
- la liste des actifs et des passifs dont vous avez connaissance ;
- l’état d’avancement de la déclaration de succession et le délai applicable ;
- les pièces que vous souhaitez recevoir de notre part (actes d’état civil portugais, habilitation d’héritiers, certificat successoral européen).

Nous restons à votre entière disposition et vous prions d’agréer, Maître, l’expression de nos salutations distinguées.

{{responsavel.nome}}
{{escritorio.nome}}`,
  },
  {
    id: 'letter-foreign-bank',
    title: 'Letter to a foreign bank — balances at date of death',
    category: 'Internacional',
    language: 'en',
    description: 'Carta em inglês a um banco estrangeiro.',
    subject: 'Estate of the late {{falecido.nome}} — request for information',
    params: [{ key: 'banco.nome', label: 'Bank', suggest: 'bancos', placeholder: 'Bank name' }],
    body: `{{escritorio.nome}}
{{escritorio.local}}, {{hoje}}

{{banco.nome}}

**Re:** Estate of the late {{falecido.nome}} — request for information

Dear Sirs,

We act on behalf of {{cliente.nome}} in connection with the estate of the late {{falecido.nome}}, who passed away on {{falecido.data_obito}}.

We would be grateful if you could confirm whether the deceased held any accounts, deposits, investments or safe deposit boxes with your institution and, if so, provide:

- a statement of the balances as at the date of death, including accrued interest;
- details of any joint holders and nominated beneficiaries;
- details of any loans, credit cards or other liabilities as at the same date;
- your requirements for releasing the funds to the heirs.

Please find enclosed a copy of the death certificate, the deed of succession (habilitação de herdeiros) and our power of attorney. A European Certificate of Succession can be provided if required.

Yours faithfully,

{{responsavel.nome}}
{{escritorio.nome}}`,
  },
].map((t) => ({ ...t, builtin: true }) as TemplateDef);

// ---------------------------------------------------------------------------
// Preenchimento

export type TemplateContext = Record<string, string>;

const MISSING_OPEN = '⟦';
const MISSING_CLOSE = '⟧';

export function placeholderLabel(key: string, extra?: Record<string, string>): string {
  return extra?.[key] ?? PLACEHOLDERS.find((p) => p.key === key)?.label ?? key;
}

/** Substitui os campos; os que faltam ficam marcados para realce (com o rótulo legível). */
export function fillTemplate(
  text: string,
  ctx: TemplateContext,
  labels?: Record<string, string>,
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = ctx[key];
    if (v === undefined || v.trim() === '') {
      missing.add(key);
      return `${MISSING_OPEN}${placeholderLabel(key, labels)}${MISSING_CLOSE}`;
    }
    return v;
  });
  return { text: out, missing: [...missing] };
}

/** Campos usados numa minuta (para validar modelos do escritório). */
export function usedPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!))];
}

function parseRuns(line: string): DocRun[] {
  const runs: DocRun[] = [];
  const re = new RegExp(`(\\*\\*[^*]+\\*\\*|${MISSING_OPEN}[^${MISSING_CLOSE}]*${MISSING_CLOSE})`, 'g');
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) runs.push({ text: line.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) {
      // Um campo em falta dentro de negrito continua realçado.
      const inner = tok.slice(2, -2);
      for (const r of parseRuns(inner)) runs.push({ ...r, bold: true });
    } else {
      runs.push({ text: `[${tok.slice(1, -1)}]`, missing: true });
    }
    last = m.index! + tok.length;
  }
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.length ? runs : [{ text: '' }];
}

/** Converte o texto preenchido em blocos (títulos, parágrafos, itens). */
export function parseBlocks(text: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let para: DocRun[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', lines: para });
    para = [];
  };
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith('# ')) {
      flush();
      blocks.push({ type: 'h1', lines: [parseRuns(line.slice(2))] });
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ type: 'h2', lines: [parseRuns(line.slice(3))] });
    } else if (/^[-•]\s+/.test(line)) {
      flush();
      blocks.push({ type: 'li', lines: [parseRuns(line.replace(/^[-•]\s+/, ''))] });
    } else {
      para.push(parseRuns(line));
    }
  }
  flush();
  return blocks;
}

/** Texto simples (para copiar ou enviar por email). */
export function blocksToText(blocks: DocBlock[]): string {
  const lines: string[] = [];
  let prev: DocBlock['type'] | null = null;
  for (const b of blocks) {
    const text = b.lines.map((l) => l.map((r) => r.text).join('')).join('\n');
    if (prev && !(prev === 'li' && b.type === 'li')) lines.push('');
    if (b.type === 'h1') lines.push(text.toUpperCase());
    else if (b.type === 'li') lines.push(`• ${text}`);
    else lines.push(text);
    prev = b.type;
  }
  return lines.join('\n');
}

/** Lista em markdown mínimo (um item por linha). */
export const bulletList = (items: string[], empty: string): string =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : empty;
