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

export function formatInEditor(editor) {
  if (!editor) return;
  editor.getAction('editor.action.formatDocument')?.run();
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
