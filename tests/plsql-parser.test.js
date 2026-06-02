import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, PLSQLParser } from '../scripts/parser/plsql-parser.js';
import { analyzePackage } from '../scripts/parser/package-analyzer.js';
import { buildCallGraphModel, getCallGraphStats } from '../scripts/graph/call-graph-builder.js';
import { detectCodeType, CODE_TYPE } from '../scripts/parser/code-type-detector.js';

describe('detectCodeType', () => {
  it('detects SQL code', () => {
    assert.equal(detectCodeType('SELECT * FROM dual'), CODE_TYPE.SQL);
  });

  it('detects Oracle Package spec', () => {
    const code = `CREATE OR REPLACE PACKAGE my_pkg AS
      PROCEDURE proc1;
    END my_pkg;
    /`;
    assert.equal(detectCodeType(code), CODE_TYPE.PACKAGE);
  });

  it('detects Oracle Package body', () => {
    const code = `CREATE OR REPLACE PACKAGE BODY my_pkg AS
      PROCEDURE proc1 IS BEGIN NULL; END;
    END my_pkg;
    /`;
    assert.equal(detectCodeType(code), CODE_TYPE.PACKAGE);
  });

  it('detects CREATE PACKAGE without OR REPLACE', () => {
    const code = `CREATE PACKAGE my_pkg AS END;`;
    assert.equal(detectCodeType(code), CODE_TYPE.PACKAGE);
  });

  it('returns UNKNOWN for empty input', () => {
    assert.equal(detectCodeType(''), CODE_TYPE.UNKNOWN);
    assert.equal(detectCodeType('   '), CODE_TYPE.UNKNOWN);
    assert.equal(detectCodeType(null), CODE_TYPE.UNKNOWN);
  });

  it('returns SQL for CREATE VIEW', () => {
    assert.equal(detectCodeType('CREATE VIEW v AS SELECT * FROM t'), CODE_TYPE.SQL);
  });
});

describe('tokenize - PL/SQL', () => {
  it('tokenizes simple PL/SQL', () => {
    const tokens = tokenize('CREATE OR REPLACE PACKAGE pkg AS END;');
    assert.ok(tokens.length >= 6);
  });

  it('ignores single-line comments', () => {
    const tokens = tokenize('-- comment\nCREATE PACKAGE pkg AS END;');
    const comments = tokens.filter(t => t.type === 'COMMENT');
    assert.equal(comments.length, 1);
  });

  it('ignores block comments', () => {
    const tokens = tokenize('/* comment */ CREATE PACKAGE pkg AS END;');
    const comments = tokens.filter(t => t.type === 'COMMENT');
    assert.equal(comments.length, 1);
  });

  it('tokenizes := assignment', () => {
    const tokens = tokenize('v_var NUMBER := 42;');
    assert.ok(tokens.some(t => t.value === ':='));
  });
});

