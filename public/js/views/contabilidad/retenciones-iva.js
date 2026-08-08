const RetencionesIvaView = createRetencionesDocView({
  prefix: 'rtv',
  apiPath: '/api/retenciones-iva',
  title: 'Retenciones Emitidas IVA',
  labelSingular: 'retención IVA emitida',
  labelNueva: 'Retención IVA emitida',
  setupCode: 'RTV',
  formatoCon: 'RTVCON',
  formatoCre: 'RTVCRE',
  kind: 'iva',
  baseLabel: 'Base gravada',
  retencionLabel: 'Monto retención IVA',
});
