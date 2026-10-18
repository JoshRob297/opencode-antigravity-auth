# Solución de problemas

[English](TROUBLESHOOTING.md) | **Español**

> [!NOTE]
> **Documento en español.** El inglés ([TROUBLESHOOTING.md](TROUBLESHOOTING.md)) es la fuente de verdad y se actualiza primero. Esta traducción puede quedar desactualizada; ante cualquier duda, manda el inglés.

Soluciones a los problemas más comunes del plugin Antigravity Auth.

> **Reset rápido**: la mayoría de los problemas se resuelven borrando `~/.config/opencode/antigravity-accounts.json` y volviendo a ejecutar `opencode auth login`.

---

## Rutas de configuración (todas las plataformas)

OpenCode usa `~/.config/opencode/` en **todas las plataformas**, incluido Windows.

| Archivo | Ruta |
|------|------|
| Configuración principal | `~/.config/opencode/opencode.json` |
| Cuentas | `~/.config/opencode/antigravity-accounts.json` |
| Configuración del plugin | `~/.config/opencode/antigravity.json` |
| Logs de depuración | `~/.config/opencode/antigravity-logs/` |

> **Usuarios de Windows**: `~` resuelve a tu directorio de usuario (por ejemplo, `C:\Users\YourName`). NO uses `%APPDATA%`.

---

## Arreglos rápidos

### Problemas de autenticación
Borra el archivo de cuentas y vuelve a autenticarte:
```bash
rm ~/.config/opencode/antigravity-accounts.json
opencode auth login
```

### "This version of Antigravity is no longer supported"
Esto casi siempre significa que todavía se está usando un `User-Agent` de Antigravity obsoleto.

1) Detén cualquier proceso de OpenCode en ejecución (los procesos zombis pueden sobrescribir tu archivo de cuentas):

**macOS/Linux:**
```bash
pkill -f opencode || true
```

**Windows (PowerShell):**
```powershell
Stop-Process -Name "opencode" -Force -ErrorAction SilentlyContinue
```

2) Limpia las cachés del plugin y vuelve a autenticarte:

**macOS/Linux:**
```bash
rm -f ~/.config/opencode/antigravity-accounts.json
rm -rf ~/.cache/opencode/node_modules/opencode-antigravity-auth
rm -rf ~/.bun/install/cache/opencode-antigravity-auth*
opencode auth login
```

**Windows (PowerShell):**
```powershell
Remove-Item "$env:APPDATA\opencode\antigravity-accounts.json" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\opencode\Cache\node_modules\opencode-antigravity-auth" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:USERPROFILE\.bun\install\cache\opencode-antigravity-auth*" -Recurse -Force -ErrorAction SilentlyContinue
opencode auth login
```

### "Model not found"
Añade esto a la configuración de tu provider `google`:
```json
"npm": "@ai-sdk/google"
```

### Errores de sesión
Escribe `continue` para disparar la auto-recuperación, o usa `/undo` para revertir.

### Clave de configuración: `plugins` (v2) o `plugin` (v1)

En OpenCode v2, usa la clave nativa en plural:

```json
{
  "plugins": ["github:JoshRob297/opencode-antigravity-auth"]
}
```

En OpenCode v1, usa la clave legacy en singular `"plugin"`. El actualizador del plugin y el verificador de auto-actualización soportan ambas de forma transparente.

### "Invalid SemVer: beta"

**Error:**
```
Invalid SemVer
{
  "name": "UnknownError",
  "data": {
    "message": "Error: Invalid SemVer: beta ... isOutdated (src/bun/registry.ts:...)"
  }
}
```

**Por qué pasa esto:** la caché de OpenCode puede mantener la dependencia del plugin como un dist-tag (`"beta"`) en `~/.cache/opencode/package.json` y `~/.cache/opencode/bun.lock`. Algunas versiones de OpenCode comparan las versiones del plugin como semver estricto y fallan con tags no numéricos.

**Solución (recomendada):** vuelve a resolver la dependencia en la caché de OpenCode para que quede fijada a una versión real.

**macOS / Linux:**
```bash
cd ~/.cache/opencode
bun add opencode-antigravity-auth@latest
```

**Windows (PowerShell):**
```powershell
Set-Location "$env:USERPROFILE\.cache\opencode"
bun add opencode-antigravity-auth@latest
```

Luego reinicia OpenCode.

> Si usas a propósito el canal beta, usa `bun add opencode-antigravity-auth@beta` en su lugar.

---

## Error de permisos de IAM / proyecto de Google Cloud

Si ves:
> Permission 'cloudaicompanion.companions.generateChat' denied on resource '//cloudaicompanion.googleapis.com/projects/...'

**Por qué pasa esto:** cuando a una cuenta le falta un proyecto Cloud Code / Antigravity vinculado, recurre a un project ID por defecto que puede no tener los permisos habilitados.

**Solución:**

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea o selecciona un proyecto
3. Habilita la **Gemini for Google Cloud API** (`cloudaicompanion.googleapis.com`)
4. Añade `projectId` a tu cuenta en `~/.config/opencode/antigravity-accounts.json`:

