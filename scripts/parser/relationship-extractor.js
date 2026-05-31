export function extractRelationships(ast) {
  const tables = new Map();
  const relationships = [];
  const subqueries = [];

  if (!ast || !ast.statement) {
    return { tables: [], relationships: [], subqueries: [] };
  }

  if (ast.ctes) {
    for (const cte of ast.ctes) {
      const cteId = `cte:${cte.name}`;
      tables.set(cteId, {
        id: cteId,
        name: cte.name,
        type: 'cte',
        originalName: cte.name,
        columns: cte.columns || [],
        fromSubquery: true
      });
      if (cte.query) {
        collectTablesAndRelationships(cte.query, tables, relationships, subqueries);
      }
    }
    for (const [, entry] of tables) {
      if (entry.type === 'table') {
        entry.cteSource = true;
      }
    }
  }

  collectTablesAndRelationships(ast.statement, tables, relationships, subqueries);

  if (ast.unions) {
    for (const union of ast.unions) {
      if (union.statement) {
        collectTablesAndRelationships(union.statement, tables, relationships, subqueries);
      }
    }
  }

  return {
    tables: Array.from(tables.values()),
    relationships,
    subqueries
  };
}

function collectTablesAndRelationships(statement, tables, relationships, subqueries, parentContext = null) {
  if (!statement || statement.type !== 'select') return;

  if (statement.from && statement.from.length > 0) {
    let prevRef = null;
    let joinOrder = 0;
    for (const tableRef of statement.from) {
      joinOrder++;
      const currentRef = processTableRef(tableRef, tables, relationships, subqueries, statement);
      if (currentRef) {
        const entry = tables.get(currentRef);
        if (entry && !entry.order) entry.order = joinOrder;
      }

      if (currentRef && prevRef && tableRef.joinInfo) {
        const joinInfo = tableRef.joinInfo;
        processJoinInfo(joinInfo, prevRef, currentRef, tables, relationships, statement);
      }

      if (currentRef) {
        prevRef = currentRef;
      }
    }
  }

  if (statement.where) {
    extractFromExpression(statement.where, tables, relationships);
  }

  if (statement.columns) {
    for (const col of statement.columns) {
      extractFromExpression(col.expression, tables, relationships);
    }
  }
}

function processTableRef(ref, tables, relationships, subqueries, parentStatement) {
  if (!ref) return null;

  if (ref.type === 'table') {
    const tableId = ref.schema ? `${ref.schema}.${ref.name}` : ref.name;

    const cteKey = `cte:${ref.name}`;
    if (tables.has(cteKey)) {
      const entry = tables.get(cteKey);
      if (ref.alias && !entry.aliases) entry.aliases = [];
      if (ref.alias && !entry.aliases.includes(ref.alias)) entry.aliases.push(ref.alias);
      return cteKey;
    }

    const key = tableId;

    if (!tables.has(key)) {
      tables.set(key, {
        id: key,
        name: ref.name,
        schema: ref.schema || null,
        alias: ref.alias || null,
        aliases: ref.alias ? [ref.alias] : [],
        type: 'table',
        dbLink: ref.dbLink || null,
        originalName: tableId,
        columns: collectReferencedColumns(ref, parentStatement)
      });
    } else {
      const entry = tables.get(key);
      if (ref.alias && !entry.aliases.includes(ref.alias)) {
        entry.aliases.push(ref.alias);
        if (!entry.alias) entry.alias = ref.alias;
      }
    }
    return key;
  }

  if (ref.type === 'subquery') {
    const subqueryId = ref.alias || `subquery_${subqueries.length + 1}`;

    if (!tables.has(subqueryId)) {
      tables.set(subqueryId, {
        id: subqueryId,
        name: ref.alias || `Subquery ${subqueries.length + 1}`,
        alias: ref.alias || null,
        type: 'subquery',
        columns: [],
        fromSubquery: true
      });
    }

    subqueries.push({
      id: subqueryId,
      alias: ref.alias || null,
      query: ref.query
    });

    if (ref.query) {
      collectTablesAndRelationships(ref.query, tables, relationships, subqueries);
    }

    return subqueryId;
  }

  if (ref.type === 'lateral') {
    const key = ref.alias || `lateral_${tables.size + 1}`;
    if (!tables.has(key)) {
      tables.set(key, {
        id: key,
        name: ref.alias || 'LATERAL',
        alias: ref.alias || null,
        type: 'subquery',
        columns: [],
        fromSubquery: true
      });
    }
    return key;
  }

  return null;
}

function processJoinInfo(joinInfo, prevKey, currentKey, tables, relationships, parentStatement) {
  if (!joinInfo) return;

  const fields = [];
  const conditions = [];

  if (joinInfo.conditions && joinInfo.conditions.length > 0) {
    for (const cond of joinInfo.conditions) {
      conditions.push(cond);
      const extractedFields = extractFieldsFromCondition(cond);
      fields.push(...extractedFields);
    }
  }

  let source = prevKey;

  if (fields.length > 0) {
    for (const f of fields) {
      const leftTable = resolveTableName(f.left?.table, tables);
      const rightTable = resolveTableName(f.right?.table, tables);
      if (rightTable && rightTable === prevKey && rightTable !== currentKey) {
        source = prevKey;
        break;
      }
      if (leftTable && leftTable === prevKey && leftTable !== currentKey) {
        source = prevKey;
        break;
      }
      if (rightTable && rightTable !== currentKey) {
        source = rightTable;
        break;
      }
      if (leftTable && leftTable !== currentKey) {
        source = leftTable;
        break;
      }
    }
  } else if (joinInfo.using) {
    source = prevKey;
  }

  const rel = {
    source,
    target: currentKey,
    joinType: joinInfo.type || 'JOIN',
    natural: joinInfo.natural || false,
    using: joinInfo.using || null,
    conditions,
    fields
  };

  if (joinInfo.using) {
    for (const col of joinInfo.using) {
      rel.fields.push({ left: { table: source, column: col, fullName: `${source}.${col}` }, right: { table: currentKey, column: col, fullName: `${currentKey}.${col}` }, operator: '=' });
    }
  }

  relationships.push(rel);
}