describe('PLSQLParser - Package Spec', () => {
  it('parses package name', () => {
    const code = `CREATE OR REPLACE PACKAGE test_pkg AS
      PROCEDURE proc1;
    END test_pkg;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.name.toUpperCase(), 'TEST_PKG');
    assert.ok(result.spec);
  });

  it('parses public procedures', () => {
    const code = `CREATE PACKAGE test_pkg AS
      PROCEDURE proc1;
      PROCEDURE proc2(p_id IN NUMBER);
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.spec.procedures.length, 2);
    assert.equal(result.spec.procedures[0].name.toUpperCase(), 'PROC1');
    assert.equal(result.spec.procedures[1].name.toUpperCase(), 'PROC2');
  });

  it('parses public functions', () => {
    const code = `CREATE PACKAGE test_pkg AS
      FUNCTION func1 RETURN NUMBER;
      FUNCTION func2(p_id IN NUMBER) RETURN VARCHAR2;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.spec.functions.length, 2);
    assert.equal(result.spec.functions[0].name.toUpperCase(), 'FUNC1');
    assert.equal(result.spec.functions[0].returnType.toUpperCase(), 'NUMBER');
    assert.equal(result.spec.functions[1].name.toUpperCase(), 'FUNC2');
    assert.equal(result.spec.functions[1].returnType.toUpperCase(), 'VARCHAR2');
  });

  it('parses constants', () => {
    const code = `CREATE PACKAGE test_pkg AS
      gc_max CONSTANT NUMBER := 100;
      gc_name CONSTANT VARCHAR2(100) := 'TEST';
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.spec.constants.length, 2);
    assert.equal(result.spec.constants[0].isConstant, true);
  });

  it('parses global variables', () => {
    const code = `CREATE PACKAGE test_pkg AS
      gv_user VARCHAR2(100);
      gv_count NUMBER := 0;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.spec.globalVariables.length, 2);
  });
});

describe('PLSQLParser - Package Body', () => {
  it('parses package body name', () => {
    const code = `CREATE OR REPLACE PACKAGE BODY test_pkg AS
      PROCEDURE proc1 IS BEGIN NULL; END;
    END test_pkg;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.name.toUpperCase(), 'TEST_PKG');
    assert.ok(result.body);
  });

  it('parses private procedures in body', () => {
    const code = `CREATE PACKAGE BODY test_pkg AS
      PROCEDURE private_proc IS
        v_val NUMBER;
      BEGIN
        v_val := 1;
      END;
      PROCEDURE public_proc IS
      BEGIN
        private_proc;
      END;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.ok(result.body.privateProcedures.length >= 1);
  });

  it('parses private functions in body', () => {
    const code = `CREATE PACKAGE BODY test_pkg AS
      FUNCTION private_func RETURN NUMBER IS
        v_val NUMBER;
      BEGIN
        RETURN 1;
      END;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.ok(result.body.privateFunctions.length >= 1);
  });

  it('extracts internal procedure calls', () => {
    const code = `CREATE PACKAGE BODY test_pkg AS
      PROCEDURE proc_a IS
      BEGIN
        proc_b;
      END;
      PROCEDURE proc_b IS
      BEGIN
        NULL;
      END;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    const procA = result.body.privateProcedures.find(p => p.name.toUpperCase() === 'PROC_A');
    assert.ok(procA, 'proc_a should be found');
    assert.ok(procA.calls, 'proc_a should have calls');
    assert.ok(procA.calls.some(c => c.name.toUpperCase() === 'PROC_B'),
      'proc_a should call proc_b');
  });
});

describe('analyzePackage - Semantic Model', () => {
  it('builds semantic model from package spec', () => {
    const code = `CREATE PACKAGE test_pkg AS
      PROCEDURE proc1;
      FUNCTION func1 RETURN NUMBER;
      gc_const CONSTANT NUMBER := 10;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);

    const packageNode = analysis.nodes.find(n => n.type === 'PACKAGE');
    assert.ok(packageNode);
    assert.equal(packageNode.name.toUpperCase(), 'TEST_PKG');

    const procNode = analysis.nodes.find(n => n.type === 'PROCEDURE');
    assert.ok(procNode);
    assert.equal(procNode.visibility, 'PUBLIC');

    const funcNode = analysis.nodes.find(n => n.type === 'FUNCTION');
    assert.ok(funcNode);

    const constNode = analysis.nodes.find(n => n.type === 'CONSTANT');
    assert.ok(constNode);
  });

  it('generates DECLARES edges', () => {
    const code = `CREATE PACKAGE test_pkg AS
      PROCEDURE proc1;
      FUNCTION func1 RETURN NUMBER;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);

    const declaresEdges = analysis.edges.filter(e => e.type === 'DECLARES');
    assert.equal(declaresEdges.length, 2);
  });

  it('generates CALLS edges', () => {
    const code = `CREATE OR REPLACE PACKAGE test_pkg AS
      PROCEDURE proc_a;
      PROCEDURE proc_b;
    END;
    /
    CREATE OR REPLACE PACKAGE BODY test_pkg AS
      PROCEDURE proc_a IS
      BEGIN
        proc_b;
      END;
      PROCEDURE proc_b IS
      BEGIN
        NULL;
      END;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);

    const callsEdges = analysis.edges.filter(e => e.type === 'CALLS');
    assert.equal(callsEdges.length, 1);
  });
});

