import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAst } from '../scripts/parser/ast-builder.js';

describe('buildAst — basic functionality', () => {
  it('returns errors property for empty SQL', () => {
    const result = buildAst('');
    assert.ok(result.errors);
    assert.ok(result.errors.length > 0);
  });

  it('parses valid SELECT without errors', () => {
    const result = buildAst('SELECT 1 FROM dual');
    assert.equal(result.errors.length, 0);
    assert.ok(result.statement);
    assert.equal(result.statement.type, 'select');
  });

  it('returns statement with columns array', () => {
    const result = buildAst('SELECT id, name FROM users');
    assert.equal(result.errors.length, 0);
    assert.ok(Array.isArray(result.statement.columns));
  });
});

describe('buildAst — columns', () => {
  it('extracts column aliases', () => {
    const sql = 'SELECT a.id AS user_id, a.name FROM accounts a';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    const cols = result.statement.columns;
    assert.equal(cols[0].alias, 'user_id');
  });

  it('extracts column expressions', () => {
    const sql = "SELECT first_name || ' ' || last_name AS full_name FROM employees";
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.columns[0].alias, 'full_name');
  });

  it('parses aggregate columns', () => {
    const sql = 'SELECT COUNT(*) AS cnt, SUM(amount) AS total FROM orders';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.columns[0].alias, 'cnt');
    assert.equal(result.statement.columns[1].alias, 'total');
  });

  it('parses scalar subquery in columns', () => {
    const sql = `SELECT id, (SELECT name FROM t2 WHERE t2.id = t1.id) AS name FROM t1`;
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.columns.length, 2);
  });

  it('parses window function in columns', () => {
    const sql = 'SELECT RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS rnk FROM emp';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.columns[0].alias, 'rnk');
  });
});

describe('buildAst — FROM / tables', () => {
  it('extracts FROM tables', () => {
    const result = buildAst('SELECT * FROM users u');
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.from.length, 1);
    assert.equal(result.statement.from[0].name, 'users');
    assert.equal(result.statement.from[0].alias, 'u');
  });

  it('extracts schema-qualified tables', () => {
    const result = buildAst('SELECT * FROM hr.employees e');
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.from[0].schema, 'hr');
    assert.equal(result.statement.from[0].name, 'employees');
  });

  it('extracts multiple FROM tables', () => {
    const result = buildAst('SELECT * FROM t1, t2');
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.from.length, 2);
  });
});

describe('buildAst — JOINs', () => {
  it('extracts INNER JOIN with ON condition', () => {
    const sql = 'SELECT * FROM a INNER JOIN b ON a.id = b.id';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    const join = result.statement.from[1]?.joinInfo;
    assert.equal(join.type, 'INNER JOIN');
  });

  it('extracts LEFT JOIN', () => {
    const result = buildAst('SELECT * FROM a LEFT JOIN b ON a.id = b.id');
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.from[1].joinInfo.type, 'LEFT JOIN');
  });

  it('extracts multiple JOINs', () => {
    const sql = 'SELECT * FROM a JOIN b ON a.id = b.id LEFT JOIN c ON b.id = c.id';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    const joined = result.statement.from.filter(t => t.joinInfo);
    assert.equal(joined.length, 2);
  });
});

describe('buildAst — WHERE', () => {
  it('extracts WHERE clause', () => {
    const result = buildAst("SELECT * FROM t WHERE status = 'active'");
    assert.equal(result.errors.length, 0);
    assert.ok(result.statement.where);
  });

  it('extracts BETWEEN with DATE literals', () => {
    const sql = "SELECT * FROM t WHERE dt BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'";
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
  });

  it('extracts IN clause', () => {
    const result = buildAst("SELECT * FROM t WHERE id IN (1, 2, 3)");
    assert.equal(result.errors.length, 0);
  });

  it('extracts IS NULL', () => {
    const result = buildAst('SELECT * FROM t WHERE name IS NULL');
    assert.equal(result.errors.length, 0);
  });

  it('extracts LIKE', () => {
    const result = buildAst("SELECT * FROM t WHERE name LIKE '%foo%'");
    assert.equal(result.errors.length, 0);
  });
});

