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

export function getLayoutOptions(name = 'cose') {
  return LAYOUTS[name] ? { ...LAYOUTS[name] } : { ...LAYOUTS.cose };
}

export function getLayoutForGraph(graphModel) {
  return getLayoutOptions('cose');
}

export function applyLayout(cy, layoutName = 'cose') {
  const options = getLayoutOptions(layoutName);
  const layout = cy.layout(options);
  layout.run();
}
