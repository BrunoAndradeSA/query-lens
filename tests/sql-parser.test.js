import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, parse } from '../scripts/parser/sql-parser.js';
import { buildAst } from '../scripts/parser/ast-builder.js';

describe('tokenize', () => {
  it('tokenizes simple SELECT', () => {
    const tokens = tokenize('SELECT a FROM b');
    assert.ok(tokens.length >= 4);
    assert.equal(tokens[0].value, 'SELECT');
    assert.equal(tokens[0].type, 'KEYWORD');
  });

  it('tokenizes string literals', () => {
    const tokens = tokenize("SELECT 'hello' FROM dual");
    assert.ok(tokens.some(t => t.type === 'STRING' && t.raw === "'hello'"));
  });

  it('tokenizes numbers', () => {
    const tokens = tokenize('SELECT 42, 3.14 FROM t');
    assert.ok(tokens.some(t => t.type === 'NUMBER' && t.value === '42'));
    assert.ok(tokens.some(t => t.type === 'NUMBER' && t.value === '3.14'));
  });

  it('tokenizes operators ||', () => {
    const tokens = tokenize("SELECT a || ' ' || b FROM t");
    const pipes = tokens.filter(t => t.value === '||');
    assert.equal(pipes.length, 2);
  });

  it('tokenizes parentheses', () => {
    const tokens = tokenize('SELECT COUNT(*) FROM t');
    assert.ok(tokens.some(t => t.type === 'PUNCTUATION' && t.value === '('));
    assert.ok(tokens.some(t => t.type === 'PUNCTUATION' && t.value === ')'));
  });
});

describe('parse — SELECT', () => {
  it('parses simple SELECT', () => {
    const result = parse('SELECT 1 FROM dual');
    assert.ok(result.statement);
    assert.equal(result.statement.type, 'select');
  });

  it('parses SELECT with multiple columns', () => {
    const sql = 'SELECT a.id, a.name, a.email FROM accounts a';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.statement.columns.length, 3);
    assert.equal(result.statement.from.length, 1);
  });

  it('parses SELECT with explicit alias (AS)', () => {
    const sql = 'SELECT a.id AS user_id FROM accounts a';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses SELECT with implicit alias', () => {
    const sql = 'SELECT a.id user_id FROM accounts a';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses DISTINCT', () => {
    const sql = 'SELECT DISTINCT status FROM orders';
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — FROM', () => {
  it('parses single table', () => {
    const result = parse('SELECT * FROM employees');
    assert.ok(result.statement);
    assert.equal(result.statement.from.length, 1);
    assert.equal(result.statement.from[0].name, 'employees');
  });

  it('parses table with alias', () => {
    const result = parse('SELECT * FROM employees e');
    assert.ok(result.statement);
    assert.equal(result.statement.from[0].name, 'employees');
    assert.equal(result.statement.from[0].alias, 'e');
  });

  it('parses schema-qualified table', () => {
    const result = parse('SELECT * FROM hr.employees e');
    assert.ok(result.statement);
    assert.equal(result.statement.from[0].schema, 'hr');
    assert.equal(result.statement.from[0].name, 'employees');
  });

  it('parses multiple tables in FROM', () => {
    const result = parse('SELECT * FROM table1 t1, table2 t2');
    assert.ok(result.statement);
    assert.equal(result.statement.from.length, 2);
  });
});

describe('parse — JOINS', () => {
  it('parses INNER JOIN', () => {
    const sql = 'SELECT * FROM a INNER JOIN b ON a.id = b.id';
    const result = parse(sql);
    assert.ok(result.statement);
    const join = result.statement.from[1]?.joinInfo;
    assert.ok(join);
    assert.equal(join.type, 'INNER JOIN');
  });

  it('parses LEFT JOIN', () => {
    const sql = 'SELECT * FROM a LEFT JOIN b ON a.id = b.id';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.statement.from[1].joinInfo.type, 'LEFT JOIN');
  });

  it('parses RIGHT JOIN', () => {
    const sql = 'SELECT * FROM a RIGHT JOIN b ON a.id = b.id';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.statement.from[1].joinInfo.type, 'RIGHT JOIN');
  });

  it('parses CROSS JOIN', () => {
    const sql = 'SELECT * FROM a CROSS JOIN b';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.statement.from[1].joinInfo.type, 'CROSS JOIN');
  });

  it('parses FULL JOIN', () => {
    const sql = 'SELECT * FROM a FULL JOIN b ON a.id = b.id';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.statement.from[1].joinInfo.type, 'FULL JOIN');
  });

  it('parses multiple JOINs', () => {
    const sql = 'SELECT * FROM a JOIN b ON a.id = b.id LEFT JOIN c ON b.id = c.id';
    const result = parse(sql);
    assert.ok(result.statement);
    const joined = result.statement.from.filter(t => t.joinInfo);
    assert.equal(joined.length, 2);
  });

  it('parses JOIN with USING clause', () => {
    const sql = 'SELECT * FROM a INNER JOIN b USING (id)';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.deepEqual(result.statement.from[1].joinInfo.using, ['id']);
  });

  it('parses NATURAL JOIN', () => {
    const sql = 'SELECT * FROM a NATURAL JOIN b';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.statement.from[1].joinInfo.natural, true);
  });
});

