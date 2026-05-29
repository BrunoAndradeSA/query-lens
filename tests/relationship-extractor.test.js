import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAst } from '../scripts/parser/ast-builder.js';
import { extractRelationships } from '../scripts/parser/relationship-extractor.js';

describe('extractRelationships', () => {
  it('returns empty arrays for null input', () => {
    const result = extractRelationships(null);
    assert.deepEqual(result, { tables: [], relationships: [], subqueries: [] });
  });

  it('returns empty arrays for no-statement AST', () => {
    const result = extractRelationships({});
    assert.deepEqual(result, { tables: [], relationships: [], subqueries: [] });
  });
});

describe('extractRelationships — table extraction', () => {
  it('extracts a single table', () => {
    const ast = buildAst('SELECT * FROM users');
    const result = extractRelationships(ast);
    assert.equal(result.tables.length, 1);
    assert.equal(result.tables[0].name, 'users');
  });

  it('extracts table with alias', () => {
    const ast = buildAst('SELECT * FROM users u');
    const result = extractRelationships(ast);
    assert.equal(result.tables.length, 1);
    assert.equal(result.tables[0].alias, 'u');
  });

  it('extracts multiple comma-separated tables', () => {
    const ast = buildAst('SELECT * FROM users u, orders o');
    const result = extractRelationships(ast);
    assert.equal(result.tables.length, 2);
    const names = result.tables.map(t => t.name).sort();
    assert.deepEqual(names, ['orders', 'users']);
  });

  it('extracts schema-qualified table', () => {
    const ast = buildAst('SELECT * FROM hr.employees e');
    const result = extractRelationships(ast);
    assert.equal(result.tables[0].schema, 'hr');
    assert.equal(result.tables[0].name, 'employees');
  });
});

describe('extractRelationships — JOIN extraction', () => {
  it('extracts INNER JOIN relationship', () => {
    const ast = buildAst('SELECT * FROM a INNER JOIN b ON a.id = b.id');
    const result = extractRelationships(ast);
    assert.equal(result.relationships.length, 1);
    assert.equal(result.relationships[0].joinType, 'INNER JOIN');
  });

  it('extracts LEFT JOIN relationship', () => {
    const ast = buildAst('SELECT * FROM a LEFT JOIN b ON a.id = b.id');
    const result = extractRelationships(ast);
    assert.equal(result.relationships.length, 1);
    assert.equal(result.relationships[0].joinType, 'LEFT JOIN');
  });

  it('extracts RIGHT JOIN relationship', () => {
    const ast = buildAst('SELECT * FROM a RIGHT JOIN b ON a.id = b.id');
    const result = extractRelationships(ast);
    assert.equal(result.relationships.length, 1);
    assert.equal(result.relationships[0].joinType, 'RIGHT JOIN');
  });

  it('extracts CROSS JOIN relationship', () => {
    const ast = buildAst('SELECT * FROM a CROSS JOIN b');
    const result = extractRelationships(ast);
    assert.equal(result.relationships.length, 1);
    assert.equal(result.relationships[0].joinType, 'CROSS JOIN');
  });

  it('extracts FULL JOIN relationship', () => {
    const ast = buildAst('SELECT * FROM a FULL JOIN b ON a.id = b.id');
    const result = extractRelationships(ast);
    assert.equal(result.relationships.length, 1);
    assert.equal(result.relationships[0].joinType, 'FULL JOIN');
  });

  it('extracts multiple JOINs', () => {
    const ast = buildAst('SELECT * FROM a JOIN b ON a.id = b.id LEFT JOIN c ON b.id = c.id');
    const rel = extractRelationships(ast);
    assert.equal(rel.relationships.length, 2);
    assert.equal(rel.relationships[0].joinType, 'JOIN');
    assert.equal(rel.relationships[1].joinType, 'LEFT JOIN');
  });

  it('assigns correct source/target in relationship', () => {
    const ast = buildAst('SELECT * FROM a INNER JOIN b ON a.id = b.id');
    const result = extractRelationships(ast);
    const rel = result.relationships[0];
    assert.ok(rel.source);
    assert.ok(rel.target);
    assert.notEqual(rel.source, rel.target);
  });
});

