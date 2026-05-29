const WEIGHTS = {
  TABLE_SCAN:     1.0,
  SUBQUERY_SCAN:  0.8,
  CTE_SCAN:       0.5,
  INNER_JOIN:     1.0,
  LEFT_JOIN:      1.5,
  RIGHT_JOIN:     1.5,
  FULL_JOIN:      2.0,
  CROSS_JOIN:     3.0,
  WHERE_JOIN:     1.0,
  GROUP_BY_EXPR:  1.5,
  ORDER_BY_EXPR:  1.0,
  DISTINCT:       3.0,
  ANALYTIC_FUNC:  2.0,
  SCALAR_SUBQUERY: 2.0,
  EXISTS_SUBQUERY: 3.0,
  IN_SUBQUERY:    4.0,
  BETWEEN_PRED:   1.0,
  LIKE_PRED:      1.5,
  CONNECT_BY:     5.0,
  UNION_FULL:     4.0,
  UNION_ALL:      2.0,
  OR_FACTOR:      1.2,
  EQUALITY_FILTER: -0.2,
};

export function estimateQueryCost(ast) {
  if (!ast || !ast.statement) {
    return { total: 0, breakdown: [], details: {} };
  }

  const breakdown = [];
  const details = { tableCount: 0, joinCount: 0, predicateCount: 0, hasDistinct: false, hasAnalytic: false, hasScalarSubquery: false, hasSubquery: false };

  let total = 0;

  const tableCosts = {};
  const edgeCosts = {};

  const stmt = ast.statement.statement || ast.statement;

  let tableIdx = 0;
  if (stmt.from) {
    for (const ref of stmt.from) {
      tableIdx++;
      let base = WEIGHTS.TABLE_SCAN;
      if (ref.type === 'subquery' || ref.type === 'lateral') base = WEIGHTS.SUBQUERY_SCAN;

      let joinMult = 1;
      if (ref.joinInfo) {
        const jt = ref.joinInfo.type;
        if (jt === 'LEFT JOIN' || jt === 'LEFT OUTER JOIN') joinMult = WEIGHTS.LEFT_JOIN;
        else if (jt === 'RIGHT JOIN' || jt === 'RIGHT OUTER JOIN') joinMult = WEIGHTS.RIGHT_JOIN;
        else if (jt === 'FULL JOIN' || jt === 'FULL OUTER JOIN') joinMult = WEIGHTS.FULL_JOIN;
        else if (jt === 'CROSS JOIN') joinMult = WEIGHTS.CROSS_JOIN;
        else joinMult = WEIGHTS.INNER_JOIN;

        const key = ref.alias || ref.name || ('t' + tableIdx);
        if (ref.joinInfo.conditions && ref.joinInfo.conditions.length > 0) {
          for (const cond of ref.joinInfo.conditions) {
            const preds = countPredicates(cond);
            base += preds.equality * WEIGHTS.EQUALITY_FILTER;
            base += preds.between * WEIGHTS.BETWEEN_PRED;
            base += preds.like * WEIGHTS.LIKE_PRED;
            base += preds.or * (WEIGHTS.OR_FACTOR - 1);
          }
        }
      }

      const cost = Math.max(0.3, base * joinMult);
      total += cost;

      const key = ref.alias || ref.name || ('t' + tableIdx);
      tableCosts[key] = cost;

      breakdown.push({
        operation: 'Table Scan',
        detail: (ref.name || ref.type) + (ref.alias ? ' AS ' + ref.alias : ''),
        cost: +cost.toFixed(2)
      });
    }
  }

  details.tableCount = stmt.from ? stmt.from.length : 0;
  details.joinCount = stmt.from ? stmt.from.filter(t => t.joinInfo).length : 0;

  if (stmt.where) {
    const preds = countPredicates(stmt.where);
    details.predicateCount = preds.total;
    const filterCost = preds.equality * WEIGHTS.EQUALITY_FILTER + preds.between * WEIGHTS.BETWEEN_PRED + preds.like * WEIGHTS.LIKE_PRED + preds.or * (WEIGHTS.OR_FACTOR - 1);
    if (Math.abs(filterCost) > 0.01 || preds.total > 0) {
      breakdown.push({
        operation: 'WHERE Filters',
        detail: preds.total + ' predicate' + (preds.total !== 1 ? 's' : ''),
        cost: +filterCost.toFixed(2)
      });
      total += filterCost;
    }
  }

  if (stmt.groupBy && stmt.groupBy.length > 0) {
    const cost = stmt.groupBy.length * WEIGHTS.GROUP_BY_EXPR;
    total += cost;
    breakdown.push({
      operation: 'GROUP BY',
      detail: stmt.groupBy.length + ' expression' + (stmt.groupBy.length !== 1 ? 's' : ''),
      cost: +cost.toFixed(2)
    });
  }

  if (stmt.having) {
    breakdown.push({ operation: 'HAVING', detail: '', cost: +WEIGHTS.GROUP_BY_EXPR.toFixed(2) });
    total += WEIGHTS.GROUP_BY_EXPR;
  }

  if (stmt.orderBy && stmt.orderBy.length > 0) {
    const cost = stmt.orderBy.length * WEIGHTS.ORDER_BY_EXPR;
    total += cost;
    breakdown.push({
      operation: 'ORDER BY',
      detail: stmt.orderBy.length + ' column' + (stmt.orderBy.length !== 1 ? 's' : ''),
      cost: +cost.toFixed(2)
    });
  }

  if (stmt.distinct) {
    details.hasDistinct = true;
    breakdown.push({ operation: 'DISTINCT', detail: '', cost: +WEIGHTS.DISTINCT.toFixed(2) });
    total += WEIGHTS.DISTINCT;
  }

  if (stmt.connectBy) {
    breakdown.push({ operation: 'CONNECT BY', detail: 'Hierarchical', cost: +WEIGHTS.CONNECT_BY.toFixed(2) });
    total += WEIGHTS.CONNECT_BY;
  }

  if (stmt.columns) {
    for (const col of stmt.columns) {
      scanExpression(col.expression, breakdown, details);
    }
  }

  if (stmt.where) {
    scanExpression(stmt.where, breakdown, details);
  }

  if (stmt.from) {
    for (const ref of stmt.from) {
      if (ref.query) {
        const subCost = estimateSelectCost(ref.query, breakdown);
        total += subCost;
      }
    }
  }

  if (ast.unions) {
    for (const u of ast.unions) {
      const cost = u.all ? WEIGHTS.UNION_ALL : WEIGHTS.UNION_FULL;
      breakdown.push({ operation: u.all ? 'UNION ALL' : 'UNION', detail: '', cost: +cost.toFixed(2) });
      total += cost;
      if (u.statement) {
        total += estimateSelectCost(u.statement, breakdown);
      }
    }
  }

  if (ast.ctes) {
    for (const cte of ast.ctes) {
      if (cte.query) {
        const cteCost = estimateSelectCost(cte.query, breakdown);
        breakdown.push({ operation: 'CTE', detail: cte.name, cost: +cteCost.toFixed(2) });
        total += cteCost;
      }
    }
  }

  total = +total.toFixed(2);

  return {
    total,
    breakdown: mergeBreakdown(breakdown),
    details,
    tableCosts,
    edgeCosts
  };
}

