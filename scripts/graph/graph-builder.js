/**
 * Constrói o modelo de grafo do Cytoscape a partir dos dados de relacionamentos SQL.
 * @param {Object} relationshipsData - Dados contendo tabelas, relacionamentos e subconsultas
 * @param {Array} relationshipsData.tables - Lista de tabelas do SQL
 * @param {Array} relationshipsData.relationships - Lista de junções entre tabelas
 * @param {Array} relationshipsData.subqueries - Lista de subconsultas
 * @returns {{ nodes: Array, edges: Array }} Modelo de grafo com nós e arestas
 */
export function buildGraphModel(relationshipsData) {
  const { tables, relationships, subqueries } = relationshipsData;
  const nodes = [];
  const edges = [];
  const addedEdges = new Set();

  for (const table of tables) {
    const displayLabel = table.order ? table.order + '. ' + table.name : table.name;
    const node = {
      data: {
        id: table.id,
        label: displayLabel,
        rawLabel: table.name,
        order: table.order || 0,
        alias: table.alias || '',
        aliases: table.aliases || (table.alias ? [table.alias] : []),
        type: table.type || 'table',
        schema: table.schema || '',
        columns: table.columns || [],
        originalName: table.originalName || table.name,
        fromSubquery: !!table.fromSubquery,
        cteSource: table.cteSource ? 'true' : undefined
      }
    };
    nodes.push(node);
  }

  const hasWhereRel = (a, b) => relationships.some(r =>
    (r.joinType === 'WHERE' || r.joinType === 'LEFT JOIN' || r.joinType === 'RIGHT JOIN') &&
    ((r.source === a && r.target === b) || (r.source === b && r.target === a))
  );

  for (const rel of relationships) {
    const sourceId = rel.source;
    const targetId = rel.target;

    if (!tables.find(t => t.id === sourceId) && !tables.find(t => t.id === targetId)) {
      if (rel.fields && rel.fields.length > 0) {
        const firstField = rel.fields[0];
        const leftTable = firstField.left?.table;
        const rightTable = firstField.right?.table;
        if (leftTable && rightTable && leftTable !== rightTable) {
          continue;
        }
      }
    }

    if (!tables.find(t => t.id === sourceId) || !tables.find(t => t.id === targetId)) {
      continue;
    }

    if (rel.joinType === 'CROSS JOIN' && hasWhereRel(sourceId, targetId)) {
      continue;
    }

    const edgeKey = sourceId + '→' + targetId + '→' + rel.joinType;
    if (addedEdges.has(edgeKey)) continue;
    addedEdges.add(edgeKey);

    const fields = rel.fields || [];
    let label = rel.joinType || 'JOIN';
    if (fields.length > 0) {
      const fieldStrs = fields.map(f => {
        const left = f.left?.fullName || f.left?.column || '?';
        const right = f.right?.fullName || f.right?.column || '?';
        return `${left} = ${right}`;
      });
      label = fieldStrs.join(', ');
    } else if (rel.using) {
      label = `USING (${rel.using.join(', ')})`;
    } else if (rel.natural) {
      label = 'NATURAL';
    }

    const edge = {
      data: {
        id: `e-${edgeKey.replace(/[^a-zA-Z0-9]/g, '-')}`,
        source: sourceId,
        target: targetId,
        label,
        joinType: rel.joinType || 'JOIN',
        natural: !!rel.natural,
        using: rel.using || null,
        conditions: rel.conditions || [],
        fields,
        implicit: !!rel.implicit,
        outerJoin: !!rel.outerJoin
      }
    };
    edges.push(edge);
  }

  return { nodes, edges };
}

/**
 * Calcula estatísticas do modelo de grafo: contagem de nós, arestas e tipos de junção.
 * @param {Object} graphModel - Modelo de grafo com listas de nodes e edges
 * @returns {{ nodes: number, edges: number, tables: number, subqueries: number, ctes: number, joinCounts: Object }} Estatísticas do grafo
 */
export function getGraphStats(graphModel) {
  const nodes = graphModel.nodes.length;
  const edges = graphModel.edges.length;
  const tables = graphModel.nodes.filter(n => n.data.type === 'table').length;
  const subqueries = graphModel.nodes.filter(n => n.data.type === 'subquery').length;
  const ctes = graphModel.nodes.filter(n => n.data.type === 'cte').length;

  const joinCounts = {};
  for (const edge of graphModel.edges) {
    const jt = edge.data.joinType || 'JOIN';
    joinCounts[jt] = (joinCounts[jt] || 0) + 1;
  }

  return { nodes, edges, tables, subqueries, ctes, joinCounts };
}
