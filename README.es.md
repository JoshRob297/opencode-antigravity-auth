# Plugin de OAuth de Antigravity para OpenCode (Edición Revivida y Extendida)

[English](README.md) | **Español**

> [!NOTE]
> **README en español.** El inglés ([README.md](README.md)) es la fuente de verdad y se actualiza primero. Esta traducción puede quedar desactualizada respecto de la versión en inglés; ante cualquier duda, manda el inglés.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml)

> [!NOTE]
> **Revival comunitario y edición extendida**: Este repositorio es una continuación activa y de código abierto del proyecto archivado de [NoeFabris](https://github.com/NoeFabris/opencode-antigravity-auth) (y del trabajo previo de [@jenslys](https://github.com/jenslys) y [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)). Corrige bugs críticos del upstream y desbloquea los modelos más nuevos de Google Antigravity.

> [!IMPORTANT]
> **Estado del proyecto (octubre de 2026) - mantenimiento en pausa.**
> Después de un uso extenso en condiciones reales, pausamos el trabajo nuevo en el plugin hasta que Google lance un modelo que realmente valga la pena pagar:
> - **Gemini 4 ("Argon") está disponible en planes de pago, y el plugin ya no necesita una release para soportarlo.** Desde el **2026-10-13** Argon se despliega en la Antigravity App, la Antigravity CLI y las extensiones de IDE (no en el IDE standalone) para **Google AI Pro (de pago, no trial), Ultra y Enterprise**. Nuestras propias cuentas están en el tier **Free / AI Plus**, así que no podemos verificarlo de punta a punta; pero con [`model_discovery`](#descubrimiento-de-modelos) activado, cualquier modelo más nuevo se registra automáticamente en cualquier cuenta que lo tenga, de modo que no hace falta cambiar el plugin para poder seleccionar Argon.
> - **Pagar por Argon sigue sin valer la pena aquí.** Argon no ha demostrado el valor que Google promete: en trabajo real de repositorio no reproducimos una ganancia de calidad sobre el caballo de batalla actual que justifique un precio de tier frontier, y pagar el tier tampoco arreglaría el backend de Antigravity, que sigue tratando la cuenta como `free-tier`.
> - **Caballo de batalla diario recomendado: Gemini 3.8 Flash.** Es el único modelo Gemini que queda en planes de consumidor, es muy rápido generando código y es gratis en el margen con credenciales de Antigravity. Úsalo para trabajo de alto volumen y bajo riesgo, y escala a un modelo frontier (por ejemplo **DeepSeek**) cuando la calidad de salida sea la restricción real.
> - **Matriz de planes (2026-10-18):** Argon y Claude Sonnet/Opus **5.5** requieren Google AI Pro **de pago**, Ultra o Enterprise. **Gemini 3.7 Flash, 3.6 Flash y 3.1 Pro son exclusivos de Enterprise.** Los planes de consumidor conservan **Gemini 3.8 Flash**, **Claude Sonnet/Opus 4.6** y **GPT-OSS 120B**, y estos dos últimos están programados para eliminarse el **2026-11-02** en **todos** los planes, incluido Ultra.
> - El backend de Antigravity sigue siendo poco fiable para planes de pago: el tier se reconoce (`paidTier = g1-pro-tier`) pero no se aplica (`currentTier = free-tier`).
>
> El descubrimiento de modelos se reconsiderará solo cuando cambie algo de esto: (a) haya una cuenta con entitlement disponible para verificación de punta a punta, (b) Argon muestre una ventaja medible sobre el caballo de batalla actual en tareas reales de repositorio, o (c) vuelva a hacer falta un curador porque el catálogo del backend no sea confiable.
>
> El plugin sigue funcionando tal como está (fija una release que sepas que funciona). El mantenimiento se reanuda cuando Google ofrezca algo que valga la pena pagar de verdad.

---

### Novedades y cambios de este fork (v2.0.0)

> *Notas de release de la línea v2.0.0.* La disponibilidad de modelos descrita abajo refleja el estado en ese momento. Desde el **2026-10-13**, **Gemini 3.7 Flash, 3.6 Flash y 3.1 Pro son exclusivos de Ultra / Enterprise** y fueron podados del catálogo de consumidor en la **v2.0.4**; consulta [Modelos](#modelos) para el catálogo actual y la nota de estado del proyecto de arriba para la decisión sobre Argon.

- **Motor nativo de OpenCode v2 y registro de variantes**: Totalmente actualizado para OpenCode v2 (`@opencode/cli` 2.0+). Registra todos los modelos con `variants` explícitas (`low`, `medium`, `high`, `max`) y `status: active`, evitando `VariantUnavailableError`.
- **Nuevas estadísticas del motor en tiempo real (`/antigravity-stats` y `antigravity_stats`)**: Panel de diagnóstico local instantáneo que reporta la distribución de peticiones por cuenta (OK / 429 / Errores), el health score en vivo, el estado de rotación activo y la tasa de aciertos de la caché de firmas de thinking (sin latencia de red externa).
- **Métrica de salud integrada en `/antigravity-quota`**: Columna `HEALTH` compacta dentro de las tablas de cuota para inspección inmediata del estado de las cuentas.
- **Estadísticas persistentes del motor (`antigravity-stats.json`)**: Conserva los health scores y los contadores de uso a través de reinicios del daemon/servicio en `~/.config/opencode/antigravity-stats.json` (auto-ignorado por git).
- **Arquitectura de doble compatibilidad con OpenCode v2**: Totalmente compatible con OpenCode v1 (`opencode-ai` 1.18.x) y con OpenCode v2 (`@opencode/cli` 2.0+). Usa un entrypoint polimórfico que exporta una factory invocable estándar de v1 y a la vez expone los métodos nativos de v2 `.id` y de ciclo de vida `.setup(context)`.
- **Registros nativos de tools y comandos en v2**: Despacha `antigravity_quota`, `antigravity_stats`, `google_search` y el comando de barra `/antigravity-quota` de forma nativa mediante los domain transforms de OpenCode v2 (`context.tool.transform` y `context.command.transform`).
- **Sanitización estricta de esquemas de tools (fix HTTP 400 `property is not defined`)**: La Cloud Code API respaldada por Protobuf rechaza llamadas a tools cuando los arrays `required` del esquema contienen propiedades no declaradas en `properties`. El normalizador limpia recursivamente los esquemas de parámetros, poda las claves `required` huérfanas y aplica validación sobre las `functionDeclarations` preempaquetadas.
- **Nuevo modelo: `antigravity-gpt-oss-120b-medium`**: Integra el modelo open-source nativo de 120B de Antigravity en `OPENCODE_MODEL_DEFINITIONS` con ventana de contexto de 131k y soporte de enrutamiento multi-cuenta.
- **Paridad con la firma del Antigravity CLI oficial**: Sincroniza los headers de firma de cliente y el User-Agent a `antigravity/cli/<version> (aidev_client; os_type=linux; arch=amd64; cl=962369648; auth_method=consumer)`, igualando la última release del binario de Google Antigravity. En su momento la firma estaba fijada en `1.2.7`; ahora se resuelve al arranque desde el endpoint del auto-updater del CLI (ver [docs/ANTIGRAVITY_API_SPEC.md](docs/ANTIGRAVITY_API_SPEC.md#client-signature-cli-user-agent)).
- **Escudo de seguridad OPSEC y telemetría (`safety_shield`)**: Intercepta los `safetyRatings` de Google Gemini en tiempo real. Emite advertencias en la UI ante clasificaciones de alto riesgo y ejecuta automáticamente una **rotación preventiva de cuenta** (`Account Shield`) tras disparos consecutivos, para dispersar la telemetría sospechosa entre tu pool de cuentas.
- **Eliminación del header `x-goog-api-key` (fix 400 `API_KEY_INVALID`)**: OpenCode inyecta automáticamente una clave de AI Studio en `x-goog-api-key` al interceptar llamadas a `generativelanguage.googleapis.com`. El backend de Antigravity priorizaba ese header por encima de la autenticación `Bearer` y devolvía `400 API_KEY_INVALID`. Ahora el header se elimina junto con `x-api-key`.
- **Modo legacy `gemini-cli` eliminado (fix definitivo del 403 `#3501`)**: Se eliminaron por completo los headers legacy de VS Code y los fallbacks de modelos `-preview`. Todas las peticiones se enrutan limpiamente con las firmas oficiales del Antigravity CLI (`aidev_client`), eliminando los falsos errores de licencia en todas las cuentas.
- **Ajustes de seguridad configurables (`safety_level`)**: Usa por defecto la línea base de moderación nativa de Google (`medium` / `BLOCK_MEDIUM_AND_ABOVE`) para proteger las cuentas, con opciones configurables para `high` y `none` (con advertencia explícita).
- **Corregido el 403 `#3501` (`SUBSCRIPTION_REQUIRED`) en Flash**: Se eliminó de los fallbacks el endpoint de sandbox `autopush`, ya decomisionado, para que todas las peticiones se enruten limpiamente a los endpoints activos `daily` y `prod`.
- **Gemini 3.5 Flash obsoleto, eliminado**: Se quitó por completo `antigravity-gemini-3.5-flash` tras la baja del backend de Google, conservando solo los modelos activos (Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.1 Pro y Claude 4.6).
- **Whitelisting de modelos en instalación limpia**: Inyecta automáticamente un `provider.google.whitelist` estricto en `opencode.json` durante una configuración limpia, ocultando más de 18 modelos integrados de Google AI Studio/Vertex sin autenticar del selector de modelos de OpenCode.
- **Auto-recuperación en vuelo del 403 `#3501` (`SUBSCRIPTION_REQUIRED`)**: Intercepta los fallos de resolución de proyecto y aprovisiona/vincula de inmediato el proyecto companion mediante `onboardManagedProject`, sin romper la sesión activa del agente.
- **Comandos de auto-actualización**: Incluye el comando de barra `/antigravity-update` y el actualizador de CLI (`antigravity-update`) para actualizar el plugin con un solo clic.

| Mejora | Qué estaba roto en el upstream | Cómo lo corrige este fork |
|---|---|---|
| **Aprovisionamiento automático de comandos de barra** | Comandos de barra como `/antigravity-quota` y `/antigravity-update` requerían copiar archivos a mano en `~/.config/opencode/command/`. | El plugin ahora aprovisiona automáticamente `antigravity-quota.md` y `antigravity-update.md` al arranque y al actualizar la configuración. |
| **Soporte de Gemini 3.8 Flash** | El backend restringía el modelo más nuevo, `gemini-3.8-flash`, a firmas oficiales del CLI. | Se añadió `resolveAntigravityGemini38FlashBackendModel` (→ `gemini-3.8-flash-{low,medium,high}`) y se extendió la regex de suplantación del User-Agent del CLI a `/gemini-3\.[78]-flash/i`, desbloqueando **Gemini 3.8 Flash (Low/Medium/High)**. |
| **Sanitización de turnos de modelo colgantes** | Tools interrumpidas o sesiones abortadas hacían que Gemini rechazara peticiones con `400 "Requests ending with a model turn are not supported"`. | Se añadió el pipeline automático `sanitizeEndingModelTurn` para payloads de Gemini más recuperación por reintento con descarte forzado (`MODEL_TURN_RECOVERY_NEEDED`). |
| **Normalización de peticiones y feedback limpio** | Los filtros por defecto provocaban bloqueos falsos positivos en prompts de programación y técnicos, con avisos legales extensos. | Se estandarizaron las configuraciones de payload para tareas de desarrollo y se añadió un manejo conciso de notificaciones en una sola línea. |
| **Salidas de cuota guiadas por datos del servidor** | El agotamiento de cuota reintentaba a ciegas con contadores de backoff incluso cuando el servidor indicaba horas de espera. | Captura `metadata.quotaResetTimeStamp` / `quotaResetDelay` de los errores RPC de Google, guarda los timestamps exactos de reset futuros y aplica `max_all_blocked_wait_seconds` (120s por defecto) con sugerencias claras de cambio de modelo. |
| **Tool nativa de cuota de doble ventana** | La cuota requería un plugin externo aparte o devolvía listas planas de modelos. | Se incrustó la tool oficial `antigravity_quota` directamente en el plugin de auth, con seguimiento completo de **Ventana de 5h + Ventana semanal** y barras de progreso vía `/v1internal:retrieveUserQuotaSummary`. |
| **Soporte de Gemini 3.7 Flash** | El backend devolvía `404 NOT_FOUND` (reescrito como *"enable preview access"* o `429`) al invocar `gemini-3.7-flash`. | Se descubrió que Google restringe 3.7 Flash estrictamente a las firmas del CLI oficial. El plugin ahora presenta dinámicamente la firma del cliente del Antigravity CLI oficial (`antigravity/cli/...`), desbloqueando acceso nativo completo a **Gemini 3.7 Flash (Low/Medium/High)**. |
| **Failover multi-cuenta rápido** | Al agotarse la cuota, el plugin se quedaba girando sobre la misma cuenta (backoffs de 60s+). | El modo de scheduling por defecto pasó a `balance`, con failover inmediato ante `QUOTA_EXHAUSTED` (500ms) a la siguiente cuenta con cuota. |
| **Auto-recuperación de IAM 403 / #3501** | Las peticiones fallaban con `403 IAM_PERMISSION_DENIED` o `SUBSCRIPTION_REQUIRED` (#3501) en cuentas nuevas o sin aprovisionar. | Descubrimiento automático del proyecto companion más auto-recuperación en vuelo con `onboardManagedProject`. Se corrigió `metadata.platform` a `PLATFORM_UNSPECIFIED`. |
| **Gemini 3.6 Flash y baja de 3.5** | Resolución nativa multi-tier del modelo en el backend (`gemini-3.6-flash-{low,medium,high}`). Se eliminó Gemini 3.5 Flash, ya obsoleto. | Soporte de resolución de thinking multi-tier integrado en `model-resolver.ts`; retirada limpia del 3.5 obsoleto. |
| **CI limpio y estándares de comunidad** | El upstream tenía actions de publicación npm rotas y ninguna ruleset. | Reemplazado por un CI de Node.js limpio y automatizado con **1.056 tests pasando**, políticas de seguridad y grupos de Dependabot. |

---

Permite que OpenCode se autentique contra **Antigravity** (el IDE de Google) vía OAuth, para que puedas usar los límites de tasa de Antigravity y acceder a modelos como `gemini-3.8-flash`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking` y `gpt-oss-120b` con tus credenciales de Google.

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
| `antigravity-claude-sonnet-4-6` | `low`, `medium`, `high`, `max` | Claude Sonnet 4.6 |
| `antigravity-claude-opus-4-6-thinking` | `low`, `medium`, `high`, `max` | Claude Opus 4.6 con thinking extendido |
| `antigravity-gpt-oss-120b-medium` | `low`, `medium`, `high` | Modelo open-source GPT-OSS 120B |

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

- **Si tu cuenta tiene Argon o Claude 5.5, aparecen.** Gemini 4 Argon (`gemini-4-argon`, `-low`, `-medium`, `-high`) y los sucesores Claude Sonnet/Opus 5.5 siguen la regla forward-only, así que una cuenta AI Pro / Ultra / Enterprise para la que el backend los liste obtiene la entrada en el selector automáticamente; esto importa el **2026-11-02**, cuando Claude 4.6 y GPT-OSS 120B se eliminan en todos los planes. El descubrimiento nunca declara soporte: refleja lo que el backend le concede a esa cuenta.
- **Solo hacia adelante (forward-only).** Todo lo más viejo que los caballos de batalla curados (`gemini-3.8-flash`, Claude 4.6) queda fuera, los ids curados nunca se duplican, y los ids medidos como muertos, retirados o internos se filtran con una denylist. Un `200` del backend no se toma como prueba de que el modelo sirva.
- **Best-effort.** Si la consulta al catálogo falla, se usa el catálogo curado y el arranque no se ve afectado.

Comportamiento completo, límites y salvedades: [docs/CONFIGURATION.md](docs/CONFIGURATION.md#model-discovery).

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

### Protección de cuota

| Opción | Por defecto | Qué hace |
|--------|---------|--------------|
| `soft_quota_threshold_percent` | `90` | Omite la cuenta cuando el uso de cuota supera este porcentaje. Evita que Google penalice a cuentas que agotan la cuota por completo. Ponlo en `100` para desactivarlo. |
| `quota_refresh_interval_minutes` | `15` | Intervalo de refresco de cuota en segundo plano. Tras peticiones exitosas a la API, refresca la caché de cuota si es más antigua que este intervalo. Ponlo en `0` para desactivarlo. |
| `soft_quota_cache_ttl_minutes` | `"auto"` | Cuánto tiempo se considera fresca la caché de cuota. `"auto"` = max(2 × intervalo de refresco, 10 minutos). Define un número (1-120) para un TTL fijo. |

> **Cómo funciona**: la caché de cuota se refresca automáticamente tras las peticiones a la API (cuando es más antigua que `quota_refresh_interval_minutes`) y manualmente desde "Check quotas" en `opencode auth login`. La comprobación de umbral usa `soft_quota_cache_ttl_minutes` para determinar la frescura de la caché: si la caché es más antigua, la cuenta se considera "desconocida" y se permite (fail-open). Cuando TODAS las cuentas superan el umbral, el plugin espera al primer reset de cuota disponible (igual que el comportamiento de rate limit). Si el tiempo de espera supera `max_rate_limit_wait_seconds`, falla de inmediato.

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
- Errores "Model not found"
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