function estimateSelectCost(stmt) {
  if (!stmt) return 0;
  let total = 0;
  if (stmt.from) {
    for (const ref of stmt.from) {
      let base = WEIGHTS.TABLE_SCAN;
      if (ref.type === 'subquery' || ref.type === 'lateral') base = WEIGHTS.SUBQUERY_SCAN;
      let jm = 1;
      if (ref.joinInfo) {
        const jt = ref.joinInfo.type;
        if (jt === 'LEFT JOIN' || jt === 'LEFT OUTER JOIN') jm = WEIGHTS.LEFT_JOIN;
        else if (jt === 'RIGHT JOIN' || jt === 'RIGHT OUTER JOIN') jm = WEIGHTS.RIGHT_JOIN;
        else if (jt === 'FULL JOIN' || jt === 'FULL OUTER JOIN') jm = WEIGHTS.FULL_JOIN;
        else if (jt === 'CROSS JOIN') jm = WEIGHTS.CROSS_JOIN;
        else jm = WEIGHTS.INNER_JOIN;
      }
      total += Math.max(0.3, base * jm);
    }
  }
  if (stmt.groupBy) total += stmt.groupBy.length * WEIGHTS.GROUP_BY_EXPR;
  if (stmt.orderBy) total += stmt.orderBy.length * WEIGHTS.ORDER_BY_EXPR;
  if (stmt.distinct) total += WEIGHTS.DISTINCT;
  if (stmt.connectBy) total += WEIGHTS.CONNECT_BY;
  if (stmt.having) total += WEIGHTS.GROUP_BY_EXPR;

  if (stmt.columns) {
    for (const col of stmt.columns) {
      total += expressionExtraCost(col.expression);
    }
  }
  if (stmt.where) {
    total += expressionExtraCost(stmt.where);
  }
  return +total.toFixed(2);
}

