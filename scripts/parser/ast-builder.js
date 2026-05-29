import { parse } from './sql-parser.js';

export function buildAst(sql) {
  const rawAst = parse(sql);
  return normalizeAst(rawAst);
}

function normalizeAst(ast) {
  if (!ast || ast._error) {
    return { type: 'query', statement: null, ctes: null, unions: null, errors: ast?._parserErrors || [{ message: ast?._error || 'Failed to parse SQL' }] };
  }

  const normalized = {
    type: 'query',
    ctes: normalizeCtes(ast.ctes),
    statement: normalizeStatement(ast.statement),
    unions: normalizeUnions(ast.unions),
    errors: ast._parserErrors || []
  };

  return normalized;
}

function normalizeCtes(ctes) {
  if (!ctes) return null;
  if (Array.isArray(ctes)) {
    return ctes.map(cte => ({
      name: typeof cte.name === 'string' ? cte.name : cte.name?.name || 'cte',
      columns: cte.columns || null,
      query: normalizeStatement(cte.query),
      originalName: cte.name
    }));
  }
  if (ctes.ctes) {
    return ctes.ctes.map(cte => ({
      name: typeof cte.name === 'string' ? cte.name : cte.name?.name || 'cte',
      columns: cte.columns || null,
      query: normalizeStatement(cte.query),
      originalName: cte.name
    }));
  }
  return null;
}

function normalizeStatement(stmt) {
  if (!stmt) return null;
  if (stmt.type === 'select') {
    return {
      type: 'select',
      distinct: !!stmt.distinct,
      columns: normalizeColumns(stmt.columns),
      from: normalizeFrom(stmt.from),
      where: stmt.where || null,
      groupBy: stmt.groupBy || null,
      having: stmt.having || null,
      orderBy: stmt.orderBy || null,
      connectBy: stmt.connectBy || null
    };
  }
  return stmt;
}

function normalizeColumns(columns) {
  if (!columns || !Array.isArray(columns)) return [];
  return columns.map(col => ({
    expression: col.expression || col,
    alias: col.alias || null
  }));
}

function normalizeFrom(from) {
  if (!from || !Array.isArray(from)) return [];
  return from.map(table => normalizeTableRef(table));
}

function normalizeTableRef(ref) {
  if (!ref) return null;
  const base = {
    type: ref.type || 'table',
    alias: ref.alias || null,
    joinInfo: ref.joinInfo ? {
      type: ref.joinInfo.type || 'JOIN',
      natural: !!ref.joinInfo.natural,
      using: ref.joinInfo.using || null,
      conditions: (ref.joinInfo.conditions || []).map(c => c)
    } : null
  };

  if (ref.type === 'table') {
    base.name = ref.name;
    base.schema = ref.schema || null;
    base.dbLink = ref.dbLink || null;
  } else if (ref.type === 'subquery') {
    base.query = normalizeStatement(ref.query);
  } else if (ref.type === 'lateral') {
    base.expression = ref.expression;
  }

  return base;
}

function normalizeUnions(unions) {
  if (!unions || !Array.isArray(unions)) return null;
  return unions.map(u => ({
    operator: u.operator,
    all: !!u.all,
    statement: normalizeStatement(u.statement)
  }));
}

export function validateSql(sql) {
  const ast = buildAst(sql);
  return {
    valid: !ast.errors || ast.errors.length === 0,
    errors: ast.errors || [],
    ast
  };
}
