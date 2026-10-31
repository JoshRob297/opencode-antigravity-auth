# Configuración

[English](CONFIGURATION.md) | **Español**

> [!NOTE]
> **Documento en español.** El inglés ([CONFIGURATION.md](CONFIGURATION.md)) es la fuente de verdad y se actualiza primero. Esta traducción puede quedar desactualizada; ante cualquier duda, manda el inglés.

Crea `~/.config/opencode/antigravity.json` (o `.opencode/antigravity.json` en la raíz del proyecto):

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json"
}
```

La mayoría de los ajustes tiene valores por defecto sensatos: configura solo lo que necesites.

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

## Inicio rápido

**Configuración mínima (recomendada para la mayoría de usuarios):**

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json"
}
```

**Con la búsqueda web activada:**

El plugin incluye una tool `google_search` que el modelo puede invocar para buscar en la web. No hace falta configurar nada: la tool siempre está disponible.

---

## Comportamiento de los modelos

Ajustes que afectan cómo piensa y responde el modelo.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `keep_thinking` | `false` | Conserva los bloques de thinking de Claude entre turnos. **Advertencia:** activarlo puede degradar la estabilidad del modelo. |
| `session_recovery` | `true` | Auto-recuperación ante errores `tool_result_missing` |
| `auto_resume` | `false` | Envía automáticamente el prompt de reanudación tras la recuperación |
| `resume_text` | `"continue"` | Texto que se envía al reanudar automáticamente |

> **Nota:** Las opciones de configuración `web_search` están obsoletas. La Búsqueda de Google ahora se implementa como una tool dedicada `google_search` que el modelo puede invocar de forma explícita.

### Acerca de `keep_thinking`

Cuando es `true`, los bloques de thinking de Claude se conservan en el historial de la conversación:
- **Ventajas:** el modelo recuerda su razonamiento y es más coherente entre turnos
- **Contras:** puede degradar la estabilidad del modelo y agrandar ligeramente el contexto

Cuando es `false` (por defecto), el thinking se elimina:
- **Ventajas:** comportamiento del modelo más estable y contexto más pequeño
- **Contras:** el modelo puede ser menos coherente y olvida su razonamiento previo

---

## Rotación de cuentas

Ajustes para gestionar varias cuentas de Google.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `account_selection_strategy` | `"hybrid"` | Cómo seleccionar las cuentas |
| `scheduling_mode` | `"balance"` | Política de programación (`"balance"`, `"cache_first"`, `"performance_first"`) |
| `switch_on_first_rate_limit` | `true` | Cambia de cuenta de inmediato al primer 429 |
| `max_all_blocked_wait_seconds` | `120` | Segundos acumulados máximos de reintento cuando todas las cuentas están bloqueadas antes de terminar con fail-fast |
| `max_rate_limit_wait_seconds` | `300` | Espera máxima (en segundos) por un único reset antes de lanzar de inmediato un error de rate limit |
| `pid_offset_enabled` | `false` | Distribuye las sesiones entre cuentas (para agentes en paralelo) |
| `quota_fallback` | `false` | Obsoleto (se ignora). Se conserva por compatibilidad hacia atrás; el fallback de Gemini es automático |

### Guía de estrategias

| Tu escenario | Estrategia recomendada | Por qué |
|------------|---------------------|-----|
| **1 cuenta** | `"sticky"` | No requiere rotación y preserva la caché del prompt |
| **2-3 cuentas** | `"hybrid"` (por defecto) | Rotación inteligente con health scoring |
| **4+ cuentas** | `"round-robin"` | Máximo rendimiento |
| **Agentes en paralelo** | `"round-robin"` + `pid_offset_enabled: true` | Distribuye entre cuentas |

### Estrategias disponibles

| Estrategia | Comportamiento | Ideal para |
|----------|----------|----------|
| `sticky` | La misma cuenta hasta que sus rate limits la limitan | Una sola cuenta, caché del prompt |
| `round-robin` | Rota en cada petición | Máximo rendimiento |
| `hybrid` | Health score + token bucket + LRU | Distribución inteligente (por defecto) |

---

## Descubrimiento de modelos

