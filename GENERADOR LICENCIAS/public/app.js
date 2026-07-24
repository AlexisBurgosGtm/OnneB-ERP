const modulesEl = document.getElementById('modules');
const form = document.getElementById('form');
const statusEl = document.getElementById('status');

function setStatus(msg, isErr = false) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg || '';
  statusEl.classList.toggle('err', Boolean(isErr));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncModuleState(modEl) {
  const modCb = modEl.querySelector('input[name=module]');
  const viewCbs = [...modEl.querySelectorAll('input[name=menu]')];
  if (!modCb || !viewCbs.length) return;
  const checked = viewCbs.filter((c) => c.checked).length;
  modCb.checked = checked === viewCbs.length;
  modCb.indeterminate = checked > 0 && checked < viewCbs.length;
}

function selectedMenus() {
  return [...modulesEl.querySelectorAll('input[name=menu]:checked')].map((el) => el.value);
}

async function loadCatalog() {
  const res = await fetch('/api/catalog');
  const data = await res.json();
  const integrityEl = document.getElementById('integrity');
  if (data.integrity && !data.integrity.ok) {
    integrityEl.hidden = false;
    integrityEl.textContent = (data.integrity.problems || []).join(' · ');
  } else {
    integrityEl.hidden = true;
  }

  modulesEl.innerHTML = (data.modules || [])
    .map((m) => {
      const views = (m.menuLabels || [])
        .map(
          (x) => `
          <label class="view">
            <input type="checkbox" name="menu" value="${escapeHtml(x.key)}" data-module="${escapeHtml(m.id)}" checked>
            <span>${escapeHtml(x.label)}</span>
          </label>`
        )
        .join('');
      return `
      <div class="mod-card" data-module="${escapeHtml(m.id)}">
        <label class="mod-head">
          <input type="checkbox" name="module" value="${escapeHtml(m.id)}" checked>
          <span>
            <strong>${escapeHtml(m.title)}</strong>
            <small>${(m.menus || []).length} vistas — marque/desmarque individualmente</small>
          </span>
        </label>
        <div class="mod-views">${views}</div>
      </div>`;
    })
    .join('');

  modulesEl.querySelectorAll('.mod-card').forEach((card) => {
    syncModuleState(card);
    const modCb = card.querySelector('input[name=module]');
    modCb?.addEventListener('change', () => {
      card.querySelectorAll('input[name=menu]').forEach((c) => {
        c.checked = modCb.checked;
      });
      modCb.indeterminate = false;
    });
    card.querySelectorAll('input[name=menu]').forEach((c) => {
      c.addEventListener('change', () => syncModuleState(card));
    });
  });
}

document.getElementById('btn-all').addEventListener('click', () => {
  modulesEl.querySelectorAll('input[type=checkbox]').forEach((el) => {
    el.checked = true;
    el.indeterminate = false;
  });
});

document.getElementById('btn-none').addEventListener('click', () => {
  modulesEl.querySelectorAll('input[type=checkbox]').forEach((el) => {
    el.checked = false;
    el.indeterminate = false;
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('');
  const customer = document.getElementById('customer').value.trim();
  const expiresAt = document.getElementById('expiresAt').value;
  const notes = document.getElementById('notes').value.trim();
  const menus = selectedMenus();

  try {
    const res = await fetch('/api/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer,
        expiresAt: expiresAt || null,
        notes,
        menus,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo emitir');

    const blob = new Blob([JSON.stringify(data.license, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || 'onneb-license.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus(
      `Licencia generada: ${data.preview?.licenseId || ''} · ${menus.length} vista(s) · ${(data.modules || []).length} módulo(s)`
    );
  } catch (err) {
    setStatus(err.message || 'Error', true);
  }
});

loadCatalog().catch((err) => setStatus(err.message || 'Error al cargar catálogo', true));