function expressionExtraCost(expr) {
  if (!expr) return 0;
  let cost = 0;
  if (expr.type === 'subquery' && expr.query) {
    cost += WEIGHTS.SCALAR_SUBQUERY + estimateSelectCost(expr.query);
  }
  if (expr.type === 'exists' && expr.query) {
    cost += WEIGHTS.EXISTS_SUBQUERY + estimateSelectCost(expr.query);
  }
  if (expr.type === 'in' && expr.list && expr.list.type === 'subquery' && expr.list.query) {
    cost += WEIGHTS.IN_SUBQUERY + estimateSelectCost(expr.list.query);
  }
  if (expr.type === 'function_call' && expr.over) {
    cost += WEIGHTS.ANALYTIC_FUNC;
  }
  if (expr.left) cost += expressionExtraCost(expr.left);
  if (expr.right) cost += expressionExtraCost(expr.right);
  if (expr.operand) cost += expressionExtraCost(expr.operand);
  if (expr.args) {
    for (const a of expr.args) cost += expressionExtraCost(a);
  }
  if (expr.cases) {
    for (const c of expr.cases) {
      if (c.when) cost += expressionExtraCost(c.when);
      if (c.then) cost += expressionExtraCost(c.then);
    }
    if (expr.else) cost += expressionExtraCost(expr.else);
  }
  if (expr.expression) cost += expressionExtraCost(expr.expression);
  if (expr.list && Array.isArray(expr.list)) {
    for (const item of expr.list) cost += expressionExtraCost(item);
  }
  if (expr.low) cost += expressionExtraCost(expr.low);
  if (expr.high) cost += expressionExtraCost(expr.high);
  if (expr.pattern) cost += expressionExtraCost(expr.pattern);
  if (expr.query) cost += expressionExtraCost(expr.query);
  return cost;
}

