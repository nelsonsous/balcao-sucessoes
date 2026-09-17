# Iterações — Balcão das Sucessões PRO

Ciclo pedido: **10 iterações seguidas** para analisar o protótipo, perceber os conceitos e construir uma aplicação muito melhor, a nível profissional, como PWA.
Nota: a EscolaPlay foi referida apenas como exemplo de formato (PWA) — nada é reaproveitado dela.

**Estado do ciclo 1: 10 de 10 iterações concluídas — versão 2.0.**

## Ciclo 2 — «10 vezes seguidas com melhorias e testes» (iterações 11–20)

**Estado do ciclo 2: iterações 11–17 concluídas (17/20).**

| # | Tema | Conteúdo previsto |
|---|---|---|
| 11 | ~~Testes de componentes e invariantes~~ | ✅ concluída |
| 12 | ~~Motor jurídico aprofundado~~ | ✅ concluída |
| 13 | ~~Prazos avançados~~ | ✅ concluída |
| 14 | ~~Partilha de dossier entre colegas~~ | ✅ concluída |
| 15 | ~~Cópias automáticas e partilha para a app~~ | ✅ concluída |
| 16 | ~~Anular ações e reciclagem~~ | ✅ concluída |
| 17 | ~~Painel de equipa e análise~~ | ✅ concluída |
| 18 | **Pesquisa e vistas guardadas** | Filtros avançados na lista de dossiers, vistas guardadas com nome, pesquisa global em notas, contactos e documentos; testes. |
| 19 | **Documentos avançados** | Pedidos de documentos por interessado, validade das certidões com avisos, pré-visualização de anexos, estados em lote; testes. |
| 20 | **Consolidação** | Auditoria final (acessibilidade, E2E alargado), manual e apresentação atualizados, versão 2.1, resumo. |



**Publicação (17 de setembro de 2026):** aplicação em https://nelsonsous.github.io/balcao-sucessoes/ (GitHub Pages, publicação automática por GitHub Actions a cada alteração: testes → build → deploy); código-fonte em https://github.com/nelsonsous/balcao-sucessoes; manual do utilizador (Word/PDF) e apresentação (PowerPoint/PDF) na pasta `docs/`.

### Iteração 17 — Painel de equipa e análise ✅

- **Agregações** (`lib/analytics.ts`, funções puras): por **mês** (dossiers abertos e encerrados, tarefas concluídas, prazos cumpridos e falhados por mês de conclusão), por **fase** (tarefas totais/concluídas/em aberto/em atraso, dossiers com a fase concluída e **mediana e média de dias desde a abertura até concluir a fase**) e por **pessoa** (dossiers ativos como responsável, tarefas em aberto e em atraso, concluídas nos últimos 30 dias, **taxa de prazos cumpridos** e tempo médio de conclusão — tarefas atribuídas ou, sem atribuição, dos dossiers de que é responsável); indicadores globais (dossiers ativos e encerrados, tarefas em aberto/atraso/concluídas, prazos cumpridos, tempo médio de encerramento); período de 3/6/12 meses ou tudo; filtro por pessoa; tarefas obsoletas e «não aplicável» excluídas; exportação CSV das tabelas.
- **Gráficos SVG acessíveis** (`components/charts.tsx`): barras verticais agrupadas ou empilhadas e barras horizontais, com `role="img"`, título e descrição textual com todos os valores, legenda quando há mais de uma série, rótulos diretos, tooltips nativos por barra, estado «sem dados» e **tabela alternativa** que substitui o gráfico ao toque de um botão; cores dos semáforos da aplicação (tokens), tema claro e escuro.
- **Página «Análise da equipa»** (`/analise`, barra lateral → Escritório, paleta): indicadores, «Dossiers por mês», «Prazos por mês», «Tempo até concluir cada fase», «Tarefas por fase» e tabela por pessoa com barra de prazos cumpridos; nota metodológica (encerramentos pela data da última alteração; indicadores de gestão interna). Os dados de demonstração passaram a espalhar as conclusões ao longo da vida de cada dossier, para a análise ter história.
- **Testes**: utilitários (meses, mediana, percentagens, prazo cumprido), série mensal com período e «tudo», indicadores/fases/tempos, por pessoa e filtro por pessoa, CSV, vazio; gráficos (título/descrição/legenda/tabela alternativa, empilhado sem dados, horizontal com notas); página (vazio, indicadores, gráficos, tabela por pessoa, filtros) — **193 testes**; novo passo E2E «Análise da equipa: gráficos acessíveis com tabela alternativa» — **14 passos**.

### Iteração 16 — Anular ações e reciclagem ✅

