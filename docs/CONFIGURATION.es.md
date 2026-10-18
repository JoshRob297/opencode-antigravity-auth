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

El backend de Antigravity reporta qué modelos puede usar cada cuenta (`fetchAvailableModels`, la misma llamada que usa la tool de cuota). Con `model_discovery` activado, el plugin registra encima de los 4 modelos curados los que son **más nuevos que el catálogo curado**.

| Opción | Por defecto | Descripción |
|--------|---------|-------------|
| `model_discovery` | `false` | Registra los modelos del backend más nuevos que el catálogo curado para la cuenta activa |

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
| `gemini-4-argon`, `gemini-4-argon-low/medium/high` | ninguno | **registrado** como `antigravity-gemini-4-argon`, `...-low`, `...-medium`, `...-high` |
| `gemini-3.9-flash`, `gemini-5-flash` | ninguno | registrado (estrictamente más nuevo que el piso 3.8) |
| `claude-sonnet-5-5`, `claude-opus-5-5-max` | ninguno | registrado (estrictamente más nuevo que el piso curado 4.6) |
| `claude-opus-4-6-thinking`, `claude-sonnet-4-6` | los tiene | omitido (ya está curado) |
| `claude-opus-4-5`, `gemini-3-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-*` | ninguno | omitidos (más viejos que el piso) |
| `gemini-3.6-flash-*`, `gemini-3.1-pro-*`, `gemini-3.5-flash-low`, `gemini-3-flash-agent` | ninguno | omitidos (medidos: `404` o retirados) |
| `chat_*`, `tab_*`, `*-image` | ninguno | omitidos (ids internos y salida de imagen) |

Así que la afirmación práctica es: **actívalo y aparecerá todo lo que tu plan conceda.** Una cuenta con Argon obtiene Argon; una cuenta que solo tiene Gemini 3.8 Flash no obtiene nada extra, que es el estado actual de las cuentas Free / AI Plus.

Los modelos descubiertos se registran con variantes de thinking low/medium/high (los modelos Claude con thinking reciben variantes de presupuesto) y límites del tamaño de Gemini, y se resuelven por la misma ruta de petición que el catálogo curado.

### Salvedades

- **Desactivado por defecto.** Activarlo cambia la lista visible de modelos.
- **El catálogo no es una lista de modelos usables.** Medido en una cuenta de consumidor real: 12 de 25 ids respondieron `200` **y** ejecutaron llamadas a tools pese a tratarse de generaciones más viejas que el cliente oficial de Antigravity no ofrece, y uno (`gemini-3.5-flash`) responde `200` estando decomisionado. Por eso el descubrimiento es solo hacia adelante más una denylist, y por eso un `200` nunca se toma como prueba.
- **Las entradas curadas tienen prioridad** y nunca se duplican: un id descubierto que el catálogo curado ya registra se omite.
- **Lo restringe el plan de Google, no el plugin.** Argon y Claude 5.5 requieren Google AI Pro de pago, Ultra o Enterprise; el descubrimiento no puede crear un entitlement, solo reflejarlo.
- **Aplica al registro de modelos de OpenCode v2.** La v1 registra los modelos desde `opencode.json` y se mantiene curada.
- El catálogo se lee para la cuenta **activa** al arranque; cambiar de cuenta requiere reiniciar para volver a descubrir.
- **Claude 4.6 y GPT-OSS 120B se eliminan el 2026-11-02** en todos los planes. El descubrimiento es solo hacia adelante para Gemini **y** Claude, así que una cuenta con entitlement a los sucesores de Claude (Sonnet/Opus 5.5, en AI Pro / Ultra / Enterprise de pago) los obtiene registrados automáticamente. Quedan dos cosas que un mantenedor debe atender: las entradas muertas `claude-*-4-6` deben podarse del catálogo curado, y GPT-OSS no tiene sucesor que descubrir.

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
