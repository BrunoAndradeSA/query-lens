import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAst } from '../scripts/parser/ast-builder.js';
import { estimateQueryCost, annotateGraphModel } from '../scripts/analysis/cost-estimator.js';

describe('estimateQueryCost', () => {
  it('returns zero-cost structure for null input', () => {
    const result = estimateQueryCost(null);
    assert.equal(result.total, 0);
    assert.ok(Array.isArray(result.breakdown));
  });

  it('returns zero-cost structure for empty AST', () => {
    const result = estimateQueryCost({});
    assert.equal(result.total, 0);
  });

  it('returns cost > 0 for valid query with tables', () => {
    const ast = buildAst('SELECT * FROM users');
    const result = estimateQueryCost(ast);
    assert.ok(result.total > 0);
  });

  it('includes breakdown array', () => {
    const ast = buildAst('SELECT * FROM users INNER JOIN orders ON users.id = orders.user_id');
    const result = estimateQueryCost(ast);
    assert.ok(Array.isArray(result.breakdown));
    assert.ok(result.breakdown.length > 0);
  });

  it('includes tableCosts map', () => {
    const ast = buildAst('SELECT * FROM users');
    const result = estimateQueryCost(ast);
    assert.ok(result.tableCosts);
    assert.ok(result.tableCosts['users']);
  });

  it('includes edgeCosts map', () => {
    const ast = buildAst('SELECT * FROM a INNER JOIN b ON a.id = b.id');
    const result = estimateQueryCost(ast);
    assert.ok(result.edgeCosts);
    assert.ok(typeof result.edgeCosts === 'object');
  });

  it('details object exists', () => {
    const ast = buildAst('SELECT * FROM users');
    const result = estimateQueryCost(ast);
    assert.ok(result.details);
  });

  it('LEFT JOIN costs more than INNER JOIN', () => {
    const astInner = buildAst('SELECT * FROM a INNER JOIN b ON a.id = b.id');
    const astLeft = buildAst('SELECT * FROM a LEFT JOIN b ON a.id = b.id');
    const costInner = estimateQueryCost(astInner);
    const costLeft = estimateQueryCost(astLeft);
    assert.ok(costLeft.total > costInner.total, 'LEFT JOIN should cost more than INNER JOIN');
  });

  it('CROSS JOIN costs significantly more', () => {
    const astInner = buildAst('SELECT * FROM a INNER JOIN b ON a.id = b.id');
    const astCross = buildAst('SELECT * FROM a CROSS JOIN b');
    const costInner = estimateQueryCost(astInner);
    const costCross = estimateQueryCost(astCross);
    assert.ok(costCross.total > costInner.total, 'CROSS JOIN should cost more than INNER JOIN');
  });
});

describe('estimateQueryCost — GROUP BY / ORDER BY / DISTINCT', () => {
  it('GROUP BY adds cost', () => {
    const ast = buildAst('SELECT dept, COUNT(*) FROM emp GROUP BY dept');
    const result = estimateQueryCost(ast);
    const hasGroupBy = result.breakdown.some(b => b.operation === 'GROUP BY');
    assert.ok(hasGroupBy);
  });

  it('ORDER BY adds cost', () => {
    const ast = buildAst('SELECT * FROM t ORDER BY name');
    const result = estimateQueryCost(ast);
    const hasOrderBy = result.breakdown.some(b => b.operation === 'ORDER BY');
    assert.ok(hasOrderBy);
  });

  it('DISTINCT adds cost', () => {
    const ast = buildAst('SELECT DISTINCT status FROM orders');
    const result = estimateQueryCost(ast);
    const hasDistinct = result.breakdown.some(b => b.operation === 'DISTINCT');
    assert.ok(hasDistinct);
  });
});