- **Anular** (`lib/undo.ts`, `components/UndoToasts.tsx`): pilha de ações reversíveis da sessão (até 30); cada ação mostra um aviso com o botão **Anular** e **Ctrl/⌘+Z** desfaz a última fora dos campos de texto (e sem diálogos abertos); ação «Anular a última ação» na paleta. Reversíveis: mudança de estado de tarefa (individual e em massa), alterações em massa (responsável, prazo, criticidade…), estado de documento, evento realizado/reaberto e todas as remoções — tarefa(s), interessado, bem, dívida, nota, contacto, evento, documento e **dossier inteiro**. Cada anulação fica no histórico («Anulado: …»).
- **Reciclagem** (`lib/recycle.ts`, tabela `trash`, base v5): o que se remove deixa de ser apagado — vai para a reciclagem com o registo completo (documentos levam o anexo; dossiers levam ficha, todas as tabelas e anexos), quem apagou e quando; **reposição** para o sítio de origem com registo no histórico («Reposto da reciclagem: …»); apagar definitivamente, esvaziar (tudo ou por dossier) e **expiração automática ao fim de 30 dias** (verificada ao arrancar). Repor um item de um dossier que está na reciclagem indica que se reponha primeiro o dossier. As cópias de segurança passam a incluir a reciclagem.
- **Página Reciclagem** (`/reciclagem`): filtros por dossier e por tipo, tabela com tipo, item, dossier, quem/quando apagou e dias até expirar, botões **Repor** / **Apagar**, «Esvaziar»; entrada na barra lateral com contador (só quando há itens), na paleta, em Definições → Dados e privacidade e no histórico de cada dossier («Reciclagem (n)»).
- **Histórico filtrável** (separador Histórico): pesquisa por texto, filtro por tipo de registo (só os presentes), «Só anulações e reposições», contagem «n de m» e tipo em cada entrada.
- **Testes**: reciclagem (mover/repor com histórico, documento com anexo, dossier inteiro como pacote — incluindo a ordem de reposição —, apagar/esvaziar por dossier/expirar), pilha de anular (registo, avisos, anular em concreto, limite), ações reversíveis (estado, remoção, massa, documento com anexo, evento, dossier), histórico filtrável (tipo, texto, anulações, ligação para a reciclagem) e página Reciclagem (lista, filtro, repor item e dossier) — **183 testes**; novo passo E2E «Anular a última ação pelo aviso» — **13 passos**.

### Iteração 15 — Cópias automáticas e partilha para a app ✅

- **Cópias automáticas para uma pasta** (`lib/autoBackup.ts`, File System Access API — Chrome/Edge em computador): o utilizador escolhe uma pasta do dispositivo (o handle fica guardado em IndexedDB); a aplicação escreve cópias **sempre cifradas** (AES-256-GCM, palavra-passe própria que fica só no dispositivo) com nome `balcao-sucessoes-auto-<data>-<hora>.cifrada.json`, um `LEIA-ME.txt` com as instruções de reposição e **rotação** (mantém as últimas 5/10/20/50). Se a pasta for sincronizada (OneDrive, SharePoint, Google Drive, NAS), o escritório fica com um repositório central de cópias sem servidor próprio.
- **Agendador** (`components/AutoBackupRunner.tsx`): corre ao arrancar, a cada minuto e quando a aplicação deixa de estar visível; só copia quando há alterações desde a última cópia (ficha dos dossiers ou histórico), segundo a frequência — a cada alteração (intervalo mínimo de 10 min), diária ou semanal; a cópia automática também conta como cópia de segurança para o lembrete semanal. Quando o navegador exige nova autorização da pasta, avisa com um toast cuja ação «Autorizar» pede a permissão e retoma; erros ficam registados e visíveis nas definições.
- **Definições → Cópias automáticas** (`AutoBackupCard`): estado, pasta, última cópia, botões «Escolher pasta…», «Autorizar pasta», «Copiar agora», palavra-passe com força, frequência, cópias a manter, anexos, ativação (só com pasta e palavra-passe); aviso para navegadores sem suporte.
- **Partilha para a app (Web Share Target)**: o manifesto declara `share_target` (POST multipart com título, texto, ligação e ficheiros — PDF, imagens, Office, e-mails); o service worker (`public/sw-extra.js`) recebe a partilha, guarda-a numa caixa de entrada IndexedDB própria (`lib/shareInbox.ts`) e redireciona para a nova página **Recebidos** (`/recebidos`), onde se escolhe o dossier e cada item passa a **documento recebido com anexo** (ficheiros) ou a **nota** (texto/ligação), ou é ignorado. Entrada «Recebidos» na barra lateral (só quando há itens, com contador), na paleta e aviso ao arrancar; explicação no cartão «Aplicação». Android com a app instalada; no iPhone a partilha direta ainda não é suportada pelo sistema.
- **Testes**: pasta em memória com o subconjunto da API (escrita cifrada legível com a palavra-passe, LEIA-ME uma vez, rotação que não toca em ficheiros estranhos), matriz de agendamento (frequências, sem dados, nada mudou, intervalo mínimo), ciclo do agendador (desligado, sem pasta, sem permissão, feito, nada a fazer, «copiar agora», erro registado); caixa de entrada (guardar, listar, contar, remover, reconstruir ficheiro, títulos); página Recebidos (estado vazio, anexar ficheiro como documento e ligação como nota, ignorar) — **169 testes**; novo passo E2E «Recebidos: manifesto e anexar ao dossier» — **12 passos**.

### Iteração 14 — Partilha de dossier entre colegas ✅

