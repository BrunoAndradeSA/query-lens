import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAst } from '../scripts/parser/ast-builder.js';
import { extractRelationships } from '../scripts/parser/relationship-extractor.js';
import { buildGraphModel, getGraphStats } from '../scripts/graph/graph-builder.js';
import { estimateQueryCost, annotateGraphModel } from '../scripts/analysis/cost-estimator.js';

function runFullPipeline(sql) {
  const ast = buildAst(sql);
  const relationships = extractRelationships(ast);
  const graph = buildGraphModel(relationships);
  const cost = estimateQueryCost(ast);
  annotateGraphModel(graph, cost);
  return { ast, relationships, graph, cost };
}

describe('Full Pipeline — default query', () => {
  const sql = `SELECT
    o.order_id,
    c.first_name || ' ' || c.last_name AS customer_name,
    c.email,
    o.order_date,
    o.status,
    oi.quantity,
    oi.unit_price,
    p.product_name,
    p.category,
    a.city,
    a.state
FROM orders o
INNER JOIN customers c ON o.customer_id = c.customer_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN products p ON oi.product_id = p.product_id
LEFT JOIN addresses a ON c.customer_id = a.customer_id
WHERE o.order_date >= TO_DATE('2025-01-01', 'YYYY-MM-DD')
  AND o.status IN ('SHIPPED', 'DELIVERED')
  AND a.city IS NOT NULL
ORDER BY o.order_date DESC`;

  it('parses without errors', () => {
    const { ast } = runFullPipeline(sql);
    assert.equal(ast.errors.length, 0);
  });

  it('extracts 5 tables and 4 relationships', () => {
    const { relationships } = runFullPipeline(sql);
    assert.equal(relationships.tables.length, 5);
    assert.equal(relationships.relationships.length, 4);
  });

  it('builds graph with 5 nodes and 4 edges', () => {
    const { graph } = runFullPipeline(sql);
    assert.equal(graph.nodes.length, 5);
    assert.equal(graph.edges.length, 4);
  });

  it('calculates correct cost', () => {
    const { cost } = runFullPipeline(sql);
    assert.equal(cost.total, 5.6);
  });

  it('annotates graph with cost data', () => {
    const { graph, cost } = runFullPipeline(sql);
    assert.equal(graph._meta.totalCost, cost.total);
    graph.nodes.forEach(n => assert.ok(n.data.cost !== undefined));
    graph.edges.forEach(e => assert.ok(e.data.costWidth !== undefined));
  });

  it('reports correct stats', () => {
    const { graph } = runFullPipeline(sql);
    const stats = getGraphStats(graph);
    assert.equal(stats.nodes, 5);
    assert.equal(stats.tables, 5);
    assert.equal(stats.ctes, 0);
    assert.equal(stats.edges, 4);
  });
});

describe('Full Pipeline — vendedores query', () => {
  const sql = `SELECT
    v.nome_vendedor,
    d.nome_departamento,
    COUNT(p.id_pedido)                  AS total_pedidos,
    SUM(ip.quantidade * ip.valor_unit) AS valor_vendido,
    AVG(p.valor_total)                 AS ticket_medio
FROM vendedores v
INNER JOIN departamentos d
    ON d.id_departamento = v.id_departamento
LEFT JOIN pedidos p
    ON p.id_vendedor = v.id_vendedor
LEFT JOIN itens_pedido ip
    ON ip.id_pedido = p.id_pedido
WHERE p.status = 'FATURADO'
  AND p.data_pedido BETWEEN DATE '2026-01-01'
                         AND DATE '2026-12-31'
GROUP BY
    v.nome_vendedor,
    d.nome_departamento
HAVING SUM(ip.quantidade * ip.valor_unit) > 10000
ORDER BY valor_vendido DESC`;

  it('parses without errors', () => {
    const { ast } = runFullPipeline(sql);
    assert.equal(ast.errors.length, 0);
  });

  it('extracts 4 tables and 3 relationships', () => {
    const { relationships } = runFullPipeline(sql);
    assert.equal(relationships.tables.length, 4);
    assert.equal(relationships.relationships.length, 3);
  });

  it('builds graph with 4 nodes and 3 edges', () => {
    const { graph } = runFullPipeline(sql);
    assert.equal(graph.nodes.length, 4);
    assert.equal(graph.edges.length, 3);
  });

  it('calculates correct cost', () => {
    const { cost } = runFullPipeline(sql);
    assert.equal(cost.total, 10.5);
  });

  it('annotates graph with cost data', () => {
    const { graph, cost } = runFullPipeline(sql);
    assert.equal(graph._meta.totalCost, cost.total);
  });
});

