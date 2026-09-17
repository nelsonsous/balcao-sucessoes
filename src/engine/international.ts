// Módulo internacional: lei aplicável e competência (Regulamento (UE) n.º 650/2012),
// Certificado Sucessório Europeu, circulação de documentos (apostila / formulários
// multilingues / legalização) e prazos de referência noutros países.
// Conteúdo de apoio — a validar pela equipa e com o colega local em cada caso.
import { parseIsoDate, todayIso } from '../lib/utils';

export interface CountryDeadline {
  label: string;
  /** Meses a contar do óbito (ou dias, se `days`). */
  months?: number;
  days?: number;
  /** Só se aplica quando o óbito ocorreu neste país. */
  onlyIfDeathHere?: boolean;
  /** Só se aplica quando o óbito ocorreu noutro país. */
  onlyIfDeathElsewhere?: boolean;
  legal: string;
  note?: string;
}

export interface CountryInfo {
  name: string;
  /** Estado-Membro da UE. */
  eu: boolean;
  /** Vinculado pelo Regulamento (UE) n.º 650/2012 (a Dinamarca e a Irlanda não participam). */
  bound650: boolean;
  /** Parte na Convenção da Haia de 1961 (apostila). */
  hague: boolean;
  deadlines: CountryDeadline[];
  notes: string[];
}

const C = (name: string, eu: boolean, bound650: boolean, hague: boolean, deadlines: CountryDeadline[], notes: string[] = []): CountryInfo => ({ name, eu, bound650, hague, deadlines, notes });