- **Ficheiro de partilha** (`lib/share.ts`): um único dossier autocontido — ficha e questionário, tarefas, interessados, bens, passivo, notas, contactos, histórico, agenda, documentos e anexos (base64) — mais os membros da equipa referenciados (responsável e atribuições), para os nomes aparecerem no destino; nome `dossier-<referência>-<data>[.cifrado].json`; **cifra opcional AES-256-GCM** com palavra-passe (PBKDF2) e pista em claro; validação (recusa cópias de segurança completas indicando o sítio certo, versões futuras e tabelas inválidas) e normalização (campos em falta preenchidos com os valores por omissão, `caseId` forçado, registos sem identificador ignorados).
- **Juntar com deteção de conflitos**: pré-visualização tabela a tabela (novos / atualizados / mantidos / iguais), comparação registo a registo com conteúdo normalizado, ficha do dossier comparada por data de alteração; quatro regras — **manter o mais recente** (por `updatedAt`, recomendada), **preferir o ficheiro**, **preferir este dispositivo** (só acrescenta) e **importar como novo dossier** (identificadores novos com referências cruzadas remapeadas — interessado do documento, anexo — e nova referência interna); histórico só de acréscimo; anexos em falta detetados e o documento fica sem anexo com aviso; membros em falta acrescentados; **nada é apagado** — o que só existe neste dispositivo mantém-se.
- **Registo no histórico**: «Dossier exportado para partilha — n anexo(s), cifrado», «Dossier importado de ‹colega› (exportado em …): n registos, n anexo(s)» ou «Dossier juntado com a versão de ‹colega› …: n novos, n atualizados, n mantidos — regra: …», com o autor local.
- **Interface**: menu do dossier → **Partilhar com colega…** (anexos com contagem e tamanho, cifra, pista); lista de dossiers → **Importar dossier** (escolher ficheiro ou colar o conteúdo, palavra-passe com pista, pré-visualização com tabela e regras de junção, abre o dossier no fim); paleta de comandos → «Importar dossier partilhado» (`/dossiers?importar=1`). As folhas carregam a pedido (fora do pacote principal).
- **Testes**: 8 do módulo (exportação com membros e anexos, validação, cifra, importação em dispositivo vazio, junção com conflitos, regras ficheiro/local incluindo a ficha, cópia com remapeamento, anexos em falta) e 4 de componentes (colar e importar, ficheiro cifrado com pista e mudança de regra, ficheiro recusado, exportação cifrada registada no histórico) — **162 testes**; novo passo E2E «Importar dossier partilhado por um colega» — **11 passos**.

### Iteração 13 — Prazos avançados ✅

- **Motor de contagem de prazos** (`engine/prazos.ts`): dias corridos, dias úteis, meses e anos a contar de uma data-âncora, com as regras gerais — o dia do facto não conta (CC art. 279.º/b), termo em dia não útil transferido para o 1.º dia útil seguinte (CC art. 279.º/e; CPC art. 138.º/2, opcional), fim de mês nos prazos em meses (CC art. 279.º/c) e **suspensão nas férias judiciais** para prazos processuais (CPC art. 138.º/1), tanto em dias corridos como em dias úteis; explicação passo a passo, base legal e períodos suspensos; lista de prazos frequentes (contestação, apelação, reclamação de créditos, aceitação/repúdio, prazos administrativos, reclamação graciosa) como ponto de partida a validar.
- **Calculadora de prazos** (`/prazos`, barra lateral e paleta): formulário com data, quantidade, unidade, prazo judicial e transferência; resultado com termo, passos e base legal; **agendar** o prazo na agenda (evento «Prazo», opcionalmente ligado a um dossier).
- **Na gaveta da tarefa**: botão **Calcular…** ao lado do prazo, pré-preenchido com a data do óbito; o resultado passa a ser o prazo da tarefa com a regra registada («Regra do prazo») e uma entrada no histórico.
- **Testes**: dias corridos com fim de semana, dias úteis com feriado (8 de dezembro), prazo judicial de verão (10/7 + 30 dias → 25/9) e de Natal em dias úteis, meses/anos em fim de mês, validação e descrição, propriedades (termo sempre posterior ao início, monótono, nunca em dia não útil com transferência) — **150 testes**.

### Iteração 12 — Motor jurídico aprofundado ✅

- **Três perguntas novas** no passo *Família*: separação de pessoas e bens ou divórcio pendente (só com cônjuge), herdeiros a residir no estrangeiro e herdeiros de paradeiro desconhecido (27 perguntas).
- **Quatro regras novas** (59) e **oito tarefas novas** (80), todas com orientação, documentos e referências: efeitos da separação/divórcio pendente na vocação do cônjuge (arts. 2133.º/3, 1785.º/3 e 1795.º-A CC — crítica); procurações consulares/apostiladas e NIF + representante fiscal dos herdeiros não residentes (LGT art. 19.º/6-7); diligências de localização de herdeiros ausentes com citação edital e curadoria provisória (CC arts. 89.º ss.; CPC arts. 225.º e 240.º — crítica); quota do falecido nas contas conjuntas (CC art. 516.º); seguros de vida ligados a créditos (RJCS); certidões de dívidas fiscais e contributivas (CC art. 2071.º; LGT art. 29.º/2) em todos os dossiers; IRS dos rendimentos da herança indivisa (CIRS art. 19.º) quando há imóveis.
- **IMT sobre o excesso de imóveis** no mapa de partilha: por herdeiro, valor dos imóveis atribuídos e excesso face à quota — assinalado no cartão e no relatório com a base legal (CIMT art. 2.º/5/c; verba 1.1 TGIS).
- **Testes**: ativação e não ativação de cada regra nova, dimensão do motor, propriedades com 400 questionários aleatórios (sem erros, chaves únicas, fases válidas, conteúdo completo, tarefas de base sempre presentes) e excesso de imóveis; **143 testes**.