function scanExpression(expr, breakdown, details) {
  if (!expr) return;
  if (expr.type === 'subquery' && expr.query) {
    details.hasScalarSubquery = true;
    details.hasSubquery = true;
    const cost = WEIGHTS.SCALAR_SUBQUERY;
    breakdown.push({ operation: 'Scalar Subquery', detail: '', cost: +cost.toFixed(2) });
  }
  if (expr.type === 'exists' && expr.query) {
    details.hasSubquery = true;
    const cost = WEIGHTS.EXISTS_SUBQUERY;
    breakdown.push({ operation: 'EXISTS Subquery', detail: '', cost: +cost.toFixed(2) });
  }
  if (expr.type === 'in' && expr.list && expr.list.type === 'subquery' && expr.list.query) {
    details.hasSubquery = true;
    const cost = WEIGHTS.IN_SUBQUERY;
    breakdown.push({ operation: 'IN Subquery', detail: '', cost: +cost.toFixed(2) });
  }
  if (expr.type === 'function_call' && expr.over) {
    details.hasAnalytic = true;
    const cost = WEIGHTS.ANALYTIC_FUNC;
    breakdown.push({ operation: 'Analytic Function', detail: expr.name, cost: +cost.toFixed(2) });
  }
  if (expr.left) scanExpression(expr.left, breakdown, details);
  if (expr.right) scanExpression(expr.right, breakdown, details);
  if (expr.operand) scanExpression(expr.operand, breakdown, details);
  if (expr.args) {
    for (const a of expr.args) scanExpression(a, breakdown, details);
  }
  if (expr.cases) {
    for (const c of expr.cases) {
      if (c.when) scanExpression(c.when, breakdown, details);
      if (c.then) scanExpression(c.then, breakdown, details);
    }
    if (expr.else) scanExpression(expr.else, breakdown, details);
  }
  if (expr.expression) scanExpression(expr.expression, breakdown, details);
  if (expr.list && Array.isArray(expr.list)) {
    for (const item of expr.list) scanExpression(item, breakdown, details);
  }
  if (expr.low) scanExpression(expr.low, breakdown, details);
  if (expr.high) scanExpression(expr.high, breakdown, details);
  if (expr.pattern) scanExpression(expr.pattern, breakdown, details);
  if (expr.query) scanExpression(expr.query, breakdown, details);
}

function countPredicates(expr) {
  const result = { total: 0, equality: 0, between: 0, like: 0, or: 0 };
  if (!expr) return result;

  if (expr.type === 'binary') {
    result.total++;
    if (expr.operator === '=') result.equality++;
    else if (['>', '<', '>=', '<='].includes(expr.operator)) { result.total += 0; }
    else if (expr.operator === 'OR') { result.or++; result.total--; }
    if (expr.left) {
      const leftC = countPredicates(expr.left);
      result.total += leftC.total;
      result.equality += leftC.equality;
      result.between += leftC.between;
      result.like += leftC.like;
      result.or += leftC.or;
    }
    if (expr.right) {
      const rightC = countPredicates(expr.right);
      result.total += rightC.total;
      result.equality += rightC.equality;
      result.between += rightC.between;
      result.like += rightC.like;
      result.or += rightC.or;
    }
  }
  if (expr.type === 'between') {
    result.total++;
    result.between++;
  }
  if (expr.type === 'like') {
    result.total++;
    result.like++;
  }
  if (expr.type === 'is_null') {
    result.total++;
  }
  if (expr.type === 'in') {
    result.total++;
  }
  if (expr.type === 'exists') {
    result.total++;
  }

  return result;
}

function mergeBreakdown(breakdown) {
  const map = {};
  for (const item of breakdown) {
    const key = item.operation + '|' + item.detail;
    if (map[key]) {
      map[key].cost = +((map[key].cost + item.cost).toFixed(2));
    } else {
      map[key] = { ...item };
    }
  }
  return Object.values(map);
}

export function annotateGraphModel(graphModel, queryCost) {
  if (!graphModel || !queryCost) return;

  let maxNodeCost = 1;
  let maxEdgeCost = 1;

  const edgeCostMap = {};

  for (const edge of graphModel.edges) {
    const key = edge.data.source + '→' + edge.data.target;
    const cost = queryCost.edgeCosts[key] || 0;
    edge.data.costWidth = cost ? 1.5 + cost * 0.5 : 2.5;
    if (edge.data.costWidth > maxEdgeCost) maxEdgeCost = edge.data.costWidth;
  }

  for (const node of graphModel.nodes) {
    const cost = queryCost.tableCosts[node.data.id];
    if (cost) {
      node.data.cost = +cost.toFixed(2);
      if (cost > maxNodeCost) maxNodeCost = cost;
    } else {
      node.data.cost = 0;
    }
  }

  graphModel._meta = graphModel._meta || {};
  graphModel._meta.totalCost = queryCost.total;
  graphModel._meta.costBreakdown = queryCost.breakdown;
  graphModel._meta.costDetails = queryCost.details;
  graphModel._meta.maxNodeCost = maxNodeCost;
  graphModel._meta.maxEdgeCost = maxEdgeCost;
}
