const RetencionesIvaView = createRetencionesDocView({
  prefix: 'rtv',
  apiPath: '/api/retenciones-iva',
  title: 'Retenciones IVA',
  labelSingular: 'retención IVA',
  labelNueva: 'Retención IVA',
  setupCode: 'RTV',
  formatoCon: 'RTVCON',
  formatoCre: 'RTVCRE',
  baseLabel: 'Base gravada',
  retencionLabel: 'Monto retención IVA',
});