### Iteração 11 — Testes de componentes e invariantes ✅

- **Testes de componentes** (jsdom + Testing Library, `src/test/setup.ts` e `src/test/render.tsx` com os contextos da aplicação): painel com dados fictícios (indicadores, saudação, próximas ações com ligações `?tarefa=`), checklist (lista por fase, abertura da gaveta, mudança de estado pelo semáforo com histórico, ações em massa, vista em quadro), paleta de comandos (navegação por Enter, pesquisa sem acentos e por referência) e ecrã de bloqueio (PIN errado/certo, bloquear agora).
- **Testes de propriedades** (fast-check): quotas somam sempre 1, frações normalizadas e álgebra correta, legítima ∈ [0, 1], valores nunca NaN, cônjuge com ¼ garantido, determinismo; parsers robustos a qualquer texto (`parseAmount`, `parseShare`, `maskName`, `normalize`) e CSV sempre bem formado.
- **Testes de biblioteca** novos: cópias de segurança (exportar/importar em modo substituir e juntar com anexos, cifradas, rejeição de ficheiros inválidos), importação para a calculadora (cônjuge, filhos, netos, repúdio, valores, notas), módulo internacional (estado, sugestões, estraneidade), documentos (geração, estados, anexos, ficheiros largados, classificação) e todas as ações CRUD (dossier, reconciliação, tarefas, interessados, bens, dívidas, notas, contactos, eventos, equipa).
- **Cobertura de código** (v8) com limiar na publicação — motor e biblioteca: 84,6 % instruções, 88,3 % linhas, 82,7 % funções, 69,6 % ramos (`npm run test:coverage`).
- **Correções encontradas pelos testes**: `documentFromFile` devolvia o registo sem o anexo (e a remoção deixava o ficheiro órfão) — agora devolve o registo atualizado, marca o documento como recebido e a remoção relê o registo; serialização das cópias sem `FileReader` (funciona também em service workers e Node); o Certificado Sucessório Europeu deixou de contar como documento que o cliente pode fornecer.
- **134 testes** (19 → 24 ficheiros).

---

## Ponto de partida (iteração 1)

O projeto-piloto original — um balcão único para as sucessões do escritório — definiu os conceitos que esta versão preserva e aprofunda:

- um balcão só do escritório: organizar, acompanhar e identificar o próximo passo;
- “perguntas certas → dossier certo”;
- a checklist é o motor: pergunta → condição → tarefa → semáforo;
- “O que está a bloquear?” e a próxima ação;
- interessados, vários tipos de património e memória prática (notas e contactos);
- visão global em tempo real;
- percurso: protótipo → inputs da equipa → prioridades → piloto fictício → validação/segurança → crescimento;
- apenas dados fictícios em demonstração.

Esta versão acrescenta, entre outros: notas e contactos por dossier, questionário que reconcilia a checklist quando as respostas mudam, prazos legais calculados, histórico de alterações, cópias de segurança, funcionamento offline e regras jurídicas mais finas (regime de bens e meação, união de facto, menores, representação, doações, seguros, Certificado Sucessório Europeu).

## Iteração 1 — Fundação profissional ✅

- Projeto novo `balcao-sucessoes-pro/` (React 19 + TS 7 strict + Vite 8 + PWA Workbox + IndexedDB/Dexie).
- Sistema de design próprio (tokens claro/escuro, índigo da marca `#2d39b9`, Inter + Fraunces offline), ícones e manifest PWA com atalhos.
- Motor de regras com 55 regras e 72 modelos de tarefa com referências legais; questionário com 24 perguntas condicionais; prazos legais automáticos; reconciliação da checklist; semáforo global; próxima ação; bloqueios.
- Ecrãs: Visão geral, Dossiers (cartões/tabela, filtros, ordenação), Nova sucessão (assistente com pré-visualização ao vivo), Dossier (checklist por fases, gaveta de tarefa, interessados, património + massa hereditária, notas & contactos, questionário, histórico), O que está a bloquear?, Definições (perfil, equipa, tema, cópias de segurança, privacidade, instalação).
- Onboarding, dados de demonstração fictícios, pesquisa global (`/`), atalho `N`, aviso de nova versão, error boundary com recuperação do service worker.
- 19 testes unitários (prazos, regras, questionário, NIF, próxima ação, reconciliação com IndexedDB). Typecheck e build limpos. Verificado no browser (desktop e telemóvel).

## Iteração 2 — Agenda e prazos ✅