El backend de Antigravity reporta qué modelos puede usar cada cuenta (`fetchAvailableModels`, la misma llamada que usa la tool de cuota). Con `model_discovery` activado, el plugin registra encima de los 4 modelos curados los que son **más nuevos que el catálogo curado**, tomando la **unión de todas las cuentas habilitadas** del pool.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `model_discovery` | `false` | Registra los modelos del backend más nuevos que el catálogo curado, unión de todas las cuentas habilitadas |

```json
// ~/.config/opencode/antigravity.json
{
  "model_discovery": true
}
```

### Qué aparece

| Id del backend | Catálogo curado | Resultado |
|---|---|---|
| `gemini-3.8-flash-tiered` | tiene `antigravity-gemini-3.8-flash` | omitido (ya está curado) |
| `gemini-4-argon`, `gemini-4-argon-low/medium/high` | ninguno | **registrado** como un solo `antigravity-gemini-4-argon` con variantes `low`/`medium`/`high` |
| `gemini-3.9-flash`, `gemini-5-flash` | ninguno | registrado (estrictamente más nuevo que el piso 3.8) |
| `claude-sonnet-5-5-*`, `claude-opus-5-5-*` | ninguno | registrados como `antigravity-claude-sonnet-5-5` / `antigravity-claude-opus-5-5` con variantes por tier |
| `claude-opus-4-6-thinking`, `claude-sonnet-4-6` | los tiene | omitido (ya está curado) |
| `claude-opus-4-5`, `gemini-3-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-*` | ninguno | omitidos (más viejos que el piso) |
| `gemini-3.6-flash-*`, `gemini-3.1-pro-*`, `gemini-3.5-flash-low`, `gemini-3-flash-agent` | ninguno | omitidos (medidos: `404` o retirados) |
| `chat_*`, `tab_*`, `*-image`, `*-disabled` | ninguno | omitidos (ids internos, salida de imagen, placeholder de entitlement) |

Así que la afirmación práctica es: **actívalo y aparecerá todo lo que tu plan conceda.** Una cuenta con Argon obtiene Argon; una cuenta que solo tiene Gemini 3.8 Flash no obtiene nada extra, que es el estado actual de las cuentas Free / AI Plus.

Los modelos descubiertos se agrupan por familia: una sola entrada en el selector por modelo con variantes `low`/`medium`/`high` en lugar de una fila por tier, y la variante se resuelve al sufijo del id del backend (`gemini-4-argon-medium`, `claude-sonnet-5-5-high`). Los límites salen del backend cuando los declara (medido: Claude 5.5 reporta 1.000.000 de contexto y 128.000 de salida). Se resuelven por la misma ruta de petición que el catálogo curado.

### Salvedades

- **Desactivado por defecto.** Activarlo cambia la lista visible de modelos.
- **El catálogo no es una lista de modelos usables.** Medido en una cuenta de consumidor real: 12 de 25 ids respondieron `200` **y** ejecutaron llamadas a tools pese a tratarse de generaciones más viejas que el cliente oficial de Antigravity no ofrece, y uno (`gemini-3.5-flash`) responde `200` estando decomisionado. Por eso el descubrimiento es solo hacia adelante más una denylist, y por eso un `200` nunca se toma como prueba.
- **Las entradas curadas tienen prioridad** y nunca se duplican: un id descubierto que el catálogo curado ya registra se omite.
- **El entitlement es por cuenta, no por nombre de plan.** Medido el 2026-10-31: una cuenta que `loadCodeAssist` reporta como `free-tier` recibió el grant completo de Argon (`modelVersion: gemini-4-argon-trial` y su propio bucket semanal `Gemini 4 Argon`), mientras otras dos solo recibieron el placeholder `gemini-4-argon-disabled`. El descubrimiento no crea entitlements, solo los refleja.
- **La rotación respeta el entitlement.** El catálogo de cada cuenta se guarda en `antigravity-accounts.json` (`modelCatalog`) y la selección de cuenta descarta las que demuestran no tener el modelo pedido. Argon solo va a la cuenta que lo tiene; `gemini-3.8-flash` sigue usando todas. Un `404` que ocurra igualmente rota a la siguiente cuenta (un intento por cuenta) en vez de mostrar "request preview access".
- **Aplica al registro de modelos de OpenCode v2.** La v1 registra los modelos desde `opencode.json` y se mantiene curada.
- El catálogo se lee como unión de todas las cuentas al arranque; agregar o habilitar una cuenta requiere reiniciar para volver a descubrir.
- **Claude 4.6 y GPT-OSS 120B se eliminan el 2026-11-02.** En la cuenta con el grant nuevo, `claude-sonnet-4-6` ya responde `200` con un aviso de retiro en vez de contenido, mientras las cuentas Free todavía lo sirven. El descubrimiento es solo hacia adelante para Gemini **y** Claude, así que los sucesores 5.5 se registran automáticamente en las cuentas que los tienen. Un mantenedor todavía debe podar las entradas muertas `claude-*-4-6` cuando pase la fecha; GPT-OSS no tiene sucesor que descubrir.

