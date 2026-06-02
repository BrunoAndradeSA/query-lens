// Cria uma instância do editor Monaco com configurações padrão para SQL
// @param {HTMLElement} container - Elemento DOM onde o editor será montado
// @param {Object} [options] - Opções adicionais do editor
// @returns {Object|null} Instância do editor ou null em caso de falha
export function createEditor(container, options = {}) {
  if (!container) {
    console.error('[QueryLens] Editor container not found');
    return null;
  }

  try {
    const editor = monaco.editor.create(container, {
      value: options.initialValue || '',
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

// Define o conteúdo textual do editor
// @param {Object} editor - Instância do editor Monaco
// @param {string} value - Novo texto SQL a ser exibido
export function setEditorValue(editor, value) {
  if (editor) {
    editor.setValue(value);
  }
}

// Retorna o conteúdo textual atual do editor
// @param {Object} editor - Instância do editor Monaco
// @returns {string} Texto SQL atual ou string vazia
export function getEditorValue(editor) {
  return editor ? editor.getValue() : '';
}

// Formata texto SQL com indentação inteligente e capitalização de palavras-chave
// @param {string} sql - Código SQL bruto
// @returns {string} SQL formatado
function formatSqlText(sql) {
  const strings = [];
  let s = sql
    .replace(/'[^']*'/g, m => { strings.push(m); return `\x00${strings.length - 1}\x00`; })
    .replace(/"[^"]*"/g, m => { strings.push(m); return `\x01${strings.length - 1}\x01`; });

  const comments = [];
  s = s
    .replace(/\/\*[\s\S]*?\*\//g, m => { comments.push(m); return `__CMT${comments.length - 1}__`; })
    .replace(/--[^\n]*/g, m => { comments.push(m); return `__CMT${comments.length - 1}__`; });

  const semiIdx = s.indexOf(';');
  let tokens;
  let extraPart = '';
  let sqlSrc;
  if (semiIdx >= 0) {
    sqlSrc = s.substring(0, semiIdx + 1);
    extraPart = s.substring(semiIdx + 1);
  } else {
    sqlSrc = s;
  }
  sqlSrc = sqlSrc.replace(/\s+/g, ' ').trim();

  // Divide uma string SQL em uma lista de tokens (palavras, operadores, delimitadores)
  // @param {string} str - Texto a ser tokenizado
  // @returns {string[]} Lista de tokens extraídos
  function tokenize(str) {
    const result = [];
    let buf = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (/[a-zA-Z_0-9]/.test(ch) || ch === '\x00' || ch === '\x01') {
        buf += ch;
      } else {
        if (buf) { result.push(buf); buf = ''; }
        if (!/\s/.test(ch)) result.push(ch);
      }
    }
    if (buf) result.push(buf);
    return result;
  }
  tokens = tokenize(sqlSrc);

  for (let i = 0; i < tokens.length - 1; i++) {
    const c = tokens[i] + tokens[i + 1];
    if (['>=','<=','<>','!=','||'].includes(c)) {
      tokens[i] = c;
      tokens.splice(i + 1, 1);
    }
  }

  const upperKeywords = new Set([
    'SELECT','FROM','WHERE','INNER','LEFT','RIGHT','FULL','CROSS','NATURAL','JOIN','ON',
    'AND','OR','AS','IN','IS','NOT','NULL','LIKE','BETWEEN','EXISTS',
    'ORDER','GROUP','BY','HAVING','UNION','ALL','MINUS','INTERSECT',
    'DISTINCT','ASC','DESC','WITH','RECURSIVE',
    'CASE','WHEN','THEN','ELSE','END','OVER','PARTITION','ROWS','RANGE',
    'UNBOUNDED','PRECEDING','FOLLOWING','CURRENT','ROW',
    'CREATE','REPLACE','VIEW','TABLE','INSERT','INTO','VALUES',
    'UPDATE','SET','DELETE','USING','LIMIT','OFFSET','TOP'
  ]);
  for (let i = 0; i < tokens.length; i++) {
    if (upperKeywords.has(tokens[i].toUpperCase())) tokens[i] = tokens[i].toUpperCase();
  }

  const C = 7;
  // Calcula a coluna de indentação atual baseada no nível de subconsulta e parênteses
  // @returns {number} Número de espaços para indentação
  function contentCol() {
    return C + 4 * subParen + (lastSubqueryInline ? 4 : 0);
  }
  // Calcula o recuo à esquerda para alinhar uma palavra-chave dentro da coluna de conteúdo
  // @param {string} word - Palavra-chave a ser alinhada
  // @returns {number} Número de espaços de recuo
  function indent(word) {
    return Math.max(0, contentCol() - word.length - 1);
  }

  let parenDepth = 0;
  let subParen = 0;
  const parenStack = [];
  let inSelect = false;
  let inCondition = false;
  let lastSubqueryInline = false;
  const out = [];

  // Emite um token para a saída formatada, gerenciando espaçamento entre tokens
  // @param {string} tok - Token a ser adicionado à saída
  function emit(tok) {
    if (out.length === 0) {
      out.push(tok);
    } else {
      const last = out[out.length - 1];
      const lastCh = last[last.length - 1];
      if (tok === ')' || tok === ',' || tok === '.' || tok === ';') {
        out.push(tok);
      } else if (lastCh === '(' || lastCh === '.') {
        out.push(tok);
      } else if (/\s/.test(lastCh)) {
        out.push(tok);
      } else if (tok === '(') {
        if (lastCh !== ' ' && lastCh !== '(') out.push(' ');
        out.push(tok);
      } else {
        out.push(' ' + tok);
      }
    }
  }

  // Verifica se o contexto atual está no nível principal da consulta (fora de subconsultas aninhadas)
  // @returns {boolean} Verdadeiro se estiver no nível superior
  function isTop() {
    return parenDepth === 0 || subParen > 0;
  }

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const next = i + 1 < tokens.length ? tokens[i + 1] : '';

    if (tok === 'SELECT') {
      inSelect = true;
      inCondition = false;
      if (out.length > 0) {
        if (subParen > 0 && lastSubqueryInline) {
          /* stays on same line as ( */;
        } else if (subParen > 0) {
          out.push('\n' + ' '.repeat(4 * subParen));
        } else {
          out.push('\n');
        }
      }
      emit('SELECT');
      i++;
      continue;
    }

    if (tok === 'FROM') {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n' + ' '.repeat(indent('FROM')) + 'FROM');
      else emit('FROM');
      i++;
      continue;
    }

    if (tok === 'WHERE') {
      inSelect = false;
      inCondition = true;
      if (isTop()) out.push('\n' + ' '.repeat(indent('WHERE')) + 'WHERE');
      else emit('WHERE');
      i++;
      continue;
    }

    if (tok === 'ORDER' && next === 'BY') {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n' + ' '.repeat(indent('ORDER')) + 'ORDER BY');
      else { emit('ORDER'); emit('BY'); }
      i += 2;
      continue;
    }

    if (tok === 'GROUP' && next === 'BY') {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n' + ' '.repeat(indent('GROUP')) + 'GROUP BY');
      else { emit('GROUP'); emit('BY'); }
      i += 2;
      continue;
    }

    if (tok === 'HAVING') {
      inSelect = false;
      inCondition = true;
      if (isTop()) out.push('\n' + ' '.repeat(indent('HAVING')) + 'HAVING');
      else emit('HAVING');
      i++;
      continue;
    }

    if (tok === 'LIMIT') {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n' + ' '.repeat(indent('LIMIT')) + 'LIMIT');
      else emit('LIMIT');
      i++;
      continue;
    }

    if (tok === 'OFFSET') {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n' + ' '.repeat(indent('OFFSET')) + 'OFFSET');
      else emit('OFFSET');
      i++;
      continue;
    }

    if (['INNER','LEFT','RIGHT','FULL','CROSS','NATURAL'].includes(tok) && next === 'JOIN') {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n' + ' '.repeat(Math.max(0, contentCol() - tok.length)) + tok + ' JOIN');
      else { emit(tok); emit('JOIN'); }
      i += 2;
      continue;
    }

    if (tok === 'JOIN' && !['INNER','LEFT','RIGHT','FULL','CROSS','NATURAL'].includes(tokens[i - 1])) {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n' + ' '.repeat(indent('JOIN')) + 'JOIN');
      else emit('JOIN');
      i++;
      continue;
    }

    if (tok === 'ON') {
      inCondition = true;
      emit('ON');
      i++;
      continue;
    }

    if (tok === 'AND' || tok === 'OR') {
      if (isTop() && inCondition) out.push('\n' + ' '.repeat(indent(tok)) + tok);
      else emit(tok);
      i++;
      continue;
    }

    if (['UNION','MINUS','INTERSECT'].includes(tok)) {
      inSelect = false;
      inCondition = false;
      if (isTop()) out.push('\n\n');
      emit(tok);
      if (tok === 'UNION' && next === 'ALL') {
        out.push(' ALL');
        i++;
      }
      i++;
      continue;
    }

    if (tok === 'PARTITION' && next === 'BY') {
      emit('PARTITION');
      emit('BY');
      i += 2;
      continue;
    }

    if (tok === '(') {
      parenDepth++;
      const isSQ = i + 1 < tokens.length && (tokens[i + 1] === 'SELECT' || tokens[i + 1] === 'WITH');
      if (isSQ) {
        subParen++;
        const last = out.length > 0 ? out[out.length - 1] : '';
        const lastCh = last[last.length - 1];
        const isInline = lastCh === ' ' || lastCh === '\n' || lastCh === '(';
        lastSubqueryInline = isInline;
        parenStack.push({ isSQ: true, savedInSelect: inSelect, isInline });
      } else {
        parenStack.push({ isSQ: false });
      }
      emit('(');
      i++;
      continue;
    }

    if (tok === ')') {
      const entry = parenStack.pop();
      if (entry && entry.isSQ) {
        subParen--;
        lastSubqueryInline = false;
        for (let j = parenStack.length - 1; j >= 0; j--) {
          if (parenStack[j].isSQ) {
            lastSubqueryInline = parenStack[j].isInline || false;
            break;
          }
        }
        if (entry.savedInSelect !== undefined) inSelect = entry.savedInSelect;
      }
      parenDepth--;
      if (entry && entry.isSQ) {
        const nextTok = i + 1 < tokens.length ? tokens[i + 1] : '';
        const inlineOk = nextTok === 'AS' || nextTok === ',' || nextTok === '.' || nextTok === ')' || nextTok === ';';
        if (!inlineOk) {
          const indentLvl = 4 * Math.max(0, subParen);
          if (out.length > 0) out.push('\n' + ' '.repeat(indentLvl));
        }
      }
      emit(')');
      i++;
      continue;
    }

    if (tok === 'WITH') {
      inSelect = false;
      inCondition = false;
      if (out.length > 0) out.push('\n');
      emit('WITH');
      i++;
      continue;
    }

    if (tok === ',' && inSelect) {
      out.push(',\n' + ' '.repeat(contentCol()));
      i++;
      continue;
    }

    emit(tok);
    i++;
  }

  let result = out.join('');

  for (let i = 0; i < strings.length; i++) {
    result = result.replace(`\x00${i}\x00`, strings[i]);
    result = result.replace(`\x01${i}\x01`, strings[i]);
  }

  for (let i = 0; i < comments.length; i++) {
    const cmt = comments[i];
    const suffix = cmt.startsWith('/*') ? '\n' : '';
    result = result.replace(`__CMT${i}__ `, cmt + suffix);
    result = result.replace(`__CMT${i}__`, cmt + suffix);
  }

  const rawLines = result.split('\n');
  let maxOn = 0;
  const onLines = [];
  for (let li = 0; li < rawLines.length; li++) {
    const line = rawLines[li];
    const m = line.match(/\bON\b/);
    if (m && /\bJOIN\b/i.test(line)) {
      onLines.push(li);
      maxOn = Math.max(maxOn, m.index);
    }
  }
  if (maxOn > 0) {
    for (const li of onLines) {
      const line = rawLines[li];
      const m = line.match(/\bON\b/);
      if (m && m.index < maxOn) {
        rawLines[li] = line.slice(0, m.index) + ' '.repeat(maxOn - m.index) + line.slice(m.index);
      }
    }
    result = rawLines.join('\n');
  }

  if (extraPart) {
    const extraLines = extraPart.split('\n').filter(l => l.trim());
    if (extraLines.length > 0) {
      let restored = extraLines.join('\n');
      for (let i = 0; i < strings.length; i++) {
        restored = restored.replace(`\x00${i}\x00`, strings[i]);
        restored = restored.replace(`\x01${i}\x01`, strings[i]);
      }
      for (let i = 0; i < comments.length; i++) {
        restored = restored.replace(`__CMT${i}__`, comments[i]);
      }
      result += '\n' + restored;
    }
  }

  return result.replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Formata o SQL atual do editor in-place e retorna se houve alteração
// @param {Object} editor - Instância do editor Monaco
// @returns {boolean} Verdadeiro se o SQL foi formatado com sucesso
export function formatInEditor(editor) {
  if (!editor) return false;
  try {
    const sql = editor.getValue();
    if (!sql) return false;
    const formatted = formatSqlText(sql);
    if (formatted === sql) return false;
    editor.setValue(formatted);
    return true;
  } catch (e) {
    console.error('[QueryLens] Format error:', e);
    return false;
  }
}

// Define os temas escuro e claro do Monaco e ativa o tema informado
// @param {string} theme - Nome do tema ('light' ou 'dark')
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
        { token: 'keyword', foreground: 'c93228', fontStyle: 'bold' },
        { token: 'type', foreground: '00747a' },
        { token: 'string', foreground: 'b37d3e' },
        { token: 'number', foreground: '3d7a46' },
        { token: 'function', foreground: 'c93228' },
        { token: 'comment', foreground: '8f96a0', fontStyle: 'italic' },
        { token: 'operator', foreground: '5a5f69' },
        { token: 'identifier', foreground: '1a1d23' },
        { token: 'variable', foreground: '7c4d8c' },
        { token: 'parameter', foreground: '5a5f69' },
        { token: 'delimiter', foreground: '5a5f69' }
      ],
      colors: {
        'editor.background': '#f8f9fa',
        'editor.foreground': '#1a1d23',
        'editor.lineHighlightBackground': '#eef0f2',
        'editor.selectionBackground': '#dce0e5',
        'editor.inactiveSelectionBackground': '#e5e8ed',
        'editorCursor.foreground': '#1a1d23',
        'editorLineNumber.foreground': '#8f96a0',
        'editorLineNumber.activeForeground': '#1a1d23',
        'editor.selectionHighlightBackground': '#c9322826',
        'editorBracketMatch.background': '#eef0f2',
        'editorBracketMatch.border': '#00747a',
        'editorWidget.background': '#eef0f2',
        'editorWidget.border': '#d5d9de',
        'input.background': '#f8f9fa',
        'input.foreground': '#1a1d23',
        'input.border': '#d5d9de',
        'focusBorder': '#c93228',
        'list.activeSelectionBackground': '#e5e8ed',
        'list.hoverBackground': '#eef0f2'
      }
    });
  } catch (e) {
    console.error('[QueryLens] Error defining Monaco themes:', e);
  }

  const activeTheme = theme === 'light' ? 'querylens-light' : 'querylens-dark';
  monaco.editor.setTheme(activeTheme);
}
