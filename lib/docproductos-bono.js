/**
 * DOCPRODUCTOS.BONO = ISNULL(PRODUCTOS.BONO, 0) × PRECIOS.EQUIVALE (mín. 1).
 * Siempre se persiste un número (0 si no hay bono); nunca NULL en INSERT.
 */
function roundBono(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
}

function productoBonoUnitOrZero(v) {
  if (v == null || v === '') return 0;
  const b = Number(v);
  return Number.isFinite(b) ? b : 0;
}

function preciosEquivaleOrOne(v) {
  const eq = Number(v);
  return Number.isFinite(eq) && eq > 0 ? eq : 1;
}

function calcDocproductosBono(productoBonoUnit, equivale) {
  const unit = productoBonoUnitOrZero(productoBonoUnit);
  const eq = preciosEquivaleOrOne(equivale);
  return roundBono(unit * eq);
}

function bonoFromPrecioRow(prod, equivaleOverride) {
  if (!prod) return 0;
  const eq = equivaleOverride ?? prod.EQUIVALE;
  return calcDocproductosBono(prod.BONO, eq);
}

function bindDocproductosBonoInput(request, sqlType, value) {
  const v =
    value == null || value === ''
      ? 0
      : roundBono(value);
  const safe = Number.isFinite(v) ? v : 0;
  return request.input('BONO', sqlType.Float, safe);
}

async function fetchProductoBonoUnit(pool, sqlType, empnit, codprod) {
  const cod = String(codprod ?? '').trim();
  if (!cod) return 0;
  const r = await pool
    .request()
    .input('EMPNIT', sqlType.VarChar, empnit)
    .input('CODPROD', sqlType.VarChar, cod)
    .query(`
      SELECT TOP 1 ISNULL(p.BONO, 0) AS BONO
      FROM dbo.PRODUCTOS p
      WHERE p.EMPNIT = @EMPNIT AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(@CODPROD))
    `);
  return productoBonoUnitOrZero(r.recordset[0]?.BONO);
}

/**
 * @param {{ lineBono?: number|null, productoBonoUnit?: number|null, equivale: number }} opts
 * lineBono: valor ya guardado en DOCPRODUCTOS (referencia/copia). Si es null/undefined, se calcula desde PRODUCTOS.
 */
async function resolveDocproductosBono(pool, sqlType, empnit, codprod, opts = {}) {
  const eq = preciosEquivaleOrOne(opts.equivale);
  if (opts.lineBono != null && opts.lineBono !== '' && Number.isFinite(Number(opts.lineBono))) {
    return roundBono(Number(opts.lineBono));
  }
  const unit =
    opts.productoBonoUnit != null && opts.productoBonoUnit !== '' && Number.isFinite(Number(opts.productoBonoUnit))
      ? productoBonoUnitOrZero(opts.productoBonoUnit)
      : await fetchProductoBonoUnit(pool, sqlType, empnit, codprod);
  return calcDocproductosBono(unit, eq);
}

module.exports = {
  calcDocproductosBono,
  bonoFromPrecioRow,
  bindDocproductosBonoInput,
  fetchProductoBonoUnit,
  resolveDocproductosBono,
  productoBonoUnitOrZero,
  preciosEquivaleOrOne,
};
