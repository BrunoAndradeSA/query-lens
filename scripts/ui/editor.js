export function createEditor(container, options = {}) {
  if (!container) {
    console.error('[QueryLens] Editor container not found');
    return null;
  }

  try {
    const editor = monaco.editor.create(container, {
      value: options.initialValue || `SELECT
  o.order_id,
  o.order_date,
  c.name AS customer_name,
  c.email,
  oi.product_id,
  p.name AS product_name,
  oi.quantity,
  oi.unit_price,
  (oi.quantity * oi.unit_price) AS total_amount,
  a.street_address,
  a.city
FROM
  orders o
  INNER JOIN customers c ON o.customer_id = c.customer_id
  INNER JOIN order_items oi ON o.order_id = oi.order_id
  INNER JOIN products p ON oi.product_id = p.product_id
  LEFT JOIN addresses a ON c.customer_id = a.customer_id AND a.address_type = 'SHIPPING'
WHERE
  o.order_date >= TO_DATE('2024-01-01', 'YYYY-MM-DD')
  AND o.status IN ('SHIPPED', 'DELIVERED')
  AND c.email IS NOT NULL
ORDER BY
  o.order_date DESC`,
      language: 'sql',
      theme: 'vs-dark',
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', 'Courier New', monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on',
      tabSize: 2,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      padding: { top: 12 },
      suggest: { showKeywords: true, showFunctions: true },
      ...(options.editorOptions || {})
    });

    return editor;
  } catch (err) {
    console.error('[QueryLens] Failed to create Monaco editor:', err);
    return null;
  }
}

export function setEditorValue(editor, value) {
  if (editor) {
    editor.setValue(value);
  }
}

export function getEditorValue(editor) {
  return editor ? editor.getValue() : '';
}

