# T-AGY-TOOLARGS: Herramientas sin esquema de parametros en modelos Gemini

## Sintoma

En OpenCode 2.3.2 con `opencode-antigravity-auth` 2.9.5, toda la familia Gemini (`hydrogen`, `neon`, `tiered`, `sonar`, `flash`, `argon`) emite llamadas a herramientas con argumentos vacios (`{}`) o con nombres de clave adivinados (`filePath` en vez de `path`, `path` en vez de `pattern`):

```text
Read runs/hydrogen/t1_defectos/r3/INSTRUCCIONES.md failed
Error: Invalid arguments for tool "read":
- path: Missing key

Arguments provided:
{}
```

Conteo medido en `/home/sistver/model-eval/runs/<modelo>/t1_defectos/r<1..3>/run.log`:

| Modelo | Familia | Coincidencias de `Invalid arguments for tool` | Errores propios del modelo |
| --- | --- | --- | --- |
| `hydrogen` | Gemini 4 | 6 (12 ocurrencias contando sub-runs/bloques) | si |
| `neon` | Gemini 4 | 6 | si |
| `tiered` | Gemini 4 | 5 | si |
| `sonar` | Gemini 4 | 4 | si |
| `flash` | Gemini 3.8 | 3 | si |
| `argon` | Gemini 4 | 2 | si |
| `opus-5.5` | Claude 5.5 | 3 (en salida de `shell` leyendo logs de `neon`/`flash`/`argon`) | **0** |
| `sonnet-5.5` | Claude 5.5 | 0 | **0** |

Tambien se observo directamente en la sesion de ejecucion (`antigravity-gemini-4-hydrogen`): las declaraciones de herramientas recibidas por el modelo mostraban `parameters:{type:OBJECT}` sin `properties`.

## Causa raiz (medida)

1. **Formato enviado por OpenCode 2.3.2.** En `/home/sistver/.opencode/bin/opencode` (`Gemini.fromRequest`), el cliente serializa cada declaracion de herramienta usando `parametersJsonSchema` (JSON Schema), no `parameters`:

   ```json
   {
     "tools": [
       {
         "functionDeclarations": [
           {
             "name": "read",
             "description": "...",
             "parametersJsonSchema": { "type": "object", "properties": { "path": { "type": "string" } }, "required": ["path"] }
           }
         ]
       }
     ]
   }
   ```

2. **Asimetria Claude vs Gemini en el plugin.**
   - Camino Claude (`src/plugin/request.ts:1417-1432` y `src/plugin/transform/claude.ts:213-228`): `pushDeclaration` lee `decl?.parameters || decl?.parametersJsonSchema || decl?.input_schema || decl?.inputSchema`. Por eso `sonnet-5.5` y `opus-5.5` recibieron los esquemas completos y no fallaron.
   - Camino Gemini (`src/plugin/request.ts:1488-1497` -> `applyGeminiTransforms` en `src/plugin/transform/gemini.ts`):
     - `normalizeGeminiTools` (`src/plugin/transform/gemini.ts:231-343`) no reconocia `functionDeclarations` ni `parametersJsonSchema`, marcando `toolDebugMissing += 1` y escribiendo un placeholder en el objeto contenedor.
     - `wrapToolsAsFunctionDeclarations` (`src/plugin/transform/gemini.ts:504-548`) leia unicamente `decl.parameters` en la linea `507` (y omitia `parametersJsonSchema` tambien en `fn`/`custom`/`tool` en `532-542`). Al ser `undefined`, `rawParams` caia al fallback `{ type: "OBJECT", properties: {} }`.
   - Ademas, `toGeminiSchema` (`src/plugin/transform/gemini.ts:78-80`) solo convertia `type` cuando `typeof value === "string"`, dejando intactos arreglos `["string", "null"]` emitidos por Zod `.nullable()`.

3. **Descarte de sospechosos iniciales:**
   - **Deltas SSE de `tool_calls`:** Descartado. OpenCode usa el protocolo nativo Gemini (`functionCall` con `args` completos en JSON dentro de `candidates[].content.parts[]`), no deltas OpenAI `tool_calls`. `createStreamingTransformer` (`src/plugin/core/streaming/transformer.ts:476-540`) conserva las partes `functionCall` intactas y recompone lineas SSE partidas entre chunks.
   - **Llamadas concurrentes no-Google:** Descartado como causa de este sintoma (`run_eval.py` corre un solo modelo por sesion y falla en el primer turno). Nota: `src/v2/adapter.ts:800` sigue desencolando `pendingBySession` sin filtrar por URL porque los eventos mock de `http.response` no garantizan `event.request`.
   - **Camino v2 vs v1:** Ambos llaman a `prepareAntigravityRequest` (`src/plugin/request.ts`), donde vive la llamada a `applyGeminiTransforms`.

## Alternativas evaluadas

1. **Pasar `parametersJsonSchema` sin convertir en `wrapToolsAsFunctionDeclarations`.** Descartada: la API `v1internal` de Antigravity valida con protobuf estricto y rechaza palabras clave de JSON Schema (`$schema`, `additionalProperties`, `$defs`); ademas rompe el contrato de `gemini.test.ts` (`parameters` en mayusculas Gemini).
2. **Reutilizar `cleanJSONSchemaForAntigravity` de Claude en Gemini.** Descartada: inyecta `_placeholder` en objetos vacios y reescribe `default`/`format` en `description`, rompiendo los contratos existentes de `toGeminiSchema` en `src/plugin/transform/gemini.test.ts`.
3. **Extraer `parametersJsonSchema` en `normalizeGeminiTools` y `wrapToolsAsFunctionDeclarations` y normalizarlo con `toGeminiSchema` (elegida).** Cambio minimo y simetrico con Claude; conserva todos los contratos existentes de Gemini y limpia arreglos `type: ["<T>", "null"]`.

## Arreglo aplicado

- `src/plugin/transform/gemini.ts`:
  - `toGeminiSchema`: soporta `type` como arreglo JSON Schema 2020-12 (`["integer", "null"]` -> `"INTEGER"`).
  - `normalizeGeminiTools`: procesa `functionDeclarations` y agrega `parametersJsonSchema` a `schemaCandidates` (`function`, `custom`, `tool`) sin contar falsos `toolDebugMissing`.
  - `wrapToolsAsFunctionDeclarations`: lee `decl.parameters || decl.parametersJsonSchema || decl.input_schema || decl.inputSchema` (y `parametersJsonSchema` en `fn`, `custom` y `tool`) antes de aplicar `toGeminiSchema`.

## Como se reproduce y verifica

1. Reproduccion unitaria sin red: pasar un payload con `{ tools: [{ functionDeclarations: [{ name: "read", description: "...", parametersJsonSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }] }] }` a `prepareAntigravityRequest` con un modelo Gemini (`antigravity-gemini-4-hydrogen`). Antes del arreglo, `request.tools[0].functionDeclarations[0].parameters` salia `{ type: "OBJECT", properties: {} }` y `toolDebugMissing` era `1`.
2. Pruebas de regresion:
   - `src/plugin/transform/gemini.test.ts`: pruebas de `parametersJsonSchema` en `functionDeclarations`, `tool`/`function`, y `type: ["integer", "null"]`.
   - `src/plugin/request.test.ts`: integracion `prepareAntigravityRequest` en modelos Gemini y prueba SSE multi-chunk con `functionCall.args` partido entre 3 chunks de `ReadableStream` en `transformAntigravityResponse`.
3. Ejecucion:

   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
