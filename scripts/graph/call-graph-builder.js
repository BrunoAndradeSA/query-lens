export function buildCallGraphModel(analysis) {
  const { nodes: semanticNodes, edges: semanticEdges } = analysis;
  const nodes = [];
  const edges = [];
  const addedEdges = new Set();
  const filteredIds = new Set();

  for (const node of semanticNodes) {
    if (node.type === 'PACKAGE') {
      const label = buildLabel(node);
      const cyNode = {
        data: {
          id: node.id,
          label,
          rawLabel: node.name,
          type: node.type,
          visibility: node.visibility || '',
          nodeType: node.type,
          params: node.params || [],
          returnType: node.returnType || '',
          dataType: node.dataType || '',
          isCallGraph: true,
          _constants: (node._constants || []).map(c => c.name).join(', '),
          _globals: (node._globals || []).map(g => g.name).join(', ')
        }
      };
      nodes.push(cyNode);
      continue;
    }

    if (node.type === 'CONSTANT' || node.type === 'GLOBAL_VARIABLE') {
      filteredIds.add(node.id);
      continue;
    }

    const label = buildLabel(node);
    const cyNode = {
      data: {
        id: node.id,
        label,
        rawLabel: node.name,
        type: node.type,
        visibility: node.visibility || '',
        nodeType: node.type,
        params: node.params || [],
        returnType: node.returnType || '',
        dataType: node.dataType || '',
        isCallGraph: true
      }
    };
    nodes.push(cyNode);
  }

  for (const edge of semanticEdges) {
    if (edge.type === EdgeType.DECLARES && filteredIds.has(edge.target)) continue;
    if (edge.type === EdgeType.CONTAINS) continue;

    const edgeKey = `${edge.source}->${edge.target}->${edge.type}`;
    if (addedEdges.has(edgeKey)) continue;
    addedEdges.add(edgeKey);

    const label = edge.type === EdgeType.CALLS ? 'calls' :
                  edge.type === EdgeType.DECLARES ? 'declares' : '';

    const cyEdge = {
      data: {
        id: `e-${edgeKey.replace(/[^a-zA-Z0-9]/g, '-')}`,
        source: edge.source,
        target: edge.target,
        label,
        edgeType: edge.type,
        isCallGraph: true
      }
    };
    edges.push(cyEdge);
  }

  return { nodes, edges };
}

function buildLabel(node) {
  let label = node.name;
  if (node.type === 'FUNCTION' && node.returnType) {
    label += `: ${node.returnType}`;
  }
  if (node.visibility === 'PRIVATE') {
    label += ' (private)';
  }
  return label;
}

export function getCallGraphStats(graphModel) {
  const nodes = graphModel.nodes.length;
  const edges = graphModel.edges.length;
  const packages = graphModel.nodes.filter(n => n.data.nodeType === 'PACKAGE').length;
  const procedures = graphModel.nodes.filter(n => n.data.nodeType === 'PROCEDURE').length;
  const functions = graphModel.nodes.filter(n => n.data.nodeType === 'FUNCTION').length;
  const pkgNode = graphModel.nodes.find(n => n.data.nodeType === 'PACKAGE');
  const constants = pkgNode && pkgNode.data._constants ? (pkgNode.data._constants || '').split(',').filter(Boolean).length : 0;
  const variables = pkgNode && pkgNode.data._globals ? (pkgNode.data._globals || '').split(',').filter(Boolean).length : 0;
  const calls = graphModel.edges.filter(e => e.data.edgeType === 'CALLS').length;
  const declarations = graphModel.edges.filter(e => e.data.edgeType === 'DECLARES').length;

  return { nodes, edges, packages, procedures, functions, constants, variables, calls, declarations };
}

const EdgeType = {
  DECLARES: 'DECLARES',
  CALLS: 'CALLS',
  CONTAINS: 'CONTAINS'
};
