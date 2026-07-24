/**
 * Verifica que todo menú de ALL_MENUS esté en MENU_GROUPS (catálogo del generador).
 * Uso: npm run license:check
 */
const { assertLicenseCatalogIntegrity, licenseModulesCatalog } = require('../lib/license-modules');

const result = assertLicenseCatalogIntegrity({
  log: (msg) => console.error(msg),
  throwOnError: false,
});

const catalog = licenseModulesCatalog();
console.log(`[Licencia] ${catalog.length} módulo(s) en generador:`);
for (const m of catalog) {
  console.log(`  - ${m.id} (${m.title}): ${m.menus.length} vista(s)`);
}

if (!result.ok) {
  console.error('\nCorrige MENU_GROUPS / API_PREFIX_TO_MODULE antes de emitir licencias.');
  process.exit(1);
}

console.log('\n[Licencia] Catálogo OK — el generador está alineado con roles/menús.');