- **Calendário português** (`engine/calendar.ts`): Páscoa (algoritmo de Meeus), 13 feriados nacionais, Carnaval (facultativo), feriado municipal configurável (11 concelhos ou dia-mês personalizado), dias úteis, 1.º dia útil seguinte, férias judiciais (22/12–3/1, Ramos–Segunda de Páscoa, 16/7–31/8).
- **Agenda** (`/agenda`): vista mensal com feriados, férias judiciais sombreadas, prazos/eventos/contactos por cor, painel do dia, vista em lista (ultrapassados + próximos 60/150 dias), filtros por tipo e responsável, duplo clique para agendar.
- **Eventos** (nova tabela, base de dados v2): escrituras, reuniões, diligências, prazos próprios e lembretes, com hora, local, dossier e responsável; aviso quando a data calha num feriado ou fim de semana.
- **Exportação `.ics`** (RFC 5545, fuso Europa/Lisboa, alarmes às 09:00 três dias antes dos prazos e 1 h antes dos eventos) — agenda global (90 dias, mês, tudo) e por dossier.
- **Dossier**: novo separador *Agenda* com linha temporal; ligações diretas `?tarefa=` abrem a tarefa certa a partir da agenda e do painel.
- **Prazos**: aviso quando um prazo termina num dia não útil, com o 1.º dia útil seguinte (ex.: 31/10/2026 sábado → 2/11, porque 1/11 é feriado) — mantendo a data original por prudência.
- **Painel**: faixa “próximos 7 dias” (com atrasados) e “Agenda próxima” unificada.
- **Lembretes**: resumo diário ao abrir a app, notificações do sistema opcionais (com clique que abre a agenda, via extensão do service worker) e contador de pendentes no ícone da app instalada (Badging API).
- **Definições**: feriado municipal, férias judiciais, notificações (ativar/testar), contador no ícone.
- Navegação: *Agenda* na barra lateral e na barra inferior do telemóvel; Definições no topo em mobile.
- Correções: foco automático dentro de `<dialog>` (o `autoFocus` do React não funciona com `showModal`), separadores compactos por *container query*, dados fictícios sempre em dias úteis.
- **28 testes** (novos: Páscoa, feriados, dias úteis, férias judiciais, grelha do mês, `.ics` com dobragem UTF-8 e alarmes).

## Iteração 3 — Calculadora sucessória ✅

- **Motor jurídico com frações exatas** (`engine/succession.ts`, `engine/fraction.ts`): classes de sucessíveis (art. 2133.º), preferência de classes e graus, cônjuge com ¼ garantido (art. 2139.º), cônjuge + ascendentes ⅔/⅓ (art. 2142.º), cônjuge sozinho (art. 2144.º), irmãos germanos ×2 (art. 2146.º), colaterais até ao 4.º grau (arts. 2147.º–2148.º), Estado (art. 2152.º).
- **Direito de representação** por estirpes, recursivo (netos, bisnetos, sobrinhos, sobrinhos-netos), incluindo repúdio e indignidade (arts. 2039.º, 2042.º, 2044.º).
- **Legítima e quota disponível** (arts. 2156.º–2161.º), com a parte de cada legitimário; **meação** do cônjuge (arts. 1688.º–1689.º); massa de cálculo com passivo e doações (art. 2162.º); **inoficiosidade** das disposições a terceiros (arts. 2168.º e ss.); estimativa de **Imposto do Selo** 10% para irmãos/colaterais.
- **Fundamentação passo a passo** com referências legais e avisos (ex.: “os pais afastam os avós”).
- **Visualização**: barra 100% empilhada com tooltip por segmento e tabela completa (paleta categórica validada para daltonismo e contraste nos dois temas), medidor da legítima, **árvore genealógica** (avós → pais → irmãos e de cujus com cônjuge → filhos → netos) com a quota de cada herdeiro.
- **Página `/calculadora`** com exemplos, importação de qualquer dossier, “Guardar em…” e impressão; **separador “Quotas”** em cada dossier, pré-preenchido a partir dos interessados, regime de bens, património e passivo, com gravação automática e notas do que rever.
- Atalhos de ferramentas no painel; `MoneyInput` partilhado.
- **45 testes** (17 novos da calculadora: todas as classes, representação, repúdio, meação, legítima, inoficiosidade, Imposto do Selo).

## Iteração 4 — Documentos e minutas ✅

