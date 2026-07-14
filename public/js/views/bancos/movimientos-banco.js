/**
 * Vista Movimientos bancarios — placeholder (DOCUMENTOS_BANCO).
 */
const MovimientosBancoView = {
  async load(container) {
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');
    container.innerHTML = `
      <div class="w-100">
        <h5 class="mb-2"><i class="fa-solid fa-money-bill-transfer me-2"></i>Movimientos</h5>
        <p class="text-muted mb-0">Módulo de movimientos bancarios — contenido pendiente.</p>
      </div>`;
  },
};