export const COUNTRY_INFO: Record<string, CountryInfo> = {
  Portugal: C('Portugal', true, true, true, [
    { label: 'Participação do óbito às Finanças (Imposto do Selo)', months: 3, legal: 'CIS, art. 26.º, n.º 3', note: 'Até ao fim do 3.º mês seguinte ao do óbito.' },
  ]),
  França: C(
    'França',
    true,
    true,
    true,
    [
      { label: 'Déclaration de succession (óbito em França)', months: 6, onlyIfDeathHere: true, legal: 'Code général des impôts, art. 641' },
      { label: 'Déclaration de succession (óbito fora de França)', months: 12, onlyIfDeathElsewhere: true, legal: 'Code général des impôts, art. 641' },
    ],
    ['O notaire elabora o acte de notoriété e a déclaration de succession; os droits de succession dependem do grau de parentesco.', 'Pesquisar disposições de última vontade no FCDDV (Fichier central) através de notaire.'],
  ),
  Espanha: C('Espanha', true, true, true, [{ label: 'Impuesto sobre Sucesiones y Donaciones (autoliquidação)', months: 6, legal: 'Reglamento del ISD (RD 1629/1991), art. 67', note: 'Prorrogável por mais 6 meses se pedido nos primeiros 5.' }], ['Competência e benefícios fiscais variam por comunidade autónoma.']),
  Luxemburgo: C('Luxemburgo', true, true, true, [{ label: 'Déclaration de succession', months: 6, onlyIfDeathHere: true, legal: 'Loi du 27 décembre 1817 sur les droits de succession', note: 'Prazos mais longos quando o óbito ocorre no estrangeiro — confirmar com a Administration de l’enregistrement.' }]),
  Alemanha: C('Alemanha', true, true, true, [{ label: 'Comunicação da aquisição ao Finanzamt (Erbschaftsteuer)', months: 3, legal: 'ErbStG, § 30', note: 'Contado do conhecimento da aquisição; a declaração é pedida depois pelo Finanzamt.' }], ['O Erbschein (certidão de herdeiro) é emitido pelo Nachlassgericht; o CSE pode substituí-lo.']),
  Bélgica: C(
    'Bélgica',
    true,
    true,
    true,
    [
      { label: 'Déclaration de succession (óbito na Bélgica)', months: 4, onlyIfDeathHere: true, legal: 'Code des droits de succession, art. 40' },
      { label: 'Déclaration de succession (óbito noutro país europeu)', months: 5, onlyIfDeathElsewhere: true, legal: 'Code des droits de succession, art. 40', note: '6 meses se o óbito ocorreu fora da Europa.' },
    ],
    ['Competência regional (Flandres, Valónia, Bruxelas) para os direitos sucessórios.'],
  ),
  'Países Baixos': C('Países Baixos', true, true, true, [{ label: 'Aangifte erfbelasting', months: 8, legal: 'Successiewet 1956 / AWR, art. 9', note: 'Prorrogação possível a pedido.' }]),
  Suíça: C('Suíça', false, false, true, [], ['Direito sucessório federal, mas imposto sucessório cantonal (prazos e taxas por cantão).', 'Não vinculada ao Regulamento 650/2012: aplicam-se as regras suíças de direito internacional privado (LDIP).']),
  'Reino Unido': C(
    'Reino Unido',
    false,
    false,
    true,
    [
      { label: 'Pagamento do Inheritance Tax', months: 6, legal: 'IHTA 1984, s. 226', note: 'Até ao fim do 6.º mês seguinte ao do óbito; juros a partir daí.' },
      { label: 'Entrega da conta IHT400', months: 12, legal: 'IHTA 1984, s. 216', note: 'Até ao fim do 12.º mês seguinte ao do óbito.' },
    ],
    ['Grant of probate / letters of administration exigidos pelas entidades; não vinculado ao Regulamento 650/2012.'],
  ),
  Brasil: C('Brasil', false, false, true, [{ label: 'Abertura do inventário', months: 2, legal: 'Código de Processo Civil, art. 611', note: 'Conclusão em 12 meses; ITCMD estadual com prazos próprios.' }], ['Partilha judicial ou extrajudicial (cartório) conforme haja acordo e capacidade dos herdeiros.']),
  'Estados Unidos': C('Estados Unidos', false, false, true, [{ label: 'Federal estate tax return (Form 706)', months: 9, legal: 'IRC § 6075(a)', note: 'Prorrogação de 6 meses possível; probate estadual.' }]),
  Canadá: C('Canadá', false, false, true, [{ label: 'Declaração final de rendimentos (T1) do falecido', months: 6, legal: 'Income Tax Act, s. 150(1)(b)', note: '30 de abril do ano seguinte, ou 6 meses após o óbito se este ocorreu após outubro.' }], ['Parte na Convenção da Haia desde 2024; probate provincial.']),
  Angola: C('Angola', false, false, false, [], ['Documentos sujeitos a legalização consular (não é parte na Convenção da Haia).']),
  Moçambique: C('Moçambique', false, false, false, [], ['Documentos sujeitos a legalização consular (não é parte na Convenção da Haia).']),
  Venezuela: C('Venezuela', false, false, true, [{ label: 'Declaración sucesoral (SENIAT)', days: 180, legal: 'Ley de Impuesto sobre Sucesiones, art. 27', note: '180 dias hábeis — confirmar contagem.' }]),
  'África do Sul': C('África do Sul', false, false, true, [{ label: 'Comunicação do óbito ao Master of the High Court', days: 14, legal: 'Administration of Estates Act 66/1965, s. 7' }], ['Nomeação de executor pelo Master; estate duty 20 %/25 %.']),
};

export const EU_MEMBERS = new Set(['Portugal', 'França', 'Espanha', 'Luxemburgo', 'Alemanha', 'Bélgica', 'Países Baixos', 'Itália', 'Áustria', 'Irlanda', 'Dinamarca', 'Suécia', 'Finlândia', 'Polónia', 'Chéquia', 'Eslováquia', 'Hungria', 'Roménia', 'Bulgária', 'Grécia', 'Croácia', 'Eslovénia', 'Estónia', 'Letónia', 'Lituânia', 'Malta', 'Chipre']);
const NOT_BOUND_650 = new Set(['Dinamarca', 'Irlanda']);

export function countryInfo(name: string): CountryInfo | undefined {
  return COUNTRY_INFO[name];
}

export const isEU = (name: string): boolean => EU_MEMBERS.has(name);
export const isBound650 = (name: string): boolean => EU_MEMBERS.has(name) && !NOT_BOUND_650.has(name);

