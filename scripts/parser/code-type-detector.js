const CODE_TYPE = {
  SQL: 'sql',
  PACKAGE: 'package',
  UNKNOWN: 'unknown'
};

const PACKAGE_PATTERN = /^\s*CREATE\s+(OR\s+REPLACE\s+)?PACKAGE\s+/i;

// Detecta se o código é SQL comum, Package PL/SQL ou desconhecido baseado no primeiro comando
// @param {string} code - Código fonte para classificar
// @returns {string} Tipo do código: 'sql', 'package' ou 'unknown'
export function detectCodeType(code) {
  if (!code || !code.trim()) return CODE_TYPE.UNKNOWN;
  const cleaned = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('--'));
  if (cleaned.length === 0) return CODE_TYPE.UNKNOWN;
  if (PACKAGE_PATTERN.test(cleaned[0])) return CODE_TYPE.PACKAGE;
  return CODE_TYPE.SQL;
}

export { CODE_TYPE };