---

## Reporte de cuota

`antigravity_quota` (y el comando `/antigravity-quota`) reportan la forma por cuenta que el backend devuelve ahora:

- **Una tabla por familia de modelos**: `Gemini Models (Flash / Pro)`, `Claude & GPT Models (Opus / Sonnet / GPT-OSS)` y `Gemini 4 Argon`, que tiene su propio bucket semanal (`gemini-argon-wtu-weekly`) y no se mezcla con la tabla de Gemini.
- **Ambas ventanas** (5h y semanal) con su barra, y solo las ventanas que esa familia realmente tiene; Argon imprime únicamente la columna semanal.
- **Cuenta regresiva corta por ventana** (`3h 54m`, `6d 22h`), tomada del timestamp que declara el backend. Sin la fecha y hora completa que solo agregaba ruido.
- **`USABLE` en lugar de un health estático**: la cuenta aparece como `no · <cuenta regresiva>` mientras cualquier ventana de esa familia esté en `0%`, porque una barra de 5h con cuota no sirve si el bucket semanal está vacío. Solo las cuentas que realmente pueden servir esa familia muestran `yes`.
- **Capacidades por cuenta (medidas)**: cuántos modelos alcanza cada cuenta, si tiene Gemini 4 Argon (con su porcentaje restante y su cuenta regresiva al reset), **Claude 4.6 y Claude 5.5 por separado**, y si `gemini-3.8-flash` está disponible. La cuota de Claude es de la familia, así que una cuenta Free puede tener cuota de Claude y no tener 5.5: medido el 2026-10-31, `claude-sonnet-4-6` responde `200` en ambas cuentas Free mientras `claude-sonnet-5-5-medium` responde `404`. Las cuentas que nunca se midieron dicen `not measured` en lugar de adivinar.

```
## Gemini 4 Argon (own weekly bucket)
QUOTA (weekly)    RESET (weekly) USABLE          ACCOUNT
[██████████] 99%  6d 22h         yes             joshuaadair.hr

## Gemini Models (Flash / Pro)
QUOTA (5h)        RESET (5h)     QUOTA (weekly)    RESET (weekly) USABLE          ACCOUNT
[██████████] 99%  3h 53m         [██████████] 99%  6d 22h         yes             joshuaadair.hr
[██████████] 100% 3h 38m         [░░░░░░░░░░] 0%   11h 59m        no · 11h 59m    hrjoces22

## Account capabilities (measured)
ACCOUNT               MODELS  GEMINI 4 ARGON      CLAUDE 4.6  CLAUDE 5.5  GEMINI 3.8 FLASH
hrjoces22             19      no                  yes         no          yes
joshuaadair.hr        26      yes 99% · 6d 22h    no          yes         yes
```

---

## Comportamiento de la app

Ajustes que controlan el comportamiento del plugin.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `quiet_mode` | `false` | Oculta las notificaciones toast (excepto las de recuperación) |
| `debug` | `false` | Activa el logging de depuración |
| `log_dir` | Por defecto del SO | Directorio personalizado para los logs de depuración |
| `auto_update` | `true` | Activa las actualizaciones automáticas del plugin |

### Logging de depuración

```json
{
  "debug": true,
  "debug_tui": true
}
```

Los logs se escriben en `~/.config/opencode/antigravity-logs/` (o en `log_dir` si está definido).

---

## Configuraciones recomendadas

Configuraciones listas para copiar y pegar con los ajustes recomendados ya aplicados.

### 1 cuenta

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json",
  "account_selection_strategy": "sticky"
}
```

**Por qué estos ajustes:**
- `sticky` — No requiere rotación y preserva la caché de prompt de Anthropic

### 2-3 cuentas

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json",
  "account_selection_strategy": "hybrid"
}
```