```json
{
  "version": 4,
  "accounts": [
    {
      "email": "you@gmail.com",
      "refreshToken": "...",
      "projectId": "your-project-id"
    }
  ]
}
```

---

## Error 400 en modelos Gemini 3 ("Unknown name 'parameters'")

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

## Servidores MCP que causan errores

Algunos servidores MCP tienen esquemas incompatibles con el formato JSON estricto de Antigravity.

**Diagnóstico:**
1. Desactiva todos los servidores MCP de tu configuración
2. Actívalos uno por uno hasta que reaparezca el error
3. Reporta el MCP concreto en un [issue de GitHub](https://github.com/JoshRob297/opencode-antigravity-auth/issues)

---

## Rate limits, shadow bans y prompts colgados

**Síntomas:**
- Los prompts se cuelgan indefinidamente (200 OK en los logs pero sin respuesta)
- Errores 403 "Permission Denied" incluso con cuentas nuevas
- "All accounts rate-limited" pero la cuota parece disponible
- Las cuentas nuevas quedan rate-limited de inmediato al añadirlas

**Por qué pasa esto:**

Google ha endurecido mucho la aplicación de cuotas y rate limits. Esto afecta a TODOS los usuarios, no solo a este plugin. Factores clave:

1. **Aplicación más estricta** — Aunque la cuota "parezca disponible", Google puede limitar o hacer soft-ban a las cuentas que disparan su detección de abuso
2. **Patrón de peticiones de OpenCode** — OpenCode hace más llamadas a la API que las apps nativas (llamadas a tools, reintentos, streaming, cadenas multi-turno), lo que dispara los límites más rápido que el uso "normal"
3. **Shadow bans** — Algunas cuentas quedan efectivamente inutilizables durante periodos prolongados una vez marcadas, mientras que otras siguen funcionando con normalidad

> **Importante:** usar este plugin puede aumentar la probabilidad de disparar las protecciones automáticas de abuso/rate limit. El proveedor del upstream puede restringir, suspender o terminar el acceso a su discreción. **ÚSALO BAJO TU PROPIO RIESGO.**

**Soluciones:**

<details>
<summary><b>1. Esperar a que pase (lo más confiable)</b></summary>

Los rate limits normalmente se resetean después de unas horas. Si ves problemas persistentes:
- Deja de usar la cuenta afectada durante 24-48 horas
- Usa otra cuenta mientras tanto
- Consulta `rateLimitResetTimes` en tu archivo de cuentas para ver cuándo expiran los límites

</details>

<details>
<summary><b>2. "Calentar" las cuentas en el Antigravity IDE (truco de la comunidad)</b></summary>

Varios usuarios han reportado éxito con este enfoque:

1. Abre el [Antigravity IDE](https://idx.google.com/) directamente en tu navegador
2. Inicia sesión con la cuenta de Google afectada
3. Ejecuta unos cuantos prompts simples (por ejemplo, "Hello", "What's 2+2?")
4. Después de 5-10 prompts exitosos, intenta usar la cuenta con el plugin otra vez

**Por qué podría funcionar:** usar la cuenta a través de la interfaz "oficial" puede resetear algunas flags internas o hacer que la cuenta parezca menos sospechosa.

</details>

<details>
<summary><b>3. Reduce el volumen y la ráfaga de peticiones</b></summary>

- Usa sesiones más cortas
- Evita flujos de trabajo con paralelismo o muchos reintentos (por ejemplo, lanzar muchos subagentes a la vez)
- Si usas oh-my-opencode, considera reducir los lanzamientos concurrentes de agentes
- Pon `max_rate_limit_wait_seconds: 0` para fallar rápido en lugar de reintentar

</details>

<details>
<summary><b>4. Usa el Antigravity IDE directamente (usuarios con una sola cuenta)</b></summary>

Si solo tienes una cuenta, probablemente tengas una mejor experiencia usando el [Antigravity IDE](https://idx.google.com/) directamente en lugar de enrutar a través de OpenCode, porque el patrón de peticiones de OpenCode dispara los límites más rápido.

</details>

<details>
<summary><b>5. Configuración de cuentas nuevas</b></summary>

Si añades cuentas nuevas:
1. Borra el archivo de cuentas: `rm ~/.config/opencode/antigravity-accounts.json`
2. Vuelve a autenticarte: `opencode auth login`
3. Actualiza a la última release: `"plugins": ["github:JoshRob297/opencode-antigravity-auth"]`
4. Considera "calentar" la cuenta antes en el Antigravity IDE

</details>

**Qué reportar:**

Si ves un comportamiento de rate limit inusual, compártelo en un [issue de GitHub](https://github.com/JoshRob297/opencode-antigravity-auth/issues):
- Códigos de estado de los logs de depuración (403, 429, etc.)
- Cuánto tiempo persiste el estado de rate limit
- Número de cuentas y estrategia de selección usada

---

## Se crean archivos `.tmp` infinitos

**Causa:** cuando la cuenta está rate-limited y el plugin reintenta infinitamente, genera muchos archivos temporales.

**Solución temporal:**
1. Detén OpenCode
2. Limpia: `rm ~/.config/opencode/*.tmp`
3. Añade más cuentas o espera a que expire el rate limit

---

## El callback de OAuth falla en Safari (macOS)

**Síntomas:**
- "fail to authorize" después de un login correcto en Google
- Safari muestra "Safari can't open the page" o conexión rechazada

**Causa:** el "HTTPS-Only Mode" de Safari bloquea la URL de callback `http://localhost`.

**Soluciones:**

1. **Usa otro navegador** (lo más fácil):
   Copia la URL de `opencode auth login` y pégala en Chrome o Firefox.

2. **Desactiva temporalmente el HTTPS-Only Mode:**
   - Safari > Settings (⌘,) > Privacy
   - Desmarca "Enable HTTPS-Only Mode"
   - Ejecuta `opencode auth login`
   - Vuelve a activarlo después de autenticarte

3. **Extracción manual del callback** (avanzado):
   - Cuando Safari muestra el error, la barra de dirección contiene `?code=...&scope=...`
   - Consulta el [issue #119](https://github.com/JoshRob297/opencode-antigravity-auth/issues/119) para el soporte de autenticación manual

---

## Puerto ya en uso

Si el OAuth falla con "Address already in use":

**macOS / Linux:**
```bash
lsof -i :51121
kill -9 <PID>
opencode auth login
```

**Windows:**
```powershell
netstat -ano | findstr :51121
taskkill /PID <PID> /F
opencode auth login
```

---

## WSL2 / Docker / desarrollo remoto

El callback de OAuth requiere que el navegador alcance `localhost` en la máquina donde corre OpenCode.

<details>
<summary><b>WSL2</b></summary>

- Usa el port forwarding de VS Code, o
- Configura el port forwarding de Windows → WSL

</details>

<details>
<summary><b>SSH / remoto</b></summary>

```bash
ssh -L 51121:localhost:51121 user@remote
```

</details>

<details>
<summary><b>Docker / contenedores</b></summary>

- El OAuth con redirect a localhost no funciona en contenedores
- Espera 30s al flujo de URL manual, o usa port forwarding por SSH

</details>

---

## Migrar cuentas entre máquinas

Al copiar `antigravity-accounts.json` a una máquina nueva:
1. Asegúrate de que el plugin está instalado: `"plugins": ["github:JoshRob297/opencode-antigravity-auth"]`
2. Copia `~/.config/opencode/antigravity-accounts.json`
3. Si obtienes el error "API key missing", el token de refresco puede ser inválido: vuelve a autenticarte

---

## Problemas de compatibilidad con plugins

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

Desactiva la autenticación integrada:
```json
{
  "google_auth": false
}
```

Al lanzar subagentes en paralelo, varios procesos pueden llegar a la misma cuenta. **Solución temporal:** activa `pid_offset_enabled: true` o añade más cuentas.

### Otros plugins de gemini-auth

No los necesitas. Este plugin cubre todo el OAuth de Google.

---

## Guías de migración

### v1.2.8+ (variantes)

La v1.2.8+ introduce **variantes de modelo** para la configuración dinámica de thinking.

**Antes (v1.2.7):**
```json
{
  "antigravity-claude-opus-4-6-thinking-low": { ... },
  "antigravity-claude-opus-4-6-thinking-max": { ... }
}
```

**Después (v1.2.8+):**
```json
{
  "antigravity-claude-opus-4-6-thinking": {
    "variants": {
      "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
      "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
    }
  }
}
```

Usa los nombres canónicos de modelo de la documentación actual. Los nombres de modelo deprecados se envían tal como se piden y pueden fallar si la API del upstream ya los eliminó.

### v1.2.7 (prefijo)

La v1.2.7+ usa el prefijo explícito `antigravity-`:

| Nombre anterior | Nombre nuevo |
|----------|----------|
| `gemini-3.8-flash-low` | `antigravity-gemini-3.8-flash` |
| `claude-sonnet-4-6` | `antigravity-claude-sonnet-4-6` |

Usa los nombres de modelo con prefijo `antigravity-` que se muestran arriba.

---

## Depuración

Activa el logging de depuración:
```json
{
  "debug": true,
  "debug_tui": true
}
```

Los logs están en `~/.config/opencode/antigravity-logs/`.

---

## Pruebas E2E

El plugin incluye pruebas de regresión (consumen cuota de API):

```bash
npx tsx script/test-regression.ts --sanity      # 7 pruebas, ~5 min
npx tsx script/test-regression.ts --heavy       # 4 pruebas, ~30 min
npx tsx script/test-regression.ts --dry-run     # Lista las pruebas
```

---

## ¿Sigues atascado?

Abre un issue en [GitHub](https://github.com/JoshRob297/opencode-antigravity-auth/issues).
