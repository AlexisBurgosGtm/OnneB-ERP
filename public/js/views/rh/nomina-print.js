/**
 * Impresión de planillas de nómina (interna e IGSS).
 */
const NominaPrint = {
  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  statusLabel(code) {
    const map = { B: 'Borrador', C: 'Calculada', F: 'Cerrada', A: 'Anulada' };
    return map[String(code || '').toUpperCase()] || code || '—';
  },

  async printPlanillaResumen({ header, lines, titulo, showPatronal = false }) {
    const incluidas = (lines || []).filter((l) => String(l.INCLUIDO || 'SI').toUpperCase() === 'SI');
    const rows = incluidas
      .map(
        (l) => `<tr>
          <td>${PrintReport.escapeHtml(l.CODEMPLEADO)}</td>
          <td>${PrintReport.escapeHtml(l.NOMEMPLEADO)}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(l.TOTAL_INGRESOS))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(l.IGSS_LABORAL))}</td>
          ${showPatronal ? `<td class="text-end">${PrintReport.escapeHtml(this.formatMoney(l.IGSS_PATRONAL))}</td>` : ''}
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(l.TOTAL_DEDUCCIONES))}</td>
          <td class="text-end fw-semibold">${PrintReport.escapeHtml(this.formatMoney(l.NETO_PAGAR))}</td>
        </tr>`
      )
      .join('');
    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: titulo || 'Planilla de nómina',
        subtitleHtml: `
          <p><strong>Período:</strong> ${PrintReport.escapeHtml(header.MES)}/${PrintReport.escapeHtml(header.ANIO)} · ${PrintReport.escapeHtml(header.PERIODO_TIPO || '')}</p>
          <p><strong>Estado:</strong> ${PrintReport.escapeHtml(this.statusLabel(header.STATUS))}</p>
          <p><strong>Descripción:</strong> ${PrintReport.escapeHtml(header.DESCRIPCION || '—')}</p>
          ${showPatronal ? `<p><strong>IGSS patronal total:</strong> ${PrintReport.escapeHtml(this.formatMoney(header.TOTAL_IGSS_PAT))}</p>` : ''}
        `,
      })}
      <table class="table table-sm table-bordered">
        <thead><tr>
          <th>Cód.</th><th>Empleado</th><th class="text-end">Ingresos</th><th class="text-end">IGSS lab.</th>
          ${showPatronal ? '<th class="text-end">IGSS pat.</th>' : ''}
          <th class="text-end">Deducciones</th><th class="text-end">Neto</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted">Sin empleados incluidos</td></tr>'}</tbody>
        <tfoot>
          <tr class="fw-semibold">
            <td colspan="2" class="text-end">Totales</td>
            <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(header.TOTAL_INGRESOS))}</td>
            <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(header.TOTAL_IGSS_LAB))}</td>
            ${showPatronal ? `<td class="text-end">${PrintReport.escapeHtml(this.formatMoney(header.TOTAL_IGSS_PAT))}</td>` : ''}
            <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(header.TOTAL_DEDUCCIONES))}</td>
            <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(header.TOTAL_NETO))}</td>
          </tr>
        </tfoot>
      </table>`;
    await PrintReport.openAndPrint(
      () => PrintReport.wrapDocument({ title: titulo || 'Planilla', bodyHtml, extraStyles: 'table{font-size:12px;}' }),
      'width=980,height=760'
    );
  },

  async printReciboEmpleado({ header, line, titulo }) {
    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: titulo || 'Recibo de nómina',
        subtitleHtml: `
          <p><strong>${PrintReport.escapeHtml(line.NOMEMPLEADO || '')}</strong></p>
          <p>DPI: ${PrintReport.escapeHtml(line.DPI || '—')} · IGSS: ${PrintReport.escapeHtml(line.IGSS || '—')}</p>
          <p>Período ${PrintReport.escapeHtml(header.MES)}/${PrintReport.escapeHtml(header.ANIO)}</p>
        `,
      })}
      <table class="table table-sm">
        <tr><td>Salario base</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.SALARIO_BASE))}</td></tr>
        <tr><td>Bonificación</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.BONIFICACION))}</td></tr>
        <tr><td>Comisión</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.COMISION))}</td></tr>
        <tr><td>Otros ingresos</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.OTROS_INGRESOS))}</td></tr>
        <tr class="fw-semibold"><td>Total ingresos</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.TOTAL_INGRESOS))}</td></tr>
        <tr><td>IGSS laboral</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.IGSS_LABORAL))}</td></tr>
        <tr><td>ISR</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.ISR))}</td></tr>
        <tr><td>Otras deducciones</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.OTRAS_DEDUCCIONES))}</td></tr>
        <tr class="fw-semibold"><td>Total deducciones</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.TOTAL_DEDUCCIONES))}</td></tr>
        <tr class="fw-bold"><td>Neto a pagar</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(line.NETO_PAGAR))}</td></tr>
      </table>`;
    await PrintReport.openAndPrint(
      () => PrintReport.wrapDocument({ title: 'Recibo nómina', bodyHtml }),
      'width=720,height=680'
    );
  },
};
