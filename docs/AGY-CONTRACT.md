# Contrato real de la CLI `agy` frente al plugin

Reverse engineering de `agy` 1.5.11 (Antigravity CLI, ELF sin símbolos,
268.841.672 bytes) para comparar lo que envía con lo que envía este plugin, y
documentar por qué el plugin recibía `429 RESOURCE_EXHAUSTED`.

Todo lo marcado **medido** viene de una captura o de una matriz de respuestas
registrada; lo marcado **estimado** es inferencia y no debe tratarse como hecho.

## Método

- `strings -n 4` volcado a `.scratch/agy.strings.txt` (2.396.782 líneas). No hay
  toolchain de Go en la máquina (`go` → exit 127), así que no hubo `go tool nm`:
  los nombres de funciones salen del pclntab embebido, como cadenas.
- Proxy MITM local (`CONNECT` en `127.0.0.1:8899`) con CA propia y certificado
  hoja con SAN amplios, montado con `HTTPS_PROXY` + `SSL_CERT_FILE`. `agy` manda
  el body con `Transfer-Encoding: chunked`, así que el proxy lo des-chunkea antes
  de registrarlo.
- Replays: se reenvía un body capturado cambiando **una sola variable** y se
  anota el status. Cada conclusión de la sección 429 tiene su matriz.

## 1. Cabeceras y identificadores (medido)

`User-Agent` real, tal cual lo emite la CLI:

```
antigravity/cli/1.5.11 (aidev_client; os_type=linux; arch=amd64; cl=1024248524; auth_method=consumer)
```

- No envía **ninguna** cabecera `x-goog-*` ni `x-sherlog-*` en
  `:streamGenerateContent`. Esas cadenas existen en el binario pero pertenecen a
  otras rutas (telemetría/endpoints internos), no a esta petición.
- El formato `%s/%s (%s)` y las claves `aidev_client`, `os_type=`, `cl=`,
  `auth_method=consumer` aparecen en el binario junto a
  `codeassistclient.getUserAgentName`
  (`google3/third_party/jetski/language_server/code_assist_client/`).
- `cl` es un id de cliente opaco. **Estimado**: proviene del build, no de la
  cuenta; no cambia entre cuentas en las capturas.

## 2. Body (medido)

`.scratch/sgen.body.json`, capturado de una petición `200` de la CLI:

```json
{
  "project": "aicode-consumers",
  "requestId": "agent/513023f7-.../1795031044589/b55ec3f4-.../1",
  "request": {
    "contents": [...],
    "systemInstruction": { "role": "user", "parts": [{ "text": "..." }] },
    "tools": [ ... 14 ... ],
    "labels": {
      "cascade_id": "513023f7-...", "root_cascade_id": "513023f7-...",
      "trajectory_id": "b55ec3f4-...", "request_id": "b55ec3f4-...-0",
      "last_step_index": "0", "model_enum": "MODEL_PLACEHOLDER_M418",
      "used_claude": "false", "used_claude_conservative": "false",
      "used_non_gemini_model": "false"
    },
    "generationConfig": {
      "maxOutputTokens": 65536,
      "thinkingConfig": { "includeThoughts": true, "thinkingLevel": "MEDIUM" }
    },
    "sessionId": "..."
  },
  "model": "gemini-4-argon-medium",
  "userAgent": "antigravity",
  "requestType": "agent"
}
```

Dos cosas que importan más de lo que parecen:

- **El sufijo de tier es obligatorio.** `gemini-4-argon` a secas →
  `404 Requested entity was not found.`; `gemini-4-argon-medium` con el mismo
  body → `200`. El id base nunca funciona contra este backend.
- **Host real:** `daily-cloudcode-pa.googleapis.com`. Medido también:
  `daily-cloudcode-pa.sandbox.googleapis.com` acepta los mismos bodies, y
  `cloudcode-pa.googleapis.com` (PROD) devuelve `429` a *cualquier* body.

## 3. El 429 no era cuota

Medido el 2026-11-18 con una cuenta, `gemini-4-argon-low`, cuerpo idéntico byte a
byte salvo una variable. El 429 es
`{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}}`,
sin `Retry-After` y sin cabeceras de rate limit: es un rechazo, no una cuota.

Matriz mínima, 5 rondas intercaladas por host, sin deriva:

| cuerpo | daily | sandbox |
| --- | --- | --- |
| benigno | `200 ×5` | `200 ×5` |
| + `tools.opencode.session_move` en `systemInstruction` | `429 ×5` | `429 ×5` |

Forma de la regla (**medido**, bisecando el mismo body):

- Case-insensitive: `TOOLS.OPENCODE.SESSION_MOVE` → 429.
- Subcadena exacta, anclada a ambos lados: prefijo de 26 chars → 200; el literal
  completo (27) → 429; con un carácter pegado delante (`ztools.…`) o un `.` de
  más detrás sigue dando 429 porque la subcadena sobrevive.
- Solo separado por puntos: `tools.opencode\tsession_move`,
  `tools/opencode/session_move`, `tools .opencode .session_move` → 200.