- **Base de dados v3**: tabelas `documents`, `files` (anexos binários guardados à parte, offline) e `templates` (minutas do escritório); eliminação em cascata inclui anexos.
- **Separador “Documentos”** em cada dossier: checklist documental gerada automaticamente a partir dos documentos das tarefas e dos interessados (identificação, certidões, procurações, representantes de menores), sem duplicados e sem genéricos redundantes; 10 categorias; estados (em falta → pedido → recebido → validado / N/A) com datas; **arrastar-e-largar** ficheiros (até 25 MB) ou anexar por documento; abrir/descarregar anexos; notas.
- **Minutas** (`/minutas` e a partir do dossier): 11 minutas-base — emails ao cliente (documentos em falta, ponto de situação, marcação de escritura), carta ao cabeça-de-casal, cartas a bancos e ao Banco de Portugal, pedido de informação sobre testamento, procuração forense, nota interna, **carta ao notaire em francês** e **carta a banco estrangeiro em inglês**.
- **Campos automáticos** (35): falecido, cliente, cônjuge, cabeça-de-casal, prazos calculados, progresso, valores, próxima escritura e listas (herdeiros, bens, bancos, dívidas, documentos em falta — só os que o cliente pode fornecer —, próximas ações, prazos); datas e valores no formato da língua; parâmetros com sugestões (ex.: bancos do património); campos em falta realçados.
- **Compositor**: pré-visualização em “papel”, edição do texto, copiar, **Word (.docx real, Office Open XML)**, PDF (impressão só do documento), email (abre o cliente de email com assunto e texto), **guardar no dossier** (o .docx fica anexado nos Documentos).
- **Minutas do escritório**: criar, duplicar a partir das base, editar com paleta de campos e pré-visualização; validação de campos desconhecidos.
- **Definições**: dados do escritório para o cabeçalho das cartas (localidade, morada, email, telefone); cópia de segurança com anexos (base64) opcional e tamanho dos anexos.
- Validação: os `.docx` gerados abrem no LibreOffice e convertem para PDF corretamente (XML bem formado, 66 partes verificadas).
- **55 testes** (novos: preenchimento, markdown mínimo, rótulos de parâmetros, integridade das minutas-base, pacote .docx, classificação e geração de documentos).

## Iteração 5 — Relatórios e relação de bens ✅

- **Modelo de documento com tabelas**: `DocBlock` ganha o tipo `table` (cabeçalho, larguras relativas, alinhamento numérico) e o estilo `small`; o gerador `.docx` escreve tabelas Office Open XML reais (`w:tbl`, grelha, cabeçalho repetido, linhas indivisíveis); a pré-visualização em papel e a impressão renderizam as mesmas tabelas; o texto simples (copiar/email) exporta-as com `|`.
- **Relatórios do dossier** (`lib/reports.ts`, botão **Relatório** no cabeçalho do dossier), com pré-visualização, Word, PDF e “guardar no dossier”:
  - **Relatório interno** — identificação, estado (progresso, fase, contadores), o que está a bloquear, próximas ações, checklist por fase (tarefas em aberto com estado/prazo/responsável), interessados, património e passivo com totais (meação), quotas guardadas, documentos em falta, agenda, notas importantes, observações e últimos contactos.
  - **Ponto de situação para o cliente** — linguagem simples e sem notas internas nem referências: onde estamos, o que já está feito, o que estamos a tratar, o que precisamos de si (só documentos que o cliente pode fornecer), próximos passos e prazos, contactos do escritório.
  - **Relação de bens** — verbas numeradas por grupo (imóveis com freguesia/artigo/descrição predial, contas com IBAN, participações com NIPC e %, veículos com matrícula, aforro, outros), natureza, quota-parte, valor e base; passivo; resumo com ativo bruto, meação, passivo e valor da herança.
  - **Mapa de partilha** — valor da herança (da simulação ou do património), quotas de cada herdeiro, atribuição dos bens e **tornas** a pagar/receber.
- **Mapa de partilha interativo** no separador *Quotas*: cada bem é atribuído a um herdeiro (ou “venda / partilha em dinheiro”); o valor que integra a herança respeita a quota-parte do de cujus e a meação (metade dos bens comuns); direito, recebido em bens e tornas por herdeiro; notas da partilha; gravação automática (`partilhaJson`).
- **Exportação CSV** (Excel em português: `;`, vírgula decimal, BOM, fórmulas neutralizadas): lista de dossiers filtrada (20 colunas), bloqueios (todos os grupos) e relação de bens/passivo por dossier.
- **Separador Património**: botões *Relação de bens* e *CSV*.
- **67 testes** (novos: quota-parte e valor na herança, numeração e descrição das verbas, totais com meação, tornas do mapa de partilha, conteúdo dos quatro relatórios — incluindo a exclusão de notas internas no relatório para o cliente —, tabelas `.docx`, CSV).

## Iteração 6 — Produtividade ✅

- **Paleta de comandos** (`⌘K` / `Ctrl+K`, botão no topo): ir para qualquer página, abrir dossiers (nome, referência, falecido, cliente, etiquetas), tarefas em aberto e minutas (abre logo o compositor via `/minutas?usar=…`), executar ações (nova sucessão, exportar cópia de segurança, tema, instalar). Pesquisa sem acentos, por palavras em qualquer ordem e por iniciais (“vg” → Visão geral); recentes guardados localmente; navegação por teclado.
- **As minhas tarefas** (`/minhas`, barra lateral com contador de atrasadas/hoje): trabalho em aberto atribuído à pessoa (ou dos dossiers de que é responsável), em dossiers ativos, agrupado em Atrasadas · Para hoje · Esta semana · Próximas · Sem prazo, com mudança de estado na linha; a identidade define-se em Definições → Perfil (“Na equipa, eu sou”) ou na própria página.
- **Checklist em quadro (Kanban)**: vista Lista/Quadro por dossier (preferência guardada); colunas por estado, cartões com fase, prazo, responsável e criticidade; **arrastar e largar** muda o estado.
- **Ações em massa** na checklist: modo de seleção com caixas por tarefa e “selecionar todas as visíveis”; barra fixa para mudar estado, atribuir responsável, definir prazo, marcar/desmarcar crítica e remover tarefas próprias (as geradas por regras marcam-se N/A); uma entrada de histórico por dossier e ação.
- **Modelos de dossier** (base de dados v4, tabela `caseTemplates`, incluída nas cópias de segurança): quatro modelos-base (cônjuge e filhos; sem descendentes — irmãos; ligação a França com tarefa própria; testamento e menores) e modelos do escritório guardados a partir de qualquer dossier (menu ⋯ → *Guardar como modelo*: respostas, etiquetas, prioridade e tarefas próprias, sem dados pessoais). No assistente, “Começar a partir de um modelo” preenche o questionário (com confirmação se já havia respostas) e acrescenta as tarefas próprias ao criar; gestão em Definições.
- **Dossiers em quadro por fase**: terceira vista da lista (cartões · tabela · quadro), uma coluna por fase atual com semáforo, progresso, próxima ação e responsável.
- **76 testes** (novos: pontuação e ordenação da paleta, agrupamento das minhas tarefas, modelos-base geram checklists válidas, modelo a partir de dossier sem dados pessoais, ações em massa com histórico por dossier).