describe('buildAst — OVER / window functions', () => {
  it('parses RANK() OVER with PARTITION BY', () => {
    const sql = 'SELECT RANK() OVER (PARTITION BY dept ORDER BY sal) AS r FROM emp';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
  });

  it('parses aggregate with OVER', () => {
    const sql = 'SELECT COUNT(*) OVER (PARTITION BY dept) AS cnt FROM emp';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
  });
});

describe('buildAst — CTE / WITH', () => {
  it('extracts CTE structure', () => {
    const sql = 'WITH cte AS (SELECT 1 AS x FROM dual) SELECT x FROM cte';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.ok(result.ctes);
    assert.equal(result.ctes.length, 1);
    assert.equal(result.ctes[0].name, 'cte');
  });

  it('extracts multiple CTEs', () => {
    const sql = `WITH
  a AS (SELECT 1 AS x FROM dual),
  b AS (SELECT 2 AS y FROM dual)
SELECT * FROM a CROSS JOIN b`;
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.equal(result.ctes.length, 2);
  });

  it('parses CTE with JOIN inside', () => {
    const sql = `WITH cte AS (
  SELECT t1.id, t2.name
  FROM t1
  INNER JOIN t2 ON t1.id = t2.ref_id
)
SELECT * FROM cte`;
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
  });
});

describe('buildAst — GROUP BY / HAVING / ORDER BY', () => {
  it('extracts GROUP BY', () => {
    const result = buildAst('SELECT dept, COUNT(*) FROM emp GROUP BY dept');
    assert.equal(result.errors.length, 0);
    assert.ok(result.statement.groupBy);
  });

  it('extracts HAVING', () => {
    const sql = 'SELECT dept, SUM(sal) FROM emp GROUP BY dept HAVING SUM(sal) > 10000';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.ok(result.statement.having);
  });

  it('extracts ORDER BY', () => {
    const result = buildAst('SELECT * FROM t ORDER BY name DESC');
    assert.equal(result.errors.length, 0);
    assert.ok(result.statement.orderBy);
    assert.equal(result.statement.orderBy.length, 1);
  });

  it('extracts ORDER BY multiple columns', () => {
    const result = buildAst('SELECT * FROM t ORDER BY dept ASC, salary DESC');
    assert.equal(result.errors.length, 0);
    assert.equal(result.statement.orderBy.length, 2);
  });
});

describe('buildAst — DDL handling', () => {
  it('handles CREATE OR REPLACE VIEW', () => {
    const sql = `CREATE OR REPLACE VIEW my_view AS
SELECT a.id, a.name FROM accounts a`;
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
  });

  it('handles CREATE VIEW', () => {
    const sql = `CREATE VIEW my_view AS
SELECT * FROM employees`;
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
  });
});

describe('buildAst — UNION / set operations', () => {
  it('extracts UNION ALL', () => {
    const sql = 'SELECT id FROM t1 UNION ALL SELECT id FROM t2';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.ok(result.unions);
    assert.equal(result.unions.length, 1);
  });

  it('extracts UNION', () => {
    const sql = 'SELECT id FROM t1 UNION SELECT id FROM t2';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
    assert.equal(result.unions.length, 1);
  });

  it('extracts MINUS', () => {
    const sql = 'SELECT id FROM t1 MINUS SELECT id FROM t2';
    const result = buildAst(sql);
    assert.equal(result.errors.length, 0);
  });
});

describe('validateSql', () => {
  it('returns valid for correct SQL', () => {
    const result = buildAst('SELECT 1 FROM dual');
    assert.equal(result.errors.length, 0);
  });

  it('returns errors for empty SQL', () => {
    const result = buildAst('');
    assert.ok(result.errors.length > 0);
  });
});
