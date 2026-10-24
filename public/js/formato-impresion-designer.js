/**
 * Diseñador visual de plantillas de impresión (bloques arrastrables + paleta).
 * Conserva tokens Mustache {{...}} / {{{...}}} como chips no editables.
 */
const FormatoImpresionDesigner = {
  TOKEN_RE: /(\{\{\{[\w./#^]+\}\}\}|\{\{[\w./#^]+\}\})/g,
  DND_MIME: 'application/x-onneb-fi',
  _frameCleanup: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  htmlToDesign(html) {
    const src = String(html || '');
    return src.replace(this.TOKEN_RE, (token) => {
      const safe = this.escapeHtml(token);
      return `<span class="fi-token" contenteditable="false" draggable="true" data-token="${safe}" title="Arrastre para mover">${safe}</span>`;
    });
  },

  designToHtml(designHtml) {
    const wrap = document.createElement('div');
    wrap.innerHTML = String(designHtml || '');
    wrap.querySelectorAll('.fi-dnd-block-bar, .fi-dnd-drop-marker').forEach((el) => el.remove());
    wrap.querySelectorAll('.fi-dnd-block').forEach((block) => {
      const body = block.querySelector('.fi-dnd-block-body');
      const frag = document.createDocumentFragment();
      if (body) {
        while (body.firstChild) frag.appendChild(body.firstChild);
      } else {
        block.querySelectorAll(':scope > *:not(.fi-dnd-block-bar)').forEach((n) => frag.appendChild(n.cloneNode(true)));
      }
      block.replaceWith(frag);
    });
    wrap.querySelectorAll('.fi-token[data-token]').forEach((el) => {
      const token = el.getAttribute('data-token') || el.textContent || '';
      el.replaceWith(document.createTextNode(token));
    });
    return wrap.innerHTML;
  },

  paperWidthPx(papel) {
    return String(papel || 'CARTA').toUpperCase() === 'TICKET' ? 302 : 794;
  },

  designerChromeCss() {
    return `
.fi-token{
  display:inline-block;background:#e0f2fe;color:#075985;border:1px solid #7dd3fc;
  border-radius:3px;padding:0 4px;margin:0 1px;font-family:ui-monospace,Consolas,monospace;
  font-size:11px;line-height:1.4;cursor:default;user-select:none;white-space:nowrap
}
.fi-token:hover{background:#bae6fd}
.fi-token[draggable="true"]{cursor:grab}
.fi-token[draggable="true"]:active{cursor:grabbing}
.fi-token.fi-dnd-dragging{opacity:.45}
.fi-token.fi-dnd-over-before{box-shadow:-2px 0 0 0 #2563eb}
.fi-token.fi-dnd-over-after{box-shadow:2px 0 0 0 #2563eb}
body.fi-designing{margin:0;padding:8px;background:#fff;min-height:200px;box-sizing:border-box}
body.fi-designing.fi-drop-active{outline:2px dashed #3b82f6;outline-offset:2px;background:#f8fafc}
.fi-dnd-block{
  position:relative;margin:0 0 10px;border:1px solid #cbd5e1;border-radius:6px;
  background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.06)
}
.fi-dnd-block.fi-dnd-dragging{opacity:.45}
.fi-dnd-block.fi-dnd-over-before{box-shadow:0 -3px 0 0 #2563eb}
.fi-dnd-block.fi-dnd-over-after{box-shadow:0 3px 0 0 #2563eb}
.fi-dnd-block-bar{
  display:flex;align-items:center;gap:6px;padding:4px 8px;background:#f1f5f9;
  border-bottom:1px solid #e2e8f0;border-radius:5px 5px 0 0;font-size:11px;color:#475569;
  user-select:none;cursor:default
}
.fi-dnd-grip{
  display:inline-flex;align-items:center;gap:4px;cursor:grab;font-weight:600;color:#334155
}
.fi-dnd-grip:active{cursor:grabbing}
.fi-dnd-del{
  margin-left:auto;border:0;background:transparent;color:#94a3b8;font-size:1.1rem;
  line-height:1;padding:0 4px;cursor:pointer
}
.fi-dnd-del:hover{color:#dc2626}
.fi-dnd-block-body{padding:8px 10px;min-height:28px;outline:none;cursor:text}
.fi-dnd-block-body:focus{box-shadow:inset 0 0 0 1px #93c5fd;border-radius:0 0 5px 5px}
.fi-dnd-block-body.fi-inner-drop-active{box-shadow:inset 0 0 0 2px #93c5fd;background:#f8fafc}
.fi-dnd-block-body *:hover{outline:1px dotted #e2e8f0}
.fi-dnd-drop-marker{height:4px;background:#2563eb;border-radius:2px;margin:4px 0}
`;
  },

  buildFrameHtml({ bodyHtml, css, papel }) {
    const width = this.paperWidthPx(papel);
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=${width}, initial-scale=1">
<style>
html,body{zoom:1!important;transform:none!important;margin:0;padding:0;background:#fff}
body{font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;color:#111;box-sizing:border-box;width:${width}px}
${css || ''}
${this.designerChromeCss()}
</style></head>
<body class="fi-designing">${bodyHtml}</body></html>`;
  },

  blockById(id) {
    return this.BLOCKS.find((b) => b.id === id);
  },

  createBlockElement(doc, blockId, labelOverride) {
    const def = this.blockById(blockId);
    const label = labelOverride || def?.label || 'Bloque';
    const innerHtml = this.htmlToDesign(def?.html || '<p>Nuevo bloque</p>');
    const wrap = doc.createElement('div');
    wrap.className = 'fi-dnd-block';
    wrap.setAttribute('data-fi-block', blockId || 'custom');
    wrap.innerHTML = `
      <div class="fi-dnd-block-bar" contenteditable="false">
        <span class="fi-dnd-grip" draggable="true" title="Arrastrar para reordenar">
          <span aria-hidden="true">⠿</span> ${this.escapeHtml(label)}
        </span>
        <button type="button" class="fi-dnd-del" title="Quitar bloque del lienzo">&times;</button>
      </div>
      <div class="fi-dnd-block-body" contenteditable="true">${innerHtml}</div>`;
    return wrap;
  },

  normalizeTopLevelBlocks(body) {
    if (!body) return;
    const doc = body.ownerDocument;
    const toWrap = Array.from(body.childNodes).filter((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && n.classList?.contains('fi-dnd-block')) return false;
      return (
        n.nodeType === Node.ELEMENT_NODE ||
        (n.nodeType === Node.TEXT_NODE && String(n.textContent || '').trim())
      );
    });
    if (!toWrap.length && !body.querySelector('.fi-dnd-block')) {
      body.appendChild(this.createBlockElement(doc, 'text', 'Texto libre'));
      return;
    }
    toWrap.forEach((node) => {
      const label =
        node.nodeType === Node.ELEMENT_NODE
          ? String(node.tagName || 'Bloque').toLowerCase()
          : 'Texto';
      const block = this.createBlockElement(doc, 'custom', label);
      const inner = block.querySelector('.fi-dnd-block-body');
      if (inner) inner.appendChild(node);
      body.appendChild(block);
    });
  },

  caretRangeFromPoint(doc, x, y) {
    if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
    if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = doc.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
    return null;
  },

  dropContainerFromPoint(doc, rootBody, clientX, clientY) {
    const hit = doc.elementFromPoint(clientX, clientY);
    const blockBody = hit?.closest?.('.fi-dnd-block-body');
    if (blockBody && rootBody.contains(blockBody)) return blockBody;
    return rootBody;
  },

  moveTokenToPoint(doc, tokenEl, clientX, clientY) {
    if (!tokenEl || !doc) return;
    const range = this.caretRangeFromPoint(doc, clientX, clientY);
    if (range) {
      range.collapse(true);
      range.insertNode(tokenEl);
      return;
    }
    const hit = doc.elementFromPoint(clientX, clientY);
    const targetToken = hit?.closest?.('.fi-token');
    if (targetToken && targetToken !== tokenEl) {
      const rect = targetToken.getBoundingClientRect();
      const before = clientX < rect.left + rect.width / 2;
      targetToken.parentNode.insertBefore(tokenEl, before ? targetToken : targetToken.nextSibling);
      return;
    }
    const blockBody = hit?.closest?.('.fi-dnd-block-body');
    if (blockBody) blockBody.appendChild(tokenEl);
  },

  insertHtmlAtPoint(doc, container, htmlDesign, clientX, clientY) {
    const range = this.caretRangeFromPoint(doc, clientX, clientY);
    if (range && container.contains(range.startContainer)) {
      range.collapse(true);
      const temp = doc.createElement('div');
      temp.innerHTML = htmlDesign;
      const frag = doc.createDocumentFragment();
      while (temp.firstChild) frag.appendChild(temp.firstChild);
      range.insertNode(frag);
      return;
    }
    const hit = doc.elementFromPoint(clientX, clientY);
    const targetToken = hit?.closest?.('.fi-token');
    if (targetToken && container.contains(targetToken)) {
      const rect = targetToken.getBoundingClientRect();
      const temp = doc.createElement('div');
      temp.innerHTML = htmlDesign;
      const nodes = Array.from(temp.childNodes);
      const before = clientX < rect.left + rect.width / 2;
      nodes.forEach((node) => {
        targetToken.parentNode.insertBefore(node, before ? targetToken : targetToken.nextSibling);
      });
      return;
    }
    if (container.classList?.contains('fi-dnd-block-body')) {
      container.insertAdjacentHTML('beforeend', htmlDesign);
      return;
    }
    const last = container.querySelector('.fi-dnd-block-body:last-of-type') || container;
    if (last.classList?.contains('fi-dnd-block-body')) {
      last.insertAdjacentHTML('beforeend', htmlDesign);
    } else {
      container.insertAdjacentHTML('beforeend', htmlDesign);
    }
  },

  insertBlockAtPoint(doc, body, blockId, clientX, clientY, beforeBlock) {
    const el = this.createBlockElement(doc, blockId);
    if (beforeBlock?.parentNode === body) {
      body.insertBefore(el, beforeBlock);
      return el;
    }
    const blocks = Array.from(body.querySelectorAll(':scope > .fi-dnd-block'));
    let inserted = false;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        body.insertBefore(el, block);
        inserted = true;
        break;
      }
    }
    if (!inserted) body.appendChild(el);
    return el;
  },

  handleCanvasDrop(doc, body, dataTransfer, clientX, clientY) {
    const raw = dataTransfer.getData(this.DND_MIME) || dataTransfer.getData('text/plain') || '';
    if (!raw) return false;

    if (raw === 'reorder:block' || raw === 'reorder:token') {
      return false;
    }

    const container = this.dropContainerFromPoint(doc, body, clientX, clientY);

    if (raw.startsWith('block:')) {
      const id = raw.slice(6);
      const el = this.insertBlockAtPoint(doc, body, id, clientX, clientY);
      el?.querySelector('.fi-dnd-block-body')?.focus();
      return true;
    }

    if (raw.startsWith('field:')) {
      const token = raw.slice(6);
      const html = this.htmlToDesign(token.startsWith('{{') ? token : `{{${token}}}`);
      this.insertHtmlAtPoint(doc, container, html, clientX, clientY);
      return true;
    }

    if (raw.startsWith('html:')) {
      let encoded = raw.slice(5);
      try {
        encoded = decodeURIComponent(encoded);
      } catch {
        /* literal */
      }
      const html = this.htmlToDesign(encoded);
      if (container.classList?.contains('fi-dnd-block-body')) {
        container.insertAdjacentHTML('beforeend', html);
        container.focus();
        return true;
      }
      const el = this.insertBlockAtPoint(doc, body, 'custom', clientX, clientY);
      const inner = el?.querySelector('.fi-dnd-block-body');
      if (inner) inner.innerHTML = html;
      return true;
    }

    return false;
  },

  clearInnerDropHighlights(root) {
    root.querySelectorAll('.fi-inner-drop-active').forEach((el) => el.classList.remove('fi-inner-drop-active'));
    root.querySelectorAll('.fi-token.fi-dnd-over-before,.fi-token.fi-dnd-over-after').forEach((el) => {
      el.classList.remove('fi-dnd-over-before', 'fi-dnd-over-after');
    });
  },

  bindBlockReorder(doc, body) {
    let dragBlock = null;
    let dragToken = null;

    body.addEventListener('dragstart', (e) => {
      const token = e.target.closest('.fi-token');
      if (token) {
        dragToken = token;
        dragBlock = null;
        token.classList.add('fi-dnd-dragging');
        e.dataTransfer.setData(this.DND_MIME, 'reorder:token');
        e.dataTransfer.effectAllowed = 'move';
        return;
      }
      const grip = e.target.closest('.fi-dnd-grip');
      if (!grip) return;
      dragBlock = grip.closest('.fi-dnd-block');
      if (!dragBlock) return;
      dragToken = null;
      dragBlock.classList.add('fi-dnd-dragging');
      e.dataTransfer.setData(this.DND_MIME, 'reorder:block');
      e.dataTransfer.effectAllowed = 'move';
    });

    body.addEventListener('dragend', () => {
      dragBlock?.classList.remove('fi-dnd-dragging');
      dragToken?.classList.remove('fi-dnd-dragging');
      body.querySelectorAll('.fi-dnd-over-before,.fi-dnd-over-after').forEach((el) => {
        el.classList.remove('fi-dnd-over-before', 'fi-dnd-over-after');
      });
      this.clearInnerDropHighlights(body);
      body.classList.remove('fi-drop-active');
      dragBlock = null;
      dragToken = null;
    });

    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      const reorderBlock = dragBlock != null;
      const reorderToken = dragToken != null;
      e.dataTransfer.dropEffect = reorderBlock || reorderToken ? 'move' : 'copy';
      body.classList.add('fi-drop-active');

      const blockBody = e.target.closest('.fi-dnd-block-body');
      if (blockBody && (reorderToken || !reorderBlock)) {
        body.querySelectorAll('.fi-dnd-block-body.fi-inner-drop-active').forEach((el) => {
          if (el !== blockBody) el.classList.remove('fi-inner-drop-active');
        });
        blockBody.classList.add('fi-inner-drop-active');
      }

      if (reorderToken && dragToken) {
        body.querySelectorAll('.fi-token.fi-dnd-over-before,.fi-token.fi-dnd-over-after').forEach((el) => {
          el.classList.remove('fi-dnd-over-before', 'fi-dnd-over-after');
        });
        const target = e.target.closest('.fi-token');
        if (target && target !== dragToken) {
          const rect = target.getBoundingClientRect();
          target.classList.add(e.clientX < rect.left + rect.width / 2 ? 'fi-dnd-over-before' : 'fi-dnd-over-after');
        }
      } else if (reorderBlock && dragBlock) {
        body.querySelectorAll('.fi-dnd-over-before,.fi-dnd-over-after').forEach((el) => {
          el.classList.remove('fi-dnd-over-before', 'fi-dnd-over-after');
        });
        const target = e.target.closest('.fi-dnd-block');
        if (target && target !== dragBlock) {
          const rect = target.getBoundingClientRect();
          target.classList.add(e.clientY < rect.top + rect.height / 2 ? 'fi-dnd-over-before' : 'fi-dnd-over-after');
        }
      }
    });

    body.addEventListener('dragleave', (e) => {
      if (!body.contains(e.relatedTarget)) {
        body.classList.remove('fi-drop-active');
        this.clearInnerDropHighlights(body);
      }
    });

    body.addEventListener('drop', (e) => {
      e.preventDefault();
      body.classList.remove('fi-drop-active');
      this.clearInnerDropHighlights(body);

      const mime = e.dataTransfer.getData(this.DND_MIME);
      if (mime === 'reorder:token' && dragToken) {
        this.moveTokenToPoint(doc, dragToken, e.clientX, e.clientY);
        dragToken.classList.remove('fi-dnd-dragging');
        dragToken = null;
        return;
      }

      const reorder = mime === 'reorder:block' && dragBlock;

      if (reorder) {
        const target = e.target.closest('.fi-dnd-block');
        if (target && target !== dragBlock) {
          const rect = target.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            body.insertBefore(dragBlock, target);
          } else {
            body.insertBefore(dragBlock, target.nextSibling);
          }
        } else if (!target) {
          body.appendChild(dragBlock);
        }
        dragBlock.classList.remove('fi-dnd-dragging');
        dragBlock = null;
        return;
      }

      this.handleCanvasDrop(doc, body, e.dataTransfer, e.clientX, e.clientY);
    });
  },

  attachFrameDnD(frame, callbacks = {}) {
    if (typeof this._frameCleanup === 'function') {
      try {
        this._frameCleanup();
      } catch {
        /* ignore */
      }
      this._frameCleanup = null;
    }

    const doc = frame?.contentDocument;
    const body = doc?.body;
    if (!doc || !body) return;

    this.normalizeTopLevelBlocks(body);
    this.bindBlockReorder(doc, body);

    const onDelete = (e) => {
      const btn = e.target.closest('.fi-dnd-del');
      if (!btn) return;
      e.preventDefault();
      const block = btn.closest('.fi-dnd-block');
      if (block && body.querySelectorAll('.fi-dnd-block').length > 1) {
        block.remove();
      } else if (block) {
        const inner = block.querySelector('.fi-dnd-block-body');
        if (inner) inner.innerHTML = '<p></p>';
      }
      callbacks.onChange?.();
    };
    body.addEventListener('click', onDelete);

    const onInput = () => callbacks.onChange?.();
    body.addEventListener('input', onInput);

    this._frameCleanup = () => {
      body.removeEventListener('click', onDelete);
      body.removeEventListener('input', onInput);
    };
  },

  bindPaletteDrag(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-fi-payload]').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        const payload = item.getAttribute('data-fi-payload') || '';
        e.dataTransfer.setData(this.DND_MIME, payload);
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('fi-palette-dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('fi-palette-dragging');
      });
    });
  },

  paletteHtml(groups) {
    const blocks = this.BLOCKS.map(
      (b) => `
      <div class="fi-palette-item" draggable="true" data-fi-payload="block:${this.escapeHtml(b.id)}"
           title="Arrastre al lienzo">
        <span class="fi-palette-grip" aria-hidden="true">⠿</span>
        <span class="fi-palette-label">${this.escapeHtml(b.label)}</span>
      </div>`
    ).join('');

    const fields = [];
    (groups || []).forEach((g) => {
      (g.vars || []).forEach((v) => {
        if (String(v).includes('bloque') || String(v).includes('#')) return;
        fields.push(`
          <div class="fi-palette-item fi-palette-item--field" draggable="true"
               data-fi-payload="field:${this.escapeHtml(v)}" title="{{${this.escapeHtml(v)}}}">
            <span class="fi-palette-grip" aria-hidden="true">⠿</span>
            <code class="fi-palette-field-code">${this.escapeHtml(v)}</code>
          </div>`);
      });
    });

    const specials = this.FIELD_TYPES.filter((f) => f.insertHtml).map(
      (f) => `
      <div class="fi-palette-item fi-palette-item--special" draggable="true"
           data-fi-payload="html:${encodeURIComponent(f.insertHtml)}" title="${this.escapeHtml(f.label)}">
        <span class="fi-palette-grip" aria-hidden="true">⠿</span>
        <span class="fi-palette-label">${this.escapeHtml(f.label)}</span>
      </div>`
    );

    return `
      <aside class="fi-palette card border-0 shadow-sm">
        <div class="card-body p-2">
          <div class="fi-palette-section">
            <div class="fi-palette-heading">Bloques</div>
            <p class="small text-muted mb-2">Arrastre bloques al lienzo o campos dentro de un bloque</p>
            <div class="fi-palette-list">${blocks}</div>
          </div>
          <div class="fi-palette-section mt-3">
            <div class="fi-palette-heading">Campos</div>
            <div class="fi-palette-list fi-palette-list--fields">${fields.join('') || '<span class="small text-muted">Cargando…</span>'}</div>
          </div>
          ${
            specials.length
              ? `<div class="fi-palette-section mt-3">
            <div class="fi-palette-heading">Especiales</div>
            <div class="fi-palette-list">${specials.join('')}</div>
          </div>`
              : ''
          }
        </div>
      </aside>`;
  },

  BLOCKS: [
    {
      id: 'header',
      label: 'Encabezado empresa',
      html: `<header class="report-header">
  <div class="report-brand">
    {{#EMPRESA.LOGO_URL}}<div class="report-brand-logo"><img src="{{{EMPRESA.LOGO_URL}}}" alt="Logo" class="report-logo"></div>{{/EMPRESA.LOGO_URL}}
    <div class="report-brand-text">
      <div class="report-empresa-nombre">{{EMPRESA.NOMBRE}}</div>
      <h1 class="report-title">{{TITLE}}</h1>
    </div>
  </div>
</header>`,
    },
    {
      id: 'meta',
      label: 'Datos del documento',
      html: `<div class="doc-meta-grid">
  <div class="doc-meta-item"><strong>Documento:</strong> {{DOC.DOCUMENTO_LABEL}}</div>
  <div class="doc-meta-item"><strong>Fecha:</strong> {{DOC.FECHA}}</div>
  {{#DOC.SERIE}}<div class="doc-meta-item"><strong>Serie:</strong> {{DOC.SERIE}}</div>{{/DOC.SERIE}}
  {{#DOC.NUMERO}}<div class="doc-meta-item"><strong>Número:</strong> {{DOC.NUMERO}}</div>{{/DOC.NUMERO}}
  <div class="doc-meta-item"><strong>Cliente:</strong> {{DOC.DOC_NOMCLIE}}</div>
  <div class="doc-meta-item"><strong>NIT:</strong> {{DOC.DOC_NIT}}</div>
  <div class="doc-meta-item"><strong>Dirección:</strong> {{DOC.DOC_DIRCLIE}}</div>
  <div class="doc-meta-item"><strong>Pago:</strong> {{DOC.CONCRE_LABEL}}</div>
  {{#DOC.VENDEDOR}}<div class="doc-meta-item"><strong>Vendedor:</strong> {{DOC.VENDEDOR}}</div>{{/DOC.VENDEDOR}}
  {{#DOC.VENDEDOR_TELEFONO}}<div class="doc-meta-item"><strong>Tel. vendedor:</strong> {{DOC.VENDEDOR_TELEFONO}}</div>{{/DOC.VENDEDOR_TELEFONO}}
</div>`,
    },
    {
      id: 'lines',
      label: 'Tabla de líneas',
      html: `<table class="doc-lines-table">
  <thead>
    <tr>
      <th>Cód.</th>
      <th>Descripción</th>
      <th class="text-end">Med.</th>
      <th class="text-end">Cant.</th>
      <th class="text-end">Precio</th>
      <th class="text-end">Total</th>
    </tr>
  </thead>
  <tbody>
    {{#LINES}}
    <tr>
      <td>{{CODPROD}}</td>
      <td>{{DESPROD}}</td>
      <td class="text-end">{{CODMEDIDA}}</td>
      <td class="text-end">{{CANTIDAD}}</td>
      <td class="text-end">{{PRECIO_FMT}}</td>
      <td class="text-end">{{TOTALPRECIO_FMT}}</td>
    </tr>
    {{/LINES}}
  </tbody>
</table>`,
    },
    {
      id: 'totals',
      label: 'Totales',
      html: `<div class="doc-totals">
  <div class="doc-totals-row grand">
    <span>Total</span>
    <span>{{TOTALES.TOTALPRECIO_FMT}}</span>
  </div>
</div>`,
    },
    {
      id: 'footer',
      label: 'Pie de página',
      html: `<div class="doc-footer">{{FOOTER}}</div>`,
    },
    {
      id: 'obs',
      label: 'Observaciones',
      html: `{{#DOC.OBS}}<p class="doc-obs"><em>{{DOC.OBS}}</em></p>{{/DOC.OBS}}`,
    },
    {
      id: 'fel',
      label: 'Datos FEL',
      html: `{{#DOC.FEL_UUDI}}<div class="doc-meta-item"><strong>FEL UUID:</strong> {{DOC.FEL_UUDI}}</div>
<div class="doc-meta-item"><strong>Serie FEL:</strong> {{DOC.FEL_SERIE}}</div>
<div class="doc-meta-item"><strong>Número FEL:</strong> {{DOC.FEL_NUMERO}}</div>{{/DOC.FEL_UUDI}}`,
    },
    {
      id: 'fel-qr',
      label: 'QR FEL',
      html: `{{#DOC.FEL_UUDI}}<div class="fi-fel-qr" style="text-align:center;margin:8px 0">
  <img src="{{{DOC.FEL_QR_IMG}}}" alt="QR FEL" width="140" height="140" style="width:140px;height:140px;object-fit:contain">
  <div style="font-size:8px;margin-top:4px;text-transform:uppercase">ESCANEA EL CÓDIGO DESDE TU CELULAR</div>
</div>{{/DOC.FEL_UUDI}}`,
    },
    {
      id: 'text',
      label: 'Texto libre',
      html: `<p>Escriba aquí su texto…</p>`,
    },
  ],

  FIELD_TYPES: [
    { id: 'var', label: 'Campo de texto' },
    {
      id: 'fel-qr',
      label: 'QR FEL (URL FEL + UUID)',
      insertHtml: `{{#DOC.FEL_UUDI}}<img class="fi-fel-qr-img" src="{{{DOC.FEL_QR_IMG}}}" alt="QR FEL" width="140" height="140" style="width:140px;height:140px;object-fit:contain">{{/DOC.FEL_UUDI}}`,
    },
  ],

  toolbarHtml() {
    return `
      <div class="fi-visual-toolbar btn-toolbar flex-wrap gap-1" role="toolbar">
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-secondary" data-cmd="bold" title="Negrita"><i class="fa-solid fa-bold"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-cmd="italic" title="Cursiva"><i class="fa-solid fa-italic"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-cmd="underline" title="Subrayado"><i class="fa-solid fa-underline"></i></button>
        </div>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-secondary" data-cmd="justifyLeft" title="Izquierda"><i class="fa-solid fa-align-left"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-cmd="justifyCenter" title="Centro"><i class="fa-solid fa-align-center"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-cmd="justifyRight" title="Derecha"><i class="fa-solid fa-align-right"></i></button>
        </div>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-secondary" data-cmd="insertUnorderedList" title="Lista"><i class="fa-solid fa-list-ul"></i></button>
          <button type="button" class="btn btn-outline-secondary" data-cmd="removeFormat" title="Limpiar formato"><i class="fa-solid fa-eraser"></i></button>
        </div>
        <select class="form-select form-select-sm fi-font-size" style="width:auto" title="Tamaño">
          <option value="">Tamaño</option>
          <option value="1">Pequeño</option>
          <option value="3">Normal</option>
          <option value="5">Grande</option>
          <option value="7">Muy grande</option>
        </select>
      </div>`;
  },

  fillVarSelect(selectEl, groups) {
    if (!selectEl) return;
    const opts = ['<option value="">+ Campo…</option>'];
    (groups || []).forEach((g) => {
      opts.push(`<optgroup label="${this.escapeHtml(g.name)}">`);
      (g.vars || []).forEach((v) => {
        if (String(v).includes('bloque')) return;
        opts.push(`<option value="${this.escapeHtml(v)}">${this.escapeHtml(v)}</option>`);
      });
      opts.push('</optgroup>');
    });
    selectEl.innerHTML = opts.join('');
  },

  /** Inserta un bloque al final del lienzo (desde menús legacy). */
  appendBlock(doc, body, blockId) {
    if (!doc || !body) return;
    const el = this.createBlockElement(doc, blockId);
    body.appendChild(el);
    el.querySelector('.fi-dnd-block-body')?.focus();
  },
};
