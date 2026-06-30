/**
 * Limpia texto de caracteres que pueden romper HTML o interferir con el guardado.
 */
function cleanText(value, maxLen = null) {
  if (value === null || value === undefined) return null;
  let s = String(value)
    .replace(/\0/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (!s) return null;
  if (maxLen !== null && maxLen > 0 && s.length > maxLen) {
    s = s.slice(0, maxLen);
  }
  return s;
}

module.exports = { cleanText };
