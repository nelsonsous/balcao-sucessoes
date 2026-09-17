// Biblioteca de regras: pergunta → condição → tarefa → semáforo.
// Cada regra explica PORQUE existe (reason) e cada tarefa traz orientação,
// documentos e referências legais. Conteúdo de apoio: a validar pela equipa.
import type { Answers, AssetKind, PhaseId, Status } from '../lib/types';
import type { DeadlineSpec } from './deadlines';

export interface RuleTask {
  key: string;
  phase: PhaseId;
  title: string;
  description: string;
  critical?: boolean;
  initialStatus?: Status;
  legal?: string[];
  docs?: string[];
  deadline?: DeadlineSpec | ((a: Answers) => DeadlineSpec | undefined);
}

export interface Rule {
  id: string;
  reason: string | ((a: Answers) => string);
  when: (a: Answers) => boolean;
  tasks: RuleTask[];
}

// ---------------------------------------------------------------------------
// Predicados reutilizáveis

const has = (a: Answers, k: AssetKind) => a.assets.includes(k);
const married = (a: Answers) => a.spouse === 'casado';
const communal = (a: Answers) => married(a) && (a.regime === 'comunhao_adquiridos' || a.regime === 'comunhao_geral');
const deathInFrance = (a: Answers) => a.deathPlace === 'estrangeiro' && a.deathCountry === 'França';

export const isFranceLinked = (a: Answers): boolean =>
  a.nationality === 'francesa' ||
  a.habitualResidence === 'franca' ||
  deathInFrance(a) ||
  (has(a, 'estrangeiro') && a.foreignCountries.includes('França'));

export const hasForeignElement = (a: Answers): boolean =>
  a.deathPlace === 'estrangeiro' ||
  (a.nationality !== '' && a.nationality !== 'portuguesa') ||
  (a.habitualResidence !== '' && a.habitualResidence !== 'portugal') ||
  has(a, 'estrangeiro');

const euLinked = (a: Answers): boolean =>
  a.nationality === 'francesa' ||
  a.nationality === 'outra_ue' ||
  a.habitualResidence === 'franca' ||
  a.habitualResidence === 'outro_ue' ||
  (a.deathPlace === 'estrangeiro' && EU_COUNTRIES.includes(a.deathCountry)) ||
  a.foreignCountries.some((c) => EU_COUNTRIES.includes(c));

const EU_COUNTRIES = ['França', 'Luxemburgo', 'Alemanha', 'Espanha', 'Bélgica', 'Países Baixos'];

/** Beneficiários que não beneficiam da isenção do art. 6.º, al. e) do CIS. */
const possiblyTaxedBeneficiaries = (a: Answers): boolean =>
  a.others === 'sim' ||
  a.will === 'sim' ||
  (a.spouse !== 'casado' && a.descendants === 'nao' && a.ascendants === 'nao');

// ---------------------------------------------------------------------------

