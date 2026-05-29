<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo.svg">
    <img alt="QueryLens" src="assets/logo.svg" width="480">
  </picture>
</p>

<p align="center">
  <strong>Visualizador interativo de consultas Oracle SQL</strong><br>
  Digite sua query, veja as relações entre tabelas em um grafo dinâmico.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Oracle_SQL-F80000?style=for-the-badge&logo=oracle&logoColor=white" alt="Oracle SQL">
  <img src="https://img.shields.io/badge/Cytoscape.js-3B8BDB?style=for-the-badge&logo=cytoscape&logoColor=white" alt="Cytoscape.js">
  <img src="https://img.shields.io/badge/Monaco_Editor-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="Monaco Editor">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="License MIT">
</p>

---

## ✨ Funcionalidades

- **🧠 Parser Oracle SQL customizado** — Analisa `SELECT`, `FROM`, `JOIN`s (INNER, LEFT, RIGHT, FULL, CROSS), `WHERE`, `GROUP BY`/`HAVING`/`ORDER BY`, `WITH` (CTE), `OVER`/`PARTITION BY` (funções de janela), subqueries escalares, `BETWEEN`, literais `DATE`/`TIMESTAMP`, concatenação `||`, `TO_DATE`/`TO_CHAR`, `CASE`, operadores de conjunto (`UNION`, `MINUS`, `INTERSECT`) e pula DDL (`CREATE VIEW ... AS`) automaticamente
- **🔗 Diagrama de relacionamento interativo** — Grafo com nós e arestas clicáveis, realce de vizinhança, tooltips com detalhes da consulta
- **🔢 Ordem de execução** — Nós numerados (1, 2, 3…) indicando a sequência lógica de execução da query
- **💰 Estimativa de custo heurística** — Painel colapsável com break-down de custos por operação (scan, join, filtro, ordenação, subquery) e arestas mais grossas para joins caros
- **🎨 Tema claro/escuro** — Paleta inspirada no Oracle Redwood, com alternância suave entre temas
- **📱 Responsivo** — Layout adaptável a desktop e mobile com toolbar compacta e painéis colapsáveis
- **🖼️ Exportar como PNG** — Baixe o diagrama como imagem PNG com um clique

## 🚀 Começando

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/query-lens.git
cd query-lens

# Inicie um servidor HTTP local
npx serve . -p 8080 --cors
```

Abra **http://localhost:8080** no navegador. Não há dependências para build — o projeto é HTML/JS puro carregado via `<script type="module">`.

## 📖 Como usar

1. Digite ou cole uma consulta Oracle SQL no editor à esquerda
2. Pressione **`Ctrl+Enter`** (ou **`Cmd+Enter`** no macOS) para renderizar
3. A query também é parseada automaticamente enquanto você digita (debounce de 500ms)
4. Passe o mouse sobre nós e arestas para ver detalhes
5. Clique em um nó para destacar suas conexões
6. Use a barra de ferramentas para trocar o layout, centralizar o grafo ou exportar como PNG

### 💡 Exemplo

```sql
SELECT
    o.order_id,
    c.first_name || ' ' || c.last_name AS customer_name,
    o.order_date,
    o.status
FROM orders o
INNER JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN addresses a ON c.customer_id = a.customer_id
WHERE o.order_date >= TO_DATE('2025-01-01', 'YYYY-MM-DD')
  AND o.status IN ('SHIPPED', 'DELIVERED')
ORDER BY o.order_date DESC
```

## 🏗️ Arquitetura

```
query-lens/
├── index.html            # Shell da SPA (Monaco + Cytoscape + UI)
├── styles/
│   └── main.css          # Todos os estilos (temas, layout, responsivo)
├── scripts/
│   ├── app.js            # Orchestrador — conecta parser, grafo e UI
│   ├── parser/           # Pipeline de análise SQL
│   │   ├── sql-parser.js           # Tokenizador + parser recursivo descendente
│   │   ├── ast-builder.js          # Construção e validação da AST
│   │   └── relationship-extractor.js  # Extração de tabelas e relacionamentos
│   ├── graph/            # Pipeline de renderização do grafo
│   │   ├── graph-builder.js        # Modelo do grafo a partir dos relacionamentos
│   │   ├── graph-renderer.js       # Cytoscape.js — renderização, interações, tooltips
│   │   └── graph-layout.js         # Configuração de layouts (force-directed, grid, etc.)
│   ├── analysis/
│   │   └── cost-estimator.js       # Estimativa heurística de custo da consulta
│   └── ui/               # Componentes de interface
│       ├── editor.js     # Integração com Monaco Editor
│       ├── toolbar.js    # Barra de ferramentas
│       └── notifications.js  # Notificações toast
└── tests/                # Suíte de testes (185 testes)
    ├── sql-parser.test.js
    ├── ast-builder.test.js
    ├── relationship-extractor.test.js
    ├── graph-builder.test.js
    ├── cost-estimator.test.js
    └── integration.test.js
```

### 🔄 Pipeline de processamento

```
SQL digitada
    │
    ▼
┌─────────────────────┐
│  sql-parser.js       │  Tokenização e parser recursivo descendente
│  ast-builder.js      │  → AST (Abstract Syntax Tree)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  relationship-       │  Extração das tabelas fontes/alvo,
│  extractor.js        │  condições de JOIN, filtros WHERE, CTEs
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  cost-estimator.js   │  Atribuição de custos heurísticos por operação
│  graph-builder.js    │  → Modelo do grafo (nós + arestas + custos)
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  graph-renderer.js   │  Renderização Cytoscape.js com interatividade
│  graph-layout.js     │  Layout escolhido pelo usuário
└─────────────────────┘
```

## 🧪 Testes

```bash
npm test
```

A suíte contém **185 testes** divididos em 6 arquivos, cobrindo parser, AST, relacionamentos, grafo, estimativa de custo e cenários de integração. Usa o runner nativo `node --test` (Node.js 18+).

## 🛠️ Tecnologias

| Tecnologia | Versão | Finalidade |
|---|---|---|
| [Cytoscape.js](https://js.cytoscape.org/) | 3.28 | Renderização e layouts do grafo |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | 0.45 | Editor de SQL com syntax highlight |
| [Node.js](https://nodejs.org/) | 18+ | Runtime para testes |
| Oracle SQL Parser | — | Parser recursivo descendente customizado |

Nenhum bundler ou framework — JavaScript vanilla puro com módulos ES nativos.

## 📄 Licença

Distribuído sob licença MIT. Veja [LICENSE](LICENSE) para mais informações.

---