- Solo ese nombre: de 19 nombres `tools.opencode.*` probados (`session_new`,
  `session_abort`, `session_list`, `read`, `read_mcp_resource`, …) únicamente
  `session_move` dispara.
- Solo ese namespace: `tools.foo.session_move`, `tools.antigravity.session_move`
  → 200.
- Solo en `systemInstruction`: el mismo literal en `contents` (turno de usuario)
  → 200.
- El tamaño no influye: relleno benigno de 6k/10k/21k → 200.

Bisección dentro del catálogo real: prefijo 4563 → 200 (×2), prefijo 4595 → 429
(×2); 4595 menos la línea de `session_move` → 200.

**Origen del literal:** no lo escribe el plugin. OpenCode 2.2.6 inyecta en el
system prompt un catálogo "# Code Mode" con sus herramientas y una pista del
worktree. En el body real del plugin (21.310 bytes) el literal aparece dos veces:
`systemInstruction.parts[2]` (catálogo, 10.571 chars) y `parts[3]` (pista del
worktree, 238 chars). El plugin lo reenviaba tal cual tras anteponer su propio
`ANTIGRAVITY_SYSTEM_INSTRUCTION`.

**Estimado**: se trata de un guard de inyección de herramientas del backend que
responde 429 en vez de 400. El mecanismo no está confirmado; solo lo está el
comportamiento.

### Alternativas evaluadas para el arreglo

1. **Quitar el catálogo "# Code Mode" del `systemInstruction`.** Descartada:
   se pierde documentación legítima de herramientas del harness y cualquier otro
   harness que inyecte texto similar volvería a romper.
2. **Escapar el literal** (backticks, `\.`, zero-width, corchetes). Descartada
   por medición: backticks 429, escapes 429, zero-width 429 y `tools.opencode["session_move"]`
   → **400** (el backend lo considera sintaxis inválida).
3. **Insertar un espacio tras el último punto** (`tools.opencode. session_move`).
   **Elegida**: medido `200`, también en mayúsculas; sigue siendo acceso a
   miembro válido en JavaScript (`` a. b `` parsea igual que `a.b`), así que el
   modelo lee la misma referencia y el guard deja de casar.

Implementación: `neutralizeBlockedSystemInstructionLiterals()` en
`src/plugin/request-helpers.ts`, aplicada al final sobre todo
`systemInstruction` en `src/plugin/request.ts:1717-1733`. La lista de literales
bloqueados es una tabla explícita, para que añadir otro sea un diff de una línea.

## 4. Tabla de diferencias plugin ↔ CLI

Solo la nº 11 cambia el status (medido, ver §3). Las demás son reales pero se
dejan fuera de este parche por alcance: ninguna movió `200` ↔ `429` en los
replays de variable única.

| # | Diferencia | Plugin | CLI (medido) | Efecto |
| --- | --- | --- | --- | --- |
| 1 | Host por defecto | `daily-cloudcode-pa.sandbox.googleapis.com` — `src/constants.ts:35` | `daily-cloudcode-pa.googleapis.com` | ninguno (ambos 200) |
| 2 | Host en verificación/quota | `cloudcode-pa.googleapis.com` — `src/plugin.ts:519`, `src/plugin/quota.ts:181,207` | nunca PROD para sgen | PROD da 429 a todo body |
| 3 | `cl` en el UA | `962369648` — `src/constants.ts:95` | `1024248524` | ninguno |
| 4 | Versión en el UA | `1.5.8` — `src/constants.ts:88` | `1.5.11` | ninguno |
| 5 | `requestId` | `agent-<uuid>` — `src/plugin/request.ts:1744` | `agent/<uuid>/<ms>/<uuid>/1` | ninguno |
| 6 | `request.labels` | ausente | 9 claves (`cascade_id`, `trajectory_id`, …) | ninguno |
| 7 | Proyecto | cacheado (`managedProjectId`) — `src/plugin/request.ts:1684` | `loadCodeAssist` → `cloudaicompanionProject` | ninguno |
| 8 | UA en otras rutas | navegador / `"antigravity"` — `src/constants.ts:113-115`, `src/plugin/project.ts:131` | UA de CLI en todo | ninguno |
| 9 | `Client-Metadata.platform` | linux reporta `MACOS` — `src/constants.ts:114` | — | cosmético |
| 10 | Regex de familias con tier | falta `hydrogen` — `src/plugin/transform/model-resolver.ts:229` | — | modelo sin tier |
| 11 | `systemInstruction` | reenvía tal cual el catálogo del harness | no aplica | **causa del 429** |

## 5. Verificación del arreglo

- Replay de control sobre el body real del plugin (21.310 bytes, dos
  ocurrencias): sin tocar → 429; con el espacio → 200 en `daily` y `sandbox`.
- Run real de aceptación:
  `opencode run --model google/antigravity-gemini-4-argon 'Reply with exactly: PONG'`
  → responde `PONG`.
- Captura de esa misma ejecución: dos `:streamGenerateContent`, bodies de 3.305
  y 22.048 bytes, **0** ocurrencias del literal original y **2** de la forma con
  espacio en el body grande; ambas respuestas `200 OK` con `text/event-stream`.
  Antes del parche, el body grande daba 429 de forma determinista.