function resolveTableName(name, tables) {
  if (!name) return null;
  if (tables.has(name)) return name;
  for (const [key, entry] of tables) {
    if (entry.aliases && entry.aliases.includes(name)) return key;
    if (key === `cte:${name}`) return key;
  }
  return null;
}

function extractFieldsFromCondition(cond) {
  const fields = [];
  if (!cond) return fields;

  if (cond.type === 'binary' && cond.operator === '=') {
    const leftCol = resolveColumnRef(cond.left);
    const rightCol = resolveColumnRef(cond.right);
    if (leftCol && rightCol) {
      fields.push({
        left: leftCol,
        right: rightCol,
        operator: cond.operator
      });
    }
  }

  if (cond.type === 'binary' && (cond.operator === 'AND' || cond.operator === 'OR')) {
    fields.push(...extractFieldsFromCondition(cond.left));
    fields.push(...extractFieldsFromCondition(cond.right));
  }

  return fields;
}

function resolveColumnRef(expr) {
  if (!expr) return null;
  if (expr.type === 'column_ref') {
    return {
      table: expr.table || null,
      column: expr.column,
      fullName: expr.table ? `${expr.table}.${expr.column}` : expr.column
    };
  }
  return null;
}

function collectReferencedColumns(tableRef, statement) {
  const columns = new Set();

  if (!statement || !statement.columns) return [];

  for (const col of statement.columns) {
    const refs = extractColumnRefs(col.expression || col);
    for (const ref of refs) {
      const tableKey = tableRef.alias || tableRef.name;
      if (!ref.table || ref.table === tableKey) {
        columns.add(ref.column);
      }
    }
  }

  return Array.from(columns);
}

function extractFromExpression(expr, tables, relationships) {
  if (!expr) return;

  if (expr.type === 'binary' && expr.operator === '=') {
    const leftCol = resolveColumnRef(expr.left);
    const rightCol = resolveColumnRef(expr.right);
    if (leftCol && rightCol && leftCol.table && rightCol.table &&
        leftCol.table !== rightCol.table) {

      const leftTable = resolveTableName(leftCol.table, tables);
      const rightTable = resolveTableName(rightCol.table, tables);
      if (leftTable && rightTable && leftTable !== rightTable) {
        const existing = relationships.some(r =>
          (r.source === leftTable && r.target === rightTable) ||
          (r.source === rightTable && r.target === leftTable)
        );
        if (!existing) {
          relationships.push({
            source: leftTable,
            target: rightTable,
            joinType: 'WHERE',
            natural: false,
            using: null,
            conditions: [expr],
            fields: [{
              left: { ...leftCol, table: leftTable },
              right: { ...rightCol, table: rightTable },
              operator: '='
            }],
            implicit: true
          });
        }
      }
    }
  }

  if (expr.type === 'binary' && (expr.operator === 'AND' || expr.operator === 'OR')) {
    extractFromExpression(expr.left, tables, relationships);
    extractFromExpression(expr.right, tables, relationships);
  }

  if (expr.type === 'exists' && expr.query) {
    collectTablesAndRelationships(expr.query, tables, relationships, []);
  }

  if (expr.type === 'in' && expr.list && expr.list.type === 'subquery' && expr.list.query) {
    collectTablesAndRelationships(expr.list.query, tables, relationships, []);
  }

  if (expr.type === 'subquery' && expr.query) {
    collectTablesAndRelationships(expr.query, tables, relationships, []);
  }

  if (expr.type === 'function_call') {
    for (const arg of expr.args || []) {
      extractFromExpression(arg, tables, relationships);
    }
  }
}

function extractColumnRefs(expr) {
  const refs = [];
  if (!expr) return refs;

  if (expr.type === 'column_ref') {
    refs.push(expr);
  } else if (expr.type === 'binary') {
    refs.push(...extractColumnRefs(expr.left));
    refs.push(...extractColumnRefs(expr.right));
  } else if (expr.type === 'unary') {
    refs.push(...extractColumnRefs(expr.operand));
  } else if (expr.type === 'function_call' && expr.args) {
    for (const arg of expr.args) {
      refs.push(...extractColumnRefs(arg));
    }
  } else if (expr.type === 'case' && expr.cases) {
    for (const c of expr.cases) {
      refs.push(...extractColumnRefs(c.when));
      refs.push(...extractColumnRefs(c.then));
    }
    if (expr.else) refs.push(...extractColumnRefs(expr.else));
  } else if (expr.type === 'parenthesized') {
    refs.push(...extractColumnRefs(expr.expression));
  } else if (expr.type === 'in') {
    refs.push(...extractColumnRefs(expr.expression));
  } else if (expr.type === 'between') {
    refs.push(...extractColumnRefs(expr.expression));
  } else if (expr.type === 'like') {
    refs.push(...extractColumnRefs(expr.expression));
  } else if (expr.type === 'is_null') {
    refs.push(...extractColumnRefs(expr.expression));
  }

  return refs;
}
