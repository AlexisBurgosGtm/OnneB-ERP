/**
 * Convierte HTML del diseñador visual (bloques DnD, chips) a plantilla Mustache limpia.
 */
function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function sanitizeDesignerHtml(html) {
  let out = String(html || '');
  if (!out.includes('fi-dnd') && !out.includes('fi-token')) return out;

  out = out.replace(/<div class="fi-dnd-block-bar"[\s\S]*?<\/div>/gi, '');
  out = out.replace(/<div class="fi-dnd-drop-marker"[\s\S]*?<\/div>/gi, '');
  out = out.replace(
    /<span class="fi-token"[^>]*data-token="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, token) => decodeHtmlEntities(token)
  );
  out = out.replace(/<div class="fi-dnd-block-body"[^>]*>/gi, '');
  out = out.replace(/<div class="fi-dnd-block"[^>]*>/gi, '');
  out = out.replace(/<\/div>\s*(?=<)/gi, '');
  return out.trim();
}

module.exports = { sanitizeDesignerHtml, decodeHtmlEntities };
