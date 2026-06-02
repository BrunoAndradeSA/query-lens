import { createEditor, setEditorTheme, formatInEditor, getEditorValue, setEditorValue } from './ui/editor.js';
import { createToolbar } from './ui/toolbar.js';
import { showNotification, clearNotifications } from './ui/notifications.js';
import { buildAst, validateSql } from './parser/ast-builder.js';
import { extractRelationships } from './parser/relationship-extractor.js';
import { buildGraphModel, getGraphStats } from './graph/graph-builder.js';
import { GraphRenderer } from './graph/graph-renderer.js';
import { estimateQueryCost, annotateGraphModel } from './analysis/cost-estimator.js';
import { debounce } from './utils/helpers.js';
import { detectCodeType, CODE_TYPE } from './parser/code-type-detector.js';
import { tokenize as plsqlTokenize, PLSQLParser } from './parser/plsql-parser.js';
import { analyzePackage } from './parser/package-analyzer.js';
import { buildCallGraphModel, getCallGraphStats } from './graph/call-graph-builder.js';

function isBenignMonacoError(msg) {
  return msg && (
    msg.includes('message channel closed') ||
    msg.includes('listener indicated an asynchronous') ||
    msg.includes('Failed to load')
  );
}

window.addEventListener('unhandledrejection', function (e) {
  var msg = (e.reason && (e.reason.message || e.reason.toString())) || '';
  if (isBenignMonacoError(msg)) {
    e.preventDefault();
  }
});

window.addEventListener('error', function (e) {
  if (isBenignMonacoError(e.message || '')) {
    e.preventDefault();
  }
});

const SAMPLE_SQL = `SELECT
  o.order_id,
  o.order_date,
  c.name AS customer_name,
  c.email,
  oi.product_id,
  p.name AS product_name,
  oi.quantity,
  oi.unit_price,
  (oi.quantity * oi.unit_price) AS total_amount,
  a.street_address,
  a.city
FROM
  orders o
  INNER JOIN customers c ON o.customer_id = c.customer_id
  INNER JOIN order_items oi ON o.order_id = oi.order_id
  INNER JOIN products p ON oi.product_id = p.product_id
  LEFT JOIN addresses a ON c.customer_id = a.customer_id AND a.address_type = 'SHIPPING'
WHERE
  o.order_date >= TO_DATE('2024-01-01', 'YYYY-MM-DD')
  AND o.status IN ('SHIPPED', 'DELIVERED')
  AND c.email IS NOT NULL
ORDER BY
  o.order_date DESC`;