function formatSqlText(sql) {
  const strings = [];
  let s = sql
    .replace(/'[^']*'/g, m => { strings.push(m); return `\x00${strings.length - 1}\x00`; })
    .replace(/"[^"]*"/g, m => { strings.push(m); return `\x01${strings.length - 1}\x01`; });

  const tokens = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/[a-zA-Z_0-9]/.test(ch) || ch === '\x00' || ch === '\x01') {
      buf += ch;
    } else {
      if (buf) { tokens.push(buf); buf = ''; }
      if (!/\s/.test(ch)) tokens.push(ch);
    }
  }
  if (buf) tokens.push(buf);

  for (let i = 0; i < tokens.length - 1; i++) {
    const c = tokens[i] + tokens[i + 1];
    if (['>=','<=','<>','!=','||'].includes(c)) {
      tokens[i] = c;
      tokens.splice(i + 1, 1);
    }
  }

  const keywords = new Set([
    'SELECT','FROM','WHERE','INNER','LEFT','RIGHT','FULL','CROSS','JOIN','ON',
    'AND','OR','AS','IN','IS','NOT','NULL','LIKE','BETWEEN','EXISTS',
    'ORDER','GROUP','BY','HAVING','UNION','ALL','MINUS','INTERSECT',
    'DISTINCT','ASC','DESC','WITH','RECURSIVE',
    'CASE','WHEN','THEN','ELSE','END','OVER','PARTITION','ROWS','RANGE',
    'UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW',
    'CREATE','REPLACE','VIEW','TABLE','INSERT','INTO','VALUES',
    'UPDATE','SET','DELETE','USING','NATURAL','OUTER',
    'LIMIT','OFFSET','TOP'
  ]);
  for (let i = 0; i < tokens.length; i++) {
    if (keywords.has(tokens[i].toUpperCase())) tokens[i] = tokens[i].toUpperCase();
  }

  const out = [];
  let last = '';

  function w(tok) {
    if (tok === '(' || tok === ')') {
      if (tok === '(' && last && !/[\s(]/.test(last)) out.push(' ');
      out.push(tok);
    } else if (tok === ',') {
      out.push(',\n  ');
    } else if (tok === '.') {
      out.push('.');
    } else if (tok === ';') {
      out.push(';');
    } else {
      if (last && !/[\s(.]/.test(last)) out.push(' ');
      out.push(tok);
    }
    last = tok.slice(-1);
  }

  function nl(n) {
    out.push('\n' + '  '.repeat(n));
    last = '\n';
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], nx = tokens[i + 1];

    if (t === 'SELECT') {
      if (out.length) out.push('\n');
      w(t);
      if (nx && !['*','DISTINCT','ALL'].includes(nx)) nl(1);
      continue;
    }
    if (t === 'FROM') { if (last !== '\n') out.push('\n'); last = '\n'; w(t); nl(1); continue; }
    if (t === 'WHERE') { if (last !== '\n') out.push('\n'); last = '\n'; w(t); nl(1); continue; }
    if (t === 'HAVING') { if (last !== '\n') out.push('\n'); last = '\n'; w(t); nl(1); continue; }

    if (t === 'ORDER' && nx === 'BY') { if (last !== '\n') out.push('\n'); last = '\n'; w(t); w('BY'); nl(1); i++; continue; }
    if (t === 'GROUP' && nx === 'BY') { if (last !== '\n') out.push('\n'); last = '\n'; w(t); w('BY'); nl(1); i++; continue; }
    if (t === 'PARTITION' && nx === 'BY') { w(t); w('BY'); i++; continue; }

    if (t === 'UNION' || t === 'MINUS' || t === 'INTERSECT') {
      out.push('\n\n'); w(t);
      if (t === 'UNION' && nx === 'ALL') { w('ALL'); i++; }
      out.push('\n');
      continue;
    }

    if (['INNER','LEFT','RIGHT','FULL','CROSS'].includes(t) && nx === 'JOIN') {
      if (last !== '\n') nl(1);
      w(t); w('JOIN'); i++;
      continue;
    }

    if (t === 'JOIN' && !['INNER','LEFT','RIGHT','FULL','CROSS'].includes(tokens[i - 1])) {
      if (last !== '\n') nl(1); else { last = '\n'; }
      w(t);
      continue;
    }

    if (t === 'ON') { w(t); continue; }
    if (t === 'AND' || t === 'OR') { if (out.length) nl(2); w(t); continue; }
    if (t === 'LIMIT' || t === 'OFFSET') { if (last !== '\n') out.push('\n'); last = '\n'; w(t); nl(1); continue; }

    w(t);
  }

  s = out.join('');
  for (let i = 0; i < strings.length; i++) {
    s = s.replace(`\x00${i}\x00`, strings[i]);
    s = s.replace(`\x01${i}\x01`, strings[i]);
  }

  return s.replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
  }
  if (buf) tokens.push(buf);

  const upperKeywords = new Set([
    'SELECT','FROM','WHERE','INNER','LEFT','RIGHT','FULL','CROSS','JOIN','ON',
    'AND','OR','AS','IN','IS','NOT','NULL','LIKE','BETWEEN','EXISTS',
    'ORDER','GROUP','BY','HAVING','UNION','ALL','MINUS','INTERSECT',
    'DISTINCT','ASC','DESC','WITH','RECURSIVE',
    'CASE','WHEN','THEN','ELSE','END','OVER','PARTITION','ROWS','RANGE',
    'UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW',
    'CREATE','REPLACE','VIEW','TABLE','INSERT','INTO','VALUES',
    'UPDATE','SET','DELETE','USING','NATURAL','OUTER',
    'LIMIT','OFFSET','TOP'
  ]);

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (upperKeywords.has(w.toUpperCase())) {
      tokens[i] = w.toUpperCase();
    }
  }

  const out = [];
  let lastTok = '';

  function space() {
    if (lastTok && !/[\s(]/.test(lastTok)) out.push(' ');
  }

  function emit(tok) {
    if (tok === '(') {
      out.push('(');
    } else if (tok === ')') {
      out.push(')');
    } else if (tok === ',') {
      out.push(',\n  ');
    } else if (tok === ';') {
      out.push(';');
    } else if (tok === '.') {
      out.push('.');
    } else if (tok === '*' || tok === '+' || tok === '-' || tok === '/' || tok === '%' || tok === '=' || tok === '<' || tok === '>' || tok === '!') {
      space();
      out.push(tok);
    } else if (tok === '>=' || tok === '<=' || tok === '<>' || tok === '!=' || tok === '||') {
      space();
      out.push(tok);
    } else {
      space();
      out.push(tok);
    }
    lastTok = tok.slice(-1);
  }

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const next = i + 1 < tokens.length ? tokens[i + 1].toUpperCase() : '';

    if (w === 'SELECT') {
      if (out.length > 0) out.push('\n');
      emit(w);
      if (next !== '*' && next !== 'DISTINCT' && next !== 'ALL') out.push('\n  ');
      continue;
    }

    if (w === 'FROM' || w === 'WHERE' || w === 'HAVING') {
      out.push('\n');
      emit(w);
      out.push('\n  ');
      continue;
    }

    if (w === 'ORDER' && next === 'BY') {
      out.push('\n');
      emit(w); emit('BY');
      out.push('\n  ');
      i++;
      continue;
    }

    if (w === 'GROUP' && next === 'BY') {
      out.push('\n');
      emit(w); emit('BY');
      out.push('\n  ');
      i++;
      continue;
    }

    if (w === 'PARTITION' && next === 'BY') {
      emit(w); emit('BY');
      i++;
      continue;
    }

    if (['UNION','MINUS','INTERSECT'].includes(w)) {
      out.push('\n\n');
      emit(w);
      if (w === 'UNION' && next === 'ALL') { emit('ALL'); i++; }
      out.push('\n');
      continue;
    }

    if (['INNER','LEFT','RIGHT','FULL','CROSS'].includes(w) && next === 'JOIN') {
      if (out.length > 0 && lastTok !== '\n') out.push('\n  ');
      emit(w); emit('JOIN');
      out.push('\n    ');
      i++;
      continue;
    }

    if (w === 'JOIN' && !['INNER','LEFT','RIGHT','FULL','CROSS'].includes(tokens[i - 1] ? tokens[i - 1].toUpperCase() : '')) {
      out.push('\n  ');
      emit(w);
      out.push('\n    ');
      continue;
    }

    if (w === 'ON') {
      if (lastTok !== ' ') out.push(' ');
      out.push('\n      ');
      emit(w);
      continue;
    }

    if (w === 'AND' || w === 'OR') {
      if (out.length > 0) out.push('\n      ');
      emit(w);
      continue;
    }

    if (w === 'LIMIT' || w === 'OFFSET') {
      out.push('\n');
      emit(w);
      out.push('\n  ');
      continue;
    }

    emit(w);
  }

  s = out.join('');
  for (let i = 0; i < strings.length; i++) {
    s = s.replace(`\x00${i}\x00`, strings[i]);
  }
  for (let i = 0; i < strings.length; i++) {
    s = s.replace(`\x01${i}\x01`, strings[i]);
  }

  return s.replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
  }
  if (buf) tokens.push(buf);

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (w.length > 1 && /^[a-zA-Z_]\w*$/.test(w)) {
      tokens[i] = w.toUpperCase();
    }
  }

  const joinTypes = new Set(['INNER','LEFT','RIGHT','FULL','CROSS']);
  const clauseWords = new Set(['SELECT','FROM','WHERE','GROUP','ORDER','HAVING','LIMIT','OFFSET','UNION','MINUS','INTERSECT']);
  const spacers = new Set(['AND','OR','ON','AS','IN','IS','NOT','NULL','LIKE','BETWEEN','EXISTS','ALL','DISTINCT','ASC','DESC','WITH','RECURSIVE','BY','JOIN','USING','NATURAL','OUTER','SET']);

  const out = [];
  let lastTok = '';

  function emit(tok, noBeforeSpace, noAfterSpace) {
    if (tok === '(') {
      out.push('(');
      lastTok = '(';
    } else if (tok === ')') {
      out.push(')');
      lastTok = ')';
    } else if (tok === ',') {
      out.push(',\n  ');
      lastTok = ',';
    } else if (tok === ';') {
      out.push(';');
      lastTok = ';';
    } else if (tok === '.') {
      out.push('.');
    } else if (tok === '*') {
      if (lastTok && !/[\s(]/.test(lastTok)) out.push(' ');
      out.push('*');
      lastTok = '*';
    } else {
      const needSpace = /[a-zA-Z_0-9)]/.test(lastTok) && !noBeforeSpace;
      out.push((needSpace ? ' ' : '') + tok);
      lastTok = tok.slice(-1);
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const next = i + 1 < tokens.length ? tokens[i + 1].toUpperCase() : '';

    if (w === 'SELECT') {
      if (out.length > 0) out.push('\n');
      emit(w);
      if (next !== '*' && !['DISTINCT','ALL'].includes(next)) out.push('\n  ');
      continue;
    }

    if (w === 'FROM' || w === 'WHERE' || w === 'HAVING') {
      out.push('\n');
      emit(w);
      out.push('\n  ');
      continue;
    }

    if (w === 'ORDER' && next === 'BY') {
      out.push('\n');
      emit(w); emit('BY');
      out.push('\n  ');
      i++;
      continue;
    }

    if (w === 'GROUP' && next === 'BY') {
      out.push('\n');
      emit(w); emit('BY');
      out.push('\n  ');
      i++;
      continue;
    }

    if (w === 'PARTITION' && next === 'BY') {
      emit(w); emit('BY');
      i++;
      continue;
    }

    if (['UNION','MINUS','INTERSECT'].includes(w)) {
      out.push('\n\n');
      emit(w);
      if (w === 'UNION' && next === 'ALL') { emit('ALL'); i++; }
      out.push('\n');
      continue;
    }

    if (joinTypes.has(w) && next === 'JOIN') {
      out.push('\n  ');
      emit(w); emit('JOIN');
      out.push('\n    ');
      i++;
      continue;
    }

    if (w === 'JOIN' && !joinTypes.has(tokens[i - 1])) {
      out.push('\n  ');
      emit(w);
      out.push('\n    ');
      continue;
    }

    if (w === 'ON') {
      out.push('\n      ');
      emit(w);
      continue;
    }

    if (w === 'AND' || w === 'OR') {
      out.push('\n      ');
      emit(w);
      continue;
    }

    if (clauseWords.has(w) || spacers.has(w)) {
      emit(w);
      continue;
    }

    if (w === 'LIMIT' || w === 'OFFSET') {
      out.push('\n');
      emit(w);
      out.push('\n  ');
      continue;
    }

    emit(w);
  }

  for (let i = 0; i < strings.length; i++) {
    s = out.join('').replace(`\x00${i}\x00`, strings[i]);
    out.length = 0;
    out.push(s);
  }
  for (let i = 0; i < strings.length; i++) {
    s = out.join('').replace(`\x01${i}\x01`, strings[i]);
    out.length = 0;
    out.push(s);
  }

  return out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

  const lines = s.split('\n');
  const result = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { result.push(''); continue; }
    result.push(trimmed);
  }

  return result.join('\n');
}
  for (let i = 0; i < strCount; i++) {
    s = s.replace(`\x01${i}\x01`, strings[i] ? strings[i].replace(/"/g, '"') : '');
  }

  const lines = s.split('\n');
  const result = [];
  let indent = 0;
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { result.push(''); continue; }

    if (/^(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET)\)?\s*$/i.test(trimmed)) {
      indent = 0;
    }

    const upperCheck = trimmed.toUpperCase();
    if (upperCheck.startsWith('INNER JOIN') || upperCheck.startsWith('LEFT JOIN') ||
        upperCheck.startsWith('RIGHT JOIN') || upperCheck.startsWith('FULL JOIN') ||
        upperCheck.startsWith('CROSS JOIN') || upperCheck.startsWith('JOIN') ||
        upperCheck.startsWith('UNION') || upperCheck.startsWith('MINUS') ||
        upperCheck.startsWith('INTERSECT')) {
      indent = 0;
    }

    const leading = '  '.repeat(indent);
    result.push(leading + trimmed);

    if (upperCheck === 'SELECT') {
      indent = 1;
    }
  }

  return result.join('\n');
}

