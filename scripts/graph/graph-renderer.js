import { applyLayout } from './graph-layout.js';

// Retorna a matriz de estilos Cytoscape específica para o tema (claro/escuro)
function getStyleForTheme(theme) {
  const isLight = theme === 'light';
  
  // Theme specific colors matching Oracle Redwood palette
  const themeColors = {
    text: isLight ? '#1a1d23' : '#cccccc',
    edgeTextBg: isLight ? '#f8f9fa' : '#161514',
    edgeText: isLight ? '#5a5f69' : '#999999',
    selectedBorder: isLight ? '#c93228' : '#e25c40',
    selectedEdge: isLight ? '#1a1d23' : '#ffffff',
    
    // Nodes
    table: {
      bg: isLight ? '#f0f2f5' : '#221e1c',
      border: isLight ? '#c93228' : '#e25c40',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    subquery: {
      bg: isLight ? '#f8f3eb' : '#2b251e',
      border: isLight ? '#b37d3e' : '#e0a96d',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    cte: {
      bg: isLight ? '#f5ece2' : '#2b1f14',
      border: isLight ? '#c96d2a' : '#e07c3e',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    cteSource: {
      bg: isLight ? '#e8f0f0' : '#172a2a',
      border: isLight ? '#00747a' : '#2aa0a0',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },

    // Call Graph - Package
    pkg: {
      bg: isLight ? '#eef0f7' : '#1a1a2e',
      border: isLight ? '#5a5a8a' : '#7c7cba',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    // Call Graph - Procedure
    proc: {
      bg: isLight ? '#f5f3f1' : '#221e1c',
      border: isLight ? '#c93228' : '#e25c40',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    callEdge: isLight ? '#d94838' : '#f06040',
    declareEdge: isLight ? '#4a6fa5' : '#5a8fc9',
    // Call Graph - Function
    cfunc: {
      bg: isLight ? '#eef5ee' : '#1a2e1a',
      border: isLight ? '#3d7a46' : '#4ca356',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    // Call Graph - Constant
    const: {
      bg: isLight ? '#f8f3eb' : '#2b251e',
      border: isLight ? '#b37d3e' : '#e0a96d',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    // Call Graph - Global Variable
    gvar: {
      bg: isLight ? '#f2edf5' : '#2e1a3e',
      border: isLight ? '#7a5c8c' : '#ab95b8',
      text: isLight ? '#1a1d23' : '#f7f5f4'
    },
    
    // Joins (Edges)
    innerJoin: '#008080',  // Teal
    leftJoin: isLight ? '#b37d3e' : '#e0a96d',   // Gold
    rightJoin: '#4ca356',  // Green
    fullJoin: '#ab95b8',   // Purple
    crossJoin: '#d94838',  // Red
  };

  return [
    {
      selector: 'node',
      style: {
        'background-color': themeColors.table.bg,
        'border-width': 2,
        'border-color': themeColors.table.border,
        'border-opacity': 0.8,
        'shape': 'round-rectangle',
        'padding': '12px',
        'font-family': 'Inter, Segoe UI, -apple-system, sans-serif',
        'font-size': '11px',
        'color': themeColors.text,
        'text-valign': 'center',
        'text-halign': 'center',
        'label': 'data(label)',
        'text-wrap': 'wrap',
        'text-max-width': '180px',
        'min-width': '120px',
        'min-height': '40px',
        'overlay-opacity': 0,
        'transition-property': 'background-color, border-color, opacity, color',
        'transition-duration': '200ms'
      }
    },
    {
      selector: 'node[type = "table"]',
      style: {
        'background-color': themeColors.table.bg,
        'border-color': themeColors.table.border,
        'color': themeColors.table.text
      }
    },
    {
      selector: 'node[type = "subquery"]',
      style: {
        'background-color': themeColors.subquery.bg,
        'border-color': themeColors.subquery.border,
        'color': themeColors.subquery.text
      }
    },
    {
      selector: 'node[type = "cte"]',
      style: {
        'background-color': themeColors.cte.bg,
        'border-color': themeColors.cte.border,
        'color': themeColors.cte.text
      }
    },
    {
      selector: 'node[cteSource = "true"]',
      style: {
        'background-color': themeColors.cteSource.bg,
        'border-color': themeColors.cteSource.border,
        'color': themeColors.cteSource.text
      }
    },
    {
      selector: 'node[nodeType = "PACKAGE"]',
      style: {
        'background-color': themeColors.pkg.bg,
        'border-color': themeColors.pkg.border,
        'color': themeColors.pkg.text,
        'border-width': 3,
        'font-size': '13px',
        'font-weight': 'bold'
      }
    },
    {
      selector: 'node[nodeType = "PROCEDURE"]',
      style: {
        'background-color': themeColors.proc.bg,
        'border-color': themeColors.proc.border,
        'color': themeColors.proc.text
      }
    },
    {
      selector: 'node[nodeType = "FUNCTION"]',
      style: {
        'background-color': themeColors.cfunc.bg,
        'border-color': themeColors.cfunc.border,
        'color': themeColors.cfunc.text
      }
    },
    {
      selector: 'node[nodeType = "CONSTANT"]',
      style: {
        'background-color': themeColors.const.bg,
        'border-color': themeColors.const.border,
        'color': themeColors.const.text,
        'font-style': 'italic'
      }
    },
    {
      selector: 'node[nodeType = "GLOBAL_VARIABLE"]',
      style: {
        'background-color': themeColors.gvar.bg,
        'border-color': themeColors.gvar.border,
        'color': themeColors.gvar.text
      }
    },
    {
      selector: 'node[visibility = "PRIVATE"]',
      style: {
        'border-style': 'dashed',
        'opacity': 0.85
      }
    },
    {
      selector: 'node[visibility = "PUBLIC"]',
      style: {
        'border-style': 'solid'
      }
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': themeColors.selectedBorder
      }
    },
    {
      selector: 'node.highlighted',
      style: {
        'border-color': themeColors.selectedBorder,
        'border-width': 3
      }
    },
    {
      selector: 'node.faded',
      style: {
        'opacity': 0.3
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 'data(costWidth)',
        'line-color': themeColors.innerJoin,
        'target-arrow-color': themeColors.innerJoin,
        'source-arrow-color': themeColors.innerJoin,
        'target-arrow-shape': 'triangle',
        'source-arrow-shape': 'none',
        'arrow-scale': 1.2,
        'curve-style': 'bezier',
        'control-point-step-size': '40px',
        'label': 'data(label)',
        'font-size': '8px',
        'color': themeColors.edgeText,
        'text-valign': 'top',
        'text-background-color': themeColors.edgeTextBg,
        'text-background-opacity': 0.9,
        'text-background-padding': '3px',
        'text-margin-y': '-8px',
        'text-max-width': '120px',
        'overlay-opacity': 0,
        'transition-property': 'line-color, width, opacity',
        'transition-duration': '200ms'
      }
    },
    {
      selector: 'edge[joinType = "LEFT JOIN"]',
      style: {
        'line-color': themeColors.leftJoin,
        'target-arrow-color': themeColors.leftJoin,
        'source-arrow-color': themeColors.leftJoin,
        'line-style': 'dashed'
      }
    },
    {
      selector: 'edge[joinType = "RIGHT JOIN"]',
      style: {
        'line-color': themeColors.rightJoin,
        'target-arrow-color': themeColors.rightJoin,
        'source-arrow-color': themeColors.rightJoin
      }
    },
    {
      selector: 'edge[joinType = "FULL JOIN"]',
      style: {
        'line-color': themeColors.fullJoin,
        'target-arrow-color': themeColors.fullJoin,
        'source-arrow-color': themeColors.fullJoin
      }
    },
    {
      selector: 'edge[joinType = "CROSS JOIN"]',
      style: {
        'line-color': themeColors.crossJoin,
        'target-arrow-color': themeColors.crossJoin,
        'source-arrow-color': themeColors.crossJoin,
        'line-style': 'dashed'
      }
    },
    {
      selector: 'edge[implicit = "true"]',
      style: {
        'line-color': themeColors.innerJoin,
        'target-arrow-color': themeColors.innerJoin,
        'source-arrow-color': themeColors.innerJoin,
        'line-style': 'dotted',
        'width': 1.5
      }
    },
    {
      selector: 'edge[edgeType = "CALLS"]',
      style: {
        'line-color': themeColors.callEdge,
        'target-arrow-color': themeColors.callEdge,
        'source-arrow-color': themeColors.callEdge,
        'line-style': 'solid',
        'width': 2.5,
        'arrow-scale': 1.5,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'source-arrow-shape': 'none',
        'label': '',
        'z-index': 2
      }
    },
    {
      selector: 'edge[edgeType = "DECLARES"]',
      style: {
        'line-color': themeColors.declareEdge,
        'target-arrow-color': themeColors.declareEdge,
        'source-arrow-color': themeColors.declareEdge,
        'line-style': 'dotted',
        'width': 1.5,
        'arrow-scale': 1,
        'target-arrow-shape': 'triangle',
        'source-arrow-shape': 'none',
        'label': '',
        'z-index': 1
      }
    },
    {
      selector: 'edge[isCallGraph = "true"]',
      style: {
        'text-background-color': themeColors.edgeTextBg,
        'text-background-opacity': 0.9,
        'text-background-padding': '3px',
        'font-size': '8px',
        'color': themeColors.edgeText
      }
    },
    {
      selector: 'edge:selected',
      style: {
        'width': 4,
        'line-color': themeColors.selectedEdge,
        'target-arrow-color': themeColors.selectedEdge,
        'source-arrow-color': themeColors.selectedEdge
      }
    },
    {
      selector: 'edge.highlighted',
      style: {
        'width': 4,
        'line-color': themeColors.selectedBorder,
        'target-arrow-color': themeColors.selectedBorder,
        'source-arrow-color': themeColors.selectedBorder
      }
    },
    {
      selector: 'edge.faded',
      style: {
        'opacity': 0.1
      }
    }
  ];
}

export class GraphRenderer {
  // Inicializa a instância do renderizador com o contêiner DOM e tema atual
  constructor(container) {
    this.container = container;
    this.cy = null;
    this.currentModel = null;
    this.tooltip = null;
    this.currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  }

  // Mede a largura máxima necessária entre todos os rótulos dos nós usando canvas
  measureMaxLabelWidth(nodes) {
    if (!nodes || nodes.length === 0) return 120;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '11px Inter, Segoe UI, -apple-system, sans-serif';
    let max = 0;
    for (const node of nodes) {
      const label = node.data?.label || '';
      const w = ctx.measureText(label).width;
      if (w > max) max = w;
    }
    return Math.max(120, Math.ceil(max) + 28);
  }

  // Aplica a largura calculada dos nós ao estilo do Cytoscape
  applyNodeWidth(nodes) {
    if (!nodes || nodes.some(n => n.data?.isCallGraph)) return;
    const w = this.measureMaxLabelWidth(nodes);
    this.cy.style()
      .selector('node')
      .style('width', w + 'px')
      .style('text-max-width', (w - 24) + 'px')
      .update();
  }

  // Inicializa a instância do Cytoscape com configurações padrão e eventos
  init() {
    this.cy = cytoscape({
      container: this.container,
      style: getStyleForTheme(this.currentTheme),
      layout: { name: 'grid' },
      elements: [],
      minZoom: 0.2,
      maxZoom: 4,
      motionBlur: true,
      wheelSensitivity: 0.3,
      pixelRatio: window.devicePixelRatio || 1
    });

    this.setupEvents();
    this.createTooltip();

    return this;
  }

  // Alterna o tema visual do grafo (claro/escuro) em tempo de execução
  setTheme(theme) {
    this.currentTheme = theme;
    if (this.cy) {
      this.cy.style(getStyleForTheme(theme)).update();
      if (this.currentModel) {
        this.applyNodeWidth(this.currentModel.nodes);
      }
    }
  }

  // Registra os manipuladores de eventos de interação (clique, hover) no Cytoscape
  setupEvents() {
    this.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      this.highlightNode(node);
    });

    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy) {
        this.clearHighlights();
      }
    });

    this.cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      this.showTooltip(node);
    });

    this.cy.on('mouseout', 'node', () => {
      this.hideTooltip();
    });

    this.cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target;
      this.showEdgeTooltip(edge);
    });

    this.cy.on('mouseout', 'edge', () => {
      this.hideTooltip();
    });
  }

  // Cria o elemento DOM do tooltip e o anexa ao contêiner do grafo
  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'cytoscape-tooltip';
    this.tooltip.style.display = 'none';
    this.container.appendChild(this.tooltip);
  }

  // Exibe o tooltip com informações detalhadas do nó na posição do cursor
  showTooltip(node) {
    const data = node.data();
    const pos = node.renderedPosition();
    const bbox = this.container.getBoundingClientRect();

    let html = `<div class="tooltip-label">${this.escape(data.label)}</div>`;
    if (data.isCallGraph) {
      const nodeType = data.nodeType || data.type || 'unknown';
      html += `<div class="tooltip-detail">Type: ${nodeType}</div>`;
      if (data.visibility) {
        html += `<div class="tooltip-detail">Visibility: ${data.visibility}</div>`;
      }
      if (data.returnType) {
        html += `<div class="tooltip-detail">Returns: ${this.escape(data.returnType)}</div>`;
      }
      if (data.dataType) {
        html += `<div class="tooltip-detail">Data Type: ${this.escape(data.dataType)}</div>`;
      }
      if (data._constants) {
        html += `<div class="tooltip-detail">Constants: ${this.escape(data._constants)}</div>`;
      }
      if (data._globals) {
        html += `<div class="tooltip-detail">Globals: ${this.escape(data._globals)}</div>`;
      }
      if (data.params && data.params.length > 0) {
        const paramNames = data.params.map(p => p.name).join(', ');
        html += `<div class="tooltip-detail">Params: ${this.escape(paramNames)}</div>`;
      }
    } else {
      if (data.alias) {
        html += `<div class="tooltip-detail">Alias: ${this.escape(data.alias)}</div>`;
      }
      if (data.schema) {
        html += `<div class="tooltip-detail">Schema: ${this.escape(data.schema)}</div>`;
      }
      html += `<div class="tooltip-detail">Type: ${data.type || 'table'}</div>`;

      if (data.columns && data.columns.length > 0) {
        const cols = data.columns.slice(0, 5);
        html += `<div class="tooltip-detail">Columns: ${cols.join(', ')}${data.columns.length > 5 ? '...' : ''}</div>`;
      }

      if (data.cost) {
        html += `<div class="tooltip-detail">Cost: ${data.cost}</div>`;
      }
    }

    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = (pos.x + 15) + 'px';
    this.tooltip.style.top = (pos.y - 10) + 'px';
  }

  // Exibe o tooltip com informações detalhadas da aresta na posição do cursor
  showEdgeTooltip(edge) {
    const data = edge.data();
    const pos = edge.renderedMidpoint();
    const srcLabel = this.cy.getElementById(data.source).data('label');
    const tgtLabel = this.cy.getElementById(data.target).data('label');

    let html;
    if (data.isCallGraph) {
      html = `<div class="tooltip-label">${this.escape(data.edgeType || 'RELATION')}</div>`;
      html += `<div class="tooltip-detail">${this.escape(srcLabel)} &rarr; ${this.escape(tgtLabel)}</div>`;
    } else {
      html = `<div class="tooltip-label">${this.escape(data.joinType || 'JOIN')}</div>`;
      html += `<div class="tooltip-detail">${this.escape(srcLabel)} &rarr; ${this.escape(tgtLabel)}</div>`;
      if (data.label && data.label !== data.joinType) {
        html += `<div class="tooltip-detail">Condition: ${this.escape(data.label)}</div>`;
      }
      if (data.costWidth && data.costWidth > 2.5) {
        html += `<div class="tooltip-detail">Cost: ${data.costWidth.toFixed(1)}×</div>`;
      }
    }

    this.tooltip.innerHTML = html;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = (pos.x + 15) + 'px';
    this.tooltip.style.top = (pos.y - 10) + 'px';
  }

  // Oculta o tooltip
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  // Destaca um nó e seus elementos conectados, esmaecendo o restante
  highlightNode(node) {
    this.clearHighlights();

    node.addClass('highlighted');

    const connectedEdges = node.connectedEdges();
    const connectedNodes = node.neighborhood().nodes();

    connectedEdges.addClass('highlighted');
    connectedNodes.addClass('highlighted');

    this.cy.nodes().not(node).not(connectedNodes).addClass('faded');
    this.cy.edges().not(connectedEdges).addClass('faded');
  }

  // Remove todos os destaques e restaura a opacidade normal dos elementos
  clearHighlights() {
    this.cy.nodes().removeClass('highlighted faded');
    this.cy.edges().removeClass('highlighted faded');
  }

  // Renderiza o modelo de grafo completo no Cytoscape com o layout especificado
  render(model, layoutName) {
    this.currentModel = model;

    const elements = [...model.nodes, ...model.edges];

    this.applyNodeWidth(model.nodes);
    this.cy.json({ elements });

    applyLayout(this.cy, layoutName);

    this.fitGraph();
  }

  // Atualiza o grafo existente com novos elementos ou faz a renderização inicial se vazio
  update(model, layoutName) {
    if (!model) return;

    const wasEmpty = !this.currentModel || this.currentModel.nodes.length === 0;
    this.currentModel = model;

    const newElements = [...model.nodes, ...model.edges];

    this.applyNodeWidth(model.nodes);

    if (wasEmpty) {
      this.render(model, layoutName);
      return;
    }

    this.cy.json({ elements: newElements });

    applyLayout(this.cy, layoutName);
    this.fitGraph();
  }

  // Ajusta o zoom e a viewport para encaixar todos os nós visíveis
  fitGraph() {
    if (this.cy && this.cy.nodes().length > 0) {
      this.cy.fit(undefined, 50);
    }
  }

  // Remove todos os elementos do grafo e reseta o modelo atual
  reset() {
    if (this.cy) {
      this.cy.elements().remove();
      this.currentModel = null;
    }
  }

  // Retorna um nó do Cytoscape pelo seu ID
  getNodeById(id) {
    return this.cy ? this.cy.getElementById(id) : null;
  }

  // Destrói a instância do Cytoscape e libera recursos
  destroy() {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
    this.currentModel = null;
  }

  // Escapa caracteres HTML especiais para prevenir XSS em tooltips
  escape(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, c => map[c]);
  }
}
