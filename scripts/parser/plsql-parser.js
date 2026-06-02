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
      tokens.push({ type: 'COMMENT', value: sql.slice(i, end), position: i });
      i = end;
      continue;
    }

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && j + 1 < sql.length && sql[j + 1] === "'") {
          j += 2; continue;
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
      while (j < sql.length && /\d/.test(sql[j])) j++;
      if (j < sql.length && sql[j] === '.' && j + 1 < sql.length && /\d/.test(sql[j + 1])) {
        j++;
        while (j < sql.length && /\d/.test(sql[j])) j++;
      }
      tokens.push({ type: 'NUMBER', value: sql.slice(i, j), position: i });
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
        tokens.push({ type: 'IDENTIFIER', value: word, position: i });
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
    if (sql[i] === '<' && sql[i + 1] === '<') {
      tokens.push({ type: 'OPERATOR', value: '<<', position: i });
      i += 2;
      continue;
    }
    if (sql[i] === '>' && sql[i + 1] === '>') {
      tokens.push({ type: 'OPERATOR', value: '>>', position: i });
      i += 2;
      continue;
    }

    if ('=<>+-*/%'.includes(sql[i]) || sql[i] === '.') {
      tokens.push({ type: 'OPERATOR', value: sql[i], position: i });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

function normalizeName(name) {
  return name ? name.toUpperCase() : name;
}

const PLSQL_TYPES = new Set([
  'VARCHAR2', 'VARCHAR', 'CHAR', 'NCHAR', 'NVARCHAR2', 'CLOB', 'NCLOB', 'BLOB',
  'NUMBER', 'INTEGER', 'INT', 'BINARY_INTEGER', 'PLS_INTEGER', 'SIMPLE_INTEGER',
  'FLOAT', 'BINARY_FLOAT', 'BINARY_DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL',
  'DATE', 'TIMESTAMP', 'INTERVAL', 'BOOLEAN', 'LONG', 'RAW', 'LONG RAW',
  'ROWID', 'UROWID', 'XMLTYPE', 'SYS_REFCURSOR', 'REF CURSOR',
  'TABLE', 'BOOLEAN', 'RECORD', 'VARRAY', 'OBJECT', 'TYPE',
  'PLS_INTEGER', 'BINARY_INTEGER', 'NATURAL', 'POSITIVE', 'SIGNTYPE',
  'SIMPLE_INTEGER', 'SIMPLE_FLOAT', 'SIMPLE_DOUBLE'
]);

function isPlsqlType(word) {
  if (!word) return false;
  const u = word.toUpperCase();
  if (PLSQL_TYPES.has(u)) return true;
  if (u.endsWith('%TYPE') || u.endsWith('%ROWTYPE')) return true;
  return false;
}

export class PLSQLParser {
  constructor(tokens) {
    this.tokens = tokens.filter(t => t.type !== 'COMMENT');
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

  match(...values) {
    const token = this.peek();
    if (!token) return false;
    const upper = token.value.toUpperCase();
    return values.some(v => v.toUpperCase() === upper);
  }

  matchKeyword(...values) {
    return this.match(...values);
  }

  consume(...values) {
    if (this.match(...values)) return this.next();
    return null;
  }

  expectPunctuation(value) {
    const token = this.peek();
    if (token && token.type === 'PUNCTUATION' && token.value === value) return this.next();
    return null;
  }

  parse() {
    this.skipShowErrors();
    const pkg = this.parsePackage();

    if (pkg.spec && !pkg.body) {
      this.skipSlashDelimiter();
      this.skipShowErrors();
      this.skipSlashDelimiter();

      const savedPos = this.pos;
      const pkg2 = this.parsePackageWithSpec(pkg.spec.procedures, pkg.spec.functions);
      this.skipSlashDelimiter();

      if (pkg2 && pkg2.body && pkg2.name && pkg2.name.toUpperCase() === (pkg.name || '').toUpperCase()) {
        pkg.body = pkg2.body;
      } else {
        this.pos = savedPos;
      }
    }

    if (this.errors.length > 0) {
      pkg.errors = (pkg.errors || []).concat(this.errors);
    }
    return pkg;
  }

  parsePackageWithSpec(specProcedures, specFunctions) {
    this.skipSlashDelimiter();
    this.skipShowErrors();
    this.skipSlashDelimiter();
    this.consume('CREATE');
    this.consume('OR');
    this.consume('REPLACE');
    this.consume('EDITIONABLE');
    this.consume('NONEDITIONABLE');

    if (!this.consume('PACKAGE')) {
      return { type: 'package', name: null, spec: null, body: null, errors: [{ message: 'Expected PACKAGE keyword' }] };
    }

    if (!this.consume('BODY')) {
      return { type: 'package', name: null, spec: null, body: null };
    }

    const nameToken = this.peek();
    if (!nameToken || nameToken.type !== 'IDENTIFIER') {
      return { type: 'package', name: null, spec: null, body: null, errors: [{ message: 'Expected package name' }] };
    }
    const name = nameToken.value;
    this.next();

    if (this.peek() && this.peek().value === '.') {
      this.next();
      const subName = this.peek();
      if (subName) this.next();
    }

    return this.parseBody(name, specProcedures, specFunctions);
  }

  skipShowErrors() {
    while (this.match('SHOW')) {
      const saved = this.pos;
      this.consume('SHOW');
      if (this.consume('ERRORS')) {
        while (this.peek() && this.peek().value !== ';') this.next();
        this.consume(';');
        continue;
      }
      this.pos = saved;
      break;
    }
  }

  skipSlashDelimiter() {
    while (this.peek() && this.peek().value === '/') {
      const next = this.peek(1);
      if (next && (next.type === 'PUNCTUATION' || next.value === '/' || !next)) {
        this.next();
      } else {
        break;
      }
    }
  }

  parsePackage() {
    this.skipSlashDelimiter();
    this.consume('CREATE');
    this.consume('OR');
    this.consume('REPLACE');
    this.consume('EDITIONABLE');
    this.consume('NONEDITIONABLE');

    if (!this.consume('PACKAGE')) {
      return { type: 'package', name: null, spec: null, body: null, errors: [{ message: 'Expected PACKAGE keyword' }] };
    }

    const isBody = !!this.consume('BODY');

    const nameToken = this.peek();
    if (!nameToken || nameToken.type !== 'IDENTIFIER') {
      return { type: 'package', name: null, spec: null, body: null, errors: [{ message: 'Expected package name' }] };
    }
    const name = nameToken.value;
    this.next();

    if (this.peek() && this.peek().value === '.') {
      this.next();
      const subName = this.peek();
      if (subName) this.next();
    }

    this.skipAuthid();

    if (isBody) {
      return this.parseBody(name);
    }

    return this.parseSpec(name);
  }

  skipAuthid() {
    if (this.match('AUTHID')) {
      this.next();
      if (this.match('CURRENT_USER') || this.match('DEFINER')) this.next();
      this.consume('AS');
    }
  }

  parseSpec(name) {
    const spec = {
      procedures: [],
      functions: [],
      constants: [],
      globalVariables: [],
      types: []
    };

    if (!this.consume('AS') && !this.consume('IS')) {
      return { type: 'package', name, spec, body: null, errors: [{ message: 'Expected AS/IS after package name' }] };
    }

    this.parseDeclarations(spec, true);

    if (!this.expectPunctuation(';') && !this.match('END')) {
    }

    if (this.match('END')) {
      const end = this.peek(1);
      if (end && end.value && end.value.toUpperCase() === name.toUpperCase()) {
        this.next();
        this.next();
      } else {
        this.next();
      }
      this.consume(';');
      this.consume('/');
    }

    this.skipSlashDelimiter();

    return { type: 'package', name, spec, body: null };
  }

  parseBody(name, specProcedures, specFunctions) {
    const body = {
      procedures: specProcedures ? specProcedures.map(p => ({ ...p })) : [],
      functions: specFunctions ? specFunctions.map(f => ({ ...f })) : [],
      privateProcedures: [],
      privateFunctions: [],
      constants: [],
      globalVariables: [],
      types: []
    };

    if (!this.consume('AS') && !this.consume('IS')) {
      return { type: 'package', name, spec: null, body, errors: [{ message: 'Expected AS/IS after package body name' }] };
    }

    this.parseDeclarations(body, false);

    this.parseBodyImplementations(body);

    if (this.match('END')) {
      const end = this.peek(1);
      if (end && end.value && end.value.toUpperCase() === name.toUpperCase()) {
        this.next();
        this.next();
      } else {
        this.next();
      }
      this.consume(';');
      this.consume('/');
    }

    this.skipSlashDelimiter();

    return { type: 'package', name, spec: null, body };
  }

  parseDeclarations(container, isSpec) {
    while (this.peek()) {
      if (this.match('END')) break;
      if (this.match('BEGIN')) break;
      if (this.match('PROCEDURE') || this.match('FUNCTION')) {
        if (isSpec) {
          if (this.match('PROCEDURE')) {
            const proc = this.parseProcedureDecl(true);
            if (proc) container.procedures.push(proc);
          } else {
            const func = this.parseFunctionDecl(true);
            if (func) container.functions.push(func);
          }
        } else {
          return;
        }
        continue;
      }
      if (this.match('SUBTYPE') || this.match('TYPE')) {
        this.parseTypeDecl();
        continue;
      }

      const token = this.peek();
      if (token && token.type === 'IDENTIFIER') {
        const next1 = this.peek(1);
        if (next1 && (
            next1.value.toUpperCase() === 'CONSTANT' ||
            next1.value === 'EXCEPTION' ||
            isPlsqlType(next1.value) ||
            next1.value === 'NOT' ||
            next1.value === ':=' ||
            next1.value === 'DEFAULT' ||
            next1.value === ';' ||
            (next1.type === 'IDENTIFIER' && !isPlsqlKeyword(next1.value) && !this.matchKeyword('PROCEDURE', 'FUNCTION', 'TYPE', 'SUBTYPE', 'CURSOR', 'BEGIN', 'END'))
        )) {
          const varOrConst = this.parseVariableOrConstant();
          if (varOrConst) {
            if (varOrConst.isConstant) {
              container.constants.push(varOrConst);
            } else {
              container.globalVariables.push(varOrConst);
            }
          }
          continue;
        }
      }

      if (this.match('CURSOR')) {
        this.skipCursorDecl();
        continue;
      }

      if (this.match('PRAGMA')) {
        this.skipUntilSemicolon();
        continue;
      }

      if (this.match('SUBTYPE')) {
        this.skipUntilSemicolon();
        continue;
      }

      if (token && token.type === 'IDENTIFIER' && this.peek(1) && this.peek(1).value === '(') {
        this.parseTypeDecl();
        continue;
      }

      break;
    }
  }

  parseProcedureDecl(isSpec) {
    this.consume('PROCEDURE');

    const nameToken = this.peek();
    if (!nameToken || nameToken.type !== 'IDENTIFIER') return null;
    const name = nameToken.value;
    this.next();

    const params = this.parseParameters();

    if (isSpec) {
      if (this.match('IS') || this.match('AS')) {
        this.consume('IS') || this.consume('AS');
        if (this.peek() && this.peek().value === ';') {
          this.next();
        }
      }
      if (this.peek() && this.peek().value === ';') {
        this.next();
      }
    }

    return { name, params };
  }

  parseFunctionDecl(isSpec) {
    this.consume('FUNCTION');
    const nameToken = this.peek();
    if (!nameToken || nameToken.type !== 'IDENTIFIER') {
      return null;
    }
    const name = nameToken.value;
    this.next();

    const params = this.parseParameters();

    this.consume('RETURN');
    const returnType = this.parseDataType();

    if (isSpec) {
      const pragmas = [];
      while (this.match('PRAGMA')) {
        this.next();
        const pName = this.peek() ? this.peek().value : null;
        if (pName) this.next();
        pragmas.push(pName);
        this.skipUntilSemicolon();
      }

      if (this.match('IS') || this.match('AS')) {
        this.consume('IS') || this.consume('AS');
        if (this.peek() && this.peek().value === ';') {
          this.next();
        }
      }
      if (this.peek() && this.peek().value === ';') {
        this.next();
      }
    }

    return { name, params, returnType };
  }

  parseParameters() {
    if (!this.peek() || this.peek().value !== '(') return [];
    this.next();
    const params = [];

    while (this.peek() && this.peek().value !== ')') {
      if (this.peek().value === ',') { this.next(); continue; }

      const nameToken = this.peek();
      if (!nameToken || nameToken.type !== 'IDENTIFIER') break;
      const name = nameToken.value;
      this.next();

      let mode = 'IN';
      if (this.match('IN') || this.match('OUT') || this.match('IN OUT')) {
        const modeToken = this.next();
        mode = modeToken.value.toUpperCase();
        if (this.match('OUT')) {
          mode += ' ' + this.next().value.toUpperCase();
        }
      }

      const dataType = this.parseDataType();

      let defaultValue = null;
      if (this.match('DEFAULT') || this.peek() && this.peek().value === ':=') {
        if (this.consume('DEFAULT') || this.consume(':')) {
          if (this.peek() && this.peek().value === '=') this.next();
          defaultValue = this.skipDefaultValue();
        }
      }

      params.push({ name, mode, dataType, defaultValue });
    }

    if (this.peek() && this.peek().value === ')') this.next();
    return params;
  }

  parseDataType() {
    const token = this.peek();
    if (!token || token.type === 'PUNCTUATION' || token.value === ';' ||
        this.match('BEGIN', 'END', 'IS', 'AS', 'RETURN', 'DEFAULT', ',', 'PRAGMA') ||
        (token.type === 'OPERATOR' && token.value !== '.')) {
      return token ? token.value : null;
    }

    let typeName = '';
    while (this.peek()) {
      const t = this.peek();
      if (t.type === 'PUNCTUATION' && t.value === '(') {
        typeName += t.value;
        this.next();
        let depth = 1;
        while (this.peek() && depth > 0) {
          if (this.peek().value === '(') depth++;
          if (this.peek().value === ')') depth--;
          if (depth > 0) typeName += this.next().value;
          else { typeName += this.next().value; break; }
        }
        continue;
      }
      if (t.value === ';' || t.value === ',' || t.value === ')' || t.type === 'OPERATOR') break;
      if (this.match('IS', 'AS', 'BEGIN', 'END', 'DEFAULT', 'RETURN', 'PRAGMA')) break;
      typeName += t.value;
      this.next();
      if (this.peek() && (this.peek().value === ';' || this.peek().value === ',' || this.peek().value === ')' || this.peek().type === 'OPERATOR') ||
          this.match('IS', 'AS', 'BEGIN', 'END', 'DEFAULT', 'PRAGMA')) break;
    }

    return typeName.trim();
  }

  skipDefaultValue() {
    let depth = 0;
    let value = '';
    while (this.peek()) {
      if (this.peek().value === '(') depth++;
      if (this.peek().value === ')') {
        if (depth === 0) break;
        depth--;
      }
      if (depth === 0 && (this.peek().value === ',' || this.peek().value === ';' || this.peek().value === ')')) break;
      if (depth === 0 && this.match('BEGIN', 'END', 'IS', 'AS')) break;
      value += this.next().value;
    }
    return value;
  }

  parseVariableOrConstant() {
    const nameToken = this.peek();
    if (!nameToken || nameToken.type !== 'IDENTIFIER') return null;
    const name = nameToken.value;
    this.next();

    const isConstant = !!this.consume('CONSTANT');

    const dataType = this.parseDataType();

    let defaultValue = null;
    if (this.match('DEFAULT') || (this.peek() && this.peek().value === ':=')) {
      if (this.consume('DEFAULT') || this.consume(':')) {
        if (this.peek() && this.peek().value === '=') this.next();
        defaultValue = this.skipDefaultValue();
      } else if (this.peek() && this.peek().value === ':=') {
        this.next();
        defaultValue = this.skipDefaultValue();
      }
    } else if (this.match('NOT') && this.peek(1) && this.peek(1).value === 'NULL') {
      this.next();
      this.next();
      if (this.match('DEFAULT') || (this.peek() && this.peek().value === ':=')) {
        if (this.consume('DEFAULT') || this.consume(':')) {
          if (this.peek() && this.peek().value === '=') this.next();
          defaultValue = this.skipDefaultValue();
        } else if (this.peek() && this.peek().value === ':=') {
          this.next();
          defaultValue = this.skipDefaultValue();
        }
      }
    }

    while (this.peek() && this.peek().value === ';') {
      this.next();
    }

    return { name, isConstant, dataType, defaultValue };
  }

  parseTypeDecl() {
    if (this.match('SUBTYPE')) {
      this.skipUntilSemicolon();
      return;
    }

    if (this.consume('TYPE')) {
      if (this.peek()) this.next();
      if (this.match('IS') || this.match('AS')) {
        this.next();
      }
      this.skipUntilSemicolon();
    }
  }

  skipCursorDecl() {
    this.consume('CURSOR');
    if (this.peek()) this.next();
    if (this.peek() && this.peek().value === '(') {
      let depth = 1;
      this.next();
      while (this.peek() && depth > 0) {
        if (this.peek().value === '(') depth++;
        if (this.peek().value === ')') depth--;
        this.next();
      }
    }
    if (this.match('IS') || this.match('RETURN')) {
      this.next();
    }
    this.skipUntilSemicolon();
  }

  skipUntilSemicolon() {
    let depth = 0;
    while (this.peek()) {
      if (this.peek().value === '(') depth++;
      if (this.peek().value === ')') depth--;
      if (depth <= 0 && this.peek().value === ';') {
        this.next();
        return;
      }
      this.next();
    }
  }

  skipProcOrFuncBlock() {
    this.next();
    if (this.peek()) this.next();
    const params = this.parseParameters();
    if (this.consume('IS') || this.consume('AS')) {
      let depth = 0;
      while (this.peek()) {
        if (this.match('BEGIN')) {
          this.next();
          depth = 1;
          break;
        }
        if (this.match('END')) {
          this.next();
          this.consume(';');
          return;
        }
        this.next();
      }
      while (this.peek() && depth > 0) {
        if (this.match('BEGIN')) { depth++; this.next(); continue; }
        if (this.match('END')) {
          depth--;
          this.next();
          if (depth === 0) {
            this.consume(';');
            return;
          }
          continue;
        }
        this.next();
      }
      this.consume(';');
    } else {
      this.consume(';');
    }
  }

  parseBodyImplementations(container) {
    while (this.peek()) {
      if (this.match('END')) break;

      if (this.match('PROCEDURE')) {
        const impl = this.parseProcedureImpl();
        if (impl) {
          const existing = container.procedures.find(p => p.name.toUpperCase() === impl.name.toUpperCase());
          if (existing) {
            existing.calls = impl.calls;
            existing.body = impl.body;
          } else {
            container.privateProcedures.push(impl);
          }
        }
        continue;
      }

      if (this.match('FUNCTION')) {
        const impl = this.parseFunctionImpl();
        if (impl) {
          const existing = container.functions.find(p => p.name.toUpperCase() === impl.name.toUpperCase());
          if (existing) {
            existing.calls = impl.calls;
            existing.body = impl.body;
          } else {
            container.privateFunctions.push(impl);
          }
        }
        continue;
      }

      if (this.match('BEGIN')) {
        this.next();
        let depth = 1;
        while (this.peek() && depth > 0) {
          if (this.match('BEGIN')) { depth++; this.next(); continue; }
          if (this.match('END')) {
            depth--;
            this.next();
            if (depth === 0) {
              this.consume(';');
              break;
            }
            continue;
          }
          this.next();
        }
        continue;
      }

      if (this.peek() && this.peek().type === 'IDENTIFIER' && this.peek(1) && this.peek(1).value === '(') {
        this.skipUntilSemicolon();
        continue;
      }

      this.next();
    }
  }

  parseProcedureImpl() {
    this.consume('PROCEDURE');

    const nameToken = this.peek();
    if (!nameToken || nameToken.type !== 'IDENTIFIER') return null;
    const name = nameToken.value;
    this.next();

    const params = this.parseParameters();

    if (!this.consume('IS') && !this.consume('AS')) {
      if (this.peek() && this.peek().value === ';') this.next();
      return null;
    }

    this.skipDeclarations();

    if (!this.consume('BEGIN')) {
      return { name, params, calls: [], body: null };
    }

    const block = this.parseBlock();

    return { name, params, calls: block.calls, body: block.body, variables: block.variables };
  }

  parseFunctionImpl() {
    this.consume('FUNCTION');

    const nameToken = this.peek();
    if (!nameToken || nameToken.type !== 'IDENTIFIER') return null;
    const name = nameToken.value;
    this.next();

    const params = this.parseParameters();

    this.consume('RETURN');
    const returnType = this.parseDataType();

    if (!this.consume('IS') && !this.consume('AS')) {
      if (this.peek() && this.peek().value === ';') this.next();
      return { name, params, returnType, calls: [], body: null };
    }

    this.skipDeclarations();

    if (!this.consume('BEGIN')) {
      return { name, params, returnType, calls: [], body: null };
    }

    const block = this.parseBlock();

    return { name, params, returnType, calls: block.calls, body: block.body, variables: block.variables };
  }

  skipDeclarations() {
    let depth = 0;
    while (this.peek()) {
      if (this.match('BEGIN')) return;
      if (this.match('CURSOR') || this.match('TYPE') || this.match('SUBTYPE') || this.match('PRAGMA')) {
        this.skipUntilSemicolon();
        continue;
      }
      const token = this.peek();
      if (token && token.type === 'IDENTIFIER' && this.peek(1) && this.peek(1).value === ' ') {
      }
      if (this.match('PROCEDURE') || this.match('FUNCTION')) {
        return;
      }
      if (this.peek() && this.peek().value === ';') {
        this.next();
        continue;
      }
      if (this.match('BEGIN')) return;
      if (this.match('END')) return;
      this.next();
    }
  }

  parseBlock() {
    const calls = [];
    const variables = [];

    this.skipBodyStatements(calls, variables);

    if (this.match('EXCEPTION')) {
      this.next();
      while (this.peek() && !this.match('END')) {
        if (this.match('WHEN')) {
          this.next();
          this.skipBodyStatements(calls, variables);
        } else {
          this.next();
        }
      }
    }

    if (this.match('END')) {
      this.next();
      if (this.peek() && this.peek().type === 'IDENTIFIER' && this.peek(1) && this.peek(1).value === ';') {
        this.next();
      }
    }

    this.consume(';');
    this.consume('/');

    return { calls, body: { calls, variables }, variables };
  }

  skipBodyStatements(calls, variables) {
    let depth = 0;
    while (this.peek()) {
      if (this.match('EXCEPTION') && depth === 0) return;
      if (this.match('END')) {
        if (depth === 0) return;
        depth--;
        this.next();
        if (this.match('IF') || this.match('LOOP') || this.match('CASE')) {
          this.next();
        }
        continue;
      }
      if (this.match('LOOP') || this.match('IF') || this.match('CASE')) {
        this.next();
        depth++;
        continue;
      }
      if (this.match('BEGIN')) {
        this.next();
        depth++;
        continue;
      }

      const token = this.peek();
      if (!token) return;

      if (token.value === ';') {
        this.next();
        continue;
      }

      if (token.value === '/' && (!this.peek(1) || this.peek(1).type === 'PUNCTUATION' || this.peek(1).value === '/')) {
        this.next();
        continue;
      }

      if (token.type === 'IDENTIFIER' && this.peek(1)) {
        const callName = token.value.toUpperCase();
        const nextVal = this.peek(1).value;

        if (nextVal === '(' || nextVal === ';' || nextVal === '.') {
          if (isPlsqlKeyword(callName) || looksLikeParameter(callName) || looksLikeType(callName)) {
            this.next();
            continue;
          }
          if (nextVal === '(' || nextVal === ';') {
            calls.push({ name: token.value, position: token.position });
          }
        } else if (this.match('FOR') || this.match('WHILE') || this.match('OPEN') ||
            this.match('CLOSE') || this.match('FETCH')) {
        }
      }

      this.next();
    }
  }
}

const PLSQL_KEYWORDS = new Set([
  'BEGIN', 'END', 'DECLARE', 'EXCEPTION', 'IF', 'THEN', 'ELSE', 'ELSIF',
  'END IF', 'LOOP', 'WHILE', 'FOR', 'IN', 'EXIT', 'CONTINUE', 'RETURN',
  'GOTO', 'NULL', 'CASE', 'WHEN', 'RAISE', 'PRAGMA', 'EXECUTE', 'IMMEDIATE',
  'OPEN', 'FETCH', 'CLOSE', 'CURSOR', 'SELECT', 'INSERT', 'UPDATE', 'DELETE',
  'INTO', 'FROM', 'WHERE', 'SET', 'VALUES', 'MERGE', 'TRUNCATE',
  'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'LOCK', 'TABLE',
  'NOT', 'AND', 'OR', 'IS', 'AS', 'AT', 'INTO', 'BULK', 'COLLECT', 'LIMIT',
  'FOUND', 'NOTFOUND', 'ROWCOUNT', 'ISOPEN', 'REF', 'RETURNING',
  'PIPE', 'ROW', 'TYPE', 'SUBTYPE', 'CONSTANT', 'DEFAULT', 'FUNCTION',
  'PROCEDURE', 'PACKAGE', 'BODY', 'AUTHID', 'DETERMINISTIC', 'PARALLEL_ENABLE',
  'RESULT_CACHE', 'ACCESSIBLE', 'MEMBER', 'STATIC', 'OVERRIDING',
  'FINAL', 'INSTANTIABLE', 'OBJECT', 'REF', 'SQL', 'LANGUAGE',
  'JAVA', 'NAME', 'MAP', 'ORDER', 'EXTERNAL', 'CALL',
  'CREATE', 'OR', 'REPLACE', 'EDITIONABLE', 'NONEDITIONABLE',
  'SHOW', 'ERRORS', 'VARIABLE', 'COLUMN', 'NEW', 'OLD',
  'PRAGMA', 'INLINE', 'UDF', 'SERIALLY_REUSABLE', 'AUTONOMOUS_TRANSACTION',
  'EXCEPTION_INIT', 'RESTRICT_REFERENCES', 'DEPRECATE',
  'TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'NVL', 'COALESCE', 'DECODE',
  'SYSDATE', 'SYSTIMESTAMP',
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
  'UPPER', 'LOWER', 'TRIM', 'SUBSTR', 'INSTR', 'LENGTH',
  'GREATEST', 'LEAST', 'PUT_LINE', 'PUT',
  'DBMS_OUTPUT', 'DBMS_SQL', 'DBMS_XMLGEN', 'DBMS_LOB', 'DBMS_RANDOM'
]);

function isPlsqlKeyword(word) {
  return PLSQL_KEYWORDS.has(word.toUpperCase());
}

function looksLikeParameter(name) {
  const u = name.toUpperCase();
  return u.startsWith('P_') || u.startsWith('V_') || u.startsWith('L_') ||
         u.startsWith('G_') || u.startsWith('C_') || u === 'SELF';
}

function looksLikeType(name) {
  const u = name.toUpperCase();
  return u === 'NUMBER' || u === 'VARCHAR2' || u === 'VARCHAR' || u === 'CHAR' ||
         u === 'DATE' || u === 'TIMESTAMP' || u === 'BOOLEAN' || u === 'INTEGER' ||
         u === 'INT' || u === 'BLOB' || u === 'CLOB' || u === 'FLOAT' ||
         u === 'BINARY_INTEGER' || u === 'PLS_INTEGER' || u === 'SYS_REFCURSOR' ||
         u === 'LONG' || u === 'RAW' || u === 'ROWID' || u === 'UROWID' ||
         u === 'XMLTYPE' || u === 'SIMPLE_INTEGER' || u === 'SIMPLE_FLOAT' ||
         u === 'SIMPLE_DOUBLE' || u === 'NATURAL' || u === 'POSITIVE' ||
         u === 'SIGNTYPE' || u === 'DECIMAL' || u === 'NUMERIC' ||
         u === 'REAL' || u === 'BINARY_FLOAT' || u === 'BINARY_DOUBLE' ||
         u === 'NCHAR' || u === 'NVARCHAR2' || u === 'NCLOB';
}
