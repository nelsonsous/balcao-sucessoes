# Balcão das Sucessões — PWA profissional

> *Para imprimir Fluencia a cada dossier.*

**Aplicação:** https://nelsonsous.github.io/balcao-sucessoes/ · **Manual do utilizador e apresentação:** ver [Documentação](#documentação)

[![Publicar no GitHub Pages](https://github.com/nelsonsous/balcao-sucessoes/actions/workflows/deploy.yml/badge.svg)](https://github.com/nelsonsous/balcao-sucessoes/actions/workflows/deploy.yml)

Aplicação web instalável (PWA) para gerir processos sucessórios: **perguntas certas → dossier certo → checklist adaptativa → semáforos → próxima ação**. Funciona offline e guarda os dados apenas no dispositivo.

Evolução do projeto-piloto do escritório: mantém os seus conceitos e eleva-os a nível profissional.

## O que faz

| Área | Descrição |
|---|---|
| **Visão geral** | Painel em tempo real: dossiers em curso, a precisar de atenção, próximas ações de todos os dossiers, prazos a chegar, fase de cada dossier, carga por responsável, contactos a retomar. |
| **Nova sucessão** | Assistente em 7 passos com **pré-visualização ao vivo** da checklist que vai nascer (tarefas, críticas e prazos calculados). Rascunho guardado automaticamente. |
| **Motor de regras** | 27 perguntas, 59 regras jurídicas e 80 modelos de tarefa (Código Civil, CIS, CIRS, CIMT, LGT, Reg. (UE) 650/2012…) que geram só o trabalho aplicável, cada tarefa com *porquê*, *como fazer*, documentos e referências. |
| **Checklist** | 10 fases, 5 estados (Pendente · Em curso · A aguardar terceiros · Concluída · N/A), tarefas críticas, filtros, pesquisa, tarefas próprias. |
| **Prazos legais** | Calculados a partir da data do óbito (ex.: Modelo 1 do Imposto do Selo até ao fim do 3.º mês seguinte; IRS; déclaration de succession em França 6/12 meses; caducidade do direito de aceitar). |
| **Agenda** | Calendário mensal e lista com feriados nacionais/municipais e férias judiciais; escrituras, reuniões, diligências e prazos próprios; exportação `.ics` (Outlook/Google/Apple) com alarmes; aviso de prazos que terminam em dia não útil; resumo diário, notificações e contador no ícone da app. |
| **Calculadora de prazos** | Dias corridos ou úteis, meses e anos a contar de uma data, com suspensão nas férias judiciais (CPC art. 138.º) e transferência para o 1.º dia útil seguinte (CC art. 279.º); explicação passo a passo, prazos frequentes, agendamento e uso direto como prazo de uma tarefa. |
| **Calculadora sucessória** | Quotas da sucessão legítima por classe (cônjuge com ¼ garantido, representação por estirpes, irmãos germanos/unilaterais, colaterais, Estado), legítima e quota disponível, meação, inoficiosidade, estimativa de Imposto do Selo, fundamentação com artigos e árvore genealógica; página própria e separador “Quotas” em cada dossier. |
| **Internacional** | Lei aplicável e competência (Reg. (UE) 650/2012) com análise passo a passo, Certificado Sucessório Europeu, apostila/formulários multilingues/legalização por país, prazos de referência noutros países, entidades no estrangeiro; ponto de situação ao cliente em PT/FR/EN. |
| **Documentos** | Checklist documental gerada a partir das tarefas e dos interessados, estados com datas, anexos guardados offline (arrastar-e-largar), abrir/descarregar. |
| **Minutas** | 13 minutas-base (PT/FR/EN) e minutas do escritório com campos automáticos do dossier; pré-visualização, edição, Word (.docx), PDF, email e “guardar no dossier”. |
| **Produtividade** | Paleta de comandos (⌘K), «As minhas tarefas» por urgência, checklist em quadro Kanban com arrastar-e-largar, ações em massa (estado, responsável, prazo, criticidade), modelos de dossier (base e do escritório) e quadro de dossiers por fase. |
| **Relatórios** | Relatório interno, ponto de situação para o cliente (sem notas internas), relação de bens (verbas numeradas com elementos de identificação) e mapa de partilha com tornas — pré-visualização, Word, PDF e arquivo no dossier; exportação CSV de dossiers, bloqueios e património. |
| **O que está a bloquear?** | Por dossier e global: prazos ultrapassados, críticas por iniciar, dependências de terceiros, prazos a 30 dias. |
| **Reconciliação** | Alterar o questionário atualiza a checklist sem perder trabalho: tarefas novas aparecem, as intocadas que deixam de se aplicar saem, as que tinham trabalho ficam “a rever”. |
| **Interessados** | Qualidade sucessória, parentesco, cabeça-de-casal, menores/maiores acompanhados, procuração, aceitação/repúdio, NIF validado; sugestões automáticas a partir do questionário. |
| **Património** | Imóveis, contas, participações, veículos, aforro e bens no estrangeiro, com campos próprios; passivo; estimativa da massa hereditária com **meação** do cônjuge. |
| **Notas & contactos** | Notas fixadas, observações com gravação automática, registo de contactos com lembretes de seguimento — tudo **por dossier**. |
| **Histórico** | Registo automático de todas as alterações (quem, o quê, quando). |
| **Dados** | IndexedDB local, cópia de segurança/importação JSON — opcionalmente **cifrada com palavra-passe (AES-256-GCM)** —, lembrete semanal de cópia, importação do protótipo original, dados de demonstração fictícios, pedido de armazenamento persistente. |
| **Segurança** | Bloqueio por PIN (PBKDF2, esperas após falhas), auto-bloqueio por inatividade e ao mudar de aplicação, modo privacidade (nomes desfocados para partilhar o ecrã), Content Security Policy sem scripts inline. |
| **Partilha entre colegas** | Exportar um dossier completo (com anexos) num ficheiro cifrado e juntá-lo noutro dispositivo com pré-visualização dos conflitos e quatro regras de junção (mais recente, ficheiro, este dispositivo, novo dossier) — sem nunca apagar nada e com registo no histórico. |
| **Cópias automáticas** | Cópias cifradas escritas automaticamente numa pasta do dispositivo (File System Access API) com rotação, frequência configurável e aviso quando a pasta precisa de autorização — numa pasta sincronizada, o escritório fica com um repositório central sem servidor. |
| **Partilha para a app** | No Android, partilhar um PDF, uma fotografia ou uma ligação para o Balcão (Web Share Target) coloca-o em «Recebidos», onde passa a documento do dossier ou a nota. |
| **Anular e reciclagem** | Cada mudança de estado ou remoção mostra «Anular» (também Ctrl/⌘+Z); o que se apaga fica 30 dias na reciclagem — tarefas, interessados, bens, documentos com anexo e dossiers inteiros — com reposição registada no histórico, que passa a ser pesquisável e filtrável por tipo. |
| **Análise da equipa** | Dossiers e prazos por mês, tempo até concluir cada fase (mediana), tarefas por fase e carga/desempenho por pessoa (prazos cumpridos, tempo de conclusão), com período e filtro por pessoa, gráficos SVG acessíveis com tabela alternativa e exportação CSV. |
| **Pesquisa e vistas** | Filtros avançados (prioridade, etiqueta, fase, prazos, data do óbito, internacional) com chips e endereço partilhável, vistas predefinidas e guardadas com nome, pesquisa profunda em notas, contactos, documentos, interessados e bens, e pesquisa global na paleta. |
| **Documentos avançados** | Validade das certidões com avisos (a expirar/expirada) e filtro, pedidos de documentos por interessado com texto pronto, e-mail e marcação como pedidos, pré-visualização de PDF/imagens/texto na aplicação e estados ou remoção em lote com «anular». |
| **Telemóvel e iPhone** | Campos a 16 px (sem zoom automático no Safari), alvos de toque maiores, áreas seguras (notch, Dynamic Island, horizontal), barra inferior que se esconde com o teclado virtual e menus que abrem sempre inteiros; verificado automaticamente em 12 ecrãs a cada publicação. |
| **Honorários e despesas** | Tempo por dossier (à mão ou com cronómetro na barra superior), acordo por hora ou valor fixo, despesas a debitar, provisões recebidas, IVA e retenção na fonte, saldo e nota de honorários em Word/PDF (documento de apoio à fatura), com horas por pessoa na análise da equipa. |
| **Regras do escritório** | Práticas da casa como regras: condições sobre o questionário → tarefas com fase, prazo, documentos e referências, integradas no motor e na reconciliação da checklist; pré-visualização dos dossiers abrangidos, alterações por aplicar com confirmação e marca «Escritório» nas tarefas. |
| **Qualidade** | 0 violações axe-core (WCAG 2.2 AA) em 25 ecrãs, divisão de código por rota e separador, fontes só em latino, 257 testes (unitários, componentes com Testing Library e propriedades com fast-check, cobertura com limiar) e 19 passos E2E com Chrome executados antes de cada publicação. |
| **PWA** | Instalável (desktop, Android, iOS), offline, atalhos, aviso de nova versão, tema claro/escuro, responsivo com navegação inferior no telemóvel. |

## Começar

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm test           # testes unitários, de componentes e de propriedades (vitest)
npm run test:coverage  # o mesmo, com cobertura e limiares
npm run e2e        # testes ponta a ponta com o Chrome instalado (depois de npm run build)
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve dist/ em http://localhost:4173 (com service worker)
```

## Documentação

| Documento | Formato |
|---|---|
| **Manual do utilizador** — 27 capítulos e 7 anexos com 55 figuras: todas as funcionalidades passo a passo (fases e estados, questionário, catálogo das tarefas geradas, campos das minutas, prazos por país, histórico das versões, ficha técnica) | [Word (.docx)](docs/Balcao-das-Sucessoes-Manual-do-Utilizador.docx) · [PDF](docs/Balcao-das-Sucessoes-Manual-do-Utilizador.pdf) |
| **Apresentação** — 29 diapositivos com notas do orador: desafio, princípios, motor de regras, cada área da aplicação, relatórios, produtividade, internacional, segurança, novidades 2.1 (prazos, partilha, cópias automáticas, anular e reciclagem, análise, pesquisa e documentos), números, tecnologia, percurso e como começar | [PowerPoint (.pptx)](docs/Balcao-das-Sucessoes-Apresentacao.pptx) · [PDF](docs/Balcao-das-Sucessoes-Apresentacao.pdf) |
| **Resumo executivo** — uma página: o que é, como funciona, o que entrega, qualidade, limites e próximos passos | [Markdown](docs/Resumo-Executivo.md) |

As figuras usam apenas dados fictícios. O conteúdo jurídico é de apoio e deve ser validado pela equipa em cada caso.

## Publicar como PWA

Cada alteração no ramo `main` é testada, compilada e publicada automaticamente no GitHub Pages (`.github/workflows/deploy.yml`).

`dist/` é um site estático com caminhos relativos e *hash routing* — pode ser servido a partir de qualquer pasta de um servidor HTTPS (intranet do escritório, Netlify, Cloudflare Pages, GitHub Pages…). O service worker exige HTTPS (ou `localhost`).

Instalação: Chrome/Edge → ícone “Instalar” na barra de endereço · Android → “Adicionar ao ecrã principal” · iPhone/iPad (Safari) → Partilhar → “Adicionar ao ecrã principal”.

## Arquitetura

```
src/
  engine/        motor puro e testado
    questions.ts   questionário (passos, visibilidade condicional)
    rules.ts       biblioteca de regras jurídicas → tarefas
    engine.ts      avaliação das regras
    sync.ts        reconciliação da checklist com a base de dados
    deadlines.ts   cálculo e estado dos prazos
    insights.ts    semáforo global, bloqueios, próxima ação
    calendar.ts    Páscoa, feriados, dias úteis, férias judiciais
    succession.ts  calculadora sucessória (Código Civil)
    fraction.ts    frações exatas
    templates.ts   minutas-base, campos e formatação
  lib/           dados e utilitários
    db.ts          esquema IndexedDB (Dexie) e fábricas
    actions.ts     todas as escritas (+ histórico)
    backup.ts      exportação/importação
    demo.ts        dados fictícios
    nif.ts         validação de NIF
    agenda.ts      agenda unificada (prazos + eventos + contactos)
    ics.ts         exportação iCalendar (RFC 5545)
    documents.ts   checklist documental e anexos
    docx.ts        gerador .docx (Office Open XML)
    templateContext.ts  dados do dossier para as minutas
  components/    sistema de design (UI, Shell, Toast, PWA)
  features/      ecrãs (dashboard, dossiers, wizard, interessados, património, notas, bloqueios, definições)
  styles/        tokens (claro/escuro), componentes, layout, ecrãs
```

**Stack:** React 19 · TypeScript 7 (strict) · Vite 8 · vite-plugin-pwa (Workbox) · Dexie (IndexedDB) · wouter · lucide · fflate (.docx) · Inter + Fraunces (self-hosted, offline).

### Acrescentar uma regra

Em `src/engine/rules.ts`, adicionar um objeto `Rule` com `when(answers)`, `reason` e as `tasks` (chave única, fase, título, descrição, `critical`, `legal`, `docs`, `deadline`). A reconciliação trata de a aplicar aos dossiers quando o questionário for guardado. Cobrir com um teste em `src/engine/engine.test.ts`.

## Aviso

Ferramenta de apoio à gestão. As tarefas, referências legais e prazos sugeridos são indicativos e **devem ser validados pela equipa** em cada caso concreto. Em demonstrações, usar apenas dados fictícios.