## Iteração 7 — Segurança e privacidade ✅

- **Bloqueio por PIN** (`lib/crypto.ts`, `lib/lock.ts`, `components/LockScreen.tsx`): PIN de 4–8 algarismos guardado como PBKDF2-SHA256 com sal (nunca em claro), ecrã de bloqueio a cobrir toda a aplicação ao abrir e a pedido (“Bloquear agora” na barra lateral, nas Definições e na paleta), **auto-bloqueio** por inatividade (1/5/15/30 min) e ao mudar de aplicação/separador, espera crescente após 5 tentativas falhadas (30 s → 10 min), PIN óbvios recusados, alteração com o PIN atual e remoção com confirmação.
- **Cópias de segurança cifradas**: exportação com palavra-passe (AES-256-GCM, chave derivada por PBKDF2 com 250 000 iterações, sal e IV aleatórios, pista opcional guardada em claro); indicador de força; ficheiro `.cifrada.json`. Importação deteta o envelope, pede a palavra-passe e distingue palavra-passe errada de ficheiro inválido. Data da última cópia nas Definições e **lembrete semanal** quando há dossiers reais e a última cópia tem mais de 7 dias (ou nunca foi feita).
- **Modo privacidade** (barra lateral, Definições e paleta): oculta por desfocagem os nomes de dossiers, falecidos, clientes e interessados nas listas, no painel, na agenda, nas minhas tarefas, na pesquisa, na paleta e nos documentos gerados — para partilhar o ecrã sem expor dados.
- **Importação do protótipo original**: cola-se o JSON extraído do `localStorage` (instruções e comando prontos a copiar); converte respostas (rótulos → valores), estados das tarefas (casamento por semelhança de títulos ≥ 60 % de palavras significativas; as não reconhecidas passam a tarefas próprias com a fase certa), interessados (qualidade → papel, procuração), bens (tipo, país, valor), responsável (cria a pessoa na equipa), cliente, notas importantes, observações e registo de contactos; dossiers marcados com a etiqueta «Importado».
- **Endurecimento**: Content Security Policy por `<meta>` (`default-src 'self'`, sem scripts inline — o script do tema passou para ficheiro externo —, `object-src 'none'`, `base-uri 'self'`), `Referrer-Policy: no-referrer`.
- **86 testes** (novos: cifra/decifra e rejeição de palavra-passe errada ou ficheiro alterado, força da palavra-passe, PIN com sal e esperas, máscara de nomes, conversão das respostas do protótipo, casamento de tarefas por semelhança e importação completa com estados, interessados, bens, cliente, notas e contactos).

## Iteração 8 — Internacional ✅

- **Motor internacional** (`engine/international.ts`): lei aplicável e competência segundo o Regulamento (UE) n.º 650/2012 — regra da residência habitual (art. 21.º/1), exceção da ligação mais estreita (21.º/2), escolha da lei da nacionalidade (22.º, com validação), unidade da sucessão (23.º), reenvio para Estados terceiros (34.º), competência geral (4.º) e subsidiária (10.º), acordo de competência (5.º–7.º), avisos para Dinamarca/Irlanda/Reino Unido; disponibilidade e razão do **Certificado Sucessório Europeu**; **regime de circulação de documentos** por país (UE: Reg. 2016/1191 sem apostila; Convenção da Haia: apostila; outros: legalização consular); **prazos de referência por país** contados do óbito (França 6/12 meses, Espanha 6, Alemanha 3, Bélgica 4/5, Países Baixos 8, Reino Unido 6/12, EUA 9, Brasil 2 para o inventário, Canadá, Venezuela, África do Sul 14 dias), com base legal e notas — sempre marcados como referência a validar.
- **Separador «Internacional»** no dossier (aparece com elementos de estraneidade: óbito, residência, nacionalidade, bens ou entidades noutro país): formulário de residência habitual, nacionalidades, escolha de lei e ligação mais estreita com **análise passo a passo** e badges (lei aplicável, competência, CSE); ficha do **CSE** (estado, finalidades, Estados onde será usado, datas de pedido e emissão, notas, lembretes dos arts. 63.º–70.º); tabela de **documentos e circulação** por país e lista dos documentos que normalmente circulam; **prazos por país** com contagem; **entidades no estrangeiro** (notaires, bancos, tribunais, consulados, tradutores, registos, fisco) com contacto e notas. Tudo guardado no dossier (`intlJson`).
- **Ponto de situação para o cliente em francês e inglês** (seletor de língua no relatório): títulos, textos, cabeçalho, fases e tipos de evento traduzidos, datas no formato da língua; nota de que os títulos das diligências estão em português.
- **Minutas novas**: «E-mail au client — documents manquants» (FR) e «Email to client — status update» (EN), com os campos automáticos (13 minutas-base).
- **94 testes** (novos: lei aplicável por residência, escolha válida/inválida, residência fora da UE com competência subsidiária e reenvio, CSE disponível/desnecessário, avisos RU/DK, regime de documentos por país, prazos por país com óbito dentro/fora, fins de mês e ordenação; relatório do cliente em FR/EN).