describe('parse — WHERE', () => {
  it('parses simple WHERE', () => {
    const result = parse("SELECT * FROM t WHERE status = 'active'");
    assert.ok(result.statement);
    assert.ok(result.statement.where);
  });

  it('parses WHERE with AND/OR', () => {
    const result = parse("SELECT * FROM t WHERE a = 1 AND b = 2 OR c = 3");
    assert.ok(result.statement);
  });

  it('parses WHERE with IN', () => {
    const result = parse("SELECT * FROM t WHERE status IN ('A', 'B', 'C')");
    assert.ok(result.statement);
  });

  it('parses WHERE with IS NOT NULL', () => {
    const result = parse('SELECT * FROM t WHERE name IS NOT NULL');
    assert.ok(result.statement);
  });

  it('parses WHERE with IS NULL', () => {
    const result = parse('SELECT * FROM t WHERE name IS NULL');
    assert.ok(result.statement);
  });

  it('parses WHERE with LIKE', () => {
    const result = parse("SELECT * FROM t WHERE name LIKE '%foo%'");
    assert.ok(result.statement);
  });

  it('parses WHERE with NOT IN', () => {
    const result = parse("SELECT * FROM t WHERE status NOT IN ('X')");
    assert.ok(result.statement);
  });
});

describe('parse — BETWEEN with DATE literals', () => {
  it('parses BETWEEN with DATE literals', () => {
    const sql = `SELECT * FROM pedidos
WHERE data_pedido BETWEEN DATE '2026-01-01' AND DATE '2026-12-31'`;
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses BETWEEN with column references', () => {
    const sql = 'SELECT * FROM t WHERE price BETWEEN min_price AND max_price';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses BETWEEN with numeric literals', () => {
    const sql = 'SELECT * FROM t WHERE age BETWEEN 18 AND 65';
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — OVER / window functions', () => {
  it('parses RANK() OVER with PARTITION BY and ORDER BY', () => {
    const sql = `SELECT RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rnk
FROM employees`;
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses ROW_NUMBER() OVER', () => {
    const sql = 'SELECT ROW_NUMBER() OVER (ORDER BY id) AS rn FROM t';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses DENSE_RANK() OVER', () => {
    const sql = 'SELECT DENSE_RANK() OVER (PARTITION BY cat ORDER BY sales DESC) FROM t';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses OVER without PARTITION BY', () => {
    const sql = 'SELECT SUM(amount) OVER (ORDER BY date) FROM t';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses aggregate with OVER and PARTITION BY', () => {
    const sql = `SELECT COUNT(*) OVER (PARTITION BY dept_id) AS cnt FROM employees`;
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — CTE (WITH)', () => {
  it('parses simple CTE', () => {
    const sql = 'WITH cte AS (SELECT 1 AS x FROM dual) SELECT x FROM cte';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.ok(result.ctes);
    assert.equal(result.ctes.length, 1);
    assert.equal(result.ctes[0].name, 'cte');
  });

  it('parses multiple CTEs', () => {
    const sql = `WITH
  a AS (SELECT 1 AS x FROM dual),
  b AS (SELECT 2 AS y FROM dual)
SELECT a.x, b.y FROM a CROSS JOIN b`;
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.ctes.length, 2);
  });

  it('parses CTE referencing another CTE', () => {
    const sql = `WITH
  step1 AS (SELECT id FROM t1),
  step2 AS (SELECT * FROM step1 WHERE id > 10)
SELECT * FROM step2`;
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — subqueries', () => {
  it('parses scalar subquery in SELECT', () => {
    const sql = `SELECT
  id,
  (SELECT name FROM t2 WHERE t2.id = t1.id) AS name
FROM t1`;
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses subquery in WHERE EXISTS', () => {
    const sql = `SELECT * FROM t1 WHERE EXISTS (SELECT 1 FROM t2 WHERE t2.id = t1.id)`;
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses subquery in WHERE IN', () => {
    const sql = `SELECT * FROM t1 WHERE id IN (SELECT id FROM t2)`;
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses subquery in FROM (derived table)', () => {
    const sql = `SELECT * FROM (SELECT id, name FROM t1) sub WHERE sub.id > 10`;
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — GROUP BY / HAVING / ORDER BY', () => {
  it('parses GROUP BY', () => {
    const sql = 'SELECT dept_id, COUNT(*) FROM employees GROUP BY dept_id';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses GROUP BY with HAVING', () => {
    const sql = 'SELECT dept_id, SUM(salary) FROM employees GROUP BY dept_id HAVING SUM(salary) > 10000';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses ORDER BY', () => {
    const sql = 'SELECT * FROM t ORDER BY name';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses ORDER BY DESC', () => {
    const sql = 'SELECT * FROM t ORDER BY created_at DESC';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses ORDER BY multiple columns', () => {
    const sql = 'SELECT * FROM t ORDER BY dept_id ASC, salary DESC';
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — string concatenation ||', () => {
  it('parses || concatenation in SELECT', () => {
    const sql = "SELECT first_name || ' ' || last_name AS full_name FROM employees";
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses || concatenation in WHERE', () => {
    const sql = "SELECT * FROM t WHERE a || b = 'ab'";
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — TO_DATE and functions', () => {
  it('parses TO_DATE', () => {
    const sql = "SELECT * FROM t WHERE date >= TO_DATE('2025-01-01', 'YYYY-MM-DD')";
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses TO_CHAR', () => {
    const sql = "SELECT TO_CHAR(dt, 'YYYY-MM') AS ym FROM t";
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses COUNT, SUM, AVG', () => {
    const sql = 'SELECT COUNT(*), SUM(amount), AVG(price) FROM t';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses NVL / COALESCE', () => {
    const sql = "SELECT NVL(name, 'N/A') AS name FROM t";
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — DDL (CREATE OR REPLACE VIEW)', () => {
  it('skips CREATE VIEW and parses SELECT', () => {
    const sql = `CREATE OR REPLACE VIEW my_view AS
SELECT a.id, a.name FROM accounts a`;
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.statement.columns.length, 2);
  });

  it('skips CREATE VIEW (without OR REPLACE)', () => {
    const sql = `CREATE VIEW my_view AS
SELECT * FROM employees`;
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('skips CREATE MATERIALIZED VIEW', () => {
    const sql = `CREATE MATERIALIZED VIEW mv AS
SELECT * FROM big_table`;
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — arithmetic operators', () => {
  it('parses + - * /', () => {
    const sql = 'SELECT price * quantity + tax - discount / 100 AS total FROM orders';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses unary minus', () => {
    const sql = 'SELECT -amount FROM transactions';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses unary plus', () => {
    const sql = 'SELECT +amount FROM transactions';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses modulo operator', () => {
    const sql = 'SELECT id % 2 AS parity FROM items';
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — CASE expressions', () => {
  it('parses simple CASE', () => {
    const sql = `SELECT CASE status
  WHEN 'A' THEN 'Active'
  WHEN 'I' THEN 'Inactive'
  ELSE 'Unknown'
END AS status_label FROM t`;
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — UNION / set operations', () => {
  it('parses UNION ALL', () => {
    const sql = 'SELECT id FROM t1 UNION ALL SELECT id FROM t2';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.ok(result.unions);
    assert.equal(result.unions.length, 1);
  });

  it('parses UNION', () => {
    const sql = 'SELECT id FROM t1 UNION SELECT id FROM t2';
    const result = parse(sql);
    assert.ok(result.statement);
    assert.equal(result.unions.length, 1);
  });

  it('parses MINUS', () => {
    const sql = 'SELECT id FROM t1 MINUS SELECT id FROM t2';
    const result = parse(sql);
    assert.ok(result.statement);
  });

  it('parses INTERSECT', () => {
    const sql = 'SELECT id FROM t1 INTERSECT SELECT id FROM t2';
    const result = parse(sql);
    assert.ok(result.statement);
  });
});

describe('parse — error handling', () => {
  it('handles empty SQL with errors', () => {
    const result = parse('');
    assert.ok(result._parserErrors || result.errors);
  });

  it('handles whitespace-only SQL with errors', () => {
    const result = parse('   ');
    assert.ok(result._parserErrors || result.errors);
  });
});

describe('parse — quoted identifiers', () => {
  it('parses quoted identifiers', () => {
    const sql = 'SELECT "My Column" FROM t';
    const result = parse(sql);
    assert.ok(result.statement);
  });
});
