import { routeCatalog } from "../src/openapi.js";

console.table(routeCatalog.map(([method, path, purpose]) => ({ method, path, purpose })));
console.log(`\n${routeCatalog.length} operações públicas catalogadas.`);
