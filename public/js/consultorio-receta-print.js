/**
 * Impresión de receta médica — siempre formato carta.
 */
const ConsultorioRecetaPrint = {
  dosisFromLine(ln) {
    const v = String(ln?.NOSERIE ?? ln?.DOSIS ?? '').trim();
    return v && v.toUpperCase() !== 'SN' ? v : '—';
  },

  duracionFromLine(ln) {
    const v = String(ln?.OBS ?? ln?.DURACION ?? '').trim();
    return v && v.toUpperCase() !== 'SN' ? v : '—';
  },

  buildBody({ consulta, paciente, receta }) {
    const esc = PrintReport.escapeHtml.bind(PrintReport);
    const pacNom = esc(paciente?.NOMBRE || consulta?.PACIENTE || '—');
    const fecha = consulta?.FECHA ? esc(String(consulta.FECHA).slice(0, 10)) : '—';
    const hora = esc(consulta?.HORA || '');
    const tel = esc(paciente?.TELEFONOS || '');
    const dir = esc(paciente?.DIRECCION || '');
    const docLabel = receta
      ? `${esc(receta.CODDOC)} #${esc(receta.CORRELATIVO)}`
      : '';
    const lines = receta?.lines || [];
    const meds = lines.length
      ? lines
          .map(
            (ln, i) => `
        <tr>
          <td class="rx-num">${i + 1}</td>
          <td>
            <div class="rx-med">${esc(ln.DESPROD || ln.CODPROD)}</div>
            <div class="rx-meta">${esc(ln.CODPROD || '')} · ${esc(ln.CODMEDIDA || '')}</div>
          </td>
          <td>${esc(this.dosisFromLine(ln))}</td>
          <td>${esc(this.duracionFromLine(ln))}</td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="4" class="text-center text-muted">Sin medicamentos en receta</td></tr>`;

    return `
      ${PrintReport.reportHeaderHtml({
        title: 'Receta médica',
        subtitleHtml: `<p class="mb-0">Fecha de consulta: <strong>${fecha}</strong>${hora ? ` · ${hora}` : ''}${
          docLabel ? ` · Doc. ${docLabel}` : ''
        }</p>`,
      })}
      <section class="rx-paciente">
        <h2 class="rx-section-title">Datos del paciente</h2>
        <div class="rx-paciente-grid">
          <div><span class="rx-label">Nombre</span><div class="rx-value">${pacNom}</div></div>
          ${tel ? `<div><span class="rx-label">Teléfono</span><div class="rx-value">${tel}</div></div>` : ''}
          ${dir ? `<div><span class="rx-label">Dirección</span><div class="rx-value">${dir}</div></div>` : ''}
        </div>
      </section>
      ${
        consulta?.IMPRESION_DIAGNOSTICA
          ? `<section class="rx-block"><h2 class="rx-section-title">Impresión diagnóstica</h2><p>${esc(consulta.IMPRESION_DIAGNOSTICA)}</p></section>`
          : ''
      }
      <section class="rx-block">
        <h2 class="rx-section-title">Prescripción</h2>
        <table class="rx-table">
          <thead>
            <tr>
              <th class="rx-col-num">#</th>
              <th>Medicamento</th>
              <th class="rx-col-dosis">Dosis</th>
              <th class="rx-col-dur">Duración / indicaciones</th>
            </tr>
          </thead>
          <tbody>${meds}</tbody>
        </table>
      </section>
      ${
        consulta?.TRATAMIENTO
          ? `<section class="rx-block"><h2 class="rx-section-title">Indicaciones adicionales</h2><p>${esc(consulta.TRATAMIENTO)}</p></section>`
          : ''
      }
      <section class="rx-firma">
        <div class="rx-firma-line"></div>
        <div class="rx-firma-label">Firma y sello del médico</div>
      </section>`;
  },

  extraStyles() {
    return `
      @page { size: letter; margin: 18mm 16mm; }
      body { font-size: 12px; line-height: 1.45; }
      .rx-section-title {
        font-size: 13px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .04em; color: #1e3a5f; margin: 0 0 .35rem;
        border-bottom: 1px solid #cbd5e1; padding-bottom: .2rem;
      }
      .rx-paciente { margin-bottom: 1rem; }
      .rx-paciente-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: .5rem 1rem;
      }
      .rx-label { font-size: 10px; text-transform: uppercase; color: #64748b; }
      .rx-value { font-weight: 600; }
      .rx-block { margin-bottom: 1rem; }
      .rx-table th { font-size: 11px; }
      .rx-col-num { width: 2rem; }
      .rx-col-dosis { width: 22%; }
      .rx-col-dur { width: 28%; }
      .rx-num { text-align: center; font-weight: 700; }
      .rx-med { font-weight: 600; }
      .rx-meta { font-size: 10px; color: #64748b; margin-top: 2px; }
      .rx-firma { margin-top: 2.5rem; page-break-inside: avoid; }
      .rx-firma-line { border-top: 1px solid #111; width: 55%; margin: 2.5rem 0 .35rem; }
      .rx-firma-label { font-size: 11px; color: #444; }
    `;
  },

  async imprimir(payload) {
    if (typeof PrintReport === 'undefined') {
      throw new Error('PrintReport no disponible');
    }
    const bodyHtml = this.buildBody(payload);
    const title = `Receta — ${payload?.paciente?.NOMBRE || 'Paciente'}`;
    const html = PrintReport.wrapDocument({
      title,
      bodyHtml,
      extraStyles: this.extraStyles(),
    });
    await PrintReport.openAndPrint(html, PrintReport.cartaFeatures(), { papel: 'CARTA', formato: 'CARTA' });
  },
};