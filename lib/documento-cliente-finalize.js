/**
 * Campos de cliente editables al finalizar documento (solo DOC_NOMCLIE / DOC_DIRCLIE).
 */

function parseFinalizeClienteBody(body) {
  const hasNom = body?.DOC_NOMCLIE !== undefined;
  const hasDir = body?.DOC_DIRCLIE !== undefined;
  if (!hasNom && !hasDir) {
    return { error: null, nomClie: null, dirClie: null };
  }
  const nomClie = String(body?.DOC_NOMCLIE ?? '').trim();
  const dirClie = String(body?.DOC_DIRCLIE ?? '').trim() || 'SN';
  if (!nomClie) {
    return { error: 'Nombre del cliente es obligatorio', nomClie: null, dirClie: null };
  }
  return { error: null, nomClie, dirClie };
}

module.exports = { parseFinalizeClienteBody };
