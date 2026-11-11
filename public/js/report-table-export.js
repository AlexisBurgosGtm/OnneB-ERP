/**
 * Exportar tablas HTML visibles a Excel (.xlsx) — reportes y vistas similares.
 */
const ReportTableExport = {
  safeFilename(name) {
    const base = String(name || 'reporte')
      .trim()
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);
    return base.toLowerCase().endsWith('.xlsx') ? base : `${base || 'reporte'}.xlsx`;
  },

  escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  },

  toolbarHtml(filename) {
    const file = this.safeFilename(filename);
    return `<div class="report-export-toolbar d-flex justify-content-end mb-1">
      <button type="button" class="btn btn-sm btn-outline-success btn-report-export-excel py-0 px-2"
        data-export-filename="${this.escapeAttr(file)}"
        title="Exportar tabla a Excel" aria-label="Exportar a Excel">
        <i class="fa-solid fa-file-excel"></i>
      </button>
    </div>`;
  },

  cellText(cell) {
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('button, .btn, .repprod-client-bar, .repcli-prod-bar, .repmar-bar').forEach((el) => {
      el.remove();
    });
    return String(clone.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  rowToTexts(tr, colCount) {
    const cells = tr.querySelectorAll('th, td');
    const out = [];
    for (let i = 0; i < colCount; i += 1) {
      out.push(this.cellText(cells[i]));
    }
    return out;
  },

  columnSkipMask(table) {
    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return [];
    const headers = headerRow.querySelectorAll('th');
    const mask = [];
    headers.forEach((th, idx) => {
      const label = this.cellText(th);
      if (/^acciones$/i.test(label)) {
        mask[idx] = true;
        return;
      }
      if (label) {
        mask[idx] = false;
        return;
      }
      const bodyRows = table.querySelectorAll('tbody tr');
      let onlyActions = true;
      for (const tr of bodyRows) {
        const td = tr.querySelectorAll('td')[idx];
        if (!td) continue;
        if (td.querySelector('button, .btn')) continue;
        const t = this.cellText(td);
        if (t && !/^sin coincidencias$/i.test(t)) {
          onlyActions = false;
          break;
        }
      }
      mask[idx] = onlyActions;
    });
    return mask;
  },

  tableToAoA(table) {
    if (!table) return [];
    const skip = this.columnSkipMask(table);
    const colCount = table.querySelectorAll('thead tr th').length;
    const keepIdx = [];
    for (let i = 0; i < colCount; i += 1) {
      if (!skip[i]) keepIdx.push(i);
    }
    if (!keepIdx.length) return [];

    const aoa = [];
    const pushRow = (tr) => {
      const cells = tr.querySelectorAll('th, td');
      const row = keepIdx.map((i) => this.cellText(cells[i]));
      if (row.some((c) => c !== '')) aoa.push(row);
    };

    table.querySelectorAll('thead tr').forEach(pushRow);
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const t = this.cellText(tr);
      if (/sin coincidencias|sin documentos|sin productos|sin facturas|sin líneas/i.test(t) && tr.querySelector('td[colspan]')) {
        return;
      }
      pushRow(tr);
    });
    table.querySelectorAll('tfoot tr').forEach(pushRow);
    return aoa;
  },

  downloadCsv(filename, aoa) {
    const csvCell = (value) => {
      const s = value === null || value === undefined ? '' : String(value);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = aoa.map((row) => row.map((c) => csvCell(c)).join(','));
    const blob = new Blob(['\ufeff', lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.xlsx$/i, '.csv');
    a.click();
    URL.revokeObjectURL(url);
  },

  exportTable(table, filename) {
    if (!table) {
      if (typeof F !== 'undefined') F.toast('No hay tabla para exportar', 'warning');
      return false;
    }
    const aoa = this.tableToAoA(table);
    if (!aoa.length || aoa.length < 2) {
      if (typeof F !== 'undefined') F.toast('La tabla no tiene datos para exportar', 'warning');
      return false;
    }
    const file = this.safeFilename(filename);
    if (typeof XLSX !== 'undefined' && XLSX.utils && XLSX.writeFile) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      const sheetName = file.replace(/\.xlsx$/i, '').slice(0, 31) || 'Datos';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, file);
      if (typeof F !== 'undefined') F.toast('Excel descargado', 'success');
      return true;
    }
    this.downloadCsv(file, aoa);
    if (typeof F !== 'undefined') F.toast('Exportado como CSV (Excel)', 'success');
    return true;
  },

  enhanceTables(root, filenameStem) {
    if (!root) return;
    const stem = String(filenameStem || 'reporte').trim() || 'reporte';
    root.querySelectorAll('.table-responsive').forEach((resp, index) => {
      const table = resp.querySelector('table');
      if (!table || resp.closest('.report-export-wrap')) return;
      if (table.classList.contains('audcaja-print-table')) return;
      const wrap = document.createElement('div');
      wrap.className = 'report-export-wrap';
      wrap.dataset.reportExportWrap = '1';
      resp.parentNode.insertBefore(wrap, resp);
      wrap.insertAdjacentHTML('beforeend', this.toolbarHtml(`${stem}_${index + 1}.xlsx`));
      wrap.appendChild(resp);
    });
    root.querySelectorAll('.card-body').forEach((body, bodyIdx) => {
      const table = body.querySelector(':scope > table.table');
      if (!table || table.closest('.report-export-wrap') || table.closest('.table-responsive')) return;
      const wrap = document.createElement('div');
      wrap.className = 'report-export-wrap';
      wrap.dataset.reportExportWrap = '1';
      const slug =
        table.closest('.card')?.querySelector('.card-header')?.textContent?.trim().slice(0, 24) ||
        `t${bodyIdx + 1}`;
      body.insertBefore(wrap, table);
      wrap.insertAdjacentHTML('beforeend', this.toolbarHtml(`${stem}_${slug.replace(/\W+/g, '_')}.xlsx`));
      wrap.appendChild(table);
    });
  },

  initGlobalClick() {
    if (ReportTableExport._globalBound) return;
    ReportTableExport._globalBound = true;
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-report-export-excel');
      if (!btn) return;
      const wrap = btn.closest('[data-report-export-wrap]');
      const table = wrap?.querySelector('table');
      const file = btn.getAttribute('data-export-filename') || wrap?.dataset.exportFilename || 'reporte.xlsx';
      ReportTableExport.exportTable(table, file);
    });
  },
};

ReportTableExport.initGlobalClick();