describe('buildCallGraphModel', () => {
  it('builds cytoscape-compatible model', () => {
    const code = `CREATE PACKAGE test_pkg AS
      PROCEDURE proc1;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);
    const model = buildCallGraphModel(analysis);

    assert.ok(model.nodes.length > 0);
    assert.ok(model.edges.length > 0);

    for (const node of model.nodes) {
      assert.ok(node.data.id);
      assert.ok(node.data.isCallGraph);
      assert.ok(node.data.nodeType);
    }
  });

  it('marks call graph edges', () => {
    const code = `CREATE PACKAGE test_pkg AS
      PROCEDURE proc_a;
      PROCEDURE proc_b;
    END;
    /
    CREATE PACKAGE BODY test_pkg AS
      PROCEDURE proc_a IS BEGIN proc_b; END;
      PROCEDURE proc_b IS BEGIN NULL; END;
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);
    const model = buildCallGraphModel(analysis);

    const callsEdge = model.edges.find(e => e.data.edgeType === 'CALLS');
    assert.ok(callsEdge);
    assert.ok(callsEdge.data.isCallGraph);
  });
});

describe('Robustness', () => {
  it('ignores SHOW ERRORS', () => {
    const code = `CREATE PACKAGE test_pkg AS
      PROCEDURE proc1;
    END test_pkg;
    /
    SHOW ERRORS`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.ok(result.spec);
  });

  it('handles multi-line declarations', () => {
    const code = `CREATE PACKAGE test_pkg AS
      PROCEDURE proc1(
        p_id IN NUMBER,
        p_name IN VARCHAR2
      );
    END;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.spec.procedures.length, 1);
    assert.ok(result.spec.procedures[0].params.length >= 2);
  });

  it('handles empty package', () => {
    const code = `CREATE PACKAGE empty_pkg AS
    END empty_pkg;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.ok(result.spec);
  });

  it('handles whitespace variations', () => {
    const code = `CREATE PACKAGE    ws_pkg   AS
      PROCEDURE   proc1   ;
    END   ;
    /`;
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.equal(result.spec.procedures.length, 1);
  });
});