describe('estimateQueryCost — subqueries and analytics', () => {
  it('scalar subquery adds cost', () => {
    const ast = buildAst('SELECT id, (SELECT name FROM t2 WHERE t2.id = t1.id) FROM t1');
    const result = estimateQueryCost(ast);
    const hasSubquery = result.breakdown.some(b => b.operation.includes('Subquery'));
    assert.ok(hasSubquery);
  });

  it('RANK OVER adds analytic cost', () => {
    const ast = buildAst('SELECT RANK() OVER (PARTITION BY dept ORDER BY sal) FROM emp');
    const result = estimateQueryCost(ast);
    const hasAnalytic = result.breakdown.some(b => b.operation === 'Analytic Function');
    assert.ok(hasAnalytic);
  });

  it('HAVING adds cost', () => {
    const sql = 'SELECT dept, SUM(sal) FROM emp GROUP BY dept HAVING SUM(sal) > 10000';
    const ast = buildAst(sql);
    const result = estimateQueryCost(ast);
    const hasHaving = result.breakdown.some(b => b.operation === 'HAVING');
    assert.ok(hasHaving);
  });
});

describe('estimateQueryCost — CTE', () => {
  it('CTE query adds cost', () => {
    const ast = buildAst('WITH cte AS (SELECT 1 AS x FROM dual) SELECT x FROM cte');
    const result = estimateQueryCost(ast);
    assert.ok(result.total > 0);
  });
});

describe('annotateGraphModel', () => {
  it('does nothing for null inputs', () => {
    annotateGraphModel(null, null);
    annotateGraphModel({ nodes: [], edges: [] }, null);
    annotateGraphModel(null, { total: 5, breakdown: [] });
  });

  it('adds cost to node data', () => {
    const ast = buildAst('SELECT * FROM users');
    const cost = estimateQueryCost(ast);
    const graph = { nodes: [{ data: { id: 'users' } }], edges: [] };
    annotateGraphModel(graph, cost);
    assert.ok(graph.nodes[0].data.cost !== undefined);
    assert.ok(graph.nodes[0].data.cost > 0);
  });

  it('adds costWidth to edge data', () => {
    const ast = buildAst('SELECT * FROM a INNER JOIN b ON a.id = b.id');
    const cost = estimateQueryCost(ast);
    const graph = {
      nodes: [
        { data: { id: 'a' } },
        { data: { id: 'b' } },
      ],
      edges: [{ data: { source: 'a', target: 'b', joinType: 'INNER JOIN' } }]
    };
    annotateGraphModel(graph, cost);
    assert.ok(graph.edges[0].data.costWidth !== undefined);
  });

  it('sets _meta on graph model', () => {
    const ast = buildAst('SELECT * FROM users');
    const cost = estimateQueryCost(ast);
    const graph = { nodes: [{ data: { id: 'users' } }], edges: [] };
    annotateGraphModel(graph, cost);
    assert.ok(graph._meta);
    assert.equal(graph._meta.totalCost, cost.total);
    assert.ok(Array.isArray(graph._meta.costBreakdown));
  });

  it('sets cost to 0 for nodes without tableCosts entry', () => {
    const graph = { nodes: [{ data: { id: 'unknown_table' } }], edges: [] };
    annotateGraphModel(graph, { total: 0, tableCosts: {}, edgeCosts: {}, breakdown: [], details: {} });
    assert.equal(graph.nodes[0].data.cost, 0);
  });
});

describe('estimateQueryCost — known query costs', () => {
  it('default query costs ~5.6', () => {
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
    const ast = buildAst(sql);
    const cost = estimateQueryCost(ast);
    assert.equal(cost.total, 5.6);
  });

  it('vendedores query costs ~10.5', () => {
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
    const ast = buildAst(sql);
    const cost = estimateQueryCost(ast);
    assert.equal(cost.total, 10.5);
  });

  it('CTE query costs ~12', () => {
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
    const ast = buildAst(sql);
    const cost = estimateQueryCost(ast);
    assert.equal(cost.total, 12);
  });
});
