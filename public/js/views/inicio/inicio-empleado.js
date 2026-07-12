/**
 * Pantalla de inicio en blanco según tipo de empleado (CODTIPOEMPLEADO).
 */
const InicioEmpleadoView = {
  _container: null,

  configs: {
    1: {
      icon: 'fa-user-shield',
      title: 'Administrador',
      hint: 'Acceso completo al sistema. Configure catálogos, operaciones e inventarios desde el menú.',
    },
    2: {
      icon: 'fa-user-gear',
      title: 'Supervisor',
      hint: 'Supervise operaciones, inventario y documentos de la empresa.',
    },
    3: {
      icon: 'fa-user-tag',
      title: 'Vendedor',
      hint: 'Realice pedidos, facturación y corte de caja desde el menú de operaciones.',
    },
    4: {
      icon: 'fa-route',
      title: 'Visitador',
      hint: 'Consulte clientes, rutas y documentos asignados.',
    },
    5: {
      icon: 'fa-warehouse',
      title: 'Bodega',
      hint: 'Gestione productos, existencias y movimientos de inventario.',
    },
    6: {
      icon: 'fa-truck',
      title: 'Transporte',
      hint: 'Consulte vehículos, kilometrajes y mantenimiento de la flota.',
    },
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  resolveConfig() {
    const codtipo =
      typeof TipoEmpleadoAccess !== 'undefined'
        ? TipoEmpleadoAccess.getCodTipo()
        : Number(F.session('user')?.codtipoempleado) || 1;
    return this.configs[codtipo] || this.configs[3];
  },

  render() {
    const user = F.session('user') || {};
    const cfg = this.resolveConfig();
    const tipoLabel =
      typeof TipoEmpleadoAccess !== 'undefined'
        ? TipoEmpleadoAccess.tipoLabel(TipoEmpleadoAccess.getCodTipo())
        : cfg.title;
    const empNombre = user.empNombre || F.getEmpNitNombre() || '—';
    const nombre = user.username || user.usuario || '—';

    return `
      <div class="inicio-empleado-wrap w-100">
        <div class="card inicio-empleado-card shadow-sm">
          <div class="card-body text-center py-5 px-4">
            <div class="inicio-empleado-icon mb-3">
              <i class="fa-solid ${cfg.icon}" aria-hidden="true"></i>
            </div>
            <h2 class="h4 mb-1">Inicio — ${this.escapeHtml(tipoLabel)}</h2>
            <p class="text-muted small mb-3">${this.escapeHtml(cfg.hint)}</p>
            <div class="inicio-empleado-meta small text-muted">
              <p class="mb-1"><strong>${this.escapeHtml(nombre)}</strong></p>
              <p class="mb-0">${this.escapeHtml(empNombre)}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  load(container) {
    const codtipo =
      typeof TipoEmpleadoAccess !== 'undefined'
        ? TipoEmpleadoAccess.getCodTipo()
        : Number(F.session('user')?.codtipoempleado) || 1;

    if (codtipo === 1 && typeof DashboardAdminView !== 'undefined') {
      return DashboardAdminView.load(container);
    }

    if (codtipo === 3 && typeof VendedorInicioView !== 'undefined') {
      return VendedorInicioView.load(container);
    }

    if (codtipo === 6 && typeof TransporteInicioView !== 'undefined') {
      return TransporteInicioView.load(container);
    }

    if (codtipo === 8 && typeof CajeroInicioView !== 'undefined') {
      return CajeroInicioView.load(container);
    }

    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');
    container.innerHTML = this.render();
  },
};
