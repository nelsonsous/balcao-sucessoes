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
| **Motor de regras** | 55 regras jurídicas e 72 modelos de tarefa (Código Civil, CIS, CIRS, CIMT, Reg. (UE) 650/2012…) que geram só o trabalho aplicável, cada tarefa com *porquê*, *como fazer*, documentos e referências. |
| **Checklist** | 10 fases, 5 estados (Pendente · Em curso · A aguardar terceiros · Concluída · N/A), tarefas críticas, filtros, pesquisa, tarefas próprias. |
| **Prazos legais** | Calculados a partir da data do óbito (ex.: Modelo 1 do Imposto do Selo até ao fim do 3.º mês seguinte; IRS; déclaration de succession em França 6/12 meses; caducidade do direito de aceitar). |
| **Agenda** | Calendário mensal e lista com feriados nacionais/municipais e férias judiciais; escrituras, reuniões, diligências e prazos próprios; exportação `.ics` (Outlook/Google/Apple) com alarmes; aviso de prazos que terminam em dia não útil; resumo diário, notificações e contador no ícone da app. |
| **Calculadora sucessória** | Quotas da sucessão legítima por classe (cônjuge com ¼ garantido, representação por estirpes, irmãos germanos/unilaterais, colaterais, Estado), legítima e quota disponível, meação, inoficiosidade, estimativa de Imposto do Selo, fundamentação com artigos e árvore genealógica; página própria e separador “Quotas” em cada dossier. |
| **Documentos** | Checklist documental gerada a partir das tarefas e dos interessados, estados com datas, anexos guardados offline (arrastar-e-largar), abrir/descarregar. |
| **Minutas** | 11 minutas-base (PT/FR/EN) e minutas do escritório com campos automáticos do dossier; pré-visualização, edição, Word (.docx), PDF, email e “guardar no dossier”. |
| **Relatórios** | Relatório interno, ponto de situação para o cliente (sem notas internas), relação de bens (verbas numeradas com elementos de identificação) e mapa de partilha com tornas — pré-visualização, Word, PDF e arquivo no dossier; exportação CSV de dossiers, bloqueios e património. |
| **O que está a bloquear?** | Por dossier e global: prazos ultrapassados, críticas por iniciar, dependências de terceiros, prazos a 30 dias. |
| **Reconciliação** | Alterar o questionário atualiza a checklist sem perder trabalho: tarefas novas aparecem, as intocadas que deixam de se aplicar saem, as que tinham trabalho ficam “a rever”. |
| **Interessados** | Qualidade sucessória, parentesco, cabeça-de-casal, menores/maiores acompanhados, procuração, aceitação/repúdio, NIF validado; sugestões automáticas a partir do questionário. |
| **Património** | Imóveis, contas, participações, veículos, aforro e bens no estrangeiro, com campos próprios; passivo; estimativa da massa hereditária com **meação** do cônjuge. |
| **Notas & contactos** | Notas fixadas, observações com gravação automática, registo de contactos com lembretes de seguimento — tudo **por dossier**. |
| **Histórico** | Registo automático de todas as alterações (quem, o quê, quando). |
| **Dados** | IndexedDB local, cópia de segurança/importação JSON, dados de demonstração fictícios, pedido de armazenamento persistente. |
| **PWA** | Instalável (desktop, Android, iOS), offline, atalhos, aviso de nova versão, tema claro/escuro, responsivo com navegação inferior no telemóvel. |

## Começar

```bash
npm install
npm run dev        # desenvolvimento em http://localhost:5173
npm test           # testes do motor, calendário, calculadora, relatórios e documentos (vitest)
npm run build      # typecheck + build de produção em dist/
npm run preview    # serve dist/ em http://localhost:4173 (com service worker)
```

## Documentação

| Documento | Formato |
|---|---|
| **Manual do utilizador** — todas as funcionalidades passo a passo, com figuras e anexos (fases e estados, questionário, catálogo das 72 tarefas, campos das minutas, roadmap, ficha técnica) | [Word (.docx)](docs/Balcao-das-Sucessoes-Manual-do-Utilizador.docx) · [PDF](docs/Balcao-das-Sucessoes-Manual-do-Utilizador.pdf) |
| **Apresentação** — 20 diapositivos com notas do orador: desafio, princípios, motor de regras, cada área da aplicação, privacidade, números, tecnologia, roadmap e como começar | [PowerPoint (.pptx)](docs/Balcao-das-Sucessoes-Apresentacao.pptx) · [PDF](docs/Balcao-das-Sucessoes-Apresentacao.pdf) |

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