export function formatInEditor(editor) {
  if (!editor) return;
  const sql = editor.getValue();
  if (!sql) return;
  const formatted = formatSqlText(sql);
  editor.executeEdits('format', [{
    range: editor.getModel().getFullModelRange(),
    text: formatted
  }]);
  editor.getModel().pushUndoStop();
}

export function setEditorTheme(theme) {
  try {
    monaco.editor.defineTheme('querylens-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'e25c40', fontStyle: 'bold' },
        { token: 'type', foreground: '008080' },
        { token: 'string', foreground: 'e0a96d' },
        { token: 'number', foreground: '85a37e' },
        { token: 'function', foreground: 'e25c40' },
        { token: 'comment', foreground: '8e8780', fontStyle: 'italic' },
        { token: 'operator', foreground: 'c5c0bb' },
        { token: 'identifier', foreground: 'f7f5f4' },
        { token: 'variable', foreground: 'ab95b8' },
        { token: 'parameter', foreground: 'c5c0bb' },
        { token: 'delimiter', foreground: 'c5c0bb' }
      ],
      colors: {
        'editor.background': '#161514',
        'editor.foreground': '#f7f5f4',
        'editor.lineHighlightBackground': '#211f1e',
        'editor.selectionBackground': '#383533',
        'editor.inactiveSelectionBackground': '#2c2a29',
        'editorCursor.foreground': '#ebdcd0',
        'editorLineNumber.foreground': '#8e8780',
        'editorLineNumber.activeForeground': '#ebdcd0',
        'editor.selectionHighlightBackground': '#e25c4026',
        'editorBracketMatch.background': '#211f1e',
        'editorBracketMatch.border': '#008080',
        'editorWidget.background': '#211f1e',
        'editorWidget.border': '#33302e',
        'input.background': '#2c2a29',
        'input.foreground': '#f7f5f4',
        'input.border': '#33302e',
        'focusBorder': '#e25c40',
        'list.activeSelectionBackground': '#2c2a29',
        'list.hoverBackground': '#211f1e'
      }
    });

    monaco.editor.defineTheme('querylens-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c74634', fontStyle: 'bold' },
        { token: 'type', foreground: '006666' },
        { token: 'string', foreground: 'b37d3e' },
        { token: 'number', foreground: '3f8a45' },
        { token: 'function', foreground: 'c74634' },
        { token: 'comment', foreground: '9d9690', fontStyle: 'italic' },
        { token: 'operator', foreground: '65605c' },
        { token: 'identifier', foreground: '1b1918' },
        { token: 'variable', foreground: '7a5c8c' },
        { token: 'parameter', foreground: '65605c' },
        { token: 'delimiter', foreground: '65605c' }
      ],
      colors: {
        'editor.background': '#fcfbfa',
        'editor.foreground': '#1b1918',
        'editor.lineHighlightBackground': '#f2efeb',
        'editor.selectionBackground': '#dfd5cb',
        'editor.inactiveSelectionBackground': '#ebdcd0',
        'editorCursor.foreground': '#1b1918',
        'editorLineNumber.foreground': '#9d9690',
        'editorLineNumber.activeForeground': '#1b1918',
        'editor.selectionHighlightBackground': '#c7463426',
        'editorBracketMatch.background': '#f2efeb',
        'editorBracketMatch.border': '#006666',
        'editorWidget.background': '#f2efeb',
        'editorWidget.border': '#e0dad4',
        'input.background': '#fcfbfa',
        'input.foreground': '#1b1918',
        'input.border': '#e0dad4',
        'focusBorder': '#c74634',
        'list.activeSelectionBackground': '#ebdcd0',
        'list.hoverBackground': '#f2efeb'
      }
    });
  } catch (e) {
    console.error('[QueryLens] Error defining Monaco themes:', e);
  }

  const activeTheme = theme === 'light' ? 'querylens-light' : 'querylens-dark';
  monaco.editor.setTheme(activeTheme);
}
