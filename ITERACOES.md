# Iterações — Balcão das Sucessões PRO

Ciclo pedido: **10 iterações seguidas** para analisar o protótipo, perceber os conceitos e construir uma aplicação muito melhor, a nível profissional, como PWA.
Nota: a EscolaPlay foi referida apenas como exemplo de formato (PWA) — nada é reaproveitado dela.

**Estado do ciclo: iteração 4 de 10 concluída.**

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

## Plano das próximas iterações

| # | Tema | Conteúdo previsto |
|---|---|---|
| 2 | ~~Agenda & prazos~~ | ✅ concluída |
| 3 | ~~Calculadora sucessória~~ | ✅ concluída |
| 4 | ~~Documentos & minutas~~ | ✅ concluída |
| 5 | **Relatórios & relação de bens** | Relatório do dossier para cliente/interno (impressão/PDF), relação de bens, mapa de partilha, exportação CSV. |
| 6 | **Produtividade** | Paleta de comandos (⌘K), vista Kanban por fase, ações em massa, modelos de dossier, “as minhas tarefas”. |
| 7 | **Segurança** | Bloqueio por PIN, auto-bloqueio, cópias cifradas (AES-GCM), modo privacidade, importação do protótipo antigo. |
| 8 | **Internacional** | Módulo França/UE aprofundado (CSE, lei aplicável, checklist notaire), textos multilingues (PT/FR/EN) para minutas e relatórios. |
| 9 | **Qualidade** | Auditoria de acessibilidade (WCAG AA), desempenho (divisão de código, só subsets latinos das fontes), testes E2E, polimento móvel. |
| 10 | **Entrega** | Revisão final, guia de utilização, pacote pronto a partilhar, resumo executivo. |

## Registo técnico

- Base relativa (`./`) + *hash routing* → funciona em qualquer pasta de um servidor estático.
- Service worker em modo *prompt*: o utilizador escolhe quando atualizar (toast “Nova versão disponível”).
- `npm run build` executa o typecheck antes do build.
