const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN',
  'LIKE', 'IS', 'NULL', 'AS', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL',
  'OUTER', 'CROSS', 'NATURAL', 'USING', 'GROUP', 'BY', 'HAVING', 'ORDER',
  'ASC', 'DESC', 'UNION', 'ALL', 'WITH', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'DISTINCT', 'FOR', 'UPDATE', 'OF', 'TABLE', 'LATERAL', 'FETCH',
  'FIRST', 'NEXT', 'ROWS', 'ONLY', 'WITH', 'TIES', 'OFFSET', 'LIMIT',
  'CONNECT', 'PRIOR', 'START', 'LEVEL', 'SIBLINGS', 'MODEL', 'PIVOT',
  'UNPIVOT', 'XMLTABLE', 'MATERIALIZED', 'VIEW', 'SYNONYM', 'SEQUENCE',
  'INDEX', 'HINT', 'MINUS', 'INTERSECT', 'EXCEPT', 'RECURSIVE',
  'FORCE', 'NO',
  'CREATE', 'REPLACE', 'ALTER', 'DROP', 'TRUNCATE', 'COMMENT', 'RENAME',
  'GRANT', 'REVOKE',
  'OVER', 'PARTITION', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING',
  'CURRENT'
]);

const ORACLE_FUNCTIONS = new Set([
  'NVL', 'NVL2', 'DECODE', 'COALESCE', 'NULLIF', 'TO_DATE', 'TO_CHAR',
  'TO_NUMBER', 'TO_TIMESTAMP', 'TO_CLOB', 'TO_BLOB', 'CAST', 'CONVERT',
  'EXTRACT', 'FLOOR', 'CEIL', 'ROUND', 'TRUNC', 'MOD', 'ABS', 'POWER',
  'SQRT', 'EXP', 'LN', 'LOG', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS',
  'ATAN', 'SINH', 'COSH', 'TANH', 'SIGN', 'GREATEST', 'LEAST', 'AVG',
  'COUNT', 'SUM', 'MIN', 'MAX', 'MEDIAN', 'STDDEV', 'VARIANCE', 'LISTAGG',
  'RANK', 'DENSE_RANK', 'ROW_NUMBER', 'NTILE', 'LEAD', 'LAG',
  'FIRST_VALUE', 'LAST_VALUE', 'CUME_DIST', 'PERCENT_RANK',
  'PERCENTILE_CONT', 'PERCENTILE_DISC', 'RATIO_TO_REPORT', 'GROUPING',
  'LENGTH', 'SUBSTR', 'INSTR', 'TRIM', 'LTRIM', 'RTRIM', 'LPAD', 'RPAD',
  'REPLACE', 'TRANSLATE', 'CONCAT', 'UPPER', 'LOWER', 'INITCAP',
  'REGEXP_LIKE', 'REGEXP_REPLACE', 'REGEXP_SUBSTR', 'REGEXP_INSTR',
  'SYSDATE', 'SYSTIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIMESTAMP',
  'LOCALTIMESTAMP', 'DBTIMEZONE', 'SESSIONTIMEZONE', 'NUMTODSINTERVAL',
  'NUMTOYMINTERVAL', 'TO_DSINTERVAL', 'TO_YMINTERVAL',
  'ADD_MONTHS', 'MONTHS_BETWEEN', 'LAST_DAY', 'NEXT_DAY', 'NEW_TIME',
  'ROUND', 'TRUNC', 'FROM_TZ', 'AT_TIME_ZONE', 'TZ_OFFSET',
  'SYS_GUID', 'UID', 'USER', 'USERENV', 'ORA_HASH', 'VSIZE',
  'BFILENAME', 'EMPTY_BLOB', 'EMPTY_CLOB', 'DECODE', 'DUMP',
  'ORA_ROWSCN', 'SCN_TO_TIMESTAMP', 'TIMESTAMP_TO_SCN',
  'XMLAGG', 'XMLCOMMENT', 'XMLCONCAT', 'XMLELEMENT', 'XMLFOREST',
  'XMLPARSE', 'XMLPI', 'XMLQUERY', 'XMLROOT', 'XMLSERIALIZE',
  'XMLTABLE', 'XMLTRANSFORM', 'XMLSEQUENCE', 'XMLCAST', 'XMLDIFF',
  'XMLPATCH', 'XMLISVALID', 'XMLVALIDATE', 'COLUMN_VALUE',
  'ROWNUM', 'ROWID', 'ROW_NUMBER', 'RATIO_TO_REPORT',
  'WIDTH_BUCKET', 'NTILE', 'CUME_DIST', 'PERCENT_RANK',
  'FIRST', 'LAST', 'LISTAGG', 'JSON_OBJECT', 'JSON_ARRAY',
  'JSON_TABLE', 'JSON_VALUE', 'JSON_QUERY', 'JSON_EXISTS',
  'JSON_DATAGUIDE', 'JSON_ARRAYAGG', 'JSON_OBJECTAGG'
]);