const SAMPLE_PACKAGE = `CREATE OR REPLACE PACKAGE customer_pkg AS
  -- Constantes
  gc_max_credit CONSTANT NUMBER(10,2) := 50000.00;
  gc_min_order CONSTANT NUMBER(10,2) := 10.00;

  -- Variáveis globais
  gv_session_user VARCHAR2(100);
  gv_log_level VARCHAR2(20) := 'INFO';

  -- Procedures públicas
  PROCEDURE processar_cliente(
    p_cliente_id IN NUMBER,
    p_acao IN VARCHAR2 DEFAULT 'CONSULTAR'
  );

  -- Functions públicas
  FUNCTION calcular_limite_credito(
    p_cliente_id IN NUMBER
  ) RETURN NUMBER;

  FUNCTION obter_status_cliente(
    p_cliente_id IN NUMBER
  ) RETURN VARCHAR2;

END customer_pkg;
/

CREATE OR REPLACE PACKAGE BODY customer_pkg AS
  -- Variáveis privadas
  gv_process_count NUMBER := 0;

  -- Procedure privada
  PROCEDURE carregar_cliente(
    p_cliente_id IN NUMBER
  ) IS
    v_nome VARCHAR2(100);
  BEGIN
    SELECT name INTO v_nome FROM customers WHERE customer_id = p_cliente_id;
    gv_process_count := gv_process_count + 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      NULL;
  END;

  -- Function privada
  FUNCTION validar_cliente_ativo(
    p_cliente_id IN NUMBER
  ) RETURN BOOLEAN IS
    v_status VARCHAR2(20);
  BEGIN
    SELECT 'ACTIVE' INTO v_status FROM customers WHERE customer_id = p_cliente_id;
    RETURN TRUE;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN FALSE;
  END;

  -- Implementação da procedure pública
  PROCEDURE processar_cliente(
    p_cliente_id IN NUMBER,
    p_acao IN VARCHAR2 DEFAULT 'CONSULTAR'
  ) IS
    v_limite NUMBER(10,2);
  BEGIN
    carregar_cliente(p_cliente_id);

    IF p_acao = 'CONSULTAR' THEN
      v_limite := calcular_limite_credito(p_cliente_id);
    ELSIF p_acao = 'VALIDAR' THEN
      IF validar_cliente_ativo(p_cliente_id) THEN
        v_limite := calcular_limite_credito(p_cliente_id);
      END IF;
    END IF;
  END;

  -- Implementação da function pública
  FUNCTION calcular_limite_credito(
    p_cliente_id IN NUMBER
  ) RETURN NUMBER IS
    v_limite NUMBER(10,2);
    v_status VARCHAR2(20);
  BEGIN
    v_status := obter_status_cliente(p_cliente_id);

    IF v_status = 'PREMIUM' THEN
      v_limite := gc_max_credit;
    ELSE
      v_limite := 5000.00;
    END IF;

    RETURN v_limite;
  END;

  -- Implementação da function pública
  FUNCTION obter_status_cliente(
    p_cliente_id IN NUMBER
  ) RETURN VARCHAR2 IS
    v_total_orders NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_total_orders
    FROM orders WHERE customer_id = p_cliente_id;

    IF v_total_orders > 100 THEN
      RETURN 'PREMIUM';
    ELSIF v_total_orders > 0 THEN
      RETURN 'REGULAR';
    ELSE
      RETURN 'NEW';
    END IF;
  END;

END customer_pkg;
/`;

class App {
  constructor() {
    this.editor = null;
    this.renderer = null;
    this.toolbar = null;
    this.currentAst = null;
    this.currentGraphModel = null;
    this.currentCost = null;
    this.currentLayout = 'cose';
    this.statusBar = null;
    this.emptyObserver = null;
    this.tableWordMap = new Map();

    this.onEditorChange = debounce(() => {
      this.processSql();
    }, 500);
  }

  async init() {
    console.log('[QueryLens] Initializing...');

    await this.waitForMonaco();
    await this.waitForCytoscape();

    console.log('[QueryLens] Dependencies loaded');

    this.initEditor();
    this.initGraph();
    this.initTheme();
    this.initToolbar();
    this.initStatusBar();
    this.initSplitter();
    this.initCostToggle();
    this.initEmptyStateObserver();
    this.setupKeyboardShortcuts();

    console.log('[QueryLens] Components initialized');

    setEditorValue(this.editor, SAMPLE_SQL);
    this.processSql();
  }

