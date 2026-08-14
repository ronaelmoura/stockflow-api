import SwaggerParser from "@apidevtools/swagger-parser";
import { openApiDocument, routeCatalog } from "../src/openapi.js";

await SwaggerParser.validate(openApiDocument as any);
const documented = new Set(Object.keys(openApiDocument.paths));
const missing = routeCatalog.filter(([, path]) => !documented.has(path));
if (missing.length) throw new Error(`Rotas sem documentação: ${missing.map(([, path]) => path).join(", ")}`);
console.log(`✓ OpenAPI válida; ${documented.size} caminhos e ${routeCatalog.length} operações catalogadas.`);