export function tokenize(sql) {
  const tokens = [];
  let i = 0;

  while (i < sql.length) {
    if (/\s/.test(sql[i])) { i++; continue; }

    if (sql[i] === '-' && sql[i + 1] === '-') {
      let end = sql.indexOf('\n', i);
      if (end === -1) end = sql.length;
      tokens.push({ type: 'COMMENT', value: sql.slice(i, end), position: i });
      i = end;
      continue;
    }

    if (sql[i] === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      const end = close === -1 ? sql.length : close + 2;
      const comment = sql.slice(i, end);
      tokens.push({ type: 'COMMENT', value: comment, position: i });
      if (comment.startsWith('/*+')) {
        tokens.push({ type: 'HINT', value: comment, position: i });
      }
      i = end;
      continue;
    }

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && j + 1 < sql.length && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j++;
      }
      tokens.push({ type: 'STRING', value: sql.slice(i + 1, j), raw: sql.slice(i, j + 1), position: i });
      i = j + 1;
      continue;
    }

    if (/\d/.test(sql[i]) || (sql[i] === '.' && i + 1 < sql.length && /\d/.test(sql[i + 1]))) {
      let j = i;
      if (j + 1 < sql.length && sql[j] === '0' && (sql[j + 1] === 'x' || sql[j + 1] === 'X')) {
        j += 2;
        while (j < sql.length && /[0-9a-fA-F]/.test(sql[j])) j++;
      } else {
        while (j < sql.length && /\d/.test(sql[j])) j++;
        if (j < sql.length && sql[j] === '.' && j + 1 < sql.length && /\d/.test(sql[j + 1])) {
          j++;
          while (j < sql.length && /\d/.test(sql[j])) j++;
        }
        if (j < sql.length && (sql[j] === 'e' || sql[j] === 'E')) {
          j++;
          if (j < sql.length && (sql[j] === '+' || sql[j] === '-')) j++;
          while (j < sql.length && /\d/.test(sql[j])) j++;
        }
        if (j < sql.length && (sql[j] === 'f' || sql[j] === 'F' || sql[j] === 'd' || sql[j] === 'D')) {
          j++;
        }
      }
      tokens.push({ type: 'NUMBER', value: sql.slice(i, j), position: i });
      i = j;
      continue;
    }

    if (sql[i] === ':' && i + 1 < sql.length && /[a-zA-Z]/.test(sql[i + 1])) {
      let j = i + 1;
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++;
      tokens.push({ type: 'BIND_VARIABLE', value: sql.slice(i, j), position: i });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(sql[i]) || sql[i] === '"') {
      if (sql[i] === '"') {
        let j = sql.indexOf('"', i + 1);
        if (j === -1) j = sql.length;
        tokens.push({ type: 'IDENTIFIER', value: sql.slice(i + 1, j), quoted: true, position: i });
        i = j + 1;
      } else {
        let j = i;
        while (j < sql.length && /[a-zA-Z0-9_$#]/.test(sql[j])) j++;
        const word = sql.slice(i, j);
        tokens.push({
          type: KEYWORDS.has(word.toUpperCase()) ? 'KEYWORD' : 'IDENTIFIER',
          value: word,
          position: i
        });
        i = j;
      }
      continue;
    }

    if (sql[i] === '(' || sql[i] === ')' || sql[i] === ',' || sql[i] === ';') {
      tokens.push({ type: 'PUNCTUATION', value: sql[i], position: i });
      i++;
      continue;
    }

    if (sql[i] === ':' && sql[i + 1] === '=') {
      tokens.push({ type: 'OPERATOR', value: ':=', position: i });
      i += 2;
      continue;
    }
    if (sql[i] === '|' && sql[i + 1] === '|') {
      tokens.push({ type: 'OPERATOR', value: '||', position: i });
      i += 2;
      continue;
    }
    if (sql[i] === '!' && sql[i + 1] === '=') {
      tokens.push({ type: 'OPERATOR', value: '!=', position: i });
      i += 2;
      continue;
    }
    if (sql[i] === '<' && sql[i + 1] === '=') {
      tokens.push({ type: 'OPERATOR', value: '<=', position: i });
      i += 2;
      continue;
    }
    if (sql[i] === '>' && sql[i + 1] === '=') {
      tokens.push({ type: 'OPERATOR', value: '>=', position: i });
      i += 2;
      continue;
    }
    if (sql[i] === '<' && sql[i + 1] === '>') {
      tokens.push({ type: 'OPERATOR', value: '<>', position: i });
      i += 2;
      continue;
    }

    if ('=<>+-*/%'.includes(sql[i])) {
      tokens.push({ type: 'OPERATOR', value: sql[i], position: i });
      i++;
      continue;
    }

    if (sql[i] === '.') {
      tokens.push({ type: 'PUNCTUATION', value: '.', position: i });
      i++;
      continue;
    }

    if (sql[i] === '@') {
      tokens.push({ type: 'PUNCTUATION', value: '@', position: i });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

export class SQLParser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== 'COMMENT' && t.type !== 'HINT');
    this.pos = 0;
    this.errors = [];
  }

  peek(offset = 0) {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : null;
  }

  next() {
    return this.tokens[this.pos++];
  }

  expect(type, value) {
    const token = this.peek();
    if (!token) {
      this.errors.push({ message: `Expected ${type} "${value}" but reached end of input`, position: this.pos });
      return null;
    }
    if (token.type !== type || (value !== undefined && token.value.toUpperCase() !== value.toUpperCase())) {
      this.errors.push({
        message: `Expected ${type} "${value}" but got "${token.value}"`,
        position: token.position,
        token
      });
      return null;
    }
    return this.next();
  }

  match(...keywords) {
    const token = this.peek();
    if (!token) return false;
    if (token.type === 'KEYWORD') {
      const upper = token.value.toUpperCase();
      return keywords.some(k => k.toUpperCase() === upper);
    }
    if (token.type === 'PUNCTUATION') {
      return keywords.some(k => k === token.value);
    }
    return false;
  }

  consume(...keywords) {
    if (this.match(...keywords)) {
      return this.next();
    }
    return null;
  }

  skipDDLIfNeeded() {
    const first = this.peek();
    if (!first || (first.type !== 'KEYWORD' && first.type !== 'IDENTIFIER') || first.value.toUpperCase() !== 'CREATE') return;

    this.next();
    if (this.match('OR')) {
      this.next();
      if (this.match('REPLACE')) this.next();
    }
    if (this.match('MATERIALIZED')) { this.next(); }
    if (this.match('FORCE')) { this.next(); }
    if (this.match('NO')) { this.next(); }

    if (!this.match('VIEW')) return;
    this.next();

    if (this.peek() && (this.peek().type === 'IDENTIFIER' || this.peek().type === 'KEYWORD')) {
      this.next();
      if (this.peek() && this.peek().value === '.') {
        this.next();
        if (this.peek()) this.next();
      }
    }

    if (this.match('(')) {
      let depth = 1;
      this.next();
      while (this.peek() && depth > 0) {
        if (this.match('(')) { depth++; this.next(); }
        else if (this.peek().value === ')') { depth--; this.next(); }
        else this.next();
      }
    }

    if (this.match('AS')) {
      this.next();
    }
  }

  parse() {
    this.skipDDLIfNeeded();
    const ctes = this.parseWithClause();
    const statement = this.parseStatement();
    const unions = this.parseUnionClause();

    const ast = { type: 'query', ctes: ctes || null, statement, unions: unions || null };
    if (this.errors.length > 0) {
      ast.errors = this.errors;
    }
    return ast;
  }

  parseWithClause() {
    if (!this.match('WITH')) return null;
    this.next();
    const recursive = !!this.consume('RECURSIVE');
    const ctes = [];

    do {
      const nameToken = this.expect('IDENTIFIER') || this.expect('KEYWORD');
      if (!nameToken) break;
      let name = nameToken.value;
      let columns = null;

      if (this.peek() && this.peek().value === '(') {
        const nextTok = this.peek(1);
        if (nextTok && nextTok.type === 'IDENTIFIER') {
          this.next();
          columns = [];
          while (this.peek() && this.peek().value !== ')') {
            const col = this.expect('IDENTIFIER');
            if (col) columns.push(col.value);
            if (this.peek() && this.peek().value === ',') this.next();
          }
          if (this.peek() && this.peek().value === ')') this.next();
        }
      }

      this.expect('KEYWORD', 'AS');
      this.expect('PUNCTUATION', '(');
      const query = this.parse();
      this.expect('PUNCTUATION', ')');

      if (columns && columns.length > 0) {
        name = { name, columns };
      }

      ctes.push({ name: nameToken.value, columns, query: query.statement });
    } while (this.peek() && this.peek().value === ',' && (this.next(), true));

    return recursive ? { recursive, ctes } : ctes;
  }

  parseStatement() {
    if (this.match('SELECT')) {
      return this.parseSelect();
    }
    if (this.match('(')) {
      this.next();
      const stmt = this.parseStatement();
      this.expect('PUNCTUATION', ')');
      return stmt;
    }
    this.errors.push({ message: 'Expected SELECT statement', position: this.pos });
    return null;
  }

  parseSelect() {
    this.consume('SELECT');
    const distinct = !!this.consume('DISTINCT');
    const columns = this.parseColumnList();

    let from = null;
    if (this.match('FROM')) {
      from = this.parseFromClause();
    } else if (columns.length === 1 && columns[0].expression && columns[0].expression.type === 'star') {
      this.checkMissingFrom(this.peek());
    }

    let where = null;
    if (this.match('WHERE')) {
      where = this.parseWhereClause();
    }

    let groupBy = null;
    if (this.match('GROUP')) {
      groupBy = this.parseGroupByClause();
    }

    let having = null;
    if (this.match('HAVING')) {
      having = this.parseHavingClause();
    }

    let orderBy = null;
    if (this.match('ORDER')) {
      orderBy = this.parseOrderByClause();
    }

    let connectBy = null;
    if (this.match('CONNECT')) {
      connectBy = this.parseConnectByClause();
    }

    if (columns.length === 0) {
      this.errors.push({ message: 'Expected column list or * after SELECT', position: this.pos });
    }

    return { type: 'select', distinct, columns, from, where, groupBy, having, orderBy, connectBy };
  }

  parseColumnList() {
    const columns = [];
    const clauseKeywords = ['FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'UNION', 'MINUS', 'INTERSECT', 'EXCEPT', 'FOR', 'OVER', 'PARTITION'];

    if (this.peek() && this.peek().value === '*') {
      this.next();
      return [{ expression: { type: 'star' }, alias: null }];
    }

    while (this.peek()) {
      if (clauseKeywords.includes(this.peek().value.toUpperCase()) || this.peek().value === ')') break;
      if (this.peek().value === ';') break;

      const col = this.parseColumn();
      if (col) {
        columns.push(col);
      } else {
        break;
      }
      if (this.peek() && this.peek().value === ',') {
        this.next();
      } else {
        break;
      }
    }

    return columns;
  }

  checkMissingFrom(next) {
    const clauseKeywords = ['WHERE', 'GROUP', 'HAVING', 'ORDER', 'UNION', 'MINUS', 'INTERSECT', 'EXCEPT', 'FOR', 'OVER', 'PARTITION', ')'];
    if (next && next.type === 'IDENTIFIER' && !clauseKeywords.includes(next.value.toUpperCase())) {
      this.errors.push({ message: 'Expected FROM keyword — did you mean "FROM"?', position: next.position });
    }
  }

  parseColumn() {
    const expr = this.parseExpression();
    if (!expr) return null;

    let alias = null;
    if (this.peek() && (
        this.peek().type === 'IDENTIFIER' ||
        (this.peek().type === 'KEYWORD' && this.peek().value.toUpperCase() === 'AS')
    ) &&
        !this.match('FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'UNION', 'MINUS', 'INTERSECT', 'EXCEPT', 'FOR', 'OVER', 'PARTITION', 'AND', 'OR', 'ON') &&
        this.peek().value !== ',' && this.peek().value !== ')' && this.peek().value !== ';') {
      if (this.consume('AS')) {
        const aliasTok = this.next();
        if (aliasTok) alias = aliasTok.value;
      } else {
        const aliasTok = this.next();
        if (aliasTok && aliasTok.type === 'IDENTIFIER' && aliasTok.value.toUpperCase() !== 'FROM') {
          alias = aliasTok.value;
        } else {
          this.pos--;
        }
      }
    }

    return { expression: expr, alias };
  }

  parseExpression() {
    return this.parseOrExpression();
  }

  parseOrExpression() {
    let left = this.parseAndExpression();
    if (!left) return null;

    while (this.match('OR')) {
      const operator = this.next().value;
      const right = this.parseAndExpression();
      if (!right) break;
      left = { type: 'binary', operator, left, right };
    }

    return left;
  }

  parseAndExpression() {
    let left = this.parseArithmeticExpression();
    if (!left) return null;

    while (this.match('AND')) {
      const operator = this.next().value;
      const right = this.parseArithmeticExpression();
      if (!right) break;
      left = { type: 'binary', operator, left, right };
    }

    return left;
  }

  parseArithmeticExpression() {
    let left = this.parseNotExpression();
    if (!left) return null;

    while (this.peek() && this.peek().type === 'OPERATOR' && ['+', '-', '*', '/', '%', '||'].includes(this.peek().value)) {
      const operator = this.next().value;
      const right = this.parseNotExpression();
      if (!right) break;
      left = { type: 'binary', operator, left, right };
    }

    return left;
  }

  parseNotExpression() {
    if (this.match('NOT')) {
      const operator = this.next().value;
      const operand = this.parsePredicate();
      return operand ? { type: 'unary', operator, operand } : null;
    }
    return this.parsePredicate();
  }

  parsePredicate() {
    if (this.match('EXISTS')) {
      return this.parseExists();
    }
    if (this.match('(')) {
      const saved = this.pos;
      this.next();
      if (this.match('SELECT')) {
        const subquery = this.parseSelect();
        if (this.peek() && this.peek().value === ')') {
          this.next();
          return { type: 'subquery', query: subquery };
        }
      }
      this.pos = saved;
    }

    const left = this.parseComparison();
    if (!left) return null;

    if (this.match('IS')) {
      return this.parseIsNull(left);
    }
    if (this.match('IN')) {
      return this.parseIn(left);
    }
    if (this.match('BETWEEN')) {
      return this.parseBetween(left);
    }
    if (this.match('LIKE')) {
      return this.parseLike(left);
    }
    if (this.match('NOT')) {
      const savedPos = this.pos;
      this.next();
      if (this.match('IN')) return this.parseIn(left, true);
      if (this.match('LIKE')) return this.parseLike(left, true);
      if (this.match('BETWEEN')) return this.parseBetween(left, true);
      if (this.match('EXISTS')) return { type: 'unary', operator: 'NOT', operand: this.parseExists() };
      this.pos = savedPos;
    }

    return left;
  }

  parseComparison() {
    let left = this.parsePrimaryExpr();
    if (!left) return null;

    const operators = ['=', '!=', '<>', '<', '>', '<=', '>=', '<=>'];
    if (this.peek() && this.peek().type === 'OPERATOR' && operators.includes(this.peek().value)) {
      const op = this.next().value;
      const right = this.parsePrimaryExpr();
      if (right) {
        return { type: 'binary', operator: op, left, right };
      }
    }

    return left;
  }

  parsePrimaryExpr() {
    if (this.match('CASE')) {
      return this.parseCase();
    }
    if (this.match('(')) {
      const savedPos = this.pos;
      this.next();
      if (this.match('SELECT')) {
        const subquery = this.parseSelect();
        if (this.peek() && this.peek().value === ')') {
          this.next();
          return { type: 'subquery', query: subquery };
        }
      }
      const expr = this.parseExpression();
      if (expr && this.peek() && this.peek().value === ')') {
        this.next();
        return { type: 'parenthesized', expression: expr };
      }
      this.pos = savedPos;
      return null;
    }

    const token = this.peek();
    if (!token) return null;

    if (token.type === 'STRING') {
      this.next();
      return { type: 'literal', valueType: 'string', value: token.value };
    }

    if (token.type === 'NUMBER') {
      this.next();
      const num = token.value.includes('.') ? parseFloat(token.value) : parseInt(token.value, 10);
      return { type: 'literal', valueType: 'number', value: num };
    }

    if (token.value === 'NULL' && token.type === 'KEYWORD') {
      this.next();
      return { type: 'literal', valueType: 'null', value: null };
    }

    if (token.type === 'BIND_VARIABLE') {
      this.next();
      return { type: 'bind_variable', name: token.value };
    }

    if (token.type === 'OPERATOR' && (token.value === '-' || token.value === '+')) {
      this.next();
      const operand = this.parsePrimaryExpr();
      return operand ? { type: 'unary', operator: token.value, operand } : null;
    }

    if (token.type === 'IDENTIFIER' || token.type === 'KEYWORD') {
      const name = this.next().value;
      const upperName = name.toUpperCase();

      if (upperName === 'TRUE') return { type: 'literal', valueType: 'boolean', value: true };
      if (upperName === 'FALSE') return { type: 'literal', valueType: 'boolean', value: false };

      if (this.peek() && this.peek().value === '(') {
        const func = { type: 'function_call', name: upperName, args: this.parseFunctionArgs() };
        if (this.peek() && this.peek().type === 'KEYWORD' && this.peek().value.toUpperCase() === 'OVER') {
          func.over = this.parseOverClause();
        }
        return func;
      }

      const dateTimeKeywords = ['DATE', 'TIMESTAMP'];
      if (dateTimeKeywords.includes(upperName) && this.peek() && this.peek().type === 'STRING') {
        const strToken = this.next();
        return { type: 'literal', valueType: 'datetime', value: strToken.value, subtype: upperName };
      }

      if (this.peek() && this.peek().value === '.') {
        this.next();
        const columnToken = this.peek();
        if (columnToken && (columnToken.type === 'IDENTIFIER' || columnToken.type === 'KEYWORD')) {
          const column = this.next().value;
          return { type: 'column_ref', table: name, column };
        }
        this.pos--;
        return { type: 'column_ref', table: null, column: name };
      }

      if (this.peek() && this.peek().value === '@') {
        this.next();
        const dbLink = this.next();
        return { type: 'column_ref', table: null, column: name, dbLink: dbLink ? dbLink.value : null };
      }

      return { type: 'column_ref', table: null, column: name };
    }

    return null;
  }

  parseFunctionArgs() {
    this.expect('PUNCTUATION', '(');
    const args = [];
    if (this.peek() && this.peek().value !== ')') {
      if (this.peek().value === '*') {
        this.next();
        args.push({ type: 'star' });
      } else if (this.match('DISTINCT')) {
        this.next();
        args.push({ type: 'distinct' });
        const arg = this.parseExpression();
        if (arg) args.push(arg);
      } else {
        do {
          const expr = this.parseExpression();
          if (expr) {
            args.push(expr);
            if (this.peek() && this.peek().value === ',') this.next();
            else break;
          } else break;
        } while (this.peek() && this.peek().value !== ')');
      }
    }
    this.expect('PUNCTUATION', ')');
    return args;
  }

  parseCase() {
    this.consume('CASE');
    let baseExpr = null;
    if (!this.match('WHEN')) {
      baseExpr = this.parseExpression();
    }

    const cases = [];
    while (this.match('WHEN')) {
      this.next();
      const whenCond = baseExpr
        ? { type: 'binary', operator: '=', left: { type: 'column_ref', ...baseExpr }, right: this.parseExpression() }
        : this.parseExpression();
      this.expect('KEYWORD', 'THEN');
      const thenVal = this.parseExpression();
      cases.push({ when: whenCond, then: thenVal });
    }

    let elseVal = null;
    if (this.match('ELSE')) {
      this.next();
      elseVal = this.parseExpression();
    }

    this.expect('KEYWORD', 'END');
    return { type: 'case', base: baseExpr, cases, else: elseVal };
  }

  parseExists() {
    this.consume('EXISTS');
    this.expect('PUNCTUATION', '(');
    const query = this.parseStatement();
    this.expect('PUNCTUATION', ')');
    return { type: 'exists', query };
  }

  parseIn(left, negated = false) {
    this.consume('IN');
    this.expect('PUNCTUATION', '(');
    let list = [];
    if (this.match('SELECT')) {
      const subquery = this.parseSelect();
      list = { type: 'subquery', query: subquery };
    } else {
      do {
        const expr = this.parseExpression();
        if (expr) {
          list.push(expr);
          if (this.peek() && this.peek().value === ',') this.next();
          else break;
        } else break;
      } while (this.peek() && this.peek().value !== ')');
    }
    this.expect('PUNCTUATION', ')');
    return { type: 'in', expression: left, list, negated };
  }

  parseBetween(left, negated = false) {
    this.consume('BETWEEN');
    const low = this.parseArithmeticExpression();
    this.expect('KEYWORD', 'AND');
    const high = this.parseArithmeticExpression();
    return { type: 'between', expression: left, low, high, negated };
  }

  parseLike(left, negated = false) {
    this.consume('LIKE');
    const pattern = this.parseExpression();
    return { type: 'like', expression: left, pattern, negated };
  }

  parseIsNull(left) {
    this.consume('IS');
    const negated = !!this.consume('NOT');
    this.expect('KEYWORD', 'NULL');
    return { type: 'is_null', expression: left, negated };
  }

  parseOverClause() {
    this.consume('OVER');
    this.expect('PUNCTUATION', '(');

    const partitionBy = [];
    const orderBy = [];

    if (this.match('PARTITION')) {
      this.consume('PARTITION');
      this.expect('KEYWORD', 'BY');
      do {
        const expr = this.parseExpression();
        if (expr) partitionBy.push(expr);
        if (this.peek() && this.peek().value === ',') {
          this.next();
        } else {
          break;
        }
      } while (this.peek() && !this.match('ORDER', ')'));
    }

    if (this.match('ORDER')) {
      this.consume('ORDER');
      this.expect('KEYWORD', 'BY');
      do {
        const expr = this.parseExpression();
        if (!expr) break;
        let direction = null;
        if (this.match('ASC')) { this.next(); direction = 'ASC'; }
        else if (this.match('DESC')) { this.next(); direction = 'DESC'; }
        orderBy.push({ expression: expr, direction });
        if (this.peek() && this.peek().value === ',') {
          this.next();
        } else {
          break;
        }
      } while (this.peek() && !this.match(')'));
    }

    this.expect('PUNCTUATION', ')');

    return { partitionBy, orderBy };
  }

  parseFromClause() {
    this.consume('FROM');
    const tables = [];

    const first = this.parseBaseTableRef();
    if (first) {
      first.joinInfo = null;
      tables.push(first);
    }

    while (this.peek()) {
      if (this.peek().value === ',') {
        this.next();
        const nextRef = this.parseBaseTableRef();
        if (nextRef) {
          nextRef.joinInfo = { type: 'CROSS JOIN', conditions: [], using: null, natural: false };
          tables.push(nextRef);
        } else break;
      } else if (this.isJoinKeyword()) {
        const joinInfo = this.parseJoinInfo();
        if (joinInfo && joinInfo.ref) {
          const ref = joinInfo.ref;
          ref.joinInfo = {
            type: joinInfo.type,
            conditions: joinInfo.conditions,
            using: joinInfo.using,
            natural: joinInfo.natural
          };
          tables.push(ref);
        } else break;
      } else break;
    }

    return tables;
  }

  parseBaseTableRef() {
    if (this.match('LATERAL') || this.match('TABLE')) {
      return this.parseLateralOrTableFunction();
    }
    if (this.match('(')) {
      return this.parseSubqueryTableRef();
    }
    return this.parseSimpleTableRef();
  }

  parseSimpleTableRef() {
    const token = this.peek();
    if (!token) return null;

    if (token.type === 'IDENTIFIER' || token.type === 'KEYWORD') {
      let schema = null;
      let name = this.next().value;

      if (this.peek() && this.peek().value === '.') {
        this.next();
        schema = name;
        const nameTok = this.peek();
        if (nameTok && (nameTok.type === 'IDENTIFIER' || nameTok.type === 'KEYWORD')) {
          name = this.next().value;
        }
      }

      let dbLink = null;
      if (this.peek() && this.peek().value === '@') {
        this.next();
        const linkTok = this.next();
        if (linkTok) dbLink = linkTok.value;
      }

      let alias = null;
      if (this.peek() && (
          this.peek().type === 'IDENTIFIER' ||
          (this.peek().type === 'KEYWORD' && this.peek().value.toUpperCase() === 'AS')
      ) &&
          !this.match('WHERE', 'GROUP', 'HAVING', 'ORDER', 'UNION', 'MINUS', 'INTERSECT', 'EXCEPT', 'FOR', 'ON', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'OUTER', 'NATURAL', 'USING', 'CONNECT') &&
          this.peek().value !== ',' && this.peek().value !== ')' && this.peek().value !== ';' &&
          this.peek().value !== '(') {
        if (this.consume('AS')) {
          const aliasTok = this.next();
          if (aliasTok) alias = aliasTok.value;
        } else {
          const aliasTok = this.next();
          if (aliasTok && aliasTok.type === 'IDENTIFIER') {
            alias = aliasTok.value;
          } else if (aliasTok && aliasTok.value.toUpperCase() !== name.toUpperCase()) {
            alias = aliasTok.value;
          } else {
            this.pos--;
          }
        }
      }

      return { type: 'table', name, schema, alias, dbLink };
    }

    return null;
  }

  parseSubqueryTableRef() {
    this.expect('PUNCTUATION', '(');
    const subquery = this.parseStatement();
    this.expect('PUNCTUATION', ')');

    let alias = null;
    if (this.peek() && (
        this.peek().type === 'IDENTIFIER' ||
        (this.peek().type === 'KEYWORD' && this.peek().value.toUpperCase() === 'AS')
    )) {
      if (this.consume('AS')) {
        const aliasTok = this.next();
        if (aliasTok) alias = aliasTok.value;
      } else {
        const aliasTok = this.next();
        if (aliasTok && aliasTok.type === 'IDENTIFIER') {
          alias = aliasTok.value;
        }
      }
    }

    return { type: 'subquery', query: subquery, alias };
  }

  parseLateralOrTableFunction() {
    this.consume('LATERAL');
    this.consume('TABLE');
    this.expect('PUNCTUATION', '(');
    const expr = this.parseExpression();
    this.expect('PUNCTUATION', ')');

    let alias = null;
    if (this.peek() && (
        this.peek().type === 'IDENTIFIER' ||
        (this.peek().type === 'KEYWORD' && this.peek().value.toUpperCase() === 'AS')
    )) {
      if (this.consume('AS')) {
        const aliasTok = this.next();
        if (aliasTok) alias = aliasTok.value;
      } else {
        const aliasTok = this.next();
        if (aliasTok && aliasTok.type === 'IDENTIFIER') {
          alias = aliasTok.value;
        }
      }
    }

    return { type: 'lateral', expression: expr, alias };
  }

  isJoinKeyword() {
    if (!this.peek()) return false;
    const v = this.peek().value.toUpperCase();
    return v === 'JOIN' || v === 'INNER' || v === 'LEFT' || v === 'RIGHT' ||
           v === 'FULL' || v === 'CROSS' || v === 'OUTER' || v === 'NATURAL';
  }

  parseJoinInfo() {
    let natural = !!this.consume('NATURAL');
    let joinType = 'JOIN';

    if (this.consume('INNER')) joinType = 'INNER JOIN';
    else if (this.consume('LEFT')) { joinType = 'LEFT JOIN'; this.consume('OUTER'); }
    else if (this.consume('RIGHT')) { joinType = 'RIGHT JOIN'; this.consume('OUTER'); }
    else if (this.consume('FULL')) { joinType = 'FULL JOIN'; this.consume('OUTER'); }
    else if (this.consume('CROSS')) joinType = 'CROSS JOIN';
    else if (this.consume('OUTER')) joinType = 'OUTER JOIN';

    this.expect('KEYWORD', 'JOIN');

    const ref = this.parseBaseTableRef();
    if (!ref) return null;

    if (natural) {
      return { type: joinType, ref, natural: true, conditions: [], using: null };
    }

    let conditions = [];
    let using = null;

    if (this.match('ON')) {
      this.next();
      conditions = this.parseJoinConditions();
    } else if (this.match('USING')) {
      this.next();
      this.expect('PUNCTUATION', '(');
      using = [];
      do {
        const col = this.next();
        if (col) using.push(col.value);
        if (this.peek() && this.peek().value === ',') this.next();
        else break;
      } while (this.peek() && this.peek().value !== ')');
      this.expect('PUNCTUATION', ')');
    }

    return { type: joinType, ref, natural, conditions, using };
  }

  parseJoinConditions() {
    const conditions = [];
    const expr = this.parseExpression();
    if (expr) conditions.push(expr);
    return conditions;
  }

  parseWhereClause() {
    this.consume('WHERE');
    return this.parseExpression();
  }

  parseGroupByClause() {
    this.consume('GROUP');
    this.expect('KEYWORD', 'BY');
    const columns = [];
    do {
      const expr = this.parseExpression();
      if (expr) columns.push(expr);
      if (this.peek() && this.peek().value === ',') this.next();
      else break;
    } while (this.peek() && !this.match('HAVING', 'ORDER', 'UNION', 'MINUS', 'INTERSECT', 'EXCEPT', 'FOR', 'CONNECT', ')'));
    return columns;
  }

  parseHavingClause() {
    this.consume('HAVING');
    return this.parseExpression();
  }

  parseOrderByClause() {
    this.consume('ORDER');
    this.expect('KEYWORD', 'BY');
    const columns = [];
    do {
      const expr = this.parseExpression();
      if (!expr) break;
      let direction = 'ASC';
      if (this.match('ASC')) { this.next(); direction = 'ASC'; }
      else if (this.match('DESC')) { this.next(); direction = 'DESC'; }

      if (this.match('NULLS')) {
        this.next();
        const nulls = this.consume('FIRST') ? 'FIRST' : 'LAST';
        columns.push({ expression: expr, direction, nulls });
      } else {
        columns.push({ expression: expr, direction });
      }

      if (this.peek() && this.peek().value === ',') this.next();
      else break;
    } while (this.peek() && !this.match('UNION', 'MINUS', 'INTERSECT', 'EXCEPT', 'FOR', 'CONNECT', ')'));
    return columns;
  }

  parseConnectByClause() {
    this.consume('CONNECT');
    this.expect('KEYWORD', 'BY');
    const prior = !!this.consume('PRIOR');
    const condition = this.parseExpression();

    let startWith = null;
    if (this.match('START')) {
      this.next();
      this.expect('KEYWORD', 'WITH');
      startWith = this.parseExpression();
    }

    return { prior, condition, startWith };
  }

  parseUnionClause() {
    if (!this.match('UNION', 'MINUS', 'INTERSECT', 'EXCEPT')) return null;
    const unions = [];

    while (this.match('UNION', 'MINUS', 'INTERSECT', 'EXCEPT')) {
      const operator = this.next().value.toUpperCase();
      let all = false;
      if (this.consume('ALL')) all = true;
      const statement = this.parseStatement();
      unions.push({ operator, all, statement });
    }

    return unions.length > 0 ? unions : null;
  }
}

export function parse(sql) {
  try {
    const tokens = tokenize(sql);
    const parser = new SQLParser(tokens);
    const ast = parser.parse();
    if (parser.errors && parser.errors.length > 0) {
      ast._parserErrors = parser.errors;
    }
    return ast;
  } catch (e) {
    return {
      type: 'query',
      statement: null,
      ctes: null,
      unions: null,
      _error: e.message,
      _parserErrors: [{ message: e.message, position: 0 }]
    };
  }
}