export type DocumentRegime = 'ue' | 'apostila' | 'legalizacao' | 'desconhecido';

/** Regime de circulação de documentos públicos entre Portugal e o país indicado. */
export function documentRegime(country: string): { regime: DocumentRegime; label: string; detail: string; legal: string } {
  if (!country || country === 'Outro') return { regime: 'desconhecido', label: 'A confirmar', detail: 'Confirmar se o país é parte na Convenção da Haia de 1961; caso contrário, legalização consular.', legal: '' };
  if (isEU(country))
    return {
      regime: 'ue',
      label: 'UE — sem apostila',
      detail: 'Documentos públicos (certidões de nascimento, casamento, óbito, etc.) circulam sem apostila; pedir o formulário multilingue para dispensar tradução.',
      legal: 'Regulamento (UE) 2016/1191',
    };
  const info = COUNTRY_INFO[country];
  if (info?.hague || info === undefined)
    return {
      regime: info ? 'apostila' : 'desconhecido',
      label: info ? 'Apostila' : 'A confirmar',
      detail: info ? 'Apostila da autoridade competente do país emissor (em Portugal: Procuradoria-Geral da República) e tradução certificada quando exigida.' : 'Confirmar adesão à Convenção da Haia de 1961.',
      legal: 'Convenção da Haia de 5 de outubro de 1961',
    };
  return { regime: 'legalizacao', label: 'Legalização consular', detail: 'Reconhecimento pela autoridade do país emissor e legalização no consulado; tradução certificada.', legal: 'Código do Notariado, art. 172.º (documentos passados no estrangeiro)' };
}

export interface LawInput {
  /** País da residência habitual à data do óbito. */
  residence: string;
  nationalities: string[];
  /** País cuja lei foi escolhida em disposição por morte (art. 22.º) — vazio se não houve escolha. */
  choiceOfLaw: string;
  /** País com ligação manifestamente mais estreita (art. 21.º, n.º 2) — vazio se não invocada. */
  closerConnection: string;
  /** Países onde há bens. */
  assetCountries: string[];
}

export interface LawStep {
  text: string;
  legal?: string;
}

export interface LawResult {
  law: string;
  basis: 'escolha' | 'ligacao' | 'residencia' | 'indeterminada';
  jurisdiction: string;
  jurisdictionBasis: string;
  cse: { available: boolean; reason: string };
  steps: LawStep[];
  warnings: string[];
}