describe('Complete Customer Package Example', () => {
  const code = `CREATE OR REPLACE PACKAGE customer_pkg AS
  gc_max_credit CONSTANT NUMBER(10,2) := 50000.00;
  gc_min_order CONSTANT NUMBER(10,2) := 10.00;

  gv_session_user VARCHAR2(100);
  gv_log_level VARCHAR2(20) := 'INFO';

  PROCEDURE processar_cliente(
    p_cliente_id IN NUMBER,
    p_acao IN VARCHAR2 DEFAULT 'CONSULTAR'
  );

  FUNCTION calcular_limite_credito(
    p_cliente_id IN NUMBER
  ) RETURN NUMBER;

  FUNCTION obter_status_cliente(
    p_cliente_id IN NUMBER
  ) RETURN VARCHAR2;

END customer_pkg;
/

CREATE OR REPLACE PACKAGE BODY customer_pkg AS
  gv_process_count NUMBER := 0;

  PROCEDURE carregar_cliente(
    p_cliente_id IN NUMBER
  ) IS
    v_nome VARCHAR2(100);
  BEGIN
    SELECT name INTO v_nome FROM customers WHERE customer_id = p_cliente_id;
    gv_process_count := gv_process_count + 1;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      NULL;
  END;

  FUNCTION validar_cliente_ativo(
    p_cliente_id IN NUMBER
  ) RETURN BOOLEAN IS
    v_status VARCHAR2(20);
  BEGIN
    SELECT 'ACTIVE' INTO v_status FROM customers WHERE customer_id = p_cliente_id;
    RETURN TRUE;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RETURN FALSE;
  END;

  PROCEDURE processar_cliente(
    p_cliente_id IN NUMBER,
    p_acao IN VARCHAR2 DEFAULT 'CONSULTAR'
  ) IS
    v_limite NUMBER(10,2);
  BEGIN
    carregar_cliente(p_cliente_id);

    IF p_acao = 'CONSULTAR' THEN
      v_limite := calcular_limite_credito(p_cliente_id);
    ELSIF p_acao = 'VALIDAR' THEN
      IF validar_cliente_ativo(p_cliente_id) THEN
        v_limite := calcular_limite_credito(p_cliente_id);
      END IF;
    END IF;
  END;

  FUNCTION calcular_limite_credito(
    p_cliente_id IN NUMBER
  ) RETURN NUMBER IS
    v_limite NUMBER(10,2);
    v_status VARCHAR2(20);
  BEGIN
    v_status := obter_status_cliente(p_cliente_id);

    IF v_status = 'PREMIUM' THEN
      v_limite := gc_max_credit;
    ELSE
      v_limite := 5000.00;
    END IF;

    RETURN v_limite;
  END;

  FUNCTION obter_status_cliente(
    p_cliente_id IN NUMBER
  ) RETURN VARCHAR2 IS
    v_total_orders NUMBER;
  BEGIN
    SELECT COUNT(*) INTO v_total_orders
    FROM orders WHERE customer_id = p_cliente_id;

    IF v_total_orders > 100 THEN
      RETURN 'PREMIUM';
    ELSIF v_total_orders > 0 THEN
      RETURN 'REGULAR';
    ELSE
      RETURN 'NEW';
    END IF;
  END;

END customer_pkg;
/`;

  it('parses the full package', () => {
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();
    assert.ok(result.spec, 'Should have spec');
    assert.ok(result.body, 'Should have body');
  });

  it('finds all public procedures and functions', () => {
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();

    assert.equal(result.spec.procedures.length, 1);
    assert.equal(result.spec.functions.length, 2);
    assert.equal(result.spec.procedures[0].name.toUpperCase(), 'PROCESSAR_CLIENTE');
  });

  it('finds all constants and variables', () => {
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();

    assert.equal(result.spec.constants.length, 2);
    assert.equal(result.spec.globalVariables.length, 2);
  });

  it('finds private procedures and functions', () => {
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const result = parser.parse();

    assert.ok(result.body.privateProcedures.length >= 1);
    assert.ok(result.body.privateFunctions.length >= 1);
  });

  it('correctly maps visibility', () => {
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);

    const publicNodes = analysis.nodes.filter(n => n.visibility === 'PUBLIC');
    const privateNodes = analysis.nodes.filter(n => n.visibility === 'PRIVATE');

    assert.ok(publicNodes.length >= 3);
    assert.ok(privateNodes.length >= 2);
  });

  it('builds complete call graph with all edges', () => {
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);
    const model = buildCallGraphModel(analysis);

    assert.ok(model.nodes.length > 0, 'Should have nodes');
    assert.ok(model.edges.length > 0, 'Should have edges');

    const callsEdges = model.edges.filter(e => e.data.edgeType === 'CALLS');
    assert.ok(callsEdges.length >= 3,
      `Expected at least 3 CALLS edges, got ${callsEdges.length}`);
  });

  it('GET call graph stats', () => {
    const tokens = tokenize(code);
    const parser = new PLSQLParser(tokens);
    const parsed = parser.parse();
    const analysis = analyzePackage(parsed);
    const model = buildCallGraphModel(analysis);
    const stats = getCallGraphStats(model);

    assert.ok(stats.nodes > 0);
    assert.ok(stats.edges > 0);
    assert.ok(stats.procedures > 0);
    assert.ok(stats.functions > 0);
    assert.ok(stats.constants >= 2);
    assert.ok(stats.variables >= 2);
    assert.ok(stats.calls >= 3);
    assert.ok(stats.declarations > 0);
  });
});
