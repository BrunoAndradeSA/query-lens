import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraphModel, getGraphStats } from '../scripts/graph/graph-builder.js';

function makeRelationships(tables, relationships, subqueries = []) {
  return { tables, relationships, subqueries };
}

describe('buildGraphModel', () => {
  it('returns empty graph for empty input', () => {
    const result = buildGraphModel(makeRelationships([], []));
    assert.deepEqual(result, { nodes: [], edges: [] });
  });

  it('creates node for each table', () => {
    const tables = [
      { id: 't1', name: 'users', type: 'table', alias: 'u', columns: ['id', 'name'] },
      { id: 't2', name: 'orders', type: 'table', alias: 'o', columns: ['id'] },
    ];
    const result = buildGraphModel(makeRelationships(tables, []));
    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes[0].data.id, 't1');
    assert.equal(result.nodes[1].data.id, 't2');
  });

  it('includes label, rawLabel, order in node data', () => {
    const tables = [
      { id: 't1', name: 'users', type: 'table', alias: 'u', columns: ['id'], order: 1 },
    ];
    const result = buildGraphModel(makeRelationships(tables, []));
    const node = result.nodes[0].data;
    assert.ok(node.label);
    assert.equal(node.rawLabel, 'users');
    assert.equal(node.order, 1);
  });

  it('includes execution order in label when order is set', () => {
    const tables = [
      { id: 't1', name: 'users', type: 'table', alias: 'u', columns: [], order: 1 },
    ];
    const result = buildGraphModel(makeRelationships(tables, []));
    assert.ok(result.nodes[0].data.label.startsWith('1.'));
  });

  it('does not add order prefix when order is 0', () => {
    const tables = [
      { id: 't1', name: 'users', type: 'table', alias: 'u', columns: [], order: 0 },
    ];
    const result = buildGraphModel(makeRelationships(tables, []));
    assert.equal(result.nodes[0].data.label, 'users');
  });

  it('sets fromSubquery on node data', () => {
    const tables = [
      { id: 't1', name: 'sub', type: 'subquery', alias: '', columns: [], fromSubquery: true },
    ];
    const result = buildGraphModel(makeRelationships(tables, []));
    assert.equal(result.nodes[0].data.fromSubquery, true);
  });

  it('sets type on node data', () => {
    const tables = [
      { id: 'c1', name: 'my_cte', type: 'cte', alias: '', columns: [] },
    ];
    const result = buildGraphModel(makeRelationships(tables, []));
    assert.equal(result.nodes[0].data.type, 'cte');
  });
});

describe('buildGraphModel — edges', () => {
  it('creates edge for each relationship', () => {
    const tables = [
      { id: 'a', name: 'users', type: 'table', alias: 'u', columns: [] },
      { id: 'b', name: 'orders', type: 'table', alias: 'o', columns: [] },
    ];
    const relationships = [
      { source: 'a', target: 'b', joinType: 'INNER JOIN', fields: [] },
    ];
    const result = buildGraphModel(makeRelationships(tables, relationships));
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].data.source, 'a');
    assert.equal(result.edges[0].data.target, 'b');
    assert.equal(result.edges[0].data.joinType, 'INNER JOIN');
  });

  it('skips edges where source or target table is missing', () => {
    const tables = [
      { id: 'a', name: 'users', type: 'table', alias: 'u', columns: [] },
    ];
    const relationships = [
      { source: 'a', target: 'nonexistent', joinType: 'INNER JOIN', fields: [] },
    ];
    const result = buildGraphModel(makeRelationships(tables, relationships));
    assert.equal(result.edges.length, 0);
  });

  it('does not deduplicate reverse-direction edges', () => {
    const tables = [
      { id: 'a', name: 'users', type: 'table', alias: 'u', columns: [] },
      { id: 'b', name: 'orders', type: 'table', alias: 'o', columns: [] },
    ];
    const relationships = [
      { source: 'a', target: 'b', joinType: 'INNER JOIN', fields: [] },
      { source: 'b', target: 'a', joinType: 'INNER JOIN', fields: [] },
    ];
    const result = buildGraphModel(makeRelationships(tables, relationships));
    assert.equal(result.edges.length, 2);
  });

  it('sets edge label from join condition fields', () => {
    const tables = [
      { id: 'a', name: 'users', type: 'table', alias: 'u', columns: [] },
      { id: 'b', name: 'orders', type: 'table', alias: 'o', columns: [] },
    ];
    const relationships = [
      {
        source: 'a', target: 'b', joinType: 'INNER JOIN',
        fields: [
          { left: { fullName: 'users.id', table: 'a', column: 'id' }, right: { fullName: 'orders.user_id', table: 'b', column: 'user_id' } }
        ]
      },
    ];
    const result = buildGraphModel(makeRelationships(tables, relationships));
    assert.ok(result.edges[0].data.label.includes('users.id'));
    assert.ok(result.edges[0].data.label.includes('orders.user_id'));
  });
});

describe('getGraphStats', () => {
  it('returns zeros for empty graph', () => {
    const stats = getGraphStats({ nodes: [], edges: [] });
    assert.equal(stats.nodes, 0);
    assert.equal(stats.tables, 0);
    assert.equal(stats.ctes, 0);
    assert.equal(stats.edges, 0);
  });

  it('counts tables correctly', () => {
    const graph = {
      nodes: [
        { data: { id: 't1', type: 'table' } },
        { data: { id: 't2', type: 'table' } },
        { data: { id: 'c1', type: 'cte' } },
      ],
      edges: [{ data: { source: 't1', target: 't2', joinType: 'JOIN' } }]
    };
    const stats = getGraphStats(graph);
    assert.equal(stats.nodes, 3);
    assert.equal(stats.tables, 2);
    assert.equal(stats.ctes, 1);
    assert.equal(stats.edges, 1);
  });

  it('counts edges correctly', () => {
    const graph = {
      nodes: [
        { data: { id: 'a', type: 'table' } },
        { data: { id: 'b', type: 'table' } },
        { data: { id: 'c', type: 'table' } },
      ],
      edges: [
        { data: { source: 'a', target: 'b', joinType: 'JOIN' } },
        { data: { source: 'b', target: 'c', joinType: 'JOIN' } },
      ]
    };
    const stats = getGraphStats(graph);
    assert.equal(stats.edges, 2);
  });
});