/** Lei aplicável e competência segundo o Regulamento (UE) n.º 650/2012 (visão de partida, a validar). */
export function applicableLaw(i: LawInput): LawResult {
  const steps: LawStep[] = [];
  const warnings: string[] = [];
  const nat = i.nationalities.filter(Boolean);
  let law = '';
  let basis: LawResult['basis'] = 'indeterminada';

  if (i.choiceOfLaw) {
    if (nat.includes(i.choiceOfLaw)) {
      law = i.choiceOfLaw;
      basis = 'escolha';
      steps.push({ text: `Escolha válida da lei da nacionalidade (${i.choiceOfLaw}) feita em disposição por morte: rege toda a sucessão.`, legal: 'Reg. (UE) 650/2012, art. 22.º' });
    } else {
      warnings.push(`A escolha da lei de ${i.choiceOfLaw} só é válida se corresponder a uma nacionalidade do de cujus (à data da escolha ou do óbito).`);
    }
  }
  if (!law && i.closerConnection) {
    law = i.closerConnection;
    basis = 'ligacao';
    steps.push({ text: `Ligação manifestamente mais estreita com ${i.closerConnection}: exceção à regra da residência habitual.`, legal: 'Reg. (UE) 650/2012, art. 21.º, n.º 2' });
  }
  if (!law && i.residence) {
    law = i.residence;
    basis = 'residencia';
    steps.push({ text: `Regra geral: lei do Estado da residência habitual à data do óbito (${i.residence}).`, legal: 'Reg. (UE) 650/2012, art. 21.º, n.º 1' });
  }
  if (!law) steps.push({ text: 'Indique a residência habitual à data do óbito para determinar a lei aplicável.' });
  if (law) steps.push({ text: 'A lei aplicável rege toda a sucessão (unidade): bens móveis e imóveis, onde quer que se encontrem.', legal: 'Reg. (UE) 650/2012, arts. 21.º e 23.º' });
  if (law && !isBound650(law)) {
    steps.push({ text: `${law} não está vinculado ao Regulamento: pode haver reenvio para a lei de um Estado-Membro ou para a lei de outro Estado terceiro.`, legal: 'Reg. (UE) 650/2012, art. 34.º' });
    warnings.push(`Confirmar com colega em ${law} se a lei local remete a sucessão (ou os imóveis) para outra lei — risco de cisão da sucessão.`);
  }

  // Competência
  let jurisdiction = '';
  let jurisdictionBasis = '';
  if (i.residence && isBound650(i.residence)) {
    jurisdiction = i.residence;
    jurisdictionBasis = 'Competência geral dos órgãos jurisdicionais do Estado-Membro da residência habitual (art. 4.º).';
  } else if (i.residence) {
    const eu = i.assetCountries.filter(isBound650);
    if (eu.length) {
      jurisdiction = eu.includes('Portugal') ? 'Portugal' : eu[0]!;
      jurisdictionBasis = `Residência habitual fora da UE: competência subsidiária do Estado-Membro onde há bens (${eu.join(', ')}) se o de cujus tinha a sua nacionalidade ou lá residiu nos 5 anos anteriores; caso contrário, apenas quanto aos bens aí situados (art. 10.º).`;
    } else {
      jurisdictionBasis = 'Residência habitual fora da UE e sem bens em Estados-Membros: competência segundo o direito internacional privado de cada Estado envolvido.';
    }
  }
  if (basis === 'escolha' && isBound650(law) && jurisdiction && jurisdiction !== law) {
    steps.push({ text: `Como a lei escolhida é a de ${law} (Estado-Membro), as partes podem acordar a competência dos seus tribunais.`, legal: 'Reg. (UE) 650/2012, arts. 5.º a 7.º' });
  }
  if (i.residence && ['Dinamarca', 'Irlanda'].includes(i.residence)) warnings.push(`${i.residence} não participa no Regulamento 650/2012: sem CSE e com regras próprias de competência e lei aplicável.`);
  if (i.residence === 'Reino Unido') warnings.push('O Reino Unido nunca participou no Regulamento 650/2012 e deixou a UE: aplica-se o direito internacional privado britânico (domicile, scission móveis/imóveis).');

  const cross = new Set([i.residence, ...i.assetCountries, ...nat].filter(Boolean)).size > 1;
  const cse = {
    available: Boolean(jurisdiction) && isBound650(jurisdiction) && cross,
    reason: !cross
      ? 'Sem elementos transfronteiriços relevantes: o CSE não é necessário.'
      : jurisdiction && isBound650(jurisdiction)
        ? `Pode ser pedido em ${jurisdiction} (autoridade competente segundo o art. 64.º) para provar a qualidade de herdeiro, legatário, executor ou administrador noutros Estados-Membros.`
        : 'Só os Estados-Membros vinculados emitem o CSE: sem competência num deles, use os certificados nacionais (ex.: habilitação de herdeiros) com apostila/tradução.',
  };
  return { law, basis, jurisdiction, jurisdictionBasis, cse, steps, warnings };
}

export interface ComputedDeadline {
  country: string;
  label: string;
  dueDate: string;
  legal: string;
  note?: string;
  daysLeft: number | null;
}

function addMonthsEndInclusive(d: Date, months: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + months, d.getDate(), 12);
  // Se o dia não existe no mês de destino (31 → 30), recua para o último dia.
  if (x.getDate() !== d.getDate()) x.setDate(0);
  return x;
}