  async waitForMonaco() {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    if (window.__monacoReady) {
      console.log('[QueryLens] Waiting for Monaco Editor...');
      await window.__monacoReady;
      console.log('[QueryLens] Monaco Editor loaded');
      setEditorTheme(theme);
      return;
    }
    return new Promise(resolve => {
      const check = () => {
        if (typeof monaco !== 'undefined' && typeof monaco.editor?.create === 'function') {
          setEditorTheme(theme);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  async waitForCytoscape() {
    if (typeof cytoscape !== 'undefined') return;
    console.log('[QueryLens] Waiting for Cytoscape...');
    return new Promise(resolve => {
      const check = () => {
        if (typeof cytoscape !== 'undefined') resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  initEditor() {
    const container = document.getElementById('editor-container');
    if (!container) {
      console.error('[QueryLens] editor-container element not found');
      return;
    }

    console.log('[QueryLens] Creating Monaco editor...');
    this.editor = createEditor(container);

    if (!this.editor) {
      console.error('[QueryLens] Failed to create editor');
      return;
    }

    console.log('[QueryLens] Editor created');

    this.editor.onDidChangeModelContent(() => {
      this.onEditorChange();
    });

    this.editor.onDidChangeCursorPosition(
      debounce((e) => {
        if (!this.renderer || !this.currentGraphModel) return;
        const model = this.editor.getModel();
        if (!model) return;
        const word = model.getWordAtPosition(e.position);
        if (!word || !word.word) return;
        const nodeId = this.tableWordMap.get(word.word.toLowerCase());
        if (!nodeId) return;
        const node = this.renderer.getNodeById(nodeId);
        if (node && node.length) {
          this.renderer.highlightNode(node);
        }
      }, 80)
    );
  }

  initGraph() {
    const container = document.getElementById('graph');
    if (!container) {
      console.error('[QueryLens] graph element not found');
      return;
    }

    console.log('[QueryLens] Initializing Cytoscape graph...');
    this.renderer = new GraphRenderer(container);
    this.renderer.init();
    console.log('[QueryLens] Graph initialized');
  }

  initToolbar() {
    const container = document.getElementById('toolbar-area');
    if (!container) return;

    this.toolbar = createToolbar(container, {
      onRun: () => this.processSql(),
      onFormat: () => this.formatSql(),
      onValidate: () => this.validateSql(),
      onClear: () => this.clearAll(),
      onFit: () => this.fitGraph(),
      onRelayout: () => this.relayoutGraph(),
      onExport: () => this.exportGraph(),
      onLayoutChange: (layout) => this.onLayoutChange(layout),
      onSampleChange: (sample) => this.loadSample(sample)
    });

    const savedLayout = (() => { try { return localStorage.getItem('querylens_layout'); } catch (e) { return null; } })();
    if (savedLayout && this.toolbar.setLayout) {
      this.toolbar.setLayout(savedLayout);
      this.currentLayout = savedLayout;
    }
  }

  initStatusBar() {
    this.statusBar = {
      tables: document.getElementById('status-tables'),
      joins: document.getElementById('status-joins'),
      status: document.getElementById('status-indicator')
    };
  }

  initCostToggle() {
    const panel = document.getElementById('cost-panel');
    const header = panel?.querySelector('.cost-header');
    if (!header) return;

    header.addEventListener('click', (e) => {
      if (e.target.closest('.cost-toggle')) return;
      this.toggleCostPanel();
    });

    const toggle = document.getElementById('cost-toggle');
    if (toggle) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCostPanel();
      });
    }
  }

  initEmptyStateObserver() {
  }

  showEmptyState() {
    const el = document.getElementById('empty-state');
    if (el) el.style.display = '';
  }

  hideEmptyState() {
    const el = document.getElementById('empty-state');
    if (el) el.style.display = 'none';
  }

  initSplitter() {
    const splitter = document.getElementById('splitter');
    const left = document.querySelector('.panel-left');
    const right = document.querySelector('.panel-right');
    const container = document.querySelector('.main-container');

    if (!splitter || !left || !right) return;

    let isDragging = false;

    splitter.addEventListener('mousedown', (e) => {
      isDragging = true;
      splitter.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(30, Math.min(70, percent));
      left.style.flex = `0 0 ${clamped}%`;
      right.style.flex = `1 1 ${100 - clamped}%`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        splitter.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      document.querySelector('meta[name="color-scheme"]').content = newTheme;
      localStorage.setItem('querylens_theme', newTheme);
      
      setEditorTheme(newTheme);
      
      if (this.renderer) {
        this.renderer.setTheme(newTheme);
      }
    });

    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    setEditorTheme(currentTheme);
    if (this.renderer) {
      this.renderer.setTheme(currentTheme);
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.processSql();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.formatSql();
      }
    });
  }

  updateCodeTypeBadge(type) {
    const badge = document.querySelector('.panel-header .badge');
    if (!badge) return;
    if (type === CODE_TYPE.PACKAGE) {
      badge.textContent = 'Package';
      badge.style.background = 'var(--accent-purple, #ab95b8)';
      badge.style.color = '#fff';
    } else if (type === CODE_TYPE.SQL) {
      badge.textContent = 'Oracle';
      badge.style.background = '';
      badge.style.color = '';
    } else {
      badge.textContent = 'Unknown';
      badge.style.background = '';
      badge.style.color = '';
    }
  }

  processSql() {
    if (!this.editor) return;
    const sql = getEditorValue(this.editor);
    if (!sql || sql.trim().length === 0) {
      if (this.renderer) this.renderer.reset();
      this.showEmptyState();
      this.updateStatusBar(null);
      this.updateCostPanel(null);
    this.currentAst = null;
    this.currentGraphModel = null;
    this.tableWordMap.clear();
    this.currentCost = null;
    this.updateCodeTypeBadge(CODE_TYPE.UNKNOWN);
      return;
    }

    this.setStatus('parsing', 'Parsing...');
    this.currentCost = null;

    const codeType = detectCodeType(sql);
    this.updateCodeTypeBadge(codeType);

    if (codeType === CODE_TYPE.PACKAGE) {
      this.processPackage(sql);
      return;
    }

    this.processSqlQuery(sql);
  }

  processPackage(sql) {
    console.log('[QueryLens] Detected Oracle Package');

    const tokens = plsqlTokenize(sql);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();

    if (parsed.errors && parsed.errors.length > 0) {
      console.log('[QueryLens] Package parse errors:', parsed.errors);
      this.setStatus('error', 'Package has errors');
      if (this.renderer) this.renderer.reset();
      this.showEmptyState();
      this.currentGraphModel = null;
      this.tableWordMap.clear();
      showNotification('Failed to parse Oracle Package: ' + parsed.errors[0].message, 'error');
      return;
    }

    if (!parsed.name) {
      this.setStatus('error', 'Could not identify package name');
      showNotification('Could not identify package name', 'error');
      return;
    }

    const analysis = analyzePackage(parsed);
    const graphModel = buildCallGraphModel(analysis);

    this.currentGraphModel = graphModel;
    this.currentAst = { type: 'package', parsed };
    this.buildTableWordMap(graphModel);

    if (graphModel.nodes.length === 0) {
      this.setStatus('ready', 'Empty package');
      if (this.renderer) this.renderer.reset();
      this.showEmptyState();
      showNotification('No elements found in package.', 'warning');
      this.updateStatusBar(graphModel);
      return;
    }

    this.hideEmptyState();
    if (this.renderer) {
      this.renderer.update(graphModel, this.currentLayout);
    }
    this.updateStatusBar(graphModel);
    this.updateCostPanel(null);

    const stats = getCallGraphStats(graphModel);
    this.setStatus('ready', `${stats.procedures + stats.functions} members, ${stats.calls} calls`);
  }

  processSqlQuery(sql) {
    console.log('[QueryLens] SQL length:', sql.length);
    const validation = buildAst(sql);
    this.currentAst = validation;
    console.log('[QueryLens] AST errors:', validation.errors?.length, 'has statement:', !!validation.statement, 'from:', validation.statement?.from?.length);

    const hadGraph = this.currentGraphModel && this.currentGraphModel.nodes.length > 0;

    if (validation.errors && validation.errors.length > 0) {
      console.log('[QueryLens] Parse errors:', validation.errors);
      this.setStatus('error', 'Query has errors');
      this.currentCost = null;
      this.updateCostPanel(null);
      if (!hadGraph) {
        if (this.renderer) this.renderer.reset();
        this.showEmptyState();
        this.currentGraphModel = null;
        this.tableWordMap.clear();
      }
      return;
    }

    const relationships = extractRelationships(validation);
    console.log('[QueryLens] Tables found:', relationships.tables?.length);
    const graphModel = buildGraphModel(relationships);

    const queryCost = estimateQueryCost(validation);
    annotateGraphModel(graphModel, queryCost);
    this.currentCost = queryCost;

    this.currentGraphModel = graphModel;
    this.buildTableWordMap(graphModel);

    if (graphModel.nodes.length === 0) {
      this.setStatus('ready', 'No tables found');
      this.updateCostPanel(null);
      if (!hadGraph) {
        if (this.renderer) this.renderer.reset();
        this.showEmptyState();
        showNotification('No tables or relationships were found in the query.', 'warning');
      }
      this.updateStatusBar(graphModel);
      return;
    }

    this.hideEmptyState();
    if (this.renderer) this.renderer.update(graphModel, this.currentLayout);
    this.updateStatusBar(graphModel);
    this.updateCostPanel(queryCost);
    this.setStatus('ready', `${graphModel.nodes.length} tables, ${graphModel.edges.length} relationships`);
  }

  formatSql() {
    if (this.editor && formatInEditor(this.editor)) {
      showNotification('SQL formatted successfully', 'success');
    }
  }

  validateSql() {
    const sql = getEditorValue(this.editor);
    if (!sql || sql.trim().length === 0) {
      showNotification('No SQL to validate.', 'warning');
      return;
    }

    const codeType = detectCodeType(sql);

    if (codeType === CODE_TYPE.PACKAGE) {
      const tokens = plsqlTokenize(sql);
      const parser = new PLSQLParser(tokens);
      const parsed = parser.parse();

      if (parsed.errors && parsed.errors.length > 0) {
        const errors = parsed.errors.map(e => e.message).join('; ');
        showNotification(errors || 'Unknown parse error', 'error', 'Validation Error');
        this.setStatus('error', 'Invalid Package');
      } else {
        showNotification('Package syntax is valid!', 'success', 'Validation');
        this.setStatus('ready', 'Valid Package');
      }
      return;
    }

    const result = validateSql(sql);

    if (result.valid) {
      showNotification('SQL syntax is valid!', 'success', 'Validation');
      this.setStatus('ready', 'Valid SQL');
    } else {
      const errors = result.errors.map(e => e.message).join('; ');
      showNotification(errors || 'Unknown syntax error', 'error', 'Validation Error');
      this.setStatus('error', 'Invalid SQL');
    }
  }

  buildTableWordMap(model) {
    this.tableWordMap.clear();
    if (!model || !model.nodes) return;
    for (const node of model.nodes) {
      const d = node.data;
      if (!d || !d.id) continue;
      this.tableWordMap.set(d.id.toLowerCase(), d.id);
      const aliases = d.aliases || (d.alias ? [d.alias] : []);
      for (const alias of aliases) {
        if (alias && alias !== d.id) {
          const key = alias.toLowerCase();
          if (!this.tableWordMap.has(key)) {
            this.tableWordMap.set(key, d.id);
          }
        }
      }
      if (d.rawLabel && d.rawLabel !== d.id && !aliases.includes(d.rawLabel)) {
        const key = d.rawLabel.toLowerCase();
        if (!this.tableWordMap.has(key)) {
          this.tableWordMap.set(key, d.id);
        }
      }
    }
  }

  loadSample(sample) {
    if (sample === 'package') {
      setEditorValue(this.editor, SAMPLE_PACKAGE);
    } else {
      setEditorValue(this.editor, SAMPLE_SQL);
    }
    this.processSql();
  }

  clearAll() {
    setEditorValue(this.editor, '');
    if (this.renderer) this.renderer.reset();
    this.showEmptyState();
    this.currentAst = null;
    this.currentGraphModel = null;
    this.currentCost = null;
    this.tableWordMap.clear();
    this.updateStatusBar(null);
    this.updateCostPanel(null);
    this.setStatus('ready', 'Cleared');
    this.updateCodeTypeBadge(CODE_TYPE.UNKNOWN);
    clearNotifications();
  }

  fitGraph() {
    if (this.renderer) {
      this.renderer.fitGraph();
    }
  }

  relayoutGraph() {
    if (this.renderer && this.currentGraphModel) {
      this.renderer.update(this.currentGraphModel, this.currentLayout);
      showNotification('Graph re-laid out', 'info');
    }
  }

  onLayoutChange(layout) {
    this.currentLayout = layout;
    try { localStorage.setItem('querylens_layout', layout); } catch (e) { /* ignore */ }
    if (this.renderer && this.currentGraphModel) {
      this.renderer.update(this.currentGraphModel, layout);
    }
  }

  exportGraph() {
    if (!this.renderer || !this.currentGraphModel) {
      showNotification('Nothing to export. Please run a query first.', 'warning');
      return;
    }

    try {
      const cy = this.renderer.cy;
      if (!cy) return;

      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const exportBg = currentTheme === 'light' ? '#fcfbfa' : '#161514';

      const pngData = cy.png({ bg: exportBg, full: true, scale: 2 });
      const link = document.createElement('a');
      link.download = 'sql-diagram.png';
      link.href = pngData;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification('Graph exported as PNG', 'success', 'Export');
    } catch (e) {
      showNotification('Failed to export graph: ' + e.message, 'error');
    }
  }

  updateStatusBar(graphModel) {
    if (!this.statusBar) return;

    const nodeCount = document.getElementById('node-count');

    if (graphModel) {
      if (graphModel.nodes[0]?.data?.isCallGraph) {
        const stats = getCallGraphStats(graphModel);
        if (this.statusBar.tables) this.statusBar.tables.textContent = `Procs: ${stats.procedures} | Funcs: ${stats.functions}`;
        if (this.statusBar.joins) this.statusBar.joins.textContent = `Calls: ${stats.calls} | Decls: ${stats.declarations}`;
        if (nodeCount) nodeCount.textContent = `${stats.nodes} ${stats.nodes === 1 ? 'node' : 'nodes'}`;
      } else {
        const stats = getGraphStats(graphModel);
        if (this.statusBar.tables) this.statusBar.tables.textContent = `Tables: ${stats.tables} | CTEs: ${stats.ctes}`;
        if (this.statusBar.joins) this.statusBar.joins.textContent = `Relations: ${stats.edges}`;
        if (nodeCount) nodeCount.textContent = `${stats.nodes} ${stats.nodes === 1 ? 'node' : 'nodes'}`;
      }
    } else {
      if (this.statusBar.tables) this.statusBar.tables.textContent = 'Tables: 0';
      if (this.statusBar.joins) this.statusBar.joins.textContent = 'Relations: 0';
      if (nodeCount) nodeCount.textContent = '0 nodes';
    }
  }

  updateCostPanel(queryCost) {
    const panel = document.getElementById('cost-panel');
    if (!panel) return;

    if (!queryCost || queryCost.total === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';

    const value = document.getElementById('cost-bar-value');
    const total = document.getElementById('cost-total');
    const breakdown = document.getElementById('cost-breakdown');

    if (total) total.textContent = queryCost.total;

    if (value) {
      const pct = Math.min(100, Math.round(queryCost.total * 5));
      value.style.width = pct + '%';
    }

    if (breakdown) {
      breakdown.innerHTML = '';
      for (const item of queryCost.breakdown) {
        const row = document.createElement('div');
        row.className = 'cost-row';
        const pct = Math.max(5, Math.min(100, Math.round(Math.abs(item.cost) / Math.max(1, queryCost.total) * 100)));
        row.innerHTML = `
          <span class="cost-row-label">${item.operation}</span>
          <span class="cost-row-detail">${item.detail}</span>
          <span class="cost-row-value">${item.cost > 0 ? '+' : ''}${item.cost}</span>
          <span class="cost-row-bar"><span style="width:${pct}%"></span></span>
        `;
        breakdown.appendChild(row);
      }
    }

    const costCollapsed = localStorage.getItem('querylens-cost-collapsed');
    if (costCollapsed === 'true') {
      panel.classList.add('collapsed');
    } else {
      panel.classList.remove('collapsed');
    }
  }

  toggleCostPanel() {
    const panel = document.getElementById('cost-panel');
    if (!panel || panel.style.display === 'none') return;
    const collapsed = panel.classList.toggle('collapsed');
    localStorage.setItem('querylens-cost-collapsed', collapsed);
  }

  setStatus(state, text) {
    if (!this.statusBar || !this.statusBar.status) return;
    const dot = this.statusBar.status.querySelector('.status-dot');
    const label = this.statusBar.status.querySelector('.status-label');
    if (dot) {
      dot.className = 'status-dot ' + state;
    }
    if (label) {
      label.textContent = text || '';
    }
  }
}

const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default app;