export const RULES: Rule[] = [
  // ========================= ABERTURA =========================
  {
    id: 'base-abertura',
    reason: 'Tarefa de base de qualquer sucessão',
    when: () => true,
    tasks: [
      {
        key: 'obito-certidao',
        phase: 'abertura',
        title: 'Obter certidão de óbito e confirmar dados do óbito',
        description:
          'Obter a certidão de óbito (online ou na conservatória) e confirmar data, local e último domicílio — determinam o momento e o lugar da abertura da sucessão.',
        critical: true,
        legal: ['Código Civil, art. 2031.º'],
        docs: ['Certidão de óbito', 'Documento de identificação do de cujus', 'Cartão/NIF do de cujus'],
      },
      {
        key: 'procuracao',
        phase: 'abertura',
        title: 'Preparar procuração forense — pontapé de saída do dossier',
        description:
          'Preparar e recolher a procuração assinada pelo cliente. Se forem praticados atos de disposição (ex.: partilha, repúdio), confirmar poderes especiais.',
        critical: true,
        docs: ['Procuração forense assinada'],
      },
      {
        key: 'kyc',
        phase: 'abertura',
        title: 'Verificar conflito de interesses e identificar o cliente',
        description:
          'Confirmar a inexistência de conflito de interesses com outros interessados e cumprir os deveres de identificação e diligência aplicáveis.',
        legal: ['Lei n.º 83/2017 (prevenção do branqueamento de capitais)'],
        docs: ['Documento de identificação do cliente', 'Comprovativo de morada'],
      },
      {
        key: 'cabeca-casal',
        phase: 'abertura',
        title: 'Identificar o cabeça-de-casal',
        description:
          'Determinar quem exerce o cargo de cabeça-de-casal (administração da herança até à partilha) segundo a ordem legal: cônjuge sobrevivo, testamenteiro, herdeiros legais, herdeiros testamentários.',
        critical: true,
        legal: ['Código Civil, arts. 2079.º e 2080.º'],
      },
      {
        key: 'lista-docs-cliente',
        phase: 'abertura',
        title: 'Enviar ao cliente as condições de serviço e a lista inicial de documentos',
        description:
          'Enviar por escrito as condições de serviço e a lista de documentos a reunir, com prazos indicativos. Reduz idas e voltas e acelera a fase inicial.',
      },
    ],
  },
  {
    id: 'obito-estrangeiro',
    reason: 'Óbito no estrangeiro de cidadão português',
    when: (a) => a.deathPlace === 'estrangeiro' && a.nationality === 'portuguesa',
    tasks: [
      {
        key: 'transcricao-obito',
        phase: 'abertura',
        title: 'Verificar registo/transcrição do óbito em Portugal',
        description:
          'Confirmar se o óbito ocorrido no estrangeiro já foi transcrito no registo civil português (consulado ou conservatória). Sem transcrição, os atos em Portugal ficam bloqueados.',
        critical: true,
        legal: ['Código do Registo Civil (transcrição de atos lavrados no estrangeiro)'],
        docs: ['Certidão de óbito estrangeira (com formulário multilingue ou apostila)'],
      },
    ],
  },
  {
    id: 'seguranca-social',
    reason: (a) => (a.socialSecurity === 'sim' ? 'Há prestações por morte a requerer' : 'Prestações por morte por confirmar'),
    when: (a) => a.socialSecurity === 'sim' || a.socialSecurity === 'desconhecido',
    tasks: [
      {
        key: 'prestacoes-morte',
        phase: 'abertura',
        title: 'Requerer prestações por morte à Segurança Social',
        description:
          'Avaliar e requerer subsídio por morte, pensão de sobrevivência e reembolso de despesas de funeral, conforme aplicável. Estas prestações estão sujeitas a prazos — confirmar junto da Segurança Social.',
        legal: ['Decreto-Lei n.º 322/90 (prestações por morte)'],
        docs: ['Certidão de óbito', 'Documentos de identificação dos requerentes', 'Faturas do funeral'],
      },
    ],
  },

  // ========================= INTERESSADOS =========================
  {
    id: 'base-interessados',
    reason: 'Tarefa de base de qualquer sucessão',
    when: () => true,
    tasks: [
      {
        key: 'qualificar-interessados',
        phase: 'interessados',
        title: 'Identificar e qualificar todos os interessados',
        description:
          'Registar cada interessado na área Interessados, com a sua qualidade (herdeiro, legatário, cônjuge, credor…) e a classe de sucessíveis aplicável.',
        critical: true,
        legal: ['Código Civil, arts. 2133.º e 2134.º'],
      },
      {
        key: 'aceitacao-repudio',
        phase: 'interessados',
        title: 'Confirmar a aceitação ou repúdio de cada herdeiro',
        description:
          'Registar a posição de cada herdeiro (aceitação pura e simples, a benefício de inventário ou repúdio). O direito de aceitar caduca 10 anos após o conhecimento da vocação.',
        legal: ['Código Civil, arts. 2050.º, 2059.º e 2062.º e ss.'],
        deadline: { kind: 'yearsAfter', years: 10, label: 'Caducidade do direito de aceitar: 10 anos (art. 2059.º CC)' },
      },
    ],
  },
  {
    id: 'conjuge',
    reason: 'Havia cônjuge',
    when: married,
    tasks: [
      {
        key: 'conjuge-registo',
        phase: 'interessados',
        title: 'Registar cônjuge e confirmar estado civil e regime de bens',
        description:
          'Confirmar o casamento (sem divórcio nem separação judicial de pessoas e bens) e o regime de bens, incluindo eventual convenção antenupcial.',
        critical: true,
        legal: ['Código Civil, arts. 1717.º e ss.', 'Código Civil, art. 2133.º, n.º 3'],
        docs: ['Certidão de casamento', 'Convenção antenupcial (se existir)'],
      },
    ],
  },
  {
    id: 'uniao-facto',
    reason: 'Havia união de facto',
    when: (a) => a.spouse === 'uniao_facto',
    tasks: [
      {
        key: 'uniao-facto',
        phase: 'interessados',
        title: 'Documentar a união de facto e os direitos do unido de facto',
        description:
          'O unido de facto não é herdeiro legal (só por testamento), mas tem direitos próprios, nomeadamente sobre a casa de morada de família. Recolher prova da união (mais de 2 anos).',
        critical: true,
        legal: ['Lei n.º 7/2001, arts. 1.º e 5.º'],
        docs: ['Declaração da junta de freguesia ou outra prova da união de facto'],
      },
    ],
  },
  {
    id: 'estado-civil-desconhecido',
    reason: 'Estado civil do de cujus desconhecido',
    when: (a) => a.spouse === 'desconhecido',
    tasks: [
      {
        key: 'confirmar-estado-civil',
        phase: 'interessados',
        title: 'Confirmar o estado civil do de cujus',
        description: 'Obter certidão de nascimento com averbamentos atualizados para confirmar casamento, divórcio ou viuvez.',
        critical: true,
        docs: ['Certidão de nascimento do de cujus (com averbamentos)'],
      },
    ],
  },
  {
    id: 'descendentes',
    reason: 'Havia descendentes',
    when: (a) => a.descendants === 'sim',
    tasks: [
      {
        key: 'descendentes-registo',
        phase: 'interessados',
        title: 'Identificar cada descendente e recolher documentação',
        description:
          'Registar todos os filhos (incluindo de outras relações) e recolher a respetiva documentação. Descendentes e cônjuge integram a 1.ª classe de sucessíveis.',
        critical: true,
        legal: ['Código Civil, arts. 2133.º, n.º 1, al. a), e 2139.º'],
        docs: ['Certidões de nascimento dos descendentes', 'Documentos de identificação e NIF'],
      },
    ],
  },
  {
    id: 'descendentes-desconhecido',
    reason: 'Existência de descendentes por confirmar',
    when: (a) => a.descendants === 'desconhecido',
    tasks: [
      {
        key: 'descendentes-confirmar',
        phase: 'interessados',
        title: 'Confirmar a existência de descendentes',
        description: 'Averiguar a existência de filhos, incluindo de relações anteriores, antes de avançar para a habilitação.',
        critical: true,
        docs: ['Certidão de nascimento do de cujus (com averbamentos)'],
      },
    ],
  },
  {
    id: 'representacao',
    reason: 'Filho pré-falecido com descendentes',
    when: (a) => a.descendants === 'sim' && (a.representation === 'sim' || a.representation === 'desconhecido'),
    tasks: [
      {
        key: 'representacao',
        phase: 'interessados',
        title: 'Identificar os descendentes de filhos pré-falecidos (direito de representação)',
        description:
          'Os descendentes do filho pré-falecido ocupam a sua posição e partilham entre si a quota que a ele caberia (sucessão por estirpes).',
        critical: true,
        legal: ['Código Civil, arts. 2039.º, 2042.º e 2044.º'],
        docs: ['Certidão de óbito do filho pré-falecido', 'Certidões de nascimento dos netos'],
      },
    ],
  },
  {
    id: 'ascendentes',
    reason: 'Sem descendentes e com ascendentes vivos',
    when: (a) => a.descendants !== 'sim' && a.ascendants === 'sim',
    tasks: [
      {
        key: 'ascendentes-registo',
        phase: 'interessados',
        title: 'Identificar ascendentes e recolher documentação',
        description:
          'Na falta de descendentes, são chamados o cônjuge e os ascendentes (2.ª classe). O grau mais próximo afasta o mais afastado.',
        critical: true,
        legal: ['Código Civil, arts. 2133.º, n.º 1, al. b), 2142.º'],
        docs: ['Certidões de nascimento', 'Documentos de identificação e NIF dos ascendentes'],
      },
    ],
  },
  {
    id: 'ascendentes-desconhecido',
    reason: 'Ascendentes por confirmar',
    when: (a) => a.descendants !== 'sim' && a.ascendants === 'desconhecido',
    tasks: [
      {
        key: 'ascendentes-confirmar',
        phase: 'interessados',
        title: 'Confirmar se há ascendentes vivos',
        description: 'Na falta de descendentes, os ascendentes são herdeiros legitimários — confirmar antes de avançar.',
        critical: true,
      },
    ],
  },
  {
    id: 'colaterais',
    reason: 'Sem cônjuge, descendentes nem ascendentes',
    when: (a) => a.spouse !== 'casado' && a.descendants === 'nao' && a.ascendants === 'nao',
    tasks: [
      {
        key: 'colaterais',
        phase: 'interessados',
        title: 'Identificar irmãos, sobrinhos e outros colaterais',
        description:
          'Chamados os irmãos e seus descendentes (3.ª classe) e, na sua falta, os outros colaterais até ao 4.º grau. Os irmãos germanos recebem o dobro dos unilaterais.',
        critical: true,
        legal: ['Código Civil, arts. 2145.º a 2147.º'],
        docs: ['Certidões de nascimento que provem o parentesco'],
      },
    ],
  },
  {
    id: 'sem-irmaos',
    reason: 'Sem cônjuge, descendentes, ascendentes nem irmãos',
    when: (a) => a.spouse !== 'casado' && a.descendants === 'nao' && a.ascendants === 'nao' && a.siblings === 'nao',
    tasks: [
      {
        key: 'colaterais-estado',
        phase: 'interessados',
        title: 'Pesquisar outros colaterais até ao 4.º grau (na falta, sucessão do Estado)',
        description:
          'Sem irmãos nem sobrinhos, são chamados os demais colaterais até ao 4.º grau (primos direitos, tios-avós…). Na falta de todos, é chamado o Estado.',
        critical: true,
        legal: ['Código Civil, arts. 2147.º e 2152.º'],
      },
    ],
  },
  {
    id: 'incapazes',
    reason: 'Há menores ou maiores acompanhados',
    when: (a) => a.incapable === 'sim',
    tasks: [
      {
        key: 'representacao-incapazes',
        phase: 'interessados',
        title: 'Assegurar a representação de menores/maiores acompanhados',
        description:
          'Identificar os representantes legais e verificar se há conflito de interesses (ex.: progenitor também herdeiro), caso em que é necessário curador especial.',
        critical: true,
        legal: ['Código Civil, art. 1881.º, n.º 2', 'Código Civil, arts. 138.º e ss. (maior acompanhado)'],
        docs: ['Certidões de nascimento dos menores', 'Sentença de acompanhamento (se aplicável)'],
      },
    ],
  },
  {
    id: 'outros-interessados',
    reason: (a) => (a.others === 'sim' ? 'Há outros interessados' : 'Outros interessados por confirmar'),
    when: (a) => a.others === 'sim' || a.others === 'a_confirmar',
    tasks: [
      {
        key: 'outros-interessados',
        phase: 'interessados',
        title: 'Identificar e registar outros interessados na sucessão',
        description: 'Legatários, credores, beneficiários ou cessionários — registar e classificar na área Interessados.',
      },
    ],
  },

  // ========================= TESTAMENTO =========================
  {
    id: 'testamento-sim',
    reason: 'Há testamento',
    when: (a) => a.will === 'sim',
    tasks: [
      {
        key: 'testamento-obter',
        phase: 'testamento',
        title: 'Obter e analisar o testamento',
        description:
          'Obter certidão do testamento (público ou cerrado — neste caso, promover a abertura) e analisar as disposições: herdeiros, legados, testamenteiro, encargos.',
        critical: true,
        legal: ['Código Civil, arts. 2179.º e ss.'],
        docs: ['Certidão do testamento'],
      },
      {
        key: 'legitima',
        phase: 'testamento',
        title: 'Verificar o respeito pela legítima',
        description:
          'Confirmar se as disposições respeitam a quota indisponível dos herdeiros legitimários; caso contrário, avaliar a redução por inoficiosidade.',
        legal: ['Código Civil, arts. 2156.º a 2178.º'],
      },
    ],
  },
  {
    id: 'testamento-desconhecido',
    reason: 'Existência de testamento desconhecida',
    when: (a) => a.will === 'desconhecido',
    tasks: [
      {
        key: 'testamento-pesquisar',
        phase: 'testamento',
        title: 'Pesquisar existência de testamento',
        description:
          'Pedir informação sobre a existência de testamento junto dos Registos Centrais (IRN). Havendo ligações ao estrangeiro, pesquisar também nos registos desses países.',
        critical: true,
        docs: ['Pedido de informação sobre existência de testamento'],
      },
    ],
  },
  {
    id: 'testamento-estrangeiro',
    reason: 'Testamento por localizar e ligação a França',
    when: (a) => a.will === 'desconhecido' && isFranceLinked(a),
    tasks: [
      {
        key: 'testamento-fcddv',
        phase: 'testamento',
        title: 'Consultar o registo francês de disposições de última vontade (FCDDV)',
        description: 'Pedir, através de notaire, a consulta ao Fichier central des dispositions de dernières volontés.',
      },
    ],
  },
  {
    id: 'doacoes',
    reason: (a) => (a.gifts === 'sim' ? 'Houve doações em vida' : 'Doações em vida por confirmar'),
    when: (a) => a.gifts === 'sim' || a.gifts === 'desconhecido',
    tasks: [
      {
        key: 'doacoes-apurar',
        phase: 'testamento',
        title: 'Apurar doações em vida e sujeição a colação',
        description:
          'Identificar as doações feitas pelo de cujus a descendentes (sujeitas a colação, salvo dispensa) e o seu valor, para o cálculo da legítima e da partilha.',
        legal: ['Código Civil, arts. 2104.º e ss.', 'Código Civil, art. 2162.º'],
        docs: ['Escrituras de doação'],
      },
    ],
  },

  // ========================= HABILITAÇÃO =========================
  {
    id: 'habilitacao-necessaria',
    reason: 'Habilitação de herdeiros necessária',
    when: (a) => a.habilitation === 'necessaria',
    tasks: [
      {
        key: 'habilitacao',
        phase: 'habilitacao',
        title: 'Preparar habilitação de herdeiros',
        description:
          'Reunir a documentação e preparar a habilitação (notarial ou no Balcão das Heranças), com indicação dos herdeiros e da inexistência de outros que prefiram ou concorram.',
        critical: true,
        legal: ['Código do Notariado, arts. 82.º e ss.'],
        docs: [
          'Certidão de óbito',
          'Certidões de nascimento/casamento dos herdeiros',
          'Testamento (se existir)',
          'Identificação dos declarantes',
        ],
      },
      {
        key: 'habilitacao-agendar',
        phase: 'habilitacao',
        title: 'Agendar a habilitação e confirmar declarantes',
        description: 'Marcar data (notário ou conservatória) e confirmar a presença e identificação de quem vai declarar.',
      },
    ],
  },
  {
    id: 'habilitacao-confirmar',
    reason: 'Necessidade de habilitação por confirmar',
    when: (a) => a.habilitation === 'a_confirmar',
    tasks: [
      {
        key: 'habilitacao-avaliar',
        phase: 'habilitacao',
        title: 'Avaliar a necessidade de habilitação de herdeiros',
        description: 'Confirmar se bancos, conservatórias ou entidades estrangeiras vão exigir prova da qualidade de herdeiro.',
        critical: true,
      },
    ],
  },

  // ========================= INTERNACIONAL =========================
  {
    id: 'internacional',
    reason: 'Existem elementos de estraneidade',
    when: hasForeignElement,
    tasks: [
      {
        key: 'frente-internacional',
        phase: 'internacional',
        title: 'Abrir frente internacional e identificar intervenientes/entidades',
        description: 'Mapear notários, bancos, conservatórias e autoridades estrangeiras envolvidas, e o circuito de documentos.',
        critical: true,
      },
      {
        key: 'lei-aplicavel',
        phase: 'internacional',
        title: 'Determinar a lei aplicável e o tribunal/autoridade competente',
        description:
          'Regra geral: lei da residência habitual à data do óbito, salvo escolha da lei da nacionalidade em disposição por morte. Verificar competência das autoridades.',
        critical: true,
        legal: ['Regulamento (UE) n.º 650/2012, arts. 4.º, 21.º e 22.º'],
      },
      {
        key: 'docs-estrangeiros',
        phase: 'internacional',
        title: 'Obter documentos estrangeiros com apostila/formulário multilingue e tradução',
        description:
          'Na UE, certidões de registo civil podem circular com formulário-padrão multilingue sem apostila; fora da UE, apostila e tradução certificada.',
        legal: ['Regulamento (UE) 2016/1191', 'Convenção da Haia de 5 de outubro de 1961'],
      },
    ],
  },
  {
    id: 'cse',
    reason: 'Ligação a outro Estado-Membro da UE',
    when: euLinked,
    tasks: [
      {
        key: 'cse',
        phase: 'internacional',
        title: 'Avaliar pedido de Certificado Sucessório Europeu',
        description:
          'O CSE prova a qualidade de herdeiro e os poderes de administração noutros Estados-Membros. Em Portugal é emitido por notário ou tribunal.',
        legal: ['Regulamento (UE) n.º 650/2012, arts. 62.º a 73.º'],
      },
    ],
  },
  {
    id: 'franca',
    reason: 'Ligação a França',
    when: isFranceLinked,
    tasks: [
      {
        key: 'franca-notaire',
        phase: 'internacional',
        title: 'Articular com o notaire em França e preparar a déclaration de succession',
        description:
          'Coordenar com o notaire o acte de notoriété e a déclaration de succession. Prazo: 6 meses se o óbito ocorreu em França; 12 meses nos restantes casos.',
        critical: true,
        legal: ['Code général des impôts (França), art. 641'],
        deadline: (a) =>
          deathInFrance(a)
            ? { kind: 'monthsAfter', months: 6, label: 'Déclaration de succession: 6 meses após o óbito (óbito em França)' }
            : { kind: 'monthsAfter', months: 12, label: 'Déclaration de succession: 12 meses após o óbito (óbito fora de França)' },
      },
      {
        key: 'franca-fiscal',
        phase: 'internacional',
        title: 'Avaliar tributação sucessória em França e risco de dupla tributação',
        description: 'Confirmar que bens e herdeiros ficam sujeitos a droits de succession e coordenar com a tributação portuguesa.',
      },
    ],
  },

  // ========================= PATRIMÓNIO =========================
  {
    id: 'imoveis',
    reason: 'Há imóveis',
    when: (a) => has(a, 'imoveis'),
    tasks: [
      {
        key: 'imoveis-docs',
        phase: 'patrimonio',
        title: 'Recolher cadernetas prediais e certidões permanentes',
        description: 'Obter caderneta predial (VPT atualizado) e certidão permanente do registo predial de cada imóvel; confirmar ónus e encargos.',
        docs: ['Caderneta predial', 'Certidão permanente do registo predial', 'Título de aquisição'],
      },
    ],
  },
  {
    id: 'contas',
    reason: 'Há contas bancárias',
    when: (a) => has(a, 'contas'),
    tasks: [
      {
        key: 'contas-saldos',
        phase: 'patrimonio',
        title: 'Identificar bancos e solicitar saldos à data do óbito',
        description:
          'Pedir a cada banco declaração de saldos e titularidade à data do óbito (contas, depósitos, aplicações). Nas contas coletivas, apurar a quota do de cujus.',
        initialStatus: 'pendente',
        docs: ['Declaração de saldos à data do óbito', 'Extratos'],
      },
    ],
  },
  {
    id: 'bdc',
    reason: (a) => (has(a, 'desconhecido') ? 'Património ainda por apurar' : 'Há contas bancárias a confirmar'),
    when: (a) => has(a, 'desconhecido') || has(a, 'contas'),
    tasks: [
      {
        key: 'banco-portugal',
        phase: 'patrimonio',
        title: 'Pesquisar contas na Base de Dados de Contas do Banco de Portugal',
        description:
          'Pedir ao Banco de Portugal a informação sobre as instituições onde o de cujus tinha contas — evita esquecer bancos.',
        critical: false,
        legal: ['Banco de Portugal — Base de Dados de Contas'],
        docs: ['Certidão de óbito', 'Habilitação de herdeiros ou prova da qualidade'],
      },
    ],
  },
  {
    id: 'desconhecido',
    reason: 'Património ainda por apurar',
    when: (a) => has(a, 'desconhecido'),
    tasks: [
      {
        key: 'pesquisa-patrimonio',
        phase: 'patrimonio',
        title: 'Pesquisar património: imóveis, veículos, aplicações e seguros',
        description:
          'Consultar a informação patrimonial disponível (Portal das Finanças do de cujus, registos, IGCP, seguradoras) antes de preparar a relação de bens.',
        critical: true,
      },
    ],
  },
  {
    id: 'participacoes',
    reason: 'Há participações sociais',
    when: (a) => has(a, 'participacoes'),
    tasks: [
      {
        key: 'participacoes-pacto',
        phase: 'patrimonio',
        title: 'Identificar participações e verificar o pacto social',
        description:
          'Verificar cláusulas de transmissão por morte, amortização ou consentimento, e o impacto na gestão da sociedade.',
        critical: true,
        legal: ['Código das Sociedades Comerciais, art. 225.º'],
        docs: ['Certidão permanente da sociedade', 'Pacto social', 'Último balanço'],
      },
      {
        key: 'rcbe',
        phase: 'patrimonio',
        title: 'Atualizar o Registo Central do Beneficiário Efetivo (se aplicável)',
        description: 'Após a transmissão, confirmar a atualização da declaração RCBE da sociedade.',
        legal: ['Lei n.º 89/2017'],
      },
    ],
  },
  {
    id: 'veiculos',
    reason: 'Há veículos',
    when: (a) => has(a, 'veiculos'),
    tasks: [
      {
        key: 'veiculos-docs',
        phase: 'patrimonio',
        title: 'Identificar veículos e documentação de registo',
        description: 'Recolher certificado de matrícula e confirmar ónus e IUC em dívida.',
        docs: ['Certificado de matrícula (DUA)', 'Certidão do registo automóvel'],
      },
    ],
  },
  {
    id: 'aforro',
    reason: 'Há Certificados de Aforro/Tesouro',
    when: (a) => has(a, 'aforro'),
    tasks: [
      {
        key: 'aforro-igcp',
        phase: 'patrimonio',
        title: 'Identificar Certificados de Aforro/Tesouro junto do IGCP',
        description: 'Pedir informação ao IGCP sobre as contas aforro do de cujus. O direito dos herdeiros está sujeito a prazo — confirmar.',
        docs: ['Habilitação de herdeiros', 'Certidão de óbito'],
      },
    ],
  },
  {
    id: 'estrangeiro-bens',
    reason: 'Há património no estrangeiro',
    when: (a) => has(a, 'estrangeiro'),
    tasks: [
      {
        key: 'bens-estrangeiro',
        phase: 'patrimonio',
        title: 'Mapear património no estrangeiro e entidade responsável',
        description: 'Identificar bens por país, a autoridade competente para a transmissão e a documentação exigida localmente.',
        critical: true,
      },
    ],
  },
  {
    id: 'seguros',
    reason: (a) => (a.insurance === 'sim' ? 'Há seguros de vida/PPR' : 'Seguros de vida por confirmar'),
    when: (a) => a.insurance === 'sim' || a.insurance === 'desconhecido',
    tasks: [
      {
        key: 'seguros-asf',
        phase: 'patrimonio',
        title: 'Consultar o registo central de seguros de vida (ASF) e identificar beneficiários',
        description:
          'Pedir à ASF informação sobre contratos com beneficiários em caso de morte. Em regra, o capital é pago diretamente aos beneficiários e não integra a herança.',
        legal: ['ASF — registo central de contratos de seguro de vida'],
      },
    ],
  },
  {
    id: 'meacao',
    reason: 'Casamento em regime de comunhão',
    when: communal,
    tasks: [
      {
        key: 'meacao',
        phase: 'patrimonio',
        title: 'Separar bens próprios e bens comuns (meação do cônjuge)',
        description:
          'Classificar cada bem como próprio ou comum. Só metade dos bens comuns integra a herança; a outra metade é a meação do cônjuge sobrevivo.',
        critical: true,
        legal: ['Código Civil, arts. 1722.º, 1724.º e 1732.º'],
      },
    ],
  },
  {
    id: 'regime-desconhecido',
    reason: 'Regime de bens desconhecido',
    when: (a) => married(a) && a.regime === 'desconhecido',
    tasks: [
      {
        key: 'regime-confirmar',
        phase: 'patrimonio',
        title: 'Confirmar o regime de bens (determina a meação)',
        description: 'Confirmar na certidão de casamento e eventual convenção antenupcial. Sem esta informação não é possível fechar a relação de bens.',
        critical: true,
        docs: ['Certidão de casamento'],
      },
    ],
  },
  {
    id: 'casa-morada',
    reason: 'A casa de morada de família integra a herança',
    when: (a) => a.familyHome === 'sim',
    tasks: [
      {
        key: 'casa-morada',
        phase: 'patrimonio',
        title: 'Acautelar os direitos sobre a casa de morada de família',
        description:
          'Cônjuge: direito de habitação e de uso do recheio a atribuir na partilha. Unido de facto: direito real de habitação e preferência nos termos da lei.',
        legal: ['Código Civil, art. 2103.º-A', 'Lei n.º 7/2001, art. 5.º'],
      },
    ],
  },

  // ========================= PASSIVO =========================
  {
    id: 'passivo-sim',
    reason: 'Há passivo conhecido',
    when: (a) => a.liabilities === 'sim',
    tasks: [
      {
        key: 'passivo-comprovar',
        phase: 'passivo',
        title: 'Recolher e comprovar o passivo conhecido',
        description: 'Obter declarações de dívida atualizadas (créditos, cartões, impostos) com o valor à data do óbito.',
        initialStatus: 'em_curso',
        docs: ['Declarações de dívida à data do óbito'],
      },
    ],
  },
  {
    id: 'passivo-confirmar',
    reason: 'Passivo por confirmar',
    when: (a) => a.liabilities === 'a_confirmar',
    tasks: [
      {
        key: 'passivo-verificar',
        phase: 'passivo',
        title: 'Verificar a existência de passivo e eventuais credores',
        description: 'Consultar bancos, Finanças e Segurança Social quanto a dívidas do de cujus.',
        critical: true,
      },
    ],
  },
  {
    id: 'beneficio-inventario',
    reason: 'O passivo pode superar o ativo',
    when: (a) => a.insolvencyRisk === 'sim' || a.insolvencyRisk === 'desconhecido',
    tasks: [
      {
        key: 'beneficio-inventario',
        phase: 'passivo',
        title: 'Avaliar aceitação a benefício de inventário ou repúdio',
        description:
          'Com aceitação a benefício de inventário, os bens da herança só respondem até às forças da herança. Esclarecer o cliente antes de qualquer ato de aceitação tácita.',
        critical: true,
        legal: ['Código Civil, arts. 2052.º, 2053.º e 2071.º'],
      },
    ],
  },
  {
    id: 'base-passivo',
    reason: 'Tarefa de base de qualquer sucessão',
    when: () => true,
    tasks: [
      {
        key: 'encargos',
        phase: 'passivo',
        title: 'Apurar encargos da herança (funeral, sufrágios, administração)',
        description: 'Reunir comprovativos das despesas que saem da herança antes da partilha.',
        legal: ['Código Civil, art. 2068.º'],
        docs: ['Faturas do funeral', 'Comprovativos de despesas'],
      },
      {
        key: 'contratos-cancelar',
        phase: 'passivo',
        title: 'Cancelar contratos, débitos diretos e subscrições',
        description: 'Telecomunicações, energia, cartões, seguros sem interesse — evita o acumular de encargos.',
      },
    ],
  },

  // ========================= FISCAL =========================
  {
    id: 'base-fiscal',
    reason: 'Obrigação fiscal de qualquer sucessão',
    when: () => true,
    tasks: [
      {
        key: 'imposto-selo',
        phase: 'fiscal',
        title: 'Participar o óbito às Finanças — Modelo 1 do Imposto do Selo',
        description:
          'Participação obrigatória pelo cabeça-de-casal, mesmo que todos os beneficiários estejam isentos (cônjuge, descendentes, ascendentes). Após a participação é atribuído NIF à herança indivisa.',
        critical: true,
        legal: ['Código do Imposto do Selo, art. 26.º, n.º 3', 'Código do Imposto do Selo, art. 6.º, al. e)'],
        docs: ['Certidão de óbito', 'NIF dos herdeiros', 'Relação de bens'],
        deadline: { kind: 'endOfMonthAfter', months: 3, label: 'Até ao fim do 3.º mês seguinte ao do óbito (art. 26.º, n.º 3 CIS)' },
      },
      {
        key: 'relacao-bens',
        phase: 'fiscal',
        title: 'Preparar a relação de bens (ativo e passivo) com valores fiscais',
        description: 'Relação de bens a anexar à participação, com valores determinados segundo as regras do Imposto do Selo (ex.: VPT dos imóveis).',
        critical: true,
        legal: ['Código do Imposto do Selo, arts. 13.º e 26.º'],
        deadline: { kind: 'endOfMonthAfter', months: 3, label: 'Acompanha a participação do Imposto do Selo' },
      },
      {
        key: 'nif-heranca',
        phase: 'fiscal',
        title: 'Confirmar o NIF da herança indivisa',
        description: 'Guardar o NIF atribuído à herança indivisa (começa por 70, 74 ou 75) e comunicá-lo aos bancos e restantes entidades.',
      },
      {
        key: 'irs-falecido',
        phase: 'fiscal',
        title: 'Entregar o IRS do falecido relativo ao ano do óbito',
        description:
          'A declaração dos rendimentos do ano do óbito é entregue pelo cabeça-de-casal no prazo normal (1 de abril a 30 de junho do ano seguinte).',
        legal: ['Código do IRS, arts. 60.º e 63.º'],
        deadline: { kind: 'dayOfNextYear', month: 6, day: 30, label: 'Prazo normal do IRS: até 30 de junho do ano seguinte ao do óbito' },
      },
    ],
  },
  {
    id: 'selo-tributado',
    reason: 'Pode haver beneficiários não isentos de Imposto do Selo',
    when: possiblyTaxedBeneficiaries,
    tasks: [
      {
        key: 'selo-10',
        phase: 'fiscal',
        title: 'Apurar Imposto do Selo (10%) para beneficiários não isentos',
        description:
          'Transmissões gratuitas a favor de quem não seja cônjuge/unido de facto, descendente ou ascendente estão sujeitas a 10%. Preparar a liquidação e o pagamento.',
        critical: true,
        legal: ['Tabela Geral do Imposto do Selo, verba 1.2'],
      },
    ],
  },
  {
    id: 'imi',
    reason: 'Há imóveis',
    when: (a) => has(a, 'imoveis'),
    tasks: [
      {
        key: 'imi',
        phase: 'fiscal',
        title: 'Acompanhar IMI em nome da herança indivisa',
        description: 'Até à partilha, a herança indivisa (representada pelo cabeça-de-casal) é o sujeito passivo do IMI.',
        legal: ['Código do IMI, art. 8.º'],
      },
    ],
  },

  // ========================= PARTILHA =========================
  {
    id: 'base-partilha',
    reason: 'Tarefa de base de qualquer sucessão',
    when: () => true,
    tasks: [
      {
        key: 'partilha-perspetiva',
        phase: 'partilha',
        title: 'Registar a perspetiva da partilha e os pontos pendentes',
        description: 'Documentar posições dos interessados, bens a adjudicar e pontos de divergência.',
        initialStatus: 'pendente',
      },
    ],
  },
  {
    id: 'partilha-acordo',
    reason: 'Há acordo ou boas perspetivas de acordo',
    when: (a) => a.partition === 'acordo' || a.partition === 'boas_perspetivas' || a.partition === 'negociacao',
    tasks: [
      {
        key: 'projeto-partilha',
        phase: 'partilha',
        title: 'Preparar projeto de partilha e mapa de quinhões',
        description: 'Calcular os quinhões, propor adjudicações e tornas e validar com todos os interessados.',
        legal: ['Código Civil, arts. 2101.º e 2102.º'],
      },
      {
        key: 'agendar-partilha',
        phase: 'partilha',
        title: 'Agendar a partilha (escritura, documento autenticado ou Balcão das Heranças)',
        description: 'Escolher a via da partilha extrajudicial e marcar data com todos os interessados ou procuradores.',
      },
    ],
  },
  {
    id: 'partilha-conflito',
    reason: 'Sem acordo entre os interessados',
    when: (a) => a.partition === 'conflito',
    tasks: [
      {
        key: 'inventario',
        phase: 'partilha',
        title: 'Avaliar a via adequada: inventário judicial ou notarial',
        description: 'Sem acordo, a partilha faz-se por inventário. Avaliar a via, custos e prazos, e preparar o requerimento inicial.',
        critical: true,
        legal: ['Código de Processo Civil, arts. 1082.º e ss.', 'Lei n.º 117/2019'],
      },
    ],
  },
  {
    id: 'partilha-incapazes',
    reason: 'Há menores ou maiores acompanhados',
    when: (a) => a.incapable === 'sim' && a.partition !== 'conflito',
    tasks: [
      {
        key: 'autorizacao-mp',
        phase: 'partilha',
        title: 'Obter autorização do Ministério Público para a partilha',
        description: 'A partilha extrajudicial em que intervenham incapazes carece de autorização, a requerer ao Ministério Público.',
        critical: true,
        legal: ['Decreto-Lei n.º 272/2001'],
      },
    ],
  },
  {
    id: 'tornas-imt',
    reason: 'Há imóveis a partilhar',
    when: (a) => has(a, 'imoveis'),
    tasks: [
      {
        key: 'tornas-imt',
        phase: 'partilha',
        title: 'Calcular tornas e eventual IMT sobre excesso de quota-parte',
        description: 'O valor dos imóveis adjudicados a um herdeiro acima da sua quota-parte está sujeito a IMT.',
        legal: ['Código do IMT, art. 2.º, n.º 5, al. c)'],
      },
    ],
  },
  {
    id: 'colacao',
    reason: 'Houve doações em vida',
    when: (a) => a.gifts === 'sim',
    tasks: [
      {
        key: 'colacao',
        phase: 'partilha',
        title: 'Efetuar a colação das doações na partilha',
        description: 'Imputar as doações sujeitas a colação na quota do donatário, para igualação da partilha.',
        legal: ['Código Civil, arts. 2104.º a 2118.º'],
      },
    ],
  },

  // ========================= ENCERRAMENTO =========================
  {
    id: 'registos-imoveis',
    reason: 'Há imóveis',
    when: (a) => has(a, 'imoveis'),
    tasks: [
      {
        key: 'registo-predial',
        phase: 'encerramento',
        title: 'Promover o registo predial das aquisições',
        description: 'Registar a aquisição a favor dos adjudicatários. O registo predial é obrigatório — confirmar o prazo aplicável ao caso.',
        critical: true,
        legal: ['Código do Registo Predial, arts. 8.º-A e ss.'],
      },
    ],
  },
  {
    id: 'registos-veiculos',
    reason: 'Há veículos',
    when: (a) => has(a, 'veiculos'),
    tasks: [
      {
        key: 'registo-automovel',
        phase: 'encerramento',
        title: 'Promover o registo automóvel a favor dos herdeiros',
        description: 'Atualizar a propriedade dos veículos no registo automóvel.',
        legal: ['Decreto-Lei n.º 54/75'],
      },
    ],
  },
  {
    id: 'contas-fecho',
    reason: 'Há contas bancárias',
    when: (a) => has(a, 'contas'),
    tasks: [
      {
        key: 'contas-movimentar',
        phase: 'encerramento',
        title: 'Movimentar ou encerrar contas conforme a partilha',
        description: 'Entregar aos bancos a documentação da partilha e acompanhar as transferências.',
      },
    ],
  },
  {
    id: 'participacoes-registo',
    reason: 'Há participações sociais',
    when: (a) => has(a, 'participacoes'),
    tasks: [
      {
        key: 'registo-comercial',
        phase: 'encerramento',
        title: 'Registar a transmissão das participações sociais',
        description: 'Promover o registo comercial da transmissão e atualizar o livro de registo de ações, se aplicável.',
      },
    ],
  },
  {
    id: 'base-encerramento',
    reason: 'Tarefa de base de qualquer sucessão',
    when: () => true,
    tasks: [
      {
        key: 'obrigacoes-finais',
        phase: 'encerramento',
        title: 'Confirmar cumprimento das obrigações pendentes e documentação final',
        description: 'Verificar que todas as tarefas críticas estão concluídas e que o cliente tem cópia dos documentos finais.',
      },
      {
        key: 'arquivar',
        phase: 'encerramento',
        title: 'Enviar relatório final, encerrar dossier e arquivar documentação',
        description: 'Enviar relatório de encerramento, emitir nota final e arquivar o dossier.',
      },
    ],
  },
];
