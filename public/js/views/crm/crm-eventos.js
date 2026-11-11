/**
 * CRM — Eventos (calendario mensual; sin persistencia por ahora).
 */
const CrmEventosView = {
  _container: null,
  _calYear: null,
  _calMonth: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  monthNames() {
    return [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
  },

  monthLabel(year, monthIndex) {
    return `${this.monthNames()[monthIndex]} ${year}`;
  },

  todayIsoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  initCalMonth() {
    const d = new Date();
    if (this._calYear == null) {
      this._calYear = d.getFullYear();
      this._calMonth = d.getMonth();
    }
  },

  shiftMonth(delta) {
    this.initCalMonth();
    let y = this._calYear;
    let m = this._calMonth + delta;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    this._calYear = y;
    this._calMonth = m;
  },

  renderCalendarHtml() {
    this.initCalMonth();
    const year = this._calYear;
    const month = this._calMonth;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;
    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const today = this.todayIsoDate();
    let cells = '';

    for (let i = 0; i < startWeekday; i += 1) {
      cells += '<div class="crm-cal-cell crm-cal-cell--muted"></div>';
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = iso === today;
      const cls = ['crm-cal-cell', isToday ? 'crm-cal-cell--today' : ''].filter(Boolean).join(' ');
      cells += `
        <div class="${cls}" data-cal-date="${this.escapeHtml(iso)}">
          <div class="crm-cal-day">${day}</div>
        </div>`;
    }

    const totalCells = startWeekday + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i += 1) {
      cells += '<div class="crm-cal-cell crm-cal-cell--muted"></div>';
    }

    return `
      <div class="crm-cal-wrap card shadow-sm">
        <div class="card-body">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="crm-cal-prev" title="Mes anterior">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <h3 class="h6 mb-0 fw-semibold text-center flex-grow-1">${this.escapeHtml(this.monthLabel(year, month))}</h3>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="crm-cal-next" title="Mes siguiente">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-primary" id="crm-cal-today" title="Mes actual">Hoy</button>
          </div>
          <div class="crm-cal-grid">
            ${weekDays.map((d) => `<div class="crm-cal-weekday">${d}</div>`).join('')}
            ${cells}
          </div>
        </div>
      </div>`;
  },

  renderScreen() {
    return `
      <div class="catalogo-vista-wrap w-100 crm-vista-wrap">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <h2 class="h5 mb-0 fw-semibold">
            <i class="fa-solid fa-calendar-days me-2 text-muted" aria-hidden="true"></i>Eventos
          </h2>
        </div>
        <div id="crm-eventos-cal-host">${this.renderCalendarHtml()}</div>
      </div>`;
  },

  refreshCalendar() {
    const host = this._container?.querySelector('#crm-eventos-cal-host');
    if (!host) return;
    host.innerHTML = this.renderCalendarHtml();
    this.bindCalendarEvents();
  },

  bindCalendarEvents() {
    const root = this._container;
    if (!root) return;
    root.querySelector('#crm-cal-prev')?.addEventListener('click', () => {
      this.shiftMonth(-1);
      this.refreshCalendar();
    });
    root.querySelector('#crm-cal-next')?.addEventListener('click', () => {
      this.shiftMonth(1);
      this.refreshCalendar();
    });
    root.querySelector('#crm-cal-today')?.addEventListener('click', () => {
      const d = new Date();
      this._calYear = d.getFullYear();
      this._calMonth = d.getMonth();
      this.refreshCalendar();
    });
  },

  load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-2', 'p-md-3');
    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }
    const d = new Date();
    this._calYear = d.getFullYear();
    this._calMonth = d.getMonth();
    container.innerHTML = this.renderScreen();
    this.bindCalendarEvents();
  },
};
