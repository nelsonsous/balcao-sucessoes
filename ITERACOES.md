# Iterações — Balcão das Sucessões PRO

Ciclo pedido: **10 iterações seguidas** para analisar o protótipo, perceber os conceitos e construir uma aplicação muito melhor, a nível profissional, como PWA.
Nota: a EscolaPlay foi referida apenas como exemplo de formato (PWA) — nada é reaproveitado dela.

**Estado do ciclo: iteração 7 de 10 concluída.**

**Publicação (17 de setembro de 2026):** aplicação em https://nelsonsous.github.io/balcao-sucessoes/ (GitHub Pages, publicação automática por GitHub Actions a cada alteração: testes → build → deploy); código-fonte em https://github.com/nelsonsous/balcao-sucessoes; manual do utilizador (Word/PDF) e apresentação (PowerPoint/PDF) na pasta `docs/`.

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

## Plano das próximas iterações

| # | Tema | Conteúdo previsto |
|---|---|---|
| 2 | ~~Agenda & prazos~~ | ✅ concluída |
| 3 | ~~Calculadora sucessória~~ | ✅ concluída |
| 4 | ~~Documentos & minutas~~ | ✅ concluída |
| 5 | ~~Relatórios & relação de bens~~ | ✅ concluída |
| 6 | ~~Produtividade~~ | ✅ concluída |
| 7 | ~~Segurança~~ | ✅ concluída |
| 8 | **Internacional** | Módulo França/UE aprofundado (CSE, lei aplicável, checklist notaire), textos multilingues (PT/FR/EN) para minutas e relatórios. |
| 9 | **Qualidade** | Auditoria de acessibilidade (WCAG AA), desempenho (divisão de código, só subsets latinos das fontes), testes E2E, polimento móvel. |
| 10 | **Entrega** | Revisão final, guia de utilização, pacote pronto a partilhar, resumo executivo. |

## Registo técnico

- Base relativa (`./`) + *hash routing* → funciona em qualquer pasta de um servidor estático.
- Service worker em modo *prompt*: o utilizador escolhe quando atualizar (toast “Nova versão disponível”).
- `npm run build` executa o typecheck antes do build.