describe('Full Pipeline — CTE query', () => {
  const sql = `WITH vendas_agrupadas AS (
    SELECT
        p.id_vendedor,
        TO_CHAR(p.data_pedido, 'YYYY-MM') AS ano_mes,
        SUM(p.valor_total)                AS total_vendas
    FROM pedidos p
    WHERE p.status = 'FATURADO'
    GROUP BY
        p.id_vendedor,
        TO_CHAR(p.data_pedido, 'YYYY-MM')
),
ranking_vendedores AS (
    SELECT
        v.id_vendedor,
        v.nome_vendedor,
        d.nome_departamento,
        va.ano_mes,
        va.total_vendas,
        RANK() OVER (
            PARTITION BY va.ano_mes
            ORDER BY va.total_vendas DESC
        ) AS ranking_mes
    FROM vendas_agrupadas va
    INNER JOIN vendedores v
        ON v.id_vendedor = va.id_vendedor
    INNER JOIN departamentos d
        ON d.id_departamento = v.id_departamento
)
SELECT
    rv.nome_vendedor,
    rv.nome_departamento,
    rv.ano_mes,
    rv.total_vendas,
    rv.ranking_mes,
    (
        SELECT COUNT(*)
        FROM pedidos p2
        WHERE p2.id_vendedor = rv.id_vendedor
          AND p2.valor_total > 5000
    ) AS pedidos_acima_5k
FROM ranking_vendedores rv
WHERE rv.ranking_mes <= 3
ORDER BY
    rv.ano_mes DESC,
    rv.ranking_mes ASC`;

  it('parses without errors', () => {
    const { ast } = runFullPipeline(sql);
    assert.equal(ast.errors.length, 0);
  });

  it('extracts CTE tables', () => {
    const { relationships } = runFullPipeline(sql);
    const uniqueNames = [...new Set(relationships.tables.map(t => t.name))];
    assert.ok(uniqueNames.includes('vendas_agrupadas'));
    assert.ok(uniqueNames.includes('ranking_vendedores'));
    assert.ok(uniqueNames.includes('pedidos'));
    assert.ok(uniqueNames.includes('vendedores'));
    assert.ok(uniqueNames.includes('departamentos'));
  });

  it('includes CTE tables in graph', () => {
    const { graph } = runFullPipeline(sql);
    const cteNodes = graph.nodes.filter(n => n.data.type === 'cte');
    assert.equal(cteNodes.length, 2);
    const names = cteNodes.map(n => n.data.rawLabel).sort();
    assert.deepEqual(names, ['ranking_vendedores', 'vendas_agrupadas']);
  });

  it('builds graph with nodes', () => {
    const { graph } = runFullPipeline(sql);
    assert.ok(graph.nodes.length > 0);
  });

  it('calculates correct cost', () => {
    const { cost } = runFullPipeline(sql);
    assert.equal(cost.total, 12);
  });

  it('annotates graph with cost data', () => {
    const { graph, cost } = runFullPipeline(sql);
    assert.equal(graph._meta.totalCost, cost.total);
    graph.nodes.forEach(n => assert.ok(n.data.cost !== undefined));
  });
});

describe('Full Pipeline — error handling', () => {
  it('handles empty SQL gracefully', () => {
    const { ast, relationships, graph, cost } = runFullPipeline('');
    assert.ok(ast.errors.length > 0);
    assert.equal(relationships.tables.length, 0);
    assert.equal(graph.nodes.length, 0);
    assert.equal(cost.total, 0);
  });

  it('handles malformed SQL gracefully', () => {
    const { ast, relationships, graph, cost } = runFullPipeline('!!! NOT SQL !!!');
    assert.ok(ast._parserErrors || (ast.errors && ast.errors.length > 0));
    assert.equal(graph.nodes.length, 0);
    assert.equal(cost.total, 0);
  });
});