**Por qué estos ajustes:**
- `hybrid` — Rotación inteligente usando health scores, evita cuentas malas

### 3+ cuentas (usuarios avanzados / agentes en paralelo)

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json",
  "account_selection_strategy": "round-robin",
  "switch_on_first_rate_limit": true,
  "pid_offset_enabled": true
}
```

**Por qué estos ajustes:**
- `round-robin` — Máximo rendimiento, rota en cada petición
- `switch_on_first_rate_limit` — Cambia de inmediato ante un 429 (por defecto: true)
- `pid_offset_enabled` — Cada sesión usa una cuenta inicial distinta

---

## Qué está activado por defecto

Estos ajustes ya son `true` por defecto: no hace falta definirlos:

| Ajuste | Por defecto | Qué hace |
|---------|---------|--------------|
| `session_recovery` | `true` | Auto-recuperación ante errores |
| `auto_update` | `true` | Mantiene el plugin actualizado |
| `switch_on_first_rate_limit` | `true` | Cambio rápido de cuenta |

Estos ajustes son `false` por defecto:

| Ajuste | Por defecto | Qué hace |
|---------|---------|--------------|
| `keep_thinking` | `false` | Conserva el thinking de Claude (puede degradar la estabilidad) |
| `auto_resume` | `false` | Continúa automáticamente tras la recuperación |

---

## Ajustes avanzados

> Estos ajustes son para casos límite. La mayoría de usuarios no necesita cambiarlos.

<details>
<summary><b>Recuperación de errores (interno)</b></summary>

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `empty_response_max_attempts` | `4` | Reintentos ante respuestas vacías de la API |
| `empty_response_retry_delay_ms` | `2000` | Retardo entre reintentos |
| `tool_id_recovery` | `true` | Corrige ids de tools desajustados por la compactación de contexto |
| `claude_tool_hardening` | `true` | Evita la alucinación de parámetros de tools |
| `max_rate_limit_wait_seconds` | `300` | Tiempo máximo de espera con rate limit (0 = ilimitado) |

</details>

<details>
<summary><b>Gestión de tokens (interno)</b></summary>

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `proactive_token_refresh` | `true` | Refresca los tokens antes de que expiren |
| `proactive_refresh_buffer_seconds` | `1800` | Refresca 30 min antes de la expiración |
| `proactive_refresh_check_interval_seconds` | `300` | Intervalo de comprobación |

</details>

<details>
<summary><b>Caché de firmas (interno)</b></summary>

Se usa cuando `keep_thinking: true`. La mayoría de usuarios no necesita configurarlo.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `signature_cache.enabled` | `true` | Activa la caché en disco |
| `signature_cache.memory_ttl_seconds` | `3600` | TTL de la caché en memoria (1 hora) |
| `signature_cache.disk_ttl_seconds` | `172800` | TTL de la caché en disco (48 horas) |
| `signature_cache.write_interval_seconds` | `60` | Intervalo de escritura en segundo plano |

</details>

<details>
<summary><b>Ajuste del health score (interno)</b></summary>

Lo usa la estrategia `hybrid`. La mayoría de usuarios no necesita configurarlo.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `health_score.initial` | `70` | Health score inicial |
| `health_score.success_reward` | `1` | Puntos que se suman en caso de éxito |
| `health_score.rate_limit_penalty` | `-10` | Puntos que se restan por rate limit |
| `health_score.failure_penalty` | `-20` | Puntos que se restan por fallo |
| `health_score.recovery_rate_per_hour` | `2` | Puntos que se recuperan por hora |
| `health_score.min_usable` | `50` | Puntuación mínima para usar la cuenta |
| `health_score.max_score` | `100` | Health score máximo |

</details>

<details>
<summary><b>Ajuste del token bucket (interno)</b></summary>

Lo usa la estrategia `hybrid`. La mayoría de usuarios no necesita configurarlo.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `token_bucket.max_tokens` | `50` | Tokens máximos en el bucket |
| `token_bucket.regeneration_rate_per_minute` | `6` | Tokens que se regeneran por minuto |
| `token_bucket.initial_tokens` | `50` | Tokens iniciales |

</details>