## Iteração 9 — Qualidade ✅

- **Acessibilidade (WCAG 2.2 AA)**: auditoria automática com axe-core em 16 ecrãs (painel, dossiers, assistente, todos os separadores do dossier, bloqueios, minhas tarefas, agenda, calculadora, minutas, definições): **547 → 0 violações**. Correções: texto discreto com contraste ≥ 4,5:1 nos dois temas (`--text-3`), cabeçalhos do funil, dias fora do mês e fins de semana da agenda, nós esbatidos da árvore genealógica, passos inativos do assistente, cores de avatar e do dia em atraso; ordem dos títulos (h1 → h2) nos estados vazios, secções da calculadora e minutas; `role="img"` no símbolo de casamento; ligações em texto corrido sublinhadas; alvos de toque ≥ 24 px nos chips do calendário.
- **Desempenho**: divisão de código por rota (agenda, calculadora, minutas, definições, minhas tarefas, bloqueios, assistente) e por separador pesado do dossier (quotas, documentos, internacional, agenda) mais paleta de comandos e relatórios a pedido — pacote inicial de **843 kB → 561 kB** (gzip 255 → 172 kB) com 12 pedaços carregados só quando necessários; fontes só nos subconjuntos latino/latino alargado (**10 → 4 ficheiros woff2**), menos precache e arranque mais rápido offline.
- **Testes ponta a ponta** (`npm run e2e`, `e2e/smoke.mjs`, Chrome do sistema via puppeteer-core): boas-vindas e dados fictícios, lista e abertura de dossier, gaveta da tarefa, mudança de estado persistida após recarregar (com histórico), paleta de comandos, relatório, PIN (definir, bloquear, PIN errado, desbloquear), telemóvel (barra inferior, sem scroll horizontal), funcionamento offline com service worker e ausência de erros de JavaScript — **10 passos, integrados na publicação** (o deploy só acontece com unitários, E2E e build a passar).
- **Polimento móvel**: alvos de toque, sem overflow horizontal (verificado no E2E), áreas seguras e `prefers-reduced-motion` já existentes confirmados.
- 94 testes unitários + 10 passos E2E.

## Iteração 10 — Entrega ✅

- **Revisão final** de todas as áreas com a auditoria de acessibilidade a zero e os testes (94 unitários + 10 E2E) a passar; versão **2.0.0**.
- **Manual do utilizador** regenerado (Word e PDF): 18 capítulos e 7 anexos, 39 figuras reais — novos capítulos para relatórios, produtividade, segurança e privacidade, separador internacional, quadro Kanban e ações em massa, modelos de dossier, paleta de comandos, cópias cifradas e importação do protótipo; anexos com o histórico das versões e os prazos de referência por país.
- **Apresentação** regenerada (PowerPoint e PDF): 24 diapositivos com notas do orador, incluindo relatórios, produtividade, internacional e segurança; números atualizados; percurso dos dez ciclos.
- **Resumo executivo** (`docs/Resumo-Executivo.md`): o que é, como funciona, o que entrega, qualidade, limites e próximos passos possíveis.
- Pacote pronto a partilhar: aplicação publicada, código-fonte, documentação e histórico das iterações neste ficheiro.

## Plano das iterações (todas concluídas)

| # | Tema | Conteúdo previsto |
|---|---|---|
| 2 | ~~Agenda & prazos~~ | ✅ concluída |
| 3 | ~~Calculadora sucessória~~ | ✅ concluída |
| 4 | ~~Documentos & minutas~~ | ✅ concluída |
| 5 | ~~Relatórios & relação de bens~~ | ✅ concluída |
| 6 | ~~Produtividade~~ | ✅ concluída |
| 7 | ~~Segurança~~ | ✅ concluída |
| 8 | ~~Internacional~~ | ✅ concluída |
| 9 | ~~Qualidade~~ | ✅ concluída |
| 10 | ~~Entrega~~ | ✅ concluída |

## Registo técnico

- Base relativa (`./`) + *hash routing* → funciona em qualquer pasta de um servidor estático.
- Service worker em modo *prompt*: o utilizador escolhe quando atualizar (toast “Nova versão disponível”).
- `npm run build` executa o typecheck antes do build.
