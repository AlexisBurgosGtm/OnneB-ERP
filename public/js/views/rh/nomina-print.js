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

  formatFecha(value) {
    if (!value) return '—';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const d = String(value.getDate()).padStart(2, '0');
      const m = String(value.getMonth() + 1).padStart(2, '0');
      return `${d}/${m}/${value.getFullYear()}`;
    }
    const s = String(value).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return String(value);
  },

  async printValeEmpleado(vale) {
    await PrintReport.ensureLogo();
    const saldo =
      Number.isFinite(Number(vale?.SALDO))
        ? Number(vale.SALDO)
        : Math.max(0, (Number(vale?.MONTO) || 0) - (Number(vale?.ABONOS) || 0));
    const pendiente = saldo > 0.005;
    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: 'Vale a empleado',
        subtitleHtml: `
          <p><strong>No. vale:</strong> ${PrintReport.escapeHtml(vale.ID)}</p>
          <p><strong>Fecha:</strong> ${PrintReport.escapeHtml(this.formatFecha(vale.FECHA))}</p>
        `,
      })}
      <table class="table table-sm">
        <tr><td>Empleado</td><td class="text-end fw-semibold">${PrintReport.escapeHtml(vale.NOMEMPLEADO || vale.CODEMP || '—')}</td></tr>
        <tr><td>Código empleado</td><td class="text-end">${PrintReport.escapeHtml(vale.CODEMP || '—')}</td></tr>
        <tr><td>Caja</td><td class="text-end">${PrintReport.escapeHtml(vale.DESCAJA || vale.CODCAJA || '—')}</td></tr>
        <tr><td>Descripción</td><td class="text-end">${PrintReport.escapeHtml(vale.DESCRIPCION || '—')}</td></tr>
        <tr class="fw-semibold"><td>Monto del vale</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(vale.MONTO))}</td></tr>
        <tr><td>Abonos</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(vale.ABONOS || 0))}</td></tr>
        <tr class="fw-bold"><td>Saldo pendiente</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(saldo))}</td></tr>
        <tr><td>Estado</td><td class="text-end">${PrintReport.escapeHtml(pendiente ? 'Pendiente' : 'Finalizado')}</td></tr>
      </table>
      <div style="margin-top:2.5rem;display:flex;justify-content:space-between;gap:2rem;">
        <div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:.4rem;">Entregó</div>
        <div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:.4rem;">Recibió</div>
      </div>`;
    await PrintReport.openAndPrint(
      () =>
        PrintReport.wrapDocument({
          title: `Vale #${vale.ID || ''}`,
          bodyHtml,
          extraStyles: 'table{font-size:13px;} td{padding:6px 8px;}',
        }),
      'width=720,height=780'
    );
  },

  async printAbonoVale({ pago, vale }) {
    await PrintReport.ensureLogo();
    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: 'Abono a vale de empleado',
        subtitleHtml: `
          <p><strong>No. abono:</strong> ${PrintReport.escapeHtml(pago.ID)}</p>
          <p><strong>Fecha de pago:</strong> ${PrintReport.escapeHtml(this.formatFecha(pago.FECHA || pago.FECHA_PAGO))}</p>
        `,
      })}
      <table class="table table-sm">
        <tr><td>Vale</td><td class="text-end fw-semibold">#${PrintReport.escapeHtml(pago.IDVALE || vale?.ID || '—')}</td></tr>
        <tr><td>Empleado</td><td class="text-end">${PrintReport.escapeHtml(vale?.NOMEMPLEADO || pago.NOMEMPLEADO || vale?.CODEMP || pago.CODEMP || '—')}</td></tr>
        <tr><td>Caja del abono</td><td class="text-end">${PrintReport.escapeHtml(pago.DESCAJA || pago.CODCAJA || vale?.DESCAJA || vale?.CODCAJA || '—')}</td></tr>
        <tr><td>Descripción del vale</td><td class="text-end">${PrintReport.escapeHtml(vale?.DESCRIPCION || pago.VALE_DESC || '—')}</td></tr>
        <tr class="fw-bold"><td>Importe abonado</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(pago.MONTO || pago.ABONO))}</td></tr>
        <tr><td>Monto original del vale</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(vale?.MONTO))}</td></tr>
        <tr><td>Abonos acumulados</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(vale?.ABONOS))}</td></tr>
        <tr><td>Saldo del vale</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(vale?.SALDO))}</td></tr>
      </table>
      <div style="margin-top:2.5rem;display:flex;justify-content:space-between;gap:2rem;">
        <div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:.4rem;">Recibió caja</div>
        <div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:.4rem;">Empleado</div>
      </div>`;
    await PrintReport.openAndPrint(
      () =>
        PrintReport.wrapDocument({
          title: `Abono vale #${pago.ID || ''}`,
          bodyHtml,
          extraStyles: 'table{font-size:13px;} td{padding:6px 8px;}',
        }),
      'width=720,height=780'
    );
  },
};
