# Plugin de OAuth de Antigravity para OpenCode (Edición Revivida y Extendida)

[English](README.md) | **Español**

> [!NOTE]
> **README en español.** El inglés ([README.md](README.md)) es la fuente de verdad y se actualiza primero. Esta traducción puede quedar desactualizada respecto de la versión en inglés; ante cualquier duda, manda el inglés.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml)

> [!NOTE]
> **Revival comunitario y edición extendida**: Este repositorio es una continuación activa y de código abierto del proyecto archivado de [NoeFabris](https://github.com/NoeFabris/opencode-antigravity-auth) (y del trabajo previo de [@jenslys](https://github.com/jenslys) y [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)). Corrige bugs críticos del upstream y desbloquea los modelos más nuevos de Google Antigravity.

> [!IMPORTANT]
> **Estado del proyecto (octubre de 2026) - medido, no supuesto.**
> - **Gemini 4 ("Argon") funciona, y el grant es por cuenta.** Medido el 2026-10-31: una cuenta que `loadCodeAssist` reporta como `free-tier` recibió el grant completo de Argon (`modelVersion: gemini-4-argon-trial` y su propio bucket semanal `Gemini 4 Argon`), mientras otras dos solo recibieron el placeholder `gemini-4-argon-disabled` y responden `404` a los ids reales. No infieras el acceso del nombre del plan: activa [`model_discovery`](#descubrimiento-de-modelos) y confírmalo con `antigravity_quota`.
> - **Argon tiene su propio bucket de cuota.** Dos llamadas de 32k tokens a Argon movieron `gemini-argon-wtu-weekly` de 98.75% a 97.75% mientras `gemini-weekly` y `gemini-5h` no se movieron. Argon no se cobra contra Gemini Flash/Pro.
> - **La rotación respeta el entitlement.** El catálogo de cada cuenta se mide y se cachea, y la selección descarta las cuentas que demuestran no tener el modelo pedido. Argon solo va a la cuenta que lo tiene; `gemini-3.8-flash` sigue usando todas.
> - **La cuota de Claude es por familia, no por generación.** Las cuentas Free sí tienen cuota de Claude, pero cubre `claude-*-4-6` y GPT-OSS; Claude 5.5 responde `404` ahí. `antigravity_quota` reporta ambas generaciones por separado.
> - **Claude 4.6 se está retirando.** En la cuenta con grant, `claude-sonnet-4-6` ya responde `200` con "Claude Sonnet 4.6 is no longer available. Please switch to Claude Sonnet 5.5."; las cuentas Free todavía lo sirven. La fecha anunciada por Google es el **2026-11-02**, y `model_discovery` expone los sucesores 5.5 sin esperar una release.
> - **Usa Argon con moderación.** Está medido: ~1% de su bucket semanal por cada 65k tokens de entrada, frente a un bucket Flash que en la práctica es gratis en el margen. Mantén **Gemini 3.8 Flash** como caballo de batalla de alto volumen.

---

### Qué cambia este fork

- **OpenCode v1 y v2 en un solo entrypoint.** Una factory invocable de v1 más `.setup()` nativo de v2, con modelos, variantes, tools y comandos registrados por los registries de v2.
- **Catálogo real de modelos de Antigravity.** El núcleo curado es Gemini 3.8 Flash, la pareja Claude 4.6 y GPT-OSS 120B; todo lo más nuevo que tu cuenta tenga concedido (Gemini 4 Argon, Claude 5.5) lo registra `model_discovery` desde el catálogo del backend, con una entrada por familia y variantes `low`/`medium`/`high`.
- **Firma oficial del cliente CLI.** Las peticiones presentan `antigravity/cli/<version> (aidev_client; ...)`, resuelta al arranque desde el auto-updater del CLI. Sin ella el backend responde `404 NOT_FOUND` para las líneas nuevas de Gemini, que es también por lo que una firma vieja parecía "preview access no habilitado".
- **Pool multi-cuenta con rotación por entitlement.** Cuota, salud y catálogo de modelos medidos por cuenta; failover en `429`, `403`, caídas de transporte y fallos `404`; cooldowns y circuit breakers para que una cuenta mala no envenene el pool.
- **Reporte de cuota de doble ventana.** `antigravity_quota` y `/antigravity-quota` muestran las ventanas 5h y semanal por familia (Gemini, Claude/GPT, Gemini 4 Argon), cuentas regresivas cortas, un `USABLE` veraz y las capacidades medidas de cada cuenta.
- **Tiers de thinking y firmas de Claude.** Ids del backend con tier, presupuestos de thinking para Claude, caché de firmas y recuperación de loops de tools interrumpidos.
- **Controles de seguridad.** `safety_level` configurable, más `safety_shield` para exponer y rotar ante telemetría de seguridad de Google.
- **Resiliencia de sesión.** Poda de respuestas históricas de tools, circuit breaker ante caídas de transporte e instrumentación de reintentos.
- **Higiene de peticiones.** Elimina `x-api-key`/`x-goog-api-key`/`x-goog-user-project`, normaliza esquemas de tools incompatibles con protobuf y sanea payloads que la Cloud Code API rechaza.

---

Permite que OpenCode se autentique contra **Antigravity** (el IDE de Google) vía OAuth, para que puedas usar los límites de tasa de Antigravity con `gemini-3.8-flash`, la línea Claude (`4.6` hoy, `5.5` en las cuentas que lo tienen) y `gpt-oss-120b`, más cualquier modelo nuevo que tu cuenta tenga concedido -Gemini 4 Argon incluido- con tus credenciales de Google.

## Qué obtienes

- **Gemini 3.8 Flash**, **Claude Opus 4.6 / Sonnet 4.6** y **GPT-OSS 120B** vía OAuth de Google: este es el catálogo completo de consumidor; **Gemini 3.7 Flash, 3.6 Flash y 3.1 Pro son exclusivos de Ultra / Enterprise** y ya no se registran
- **Soporte multi-cuenta** — añade varias cuentas de Google y rota automáticamente cuando alguna queda limitada
- **Normalización de peticiones y feedback limpio** — parámetros optimizados que evitan falsos positivos en tareas de desarrollo; aviso limpio de una línea ante los filtros
- **Comandos de barra** — `/antigravity-quota` para inspeccionar los límites de doble ventana, y `/antigravity-stats` para métricas locales instantáneas
- **Tools nativas** — las tools `antigravity_quota`, `antigravity_stats` y `google_search`, registradas directamente en el runtime del agente
- **Modelos con thinking** — thinking extendido para Claude y Gemini 3, con presupuestos y niveles de thinking configurables
- **Grounding con Google Search** — activa la búsqueda web para los modelos Gemini (automática o siempre activa)
- **Auto-recuperación** — gestiona errores de sesión y fallos de tools de forma automática
- **Compatible con otros plugins** — convive con otros plugins de OpenCode (oh-my-opencode, dcp, etc.)
- **Soporte de doble versión** — compatibilidad nativa con OpenCode v1 (`opencode-ai`) y OpenCode v2 (`@opencode/cli`)

---

## Compatibilidad de arquitectura con OpenCode v1 y v2

Este plugin implementa un entrypoint polimórfico de doble compatibilidad en `index.ts`:

- **OpenCode v1 (1.18.x / `opencode-ai`):**
  Se carga como una función factory invocable:
  ```typescript
  export default async function ({ client, directory }: PluginContext): Promise<PluginResult>
  ```
  Devuelve los hooks `{ auth, event, tool }` con rotación multi-cuenta completa e intercepción de headers.

- **OpenCode v2 (2.0.x / `@opencode/cli`):**
  Se carga como un objeto de definición de plugin nativo de v2:
  ```typescript
  export default {
    id: "opencode-antigravity-auth",
    setup: async (context: V2Context) => cleanup
  }
  ```
  Registra tools nativas (`context.tool.transform`), comandos (`context.command.transform`), modelos (`context.model.transform`) y la **integración OAuth de Google Antigravity** (`context.integration.transform`), compartiendo el mismo pool de cuentas y la misma configuración. Esto hace que `opencode auth login` ofrezca `OAuth with Google (Antigravity)` y que cada cuenta autorizada se añada al pool de rotación multi-cuenta.

No hace falta cambiar nada de configuración al pasar de OpenCode v1 a v2.

---

<details open>
<summary><b>Advertencia de Términos de Servicio — Lee antes de instalar</b></summary>

> [!CAUTION]
> Usar este plugin (y cualquier proxy para Antigravity) viola los Términos de Servicio de Google. Varios usuarios han reportado que sus cuentas de Google fueron **baneadas** o **shadow-baneadas** (acceso restringido sin notificación explícita).
>
> **Al usar este plugin, aceptas que:**
> - Es una herramienta no oficial y no está respaldada por Google
> - Tu cuenta puede ser suspendida o baneada de forma permanente
> - Asumes todos los riesgos asociados al uso del plugin
>

</details>

---

## Instalación

### Opción A: Directo desde GitHub (Recomendado)

Añade a `plugins` en `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["github:JoshRob297/opencode-antigravity-auth"]
}
```

> OpenCode v2 clona, compila y actualiza el plugin automáticamente desde el repositorio oficial.

### Opción B: Directorio local (Desarrollo / Sin conexión)

Clona y referencia de forma local:

```bash
git clone https://github.com/JoshRob297/opencode-antigravity-auth.git /path/to/plugin
cd /path/to/plugin && npm install && npm run build
```

Luego, en `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["/path/to/plugin"]
}
```

---

## Inicio rápido (cero configuración en OpenCode v2)

1. **Añade el plugin** a `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugins": ["github:JoshRob297/opencode-antigravity-auth"]
   }
   ```

2. **Autentícate con Google:**

   ```bash
   opencode auth login
   ```
   Selecciona **Google → OAuth with Google (Antigravity)**.
   *(En entornos SSH / headless, el CLI te da automáticamente una URL directa para abrir en tu navegador y pegar el código de verificación).*

3. **Listo para usar.**
   En OpenCode v2, **todos los modelos, variantes y presupuestos de thinking se registran dinámicamente de forma automática**. Puedes ejecutar ya mismo:

   ```bash
   opencode run "Hello" --model=google/antigravity-gemini-3.8-flash --variant=high
   ```

   *(Opcional: puedes ejecutar `/antigravity-setup` dentro de OpenCode en cualquier momento para auto-formatear limpiamente tu `opencode.json` con las whitelists recomendadas).*

---

## Modelos

### Referencia de modelos

| Modelo | Variantes | Descripción |
|---|---|---|
| `antigravity-gemini-3.8-flash` | `low`, `medium`, `high` | **Gemini 3.8 Flash** con niveles de thinking *(Por defecto)* |
| `antigravity-claude-sonnet-4-6` | `low`, `medium`, `high`, `max` | Claude Sonnet 4.6 *(se retira el 2026-11-02)* |
| `antigravity-claude-opus-4-6-thinking` | `low`, `medium`, `high`, `max` | Claude Opus 4.6 con thinking extendido *(se retira el 2026-11-02)* |
| `antigravity-gpt-oss-120b-medium` | `low`, `medium`, `high` | Modelo open-source GPT-OSS 120B |

Las familias nuevas **no** están hardcodeadas. `model_discovery` las registra desde el catálogo de la propia cuenta; medido el 2026-10-31 en una cuenta con grant: `antigravity-gemini-4-argon` (`low`/`medium`/`high`), `antigravity-claude-sonnet-5-5` y `antigravity-claude-opus-5-5`. Los límites salen del backend (Claude 5.5: 1M de contexto / 128k de salida).

---

<details>
<summary><b>Configuración manual de modelos (Opcional / Avanzado)</b></summary>

En OpenCode v2 esto **no es necesario**, porque el plugin registra todos los modelos y variantes automáticamente vía `model.transform`. Sin embargo, si quieres fijar límites de tokens personalizados o sobrescribir nombres de modelo a mano, puedes añadir esto en `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:JoshRob297/opencode-antigravity-auth"],
  "providers": {
    "google": {
      "models": {
        "antigravity-gemini-3.8-flash": {
          "name": "Gemini 3.8 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingLevel": "low" },
            "medium": { "thinkingLevel": "medium" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-claude-sonnet-4-6": {
          "name": "Claude Sonnet 4.6 (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-opus-4-6-thinking": {
          "name": "Claude Opus 4.6 Thinking (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "antigravity-gpt-oss-120b-medium": {
          "name": "GPT-OSS 120B (Antigravity)",
          "limit": { "context": 131072, "output": 8192 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        }
      }
    }
  }
}
```

</details>

---

## Descubrimiento de modelos

El backend de Antigravity reporta qué modelos puede usar cada cuenta. Con `model_discovery` activado, el plugin registra encima del catálogo curado los que son **más nuevos que él**, de modo que un modelo liberado para tu plan queda seleccionable sin esperar una release del plugin:

```json
// ~/.config/opencode/antigravity.json
{
  "model_discovery": true
}
```

- **Si cualquier cuenta del pool tiene Argon o Claude 5.5, aparecen.** Gemini 4 Argon y los sucesores Claude Sonnet/Opus 5.5 siguen la regla forward-only, y el catálogo se toma como la **unión de todas las cuentas**: basta una cuenta con acceso para que la entrada aparezca en el selector. El acceso se concede por cuenta, no por nombre de plan; medido el 2026-10-31, una cuenta que reportaba `free-tier` a `loadCodeAssist` recibió igualmente el grant completo de Argon (`modelVersion: gemini-4-argon-trial` y su propio bucket de cuota `Gemini 4 Argon`). El descubrimiento nunca declara soporte: refleja lo que el backend concede.
- **Una entrada por familia, los tiers como variantes.** El backend expone un id por nivel de pensamiento (`gemini-4-argon-low|medium|high`, `claude-sonnet-5-5-low|medium|high`); el plugin registra un solo modelo (`antigravity-gemini-4-argon`, `antigravity-claude-sonnet-5-5`) con un selector de variantes `low|medium|high` en lugar de tres filas casi idénticas. Los límites salen del backend cuando los declara (Claude 5.5 reporta 1M de contexto y 128k de salida).
- **La rotación respeta el entitlement.** El catálogo de cada cuenta se mide con `fetchAvailableModels` y se cachea en disco, y la selección de cuenta descarta cualquier cuenta que demuestre no tener el modelo pedido: una petición a Argon nunca cae en una cuenta Free/AI Plus que respondería `404 NOT_FOUND`, mientras esa misma cuenta sigue sirviendo **Gemini 3.8 Flash**, que todos los planes tienen. Un `404` que aun así ocurra rota a la siguiente cuenta (acotado a un intento por cuenta) en vez de mostrar el error engañoso de "request preview access".
- **Aviso sobre consumo de cuota en modelos frontier:** Ten en cuenta que utilizar **Gemini 4 Argon** agota las ventanas de 5 horas y semanales de Antigravity notablemente más rápido que los modelos Flash. Utilízalo de forma moderada para decisiones críticas de diseño o problemas difíciles, y mantén **Gemini 3.8 Flash** para el flujo de trabajo continuo.
- **Claude 5.5 trae un monitor de seguridad del lado de la cuenta.** Medido el 2026-10-31: un prompt de agente largo (17k tokens de instrucciones de sistema orientadas a seguridad) recibe `finishReason: SAFETY` con el texto vacío. Argon y Flash sirven ese mismo prompt con normalidad. El plugin ahora convierte ese payload vacío en un mensaje explícito de "bloqueado por los filtros del modelo" en lugar de un error opaco del proveedor.
- **Solo hacia adelante (forward-only).** Todo lo más viejo que los caballos de batalla curados (`gemini-3.8-flash`, Claude 4.6) queda fuera, los ids curados nunca se duplican, y los ids medidos como muertos, retirados, internos o `-disabled` se filtran con una denylist. Un `200` del backend no se toma como prueba de que el modelo sirva.
- **Best-effort.** Si la consulta al catálogo falla, se usa el catálogo curado y el arranque no se ve afectado.

Comportamiento completo, límites y salvedades: [docs/CONFIGURATION.md](docs/CONFIGURATION.md#model-discovery).

---

## Ocultar modelos de Google ajenos

`models.dev` publica un provider `google` con toda la linea Gemini. Como la credencial
OAuth de Antigravity hace que ese provider este disponible, todos esos modelos aparecen
en el selector aunque solo los modelos curados de Antigravity se puedan servir. Con
`hide_foreign_models` activado, el plugin desactiva todo modelo `google` que no forme
parte de su catalogo curado:

```json
// ~/.config/opencode/antigravity.json
{
  "hide_foreign_models": true
}
```

- **Opt-in a proposito.** Si tenes tu propia API key de Google (`GEMINI_API_KEY`), la
  lista completa de `models.dev` es valida, por eso el default es `false`.
- **Se reevalua en cada carga**, asi que un refresco del catalogo ya no puede devolver
  toda la linea Gemini al selector.
- **Fail-open.** Un editor que no puede listar modelos, o cualquier error, deja la lista
  como esta.

---

## Configuración multi-cuenta

Añade varias cuentas de Google para obtener una cuota combinada mayor. El plugin rota automáticamente entre cuentas cuando alguna está limitada.

```bash
opencode auth login  # Ejecútalo otra vez para añadir más cuentas
```

**Opciones de gestión de cuentas (vía `opencode auth login`):**
- **Configure models** — Auto-configura todos los modelos del plugin en opencode.json
- **Check quotas** — Muestra la cuota de API restante de cada cuenta
- **Manage accounts** — Activa/desactiva cuentas concretas para la rotación

Para detalles sobre balanceo de carga, pools de cuota duales y almacenamiento de cuentas, consulta [docs/MULTI-ACCOUNT.md](docs/MULTI-ACCOUNT.md).

---

## Manejo de peticiones, seguridad y feedback

### Niveles de seguridad (`safety_level`)

Por defecto, el plugin replica la línea base de moderación nativa de Google (`medium` / `BLOCK_MEDIUM_AND_ABOVE`) para proteger tus cuentas frente a anomalías de telemetría.

Puedes configurar `safety_level` en `~/.config/opencode/antigravity.json`:

```json
{
  "safety_level": "medium"
}
```

Niveles disponibles:
- `"medium"` (Por defecto) — Filtros de seguridad estándar de Google (`BLOCK_MEDIUM_AND_ABOVE`). Máxima protección de la cuenta.
- `"high"` — Bloquea solo el daño de alta probabilidad (`BLOCK_ONLY_HIGH`). Recomendado para desarrollo intensivo, análisis de vulnerabilidades y depuración.
- `"none"` — Desactiva los clasificadores externos de seguridad (`BLOCK_NONE`) y salta los filtros de inyección de prompt (`HARM_CATEGORY_JAILBREAK`).

> **AVISO:** Poner `safety_level` en `"none"` es estrictamente para investigación de seguridad autorizada y flujos avanzados. Usar `"none"` queda bajo tu exclusiva discreción y riesgo. No aceptamos responsabilidad alguna por revisiones, suspensiones o baneos de cuenta ejecutados por Google.

### Escudo de seguridad OPSEC (`safety_shield`)

Al operar con `safety_level: "none"`, el backend de Google sigue evaluando tus consultas y adjunta probabilidades `safetyRatings` (`NEGLIGIBLE`, `LOW`, `MEDIUM`, `HIGH`) a las respuestas.

El plugin incluye un motor de defensa activa, configurable en `~/.config/opencode/antigravity.json`:

```json
{
  "safety_level": "none",
  "safety_shield": {
    "enabled": true,
    "log_ratings": true,
    "show_toast": true,
    "auto_rotate_threshold": 2
  }
}
```

- **`log_ratings`**: Emite advertencias detalladas en los logs cada vez que Google asigna probabilidad de daño `HIGH` o de jailbreak `MEDIUM` a una respuesta.
- **`show_toast`**: Muestra advertencias OPSEC no bloqueantes en la interfaz de OpenCode (`[OPSEC Shield] Google flagged response: ...`).
- **`auto_rotate_threshold`**: Número de respuestas de alto riesgo consecutivas en una misma cuenta antes de disparar una rotación automática y preventiva a la siguiente cuenta de Google (`Account Shield`). Esto evita que el riesgo se acumule en cuentas personales concretas. Ponlo en `0` para desactivar la rotación automática.

### Manejo conciso de notificaciones
Si una consulta dispara un aviso de moderación del backend, el plugin intercepta la respuesta verbosa (que incluye largos avisos legales, enlaces a políticas y URLs de reporte de bugs) y la reemplaza por un aviso limpio y accionable:

```text
[Solicitud bloqueada por filtros de seguridad de Gemini. Por favor, intenta reformular tu prompt o enfoque.]
```

Esto evita el ruido en el chat, los bloqueos de sesión y las cascadas de errores irrecuperables.

---

## Solución de problemas

> **Reset rápido**: La mayoría de los problemas se resuelven borrando `~/.config/opencode/antigravity-accounts.json` y volviendo a ejecutar `opencode auth login`.

### Ruta de configuración (todas las plataformas)

OpenCode usa `~/.config/opencode/` en **todas las plataformas**, incluido Windows.

| Archivo | Ruta |
|------|------|
| Configuración principal | `~/.config/opencode/opencode.json` |
| Cuentas | `~/.config/opencode/antigravity-accounts.json` |
| Configuración del plugin | `~/.config/opencode/antigravity.json` |
| Logs de depuración | `~/.config/opencode/antigravity-logs/` |

> **Usuarios de Windows**: `~` resuelve a tu directorio de usuario (por ejemplo, `C:\Users\YourName`). NO uses `%APPDATA%`.

> **Ruta personalizada**: Define la variable de entorno `OPENCODE_CONFIG_DIR` para usar una ubicación propia.

> **Migración en Windows**: Si vienes del plugin v1.3.x o anterior, el plugin encontrará automáticamente tu configuración existente en `%APPDATA%\opencode\` y la usará. Las instalaciones nuevas usan `~/.config/opencode/`.

---

### Problemas de autenticación multi-cuenta

Si tienes problemas de autenticación con varias cuentas:

1. Borra el archivo de cuentas:
   ```bash
   rm ~/.config/opencode/antigravity-accounts.json
   ```
2. Vuelve a autenticarte:
   ```bash
   opencode auth login
   ```

---

### 403 Permission Denied (`rising-fact-p41fc`)

**Error:**
```
Permission 'cloudaicompanion.companions.generateChat' denied on resource 
'//cloudaicompanion.googleapis.com/projects/rising-fact-p41fc/locations/global'
```

**Causa:** El plugin recurre a un project ID por defecto cuando no encuentra un proyecto válido. Corregido desde la v1.7.0+ con el descubrimiento automático del `managedProjectId` real de la cuenta.

**Solución:**
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea o selecciona un proyecto
3. Habilita la **Gemini for Google Cloud API** (`cloudaicompanion.googleapis.com`)
4. Añade `projectId` a tu archivo de cuentas:
   ```json
   {
     "accounts": [
       {
         "email": "your@email.com",
         "refreshToken": "...",
         "projectId": "your-project-id"
       }
     ]
   }
   ```

> **Nota**: Hazlo con cada cuenta en una configuración multi-cuenta.

---

### Modelo Gemini no encontrado

Añade esto a la configuración de tu provider `google`:

```jsonc
{
  "providers": {
    "google": {
      "npm": "@ai-sdk/google",
      "models": { ... }
    }
  }
}
```

---

### Error 400 en modelos Gemini 3 ("Unknown name 'parameters'")

**Error:**
```
Invalid JSON payload received. Unknown name "parameters" at 'request.tools[0]'
```

**Causas:**
- Incompatibilidad del esquema de tools con la validación estricta de protobuf de Gemini
- Servidores MCP con esquemas malformados
- Regresión de versión del plugin

**Soluciones:**
1. **Actualiza a la última release de GitHub:**
   ```json
   { "plugins": ["github:JoshRob297/opencode-antigravity-auth"] }
   ```

2. **Desactiva los servidores MCP** uno por uno para encontrar el problemático

3. **Añade un override de npm:**
   ```json
   { "providers": { "google": { "npm": "@ai-sdk/google" } } }
   ```

---

### Servidores MCP que causan errores

Algunos servidores MCP tienen esquemas incompatibles con el formato JSON estricto de Antigravity.

**Síntoma habitual:**
```bash
Invalid function name must start with a letter or underscore
```

A veces aparece así:
```bash
GenerateContentRequest.tools[0].function_declarations[12].name: Invalid function name must start with a letter or underscore
```

Normalmente significa que el nombre de una tool MCP empieza con un número (por ejemplo, una clave de 1mcp como `1mcp_*`). Renombra la clave del MCP para que empiece con una letra (p. ej. `gw`) o desactiva esa entrada MCP para los modelos de Antigravity.

**Diagnóstico:**
1. Desactiva todos los servidores MCP de tu configuración
2. Actívalos uno por uno hasta que reaparezca el error
3. Reporta el MCP concreto en un [issue de GitHub](https://github.com/JoshRob297/opencode-antigravity-auth/issues)

---

### "All Accounts Rate-Limited" (pero hay cuota disponible)

**Causa:** Bug en cascada dentro de `clearExpiredRateLimits()` en modo hybrid (corregido en una beta reciente).

**Soluciones:**
1. Actualiza a la última versión beta
2. Si persiste, borra el archivo de cuentas y vuelve a autenticarte
3. Prueba cambiando `account_selection_strategy` a `"sticky"` en `antigravity.json`

---

### Recuperación de sesión

Si encuentras errores durante una sesión:
1. Escribe `continue` para disparar el mecanismo de recuperación
2. Si está bloqueado, usa `/undo` para volver al estado previo al error
3. Reintenta la operación

---

### Uso con Oh-My-OpenCode

**Importante:** desactiva la autenticación integrada de Google para evitar conflictos:

```jsonc
// ~/.config/opencode/oh-my-opencode.json
{
  "google_auth": false,
  "agents": {
    "frontend-ui-ux-engineer": { "model": "google/antigravity-gemini-3.8-flash" },
    "document-writer": { "model": "google/antigravity-gemini-3.8-flash" }
  }
}
```

---

### Se crean archivos `.tmp` infinitos

**Causa:** cuando la cuenta está limitada y el plugin reintenta infinitamente, genera muchos archivos temporales.

**Solución temporal:**
1. Detén OpenCode
2. Limpia: `rm ~/.config/opencode/*.tmp`
3. Añade más cuentas o espera a que expire el rate limit

---

### Problemas con el callback de OAuth

<details>
<summary><b>El callback de OAuth falla en Safari (macOS)</b></summary>

**Síntomas:**
- "fail to authorize" después de un login correcto en Google
- Safari muestra "Safari can't open the page"

**Causa:** el "HTTPS-Only Mode" de Safari bloquea el callback a `http://localhost`.

**Soluciones:**

1. **Usa Chrome o Firefox** (lo más fácil):
   Copia la URL de OAuth y pégala en otro navegador.

2. **Desactiva temporalmente el HTTPS-Only Mode:**
   - Safari > Settings (⌘,) > Privacy
   - Desmarca "Enable HTTPS-Only Mode"
   - Ejecuta `opencode auth login`
   - Vuelve a activarlo después de autenticarte

</details>

<details>
<summary><b>Conflicto de puerto (Address Already in Use)</b></summary>

**macOS / Linux:**
```bash
# Find process using the port
lsof -i :51121

# Kill if stale
kill -9 <PID>

# Retry
opencode auth login
```

**Windows (PowerShell):**
```powershell
netstat -ano | findstr :51121
taskkill /PID <PID> /F
opencode auth login
```

</details>

<details>
<summary><b>Docker / WSL2 / Desarrollo remoto</b></summary>

El callback de OAuth requiere que el navegador alcance `localhost` en la máquina donde corre OpenCode.

**WSL2:**
- Usa el port forwarding de VS Code, o
- Configura el port forwarding de Windows → WSL

**SSH / Remoto:**
```bash
ssh -L 51121:localhost:51121 user@remote
```

**Docker / Contenedores:**
- El OAuth con redirect a localhost no funciona en contenedores
- Espera 30s al flujo de URL manual, o usa port forwarding por SSH

</details>

---

### Clave de configuración: `plugins` (v2) o `plugin` (v1)

En OpenCode v2, usa la clave nativa en plural:

```json
{
  "plugins": ["github:JoshRob297/opencode-antigravity-auth"]
}
```

OpenCode v1 usa la clave legacy en singular, `"plugin"`. El actualizador detecta ambas automáticamente y respeta la convención que use tu configuración.

---

### Migrar cuentas entre máquinas

Al copiar `antigravity-accounts.json` a una máquina nueva:
1. Asegúrate de que el plugin está instalado en `~/.config/opencode/opencode.json` (`"plugins"` o `"plugin"`)
2. Copia `~/.config/opencode/antigravity-accounts.json`
3. Si obtienes el error "API key missing", el refresh token puede ser inválido: vuelve a autenticarte

## Interacciones conocidas con otros plugins
Para detalles sobre balanceo de carga, pools de cuota duales y almacenamiento de cuentas, consulta [docs/MULTI-ACCOUNT.md](docs/MULTI-ACCOUNT.md).

---

## Compatibilidad de plugins

### @tarquinen/opencode-dcp

DCP crea mensajes de asistente sintéticos que carecen de bloques de thinking. **Lista este plugin ANTES de DCP:**

```json
{
  "plugins": [
    "github:JoshRob297/opencode-antigravity-auth",
    "@tarquinen/opencode-dcp@latest"
  ]
}
```

### oh-my-opencode

Desactiva la autenticación integrada y sobrescribe los modelos de los agentes en `oh-my-opencode.json`:

```json
{
  "google_auth": false,
  "agents": {
    "frontend-ui-ux-engineer": { "model": "google/antigravity-gemini-3.8-flash" },
    "document-writer": { "model": "google/antigravity-gemini-3.8-flash" },
    "multimodal-looker": { "model": "google/antigravity-gemini-3.8-flash" }
  }
}
```

> **Consejo:** al lanzar subagentes en paralelo, activa `pid_offset_enabled: true` en `antigravity.json` para distribuir las sesiones entre cuentas.

### Plugins que no necesitas

- **Plugins de gemini-auth** — No hacen falta. Este plugin cubre todo el OAuth de Google.

---

## Configuración

Crea `~/.config/opencode/antigravity.json` para los ajustes opcionales:

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json"
}
```

La mayoría de usuarios no necesita configurar nada: los valores por defecto funcionan bien.

### Comportamiento de los modelos

| Opción | Por defecto | Qué hace |
|--------|---------|--------------
| `keep_thinking` | `false` | Conserva el thinking de Claude entre turnos. **Advertencia:** activarlo puede degradar la estabilidad del modelo. |
| `session_recovery` | `true` | Auto-recuperación ante errores de tools |

### Rotación de cuentas

| Tu escenario | Configuración recomendada |
|------------|-------------------|
| **1 cuenta** | `"account_selection_strategy": "sticky"` |
| **2-5 cuentas** | El valor por defecto (`"hybrid"`) funciona muy bien |
| **5+ cuentas** | `"account_selection_strategy": "round-robin"` |
| **Agentes en paralelo** | Añade `"pid_offset_enabled": true` |

Todas las estrategias respetan el entitlement: una cuenta cuyo catálogo medido no tiene el modelo pedido se omite para ese modelo, sin importar lo sana o libre que esté.

### Protección de cuota y resiliencia de transporte

| Opción | Por defecto | Qué hace |
|--------|---------|--------------|
| `soft_quota_threshold_percent` | `100` | Omite la cuenta cuando el uso de cuota supera este porcentaje. Por defecto en `100` (desactivado) para evitar bloqueos prematuros cuando el remanente de cuota es bajo. Ponlo en `90` para una protección conservadora contra penalizaciones de Google. |
| `quota_refresh_interval_minutes` | `15` | Intervalo de refresco de cuota en segundo plano. Tras peticiones exitosas a la API, refresca la caché de cuota si es más antigua que este intervalo. Ponlo en `0` para desactivarlo. |
| `soft_quota_cache_ttl_minutes` | `"auto"` | Cuánto tiempo se considera fresca la caché de cuota. `"auto"` = max(2 × intervalo de refresco, 10 minutos). Define un número (1-120) para un TTL fijo. |

> **Cómo funciona**: la caché de cuota se refresca automáticamente tras las peticiones a la API (cuando es más antigua que `quota_refresh_interval_minutes`) y manualmente desde "Check quotas" en `opencode auth login`. La comprobación de umbral usa `soft_quota_cache_ttl_minutes` para determinar la frescura de la caché: si la caché es más antigua, la cuenta se considera "desconocida" y se permite (fail-open). Cuando TODAS las cuentas superan el umbral, el plugin espera al primer reset de cuota disponible (igual que el comportamiento de rate limit). Si el tiempo de espera supera `max_rate_limit_wait_seconds`, falla de inmediato.
>
> **Circuit Breaker de transporte y poda de herramientas (v2.3.0+)**: para prevenir resets TCP de 60 segundos (`ECONNRESET`) generados por outputs colosales de comandos, los resultados de herramientas que superen 30,000 caracteres en turnos históricos (anteriores a los 2 últimos) se truncan automáticamente con un snippet de resumen explicativo. Adicionalmente, un circuit breaker interrumpe los reintentos tras 3 caídas consecutivas de socket en una misma sesión para advertir de la necesidad de compactar contexto.

### Programación de rate limits

Controla cómo gestiona el plugin los rate limits:

| Opción | Por defecto | Qué hace |
|--------|---------|--------------|
| `scheduling_mode` | `"cache_first"` | `"cache_first"` = espera a la misma cuenta (preserva la caché del prompt), `"balance"` = cambia de inmediato, `"performance_first"` = round-robin |
| `max_cache_first_wait_seconds` | `60` | Segundos máximos de espera en modo cache_first antes de cambiar de cuenta |
| `failure_ttl_seconds` | `3600` | Reinicia el contador de fallos después de estos segundos (evita que fallos viejos penalicen a una cuenta de forma permanente) |

**Cuándo usar cada modo:**
- **cache_first** (por defecto): lo mejor para conversaciones largas. Espera a que la misma cuenta se recupere, preservando la caché de tu prompt.
- **balance**: lo mejor para tareas rápidas. Cambia de cuenta de inmediato al recibir un rate limit, para máxima disponibilidad.
- **performance_first**: lo mejor para muchas peticiones cortas. Distribuye la carga de forma uniforme entre todas las cuentas.

### Comportamiento de la app

| Opción | Por defecto | Qué hace |
|--------|---------|--------------|
| `quiet_mode` | `false` | Oculta las notificaciones toast |
| `debug` | `false` | Activa el logging de depuración a archivo (`~/.config/opencode/antigravity-logs/`) |
| `debug_tui` | `false` | Muestra los logs de depuración en el panel de logs de la TUI (independiente de `debug`) |
| `auto_update` | `true` | Auto-actualiza el plugin |

Para todas las opciones, consulta [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

**Variables de entorno:**
```bash
OPENCODE_CONFIG_DIR=/path/to/config opencode  # Custom config directory
OPENCODE_ANTIGRAVITY_DEBUG=1 opencode         # Enable debug file logging
OPENCODE_ANTIGRAVITY_DEBUG=2 opencode         # Verbose debug file logging
OPENCODE_ANTIGRAVITY_DEBUG_TUI=1 opencode     # Enable TUI log panel debug output
```

---

## Solución de problemas

Consulta la [Guía de solución de problemas](docs/TROUBLESHOOTING.md) completa (en inglés) para soluciones a problemas comunes, entre ellos:

- Problemas de autenticación y refresco de tokens
- "Model not found" / `404` en un modelo que tu cuenta no tiene concedido
- Recuperación de sesión
- Errores de permisos de IAM y de proyectos de Google Cloud
- Problemas de OAuth en Safari
- Compatibilidad de plugins
- Guías de migración

---

## Documentación

- [Configuración](docs/CONFIGURATION.es.md) — Todas las opciones de configuración (también en [inglés](docs/CONFIGURATION.md))
- [Multi-cuenta](docs/MULTI-ACCOUNT.es.md) — Balanceo de carga, pools de cuota duales, almacenamiento de cuentas (también en [inglés](docs/MULTI-ACCOUNT.md))
- [Solución de problemas](docs/TROUBLESHOOTING.es.md) — Problemas comunes y soluciones (también en [inglés](docs/TROUBLESHOOTING.md))
- [Model Variants](docs/MODEL-VARIANTS.md) — Presupuestos de thinking y sistema de variantes (solo en inglés)
- [Architecture](docs/ARCHITECTURE.md) — Cómo funciona el plugin (solo en inglés)
- [API Spec](docs/ANTIGRAVITY_API_SPEC.md) — Referencia de la API de Antigravity (solo en inglés)

---

## Créditos y agradecimientos

Este proyecto se apoya sobre los hombros de la comunidad open-source:

- **Autor original**: [NoeFabris](https://github.com/NoeFabris/opencode-antigravity-auth) — Creó el plugin original `opencode-antigravity-auth`.
- **Colaboradores del upstream**:
  - [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) de [@jenslys](https://github.com/jenslys)
  - [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
  - [@dopesalmon](https://x.com/dopesalmon)
- **Mantenedor del revival**: [JoshRob297](https://github.com/JoshRob297) — Mantenimiento desde la v1.7.0+, soporte de Gemini 3.7 Flash y arreglos del IAM 403.

## Licencia

Licencia MIT. Consulta [LICENSE](LICENSE) para más detalles.

<details>
<summary><b>Legal</b></summary>

### Uso previsto

- Solo desarrollo personal / interno
- Respeta las cuotas internas y las políticas de manejo de datos
- No para servicios en producción ni para saltarse límites previstos

### Advertencia

Al usar este plugin, aceptas que:

- **Riesgo de Términos de Servicio** — Este enfoque puede violar los ToS de los proveedores de modelos de IA
- **Riesgo de cuenta** — Los proveedores pueden suspender o banear cuentas
- **Sin garantías** — Las APIs pueden cambiar sin previo aviso
- **Asunción de riesgo** — Asumes todos los riesgos legales, financieros y técnicos

### Descargo de responsabilidad

- No estamos afiliados a Google. Este es un proyecto open-source independiente.
- "Antigravity", "Gemini", "Google Cloud" y "Google" son marcas registradas de Google LLC.

</details>