describe('extractRelationships — CTE tables', () => {
  it('extracts CTE as a table', () => {
    const ast = buildAst('WITH cte AS (SELECT 1 AS x FROM dual) SELECT x FROM cte');
    const result = extractRelationships(ast);
    const cteTable = result.tables.find(t => t.type === 'cte');
    assert.ok(cteTable);
    assert.equal(cteTable.name, 'cte');
  });

  it('extracts tables from CTE query', () => {
    const ast = buildAst('WITH cte AS (SELECT * FROM t1 INNER JOIN t2 ON t1.id = t2.id) SELECT * FROM cte');
    const result = extractRelationships(ast);
    const uniqueNames = [...new Set(result.tables.map(t => t.name))];
    assert.ok(uniqueNames.includes('t1'));
    assert.ok(uniqueNames.includes('t2'));
  });

  it('extracts relationships inside CTE query', () => {
    const ast = buildAst('WITH cte AS (SELECT * FROM t1 INNER JOIN t2 ON t1.id = t2.id) SELECT * FROM cte');
    const result = extractRelationships(ast);
    assert.ok(result.relationships.length >= 1);
  });
});

describe('extractRelationships — subqueries in columns', () => {
  it('extracts tables from scalar subquery in column list', () => {
    const ast = buildAst(`SELECT
  id,
  (SELECT name FROM t2 WHERE t2.id = t1.id) AS name
FROM t1`);
    const result = extractRelationships(ast);
    const tableNames = result.tables.map(t => t.name);
    assert.ok(tableNames.includes('t2'), 't2 should be extracted from scalar subquery');
  });

  it('extracts relationships from scalar subquery in column list', () => {
    const ast = buildAst(`SELECT
  id,
  (SELECT name FROM t2 WHERE t2.id = t1.id) AS name
FROM t1`);
    const result = extractRelationships(ast);
    assert.ok(result.relationships.length > 0);
  });
});

describe('extractRelationships — derived tables in FROM', () => {
  it('extracts tables from subquery in FROM clause', () => {
    const ast = buildAst('SELECT * FROM (SELECT id, name FROM t1) sub WHERE sub.id > 10');
    const result = extractRelationships(ast);
    const tableNames = result.tables.map(t => t.name);
    assert.ok(tableNames.includes('t1'));
  });
});

describe('extractRelationships — full query coverage', () => {
  it('extracts 5 tables from default query', () => {
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
    const result = extractRelationships(ast);
    assert.equal(result.tables.length, 5);
    assert.equal(result.relationships.length, 4);
  });

  it('extracts 4 tables from vendedores query', () => {
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
    const result = extractRelationships(ast);
    assert.equal(result.tables.length, 4);
    assert.equal(result.relationships.length, 3);
  });

  it('extracts tables from complex CTE query', () => {
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
    const result = extractRelationships(ast);
    const uniqueNames = [...new Set(result.tables.map(t => t.name))];
    assert.ok(uniqueNames.includes('pedidos'));
    assert.ok(uniqueNames.includes('vendedores'));
    assert.ok(uniqueNames.includes('departamentos'));
    assert.ok(uniqueNames.includes('vendas_agrupadas'));
    assert.ok(uniqueNames.includes('ranking_vendedores'));
  });
});

describe('extractRelationships — processJoinInfo source detection', () => {
  it('detects correct source from join fields', () => {
    const sql = 'SELECT * FROM customers c LEFT JOIN addresses a ON c.customer_id = a.customer_id';
    const ast = buildAst(sql);
    const result = extractRelationships(ast);
    assert.equal(result.relationships.length, 1);
    const rel = result.relationships[0];
    const srcTable = result.tables.find(t => t.id === rel.source);
    const tgtTable = result.tables.find(t => t.id === rel.target);
    assert.ok(srcTable);
    assert.ok(tgtTable);
  });
});
