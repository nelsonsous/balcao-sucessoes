# Balcão das Sucessões — Resumo executivo

**Aplicação:** https://nelsonsous.github.io/balcao-sucessoes/ · **Código:** https://github.com/nelsonsous/balcao-sucessoes · **Versão 2.0** · 17 de setembro de 2026

## O que é

Um balcão único, instalável em computador, tablet e telemóvel, para organizar e acompanhar processos sucessórios e identificar sempre o próximo passo. Funciona sem internet e guarda os dados apenas no dispositivo — sem servidores, contas ou telemetria.

## Como funciona

1. **Perguntas certas → dossier certo.** Um questionário de 24 perguntas descreve a sucessão (óbito e ligações internacionais, família, disposições, património e passivo, partilha).
2. **A checklist é o motor.** 55 regras geram só as tarefas aplicáveis (até 72), em 10 fases, cada uma com orientação, documentos, referências legais e prazos calculados a partir da data do óbito (Imposto do Selo, IRS, prazos franceses, caducidade da aceitação).
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

## Qualidade e entrega

- **94 testes unitários** e **10 passos ponta a ponta** (Chrome) executados antes de cada publicação; publicação automática por GitHub Actions.
- **0 violações de acessibilidade** (axe-core, WCAG 2.2 AA) nos 16 ecrãs auditados; contraste, ordem de títulos, alvos de toque e teclado revistos.
- Pacote inicial reduzido a 561 kB (172 kB comprimido) com carregamento a pedido por rota; fontes só nos subconjuntos latinos.
- Manual do utilizador (18 capítulos, 7 anexos, 39 figuras) e apresentação (24 diapositivos) na pasta `docs/`.

## Limites e próximos passos possíveis

- Os dados vivem em cada dispositivo: a partilha entre colegas faz-se por cópia de segurança (cifrada). Uma sincronização entre dispositivos exigiria um serviço com autenticação e cifra ponta a ponta.
- O conteúdo jurídico (regras, prazos, referências, análise internacional) é de apoio e deve ser validado pela equipa em cada caso; a manutenção das regras é feita em ficheiros legíveis (`src/engine/rules.ts`, `src/engine/international.ts`).
- Ideias para uma fase seguinte: sincronização opcional entre dispositivos, assinatura e envio de documentos, integração com agendas do escritório, painel de equipa com métricas de produtividade.
