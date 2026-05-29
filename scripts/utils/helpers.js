export function debounce(fn, delay = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function throttle(fn, limit = 100) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

export function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function uniqueId(prefix = 'n') {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function formatSql(sql) {
  let formatted = '';
  let indent = 0;
  const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ON', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'UNION', 'UNION ALL', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN'];
  const lines = sql
    .replace(/\s+/g, ' ')
    .replace(/\b(SELECT|FROM|WHERE|AND|OR|ON|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|UNION|UNION ALL|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|CROSS JOIN|JOIN)\b/gi, '\n$1')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);

  for (let line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith(')')) indent = Math.max(0, indent - 1);
    if (upper.startsWith('SELECT') || upper.startsWith('FROM') || upper.startsWith('WHERE') ||
        upper.startsWith('ORDER BY') || upper.startsWith('GROUP BY') || upper.startsWith('HAVING') ||
        upper.startsWith('INNER JOIN') || upper.startsWith('LEFT JOIN') || upper.startsWith('RIGHT JOIN') ||
        upper.startsWith('FULL JOIN') || upper.startsWith('CROSS JOIN') || upper.startsWith('JOIN') ||
        upper.startsWith('UNION') || upper.startsWith('LIMIT') || upper.startsWith('OFFSET') ||
        upper.startsWith('ON') || upper.startsWith('AND') || upper.startsWith('OR')) {
      formatted += '  '.repeat(indent) + line + '\n';
      if (upper.startsWith('SELECT') || upper.startsWith('FROM') || upper.startsWith('WHERE')) indent++;
    } else {
      formatted += '  '.repeat(Math.max(0, indent)) + line + '\n';
    }
  }
  return formatted.trim();
}

export function truncate(str, maxLen = 50) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function getJoinColor(joinType) {
  const map = {
    'INNER JOIN': '#4fc3f7',
    'LEFT JOIN': '#ffd54f',
    'RIGHT JOIN': '#81c784',
    'FULL JOIN': '#ce93d8',
    'CROSS JOIN': '#ef5350',
    'JOIN': '#4fc3f7',
    'INNER': '#4fc3f7',
    'LEFT': '#ffd54f',
    'RIGHT': '#81c784',
    'FULL': '#ce93d8',
    'CROSS': '#ef5350'
  };
  return map[joinType] || '#4fc3f7';
}

export function getJoinLabel(joinType) {
  const map = {
    'INNER JOIN': 'INNER',
    'LEFT JOIN': 'LEFT',
    'RIGHT JOIN': 'RIGHT',
    'FULL JOIN': 'FULL',
    'CROSS JOIN': 'CROSS',
    'JOIN': 'INNER',
    'INNER': 'INNER',
    'LEFT': 'LEFT',
    'RIGHT': 'RIGHT',
    'FULL': 'FULL',
    'CROSS': 'CROSS'
  };
  return map[joinType] || 'JOIN';
}
