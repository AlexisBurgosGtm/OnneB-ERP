/**
 * Navegación por teclado en listas de productos y modales cantidad/precio.
 */
const PosProductKeyboardUI = {
  confirmButton(popup) {
    if (popup) return popup.querySelector('.swal2-confirm');
    return document.querySelector('.swal2-container:not(.swal2-backdrop-hide) .swal2-confirm');
  },

  focusInput(input) {
    if (!input) return;
    input.focus();
    if (typeof input.select === 'function' && input.type !== 'number') {
      try {
        input.select();
      } catch (_) {
        /* ignore */
      }
    } else if (typeof input.select === 'function') {
      input.select();
    }
  },

  /**
   * Enter en cantidad → precio (si existe) → botón guardar.
   * @param {{ cantInput?: HTMLElement, priceInput?: HTMLElement, popup?: HTMLElement }} opts
   */
  wireModalQtyFlow(opts = {}) {
    const { cantInput, priceInput, popup } = opts;
    if (!cantInput) return;
    const confirmBtn = this.confirmButton(popup);
    if (priceInput) {
      priceInput.removeAttribute('tabindex');
    }
    cantInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (priceInput) {
        this.focusInput(priceInput);
      } else {
        confirmBtn?.focus();
      }
    });
    priceInput?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      confirmBtn?.focus();
    });
  },

  productItemsInList(listEl) {
    if (!listEl) return [];
    return Array.from(listEl.querySelectorAll('.pos-product-item'));
  },

  focusProductItem(item) {
    if (!item) return;
    item.focus();
    item.scrollIntoView({ block: 'nearest' });
  },

  triggerProductPick(item, onPick) {
    if (!item || typeof onPick !== 'function') return;
    const cod = item.getAttribute('data-codprod');
    const med = item.getAttribute('data-codmedida');
    onPick(cod, med, item).catch((err) => F.toast(err.message || 'Error', 'error'));
  },

  /**
   * Flechas arriba/abajo en la lista; Enter selecciona producto.
   */
  bindProductListKeyboard(container, prefix, opts = {}) {
    const onPick = opts.onPick;
    const findProductRow =
      opts.findProductRow ||
      ((cod, med) =>
        (opts.view?._productos || []).find(
          (p) =>
            String(p.CODPROD).trim() === String(cod).trim() &&
            String(p.CODMEDIDA).trim() === String(med).trim()
        ));

    const pickHandler = async (cod, med) => {
      const row = findProductRow(cod, med);
      if (!row || !onPick) return;
      await onPick(row);
    };

    const lists =
      typeof PosDocSearchUI !== 'undefined'
        ? PosDocSearchUI.listTargets(container, prefix)
        : [container?.querySelector(`#${prefix}-product-list`)].filter(Boolean);

    const searchInputs =
      typeof PosDocSearchUI !== 'undefined'
        ? PosDocSearchUI.searchInputs(container, prefix)
        : [container?.querySelector(`#${prefix}-product-search`)].filter(Boolean);

    const handleListKeydown = (e) => {
      const item = e.target.closest('.pos-product-item');
      if (!item) return;
      const list = e.currentTarget;
      const items = this.productItemsInList(list);
      const idx = items.indexOf(item);
      if (idx < 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.focusProductItem(items[idx + 1] || items[idx]);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) {
          this.focusProductItem(items[idx - 1]);
        } else {
          const inp = searchInputs[0];
          inp?.focus();
          if (inp && typeof inp.select === 'function') inp.select();
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        this.triggerProductPick(item, async (cod, med) => {
          await pickHandler(cod, med);
        });
      }
    };

    lists.forEach((list) => {
      list.addEventListener('keydown', handleListKeydown);
    });

    searchInputs.forEach((inp) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown') return;
        const list =
          lists.find((el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            return this.productItemsInList(el).length > 0;
          }) || lists[0];
        const items = this.productItemsInList(list);
        if (!items.length) return;
        e.preventDefault();
        this.focusProductItem(items[0]);
      });
    });
  },

  partyResultItems(listEl, itemSelector = 'button.list-group-item-action') {
    if (!listEl || listEl.classList.contains('d-none')) return [];
    return Array.from(listEl.querySelectorAll(itemSelector));
  },

  focusPartyResultItem(item) {
    if (!item) return;
    item.focus();
    item.scrollIntoView({ block: 'nearest' });
  },

  /**
   * Flechas ↑/↓ y Enter en resultados de cliente/proveedor (list-group bajo el input).
   * @param {HTMLElement} searchInput
   * @param {HTMLElement} resultsList
   * @param {{ itemSelector?: string }} [opts]
   */
  bindPartyResultsKeyboard(searchInput, resultsList, opts = {}) {
    if (!searchInput || !resultsList) return;
    const itemSelector = opts.itemSelector || 'button.list-group-item-action';

    const hideResults = () => {
      resultsList.classList.add('d-none');
    };

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!resultsList.classList.contains('d-none')) {
          e.preventDefault();
          hideResults();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        const items = this.partyResultItems(resultsList, itemSelector);
        if (!items.length) return;
        e.preventDefault();
        this.focusPartyResultItem(items[0]);
        return;
      }
      if (e.key === 'ArrowUp') {
        const items = this.partyResultItems(resultsList, itemSelector);
        if (!items.length) return;
        e.preventDefault();
        this.focusPartyResultItem(items[items.length - 1]);
      }
    });

    resultsList.addEventListener('keydown', (e) => {
      const item = e.target.closest(itemSelector);
      if (!item || !resultsList.contains(item)) return;
      const items = this.partyResultItems(resultsList, itemSelector);
      const idx = items.indexOf(item);
      if (idx < 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.focusPartyResultItem(items[Math.min(idx + 1, items.length - 1)]);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx <= 0) {
          searchInput.focus();
          if (typeof searchInput.select === 'function') searchInput.select();
        } else {
          this.focusPartyResultItem(items[idx - 1]);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        item.click();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        hideResults();
        searchInput.focus();
      }
    });
  },
};
