export const LAYOUTS = {
  cose: {
    name: 'cose',
    animate: true,
    animationDuration: 500,
    animationEasing: 'ease-out',
    fit: true,
    padding: 50,
    nodeRepulsion: 8000,
    nodeOverlap: 10,
    idealEdgeLength: 180,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 0.25,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0
  },
  breadthfirst: {
    name: 'breadthfirst',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 50,
    directed: true,
    maximal: true,
    spacingFactor: 1.5
  },
  concentric: {
    name: 'concentric',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 50,
    startAngle: 3 / 2 * Math.PI,
    clockwise: true,
    concentric: function (node) {
      return node.degree();
    },
    levelWidth: function (nodes) {
      return 2;
    }
  },
  grid: {
    name: 'grid',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 50,
    rows: null,
    columns: null,
    sort: 'degree'
  },
  circle: {
    name: 'circle',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 50
  }
};

export const LAYOUT_LABELS = {
  cose: 'Force-directed (cose)',
  grid: 'Grid',
  circle: 'Circle',
  concentric: 'Concentric',
  breadthfirst: 'Breadth-first'
};

/**
 * Retorna as opções de configuração para o nome do layout informado.
 * @param {string} [name='cose'] - Nome do layout (cose, grid, circle, concentric, breadthfirst)
 * @returns {Object} Opções de layout
 */
export function getLayoutOptions(name = 'cose') {
  return LAYOUTS[name] ? { ...LAYOUTS[name] } : { ...LAYOUTS.cose };
}

/**
 * Seleciona o layout apropriado com base no tipo de grafo (chamadas vs. relacional).
 * @param {Object} graphModel - Modelo de grafo para inspecionar o tipo
 * @returns {Object} Opções de layout específicas para o tipo de grafo
 */
export function getLayoutForGraph(graphModel) {
  const isCallGraph = graphModel.nodes && graphModel.nodes.some(n => n.data && n.data.isCallGraph);
  if (isCallGraph) {
    return {
      name: 'breadthfirst',
      animate: true,
      animationDuration: 500,
      fit: true,
      padding: 50,
      directed: true,
      maximal: true,
      spacingFactor: 1.5
    };
  }
  return getLayoutOptions('cose');
}

/**
 * Aplica o layout ao grafo Cytoscape, detectando automaticamente o tipo de grafo.
 * @param {Object} cy - Instância do Cytoscape
 * @param {string} [layoutName='cose'] - Nome do layout desejado
 */
export function applyLayout(cy, layoutName = 'cose') {
  const isCallGraph = cy.nodes().some(n => n.data && n.data.isCallGraph);
  const options = isCallGraph ? getLayoutForGraph({ nodes: [{ data: { isCallGraph: true } }] }) : getLayoutOptions(layoutName);
  const layout = cy.layout(options);
  layout.run();
}