/** Prazos de referência nos países envolvidos, a contar da data do óbito. */
export function countryDeadlines(countries: string[], deathDate: string, deathCountry: string, today: Date = new Date()): ComputedDeadline[] {
  const d = parseIsoDate(deathDate);
  if (!d) return [];
  const out: ComputedDeadline[] = [];
  for (const name of [...new Set(countries.filter(Boolean))]) {
    const info = COUNTRY_INFO[name];
    if (!info) continue;
    for (const dl of info.deadlines) {
      const here = deathCountry === name;
      if (dl.onlyIfDeathHere && !here) continue;
      if (dl.onlyIfDeathElsewhere && here) continue;
      const due = dl.days ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + dl.days, 12) : addMonthsEndInclusive(d, dl.months ?? 0);
      const dueDate = todayIso(due);
      const daysLeft = Math.round((due.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()) / 86_400_000);
      out.push({ country: name, label: dl.label, dueDate, legal: dl.legal, note: dl.note, daysLeft });
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Documentos típicos a fazer circular e para que país. */
export const INTL_DOCUMENTS: Array<{ key: string; label: string; from: 'pt' | 'estrangeiro'; hint: string }> = [
  { key: 'obito', label: 'Certidão de óbito', from: 'estrangeiro', hint: 'Do país do óbito; com formulário multilingue (UE) ou apostila.' },
  { key: 'nascimento', label: 'Certidões de nascimento e casamento dos herdeiros', from: 'pt', hint: 'Para provar a qualidade sucessória perante entidades estrangeiras.' },
  { key: 'habilitacao', label: 'Habilitação de herdeiros / CSE', from: 'pt', hint: 'A habilitação notarial portuguesa precisa de apostila fora da UE; dentro da UE o CSE dispensa qualquer formalidade.' },
  { key: 'procuracao', label: 'Procurações', from: 'pt', hint: 'Outorgadas em Portugal para uso no estrangeiro: apostila (Haia) ou legalização; ou outorgadas no consulado.' },
  { key: 'testamento', label: 'Testamento / certidão de registo de disposições de última vontade', from: 'estrangeiro', hint: 'Pesquisar em cada país ligado ao de cujus (Portugal: Registos Centrais; França: FCDDV; Espanha: Registro de Últimas Voluntades).' },
  { key: 'fiscal', label: 'Certificados fiscais e comprovativos de imposto pago', from: 'estrangeiro', hint: 'Para evitar dupla tributação e desbloquear bens (bancos exigem prova de liquidação).' },
];

export type EntityKind = 'notaire' | 'advogado' | 'banco' | 'tribunal' | 'consulado' | 'tradutor' | 'registo' | 'fiscal' | 'outro';
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  notaire: 'Notário / notaire',
  advogado: 'Advogado local',
  banco: 'Banco',
  tribunal: 'Tribunal',
  consulado: 'Consulado / embaixada',
  tradutor: 'Tradutor certificado',
  registo: 'Registo civil / predial',
  fiscal: 'Administração fiscal',
  outro: 'Outra entidade',
};

export interface IntlEntity {
  id: string;
  kind: EntityKind;
  name: string;
  country: string;
  contact: string;
  notes: string;
}

export interface IntlState {
  residence: string;
  nationalities: string[];
  choiceOfLaw: string;
  closerConnection: string;
  cse: { status: '' | 'a_avaliar' | 'pedir' | 'pedido' | 'emitido' | 'nao_necessario'; purposes: string[]; states: string[]; requestedAt: string; issuedAt: string; notes: string };
  entities: IntlEntity[];
}

export const emptyIntl = (): IntlState => ({ residence: '', nationalities: [], choiceOfLaw: '', closerConnection: '', cse: { status: '', purposes: [], states: [], requestedAt: '', issuedAt: '', notes: '' }, entities: [] });

export const CSE_STATUS: Array<{ id: IntlState['cse']['status']; label: string }> = [
  { id: '', label: 'Por avaliar' },
  { id: 'a_avaliar', label: 'A avaliar' },
  { id: 'nao_necessario', label: 'Não necessário' },
  { id: 'pedir', label: 'A pedir' },
  { id: 'pedido', label: 'Pedido' },
  { id: 'emitido', label: 'Emitido' },
];

export const CSE_PURPOSES = ['Qualidade de herdeiro', 'Qualidade de legatário', 'Poderes do executor testamentário', 'Poderes do administrador da herança', 'Atribuição de bens determinados'];
