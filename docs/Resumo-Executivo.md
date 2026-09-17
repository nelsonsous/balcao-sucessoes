# Balcão das Sucessões — Resumo executivo

**Aplicação:** https://nelsonsous.github.io/balcao-sucessoes/ · **Código:** https://github.com/nelsonsous/balcao-sucessoes · **Versão 2.1** · 17 de setembro de 2026

## O que é

Um balcão único, instalável em computador, tablet e telemóvel, para organizar e acompanhar processos sucessórios e identificar sempre o próximo passo. Funciona sem internet e guarda os dados apenas no dispositivo — sem servidores, contas ou telemetria.

## Como funciona

1. **Perguntas certas → dossier certo.** Um questionário de 27 perguntas descreve a sucessão (óbito e ligações internacionais, família — incluindo separação, herdeiros no estrangeiro ou de paradeiro desconhecido —, disposições, património e passivo, partilha).
2. **A checklist é o motor.** 59 regras geram só as tarefas aplicáveis (até 80), em 10 fases, cada uma com orientação, documentos, referências legais e prazos calculados a partir da data do óbito (Imposto do Selo, IRS, prazos franceses, caducidade da aceitação).
3. **O que está a bloquear? e a próxima ação.** Em cada dossier e para toda a equipa: prazos ultrapassados, tarefas críticas por iniciar, dependências de terceiros.
4. **Memória prática.** Interessados, património e passivo, documentos com anexos, notas e registo de contactos — tudo no dossier.

## O que entrega

| Área | Capacidades |
|---|---|
| Dossier | Checklist (lista ou quadro Kanban, ações em massa), interessados, património, documentos com checklist automática e anexos offline, quotas com mapa de partilha, internacional, agenda, notas & contactos, questionário com reconciliação, histórico |
| Agenda | Calendário português (feriados, férias judiciais), eventos, exportação .ics, lembretes, notificações e contador no ícone |
| Calculadora sucessória | Quotas com frações exatas (Código Civil, arts. 2131.º–2178.º), legítima e quota disponível, meação, representação, inoficiosidade, Imposto do Selo, árvore genealógica |
| Documentos | 13 minutas-base (PT/FR/EN) e minutas do escritório com 35 campos automáticos; 4 relatórios (interno, ponto de situação ao cliente em três línguas, relação de bens, mapa de partilha) em Word com tabelas reais, PDF e email; exportação CSV |
| Internacional | Lei aplicável e competência (Reg. (UE) 650/2012), Certificado Sucessório Europeu, regime de documentos por país, prazos de referência em 16 países, entidades no estrangeiro |
| Produtividade | Paleta de comandos (⌘K), «As minhas tarefas», modelos de dossier, quadro de dossiers por fase |
| Segurança | Bloqueio por PIN com auto-bloqueio, cópias de segurança cifradas (AES-256-GCM), modo privacidade, importação do protótipo original, Content Security Policy |
| Prazos | Calculadora de prazos (dias corridos/úteis, meses, anos, férias judiciais, dia útil seguinte) com explicação passo a passo, ligada à agenda e às tarefas |
| Colaboração | Partilha de um dossier completo (com anexos) em ficheiro cifrado e junção noutro dispositivo com pré-visualização de conflitos e quatro regras; cópias automáticas cifradas para uma pasta (rotação); receção de ficheiros partilhados no Android (Web Share Target) |
| Recuperação | «Anular» em todas as ações reversíveis (Ctrl/⌘+Z), reciclagem de 30 dias com reposição de tarefas, interessados, bens, documentos e dossiers inteiros, histórico pesquisável |
| Análise | Painel de equipa por mês, fase e pessoa (prazos cumpridos, tempo até concluir cada fase, carga) com gráficos SVG acessíveis, tabela alternativa e CSV |
| Pesquisa | Filtros avançados no endereço da página, chips, vistas predefinidas e guardadas com nome, pesquisa profunda e global (notas, contactos, documentos) |
| Documentos avançados | Validade das certidões com avisos, pedidos de documentos por interessado (texto pronto, e-mail, marcação), pré-visualização de anexos e estados em lote |

## Qualidade e entrega

- **212 testes** (unitários, componentes com Testing Library e propriedades com fast-check, com limiar de cobertura) e **16 passos ponta a ponta** (Chrome) executados antes de cada publicação; publicação automática por GitHub Actions.
- **0 violações de acessibilidade** (axe-core, WCAG 2.2 AA) nos 23 ecrãs auditados; contraste, ordem de títulos, alvos de toque, regiões com foco de teclado e gráficos com tabela alternativa.
- Carregamento a pedido por rota e por separador (pacote inicial de 606 kB, 186 kB comprimido); fontes só nos subconjuntos latinos.
- Manual do utilizador (27 capítulos, 7 anexos, 55 figuras) e apresentação (29 diapositivos) na pasta `docs/`.

## Limites e próximos passos possíveis

- Os dados vivem em cada dispositivo: a partilha entre colegas faz-se por ficheiro cifrado de dossier (com junção por regras) ou por cópia de segurança; as cópias automáticas para uma pasta sincronizada dão ao escritório um repositório central sem servidor. Trabalho simultâneo no mesmo dossier exigiria um serviço de sincronização num projeto próprio do escritório (por exemplo Supabase, região UE, um espaço por escritório, login dos membros), mantendo o IndexedDB como cache offline.
- O conteúdo jurídico (regras, prazos, referências, análise internacional) é de apoio e deve ser validado pela equipa em cada caso; a manutenção das regras é feita em ficheiros legíveis (`src/engine/rules.ts`, `src/engine/international.ts`).
- Ideias para uma fase seguinte («modo escritório»): sincronização opcional entre dispositivos com a lógica de junção já existente como regra de conflitos, assinatura e envio de documentos, integração com agendas do escritório.
