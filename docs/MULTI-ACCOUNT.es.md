# Configuración multi-cuenta

[English](MULTI-ACCOUNT.md) | **Español**

> [!NOTE]
> **Documento en español.** El inglés ([MULTI-ACCOUNT.md](MULTI-ACCOUNT.md)) es la fuente de verdad y se actualiza primero. Esta traducción puede quedar desactualizada; ante cualquier duda, manda el inglés.

Añade varias cuentas de Google para aumentar tu cuota combinada y mejorar la disponibilidad. El plugin rota automáticamente entre cuentas cuando una queda limitada.

```bash
opencode auth login  # Ejecútalo otra vez para añadir más cuentas
```

---

## Comportamiento del balanceo de carga

- **Selección de cuenta sticky** — Se mantiene en la misma cuenta hasta que queda limitada (preserva la caché del prompt)
- **Límites por familia de modelos** — Los rate limits se rastrean por separado para los modelos Claude y Gemini
- **Rotación de cuentas** — Failover automático y fluido a la siguiente cuenta disponible al alcanzar un rate limit
- **Umbral inteligente de reintento** — Los rate limits cortos (≤5s) se reintentan en la misma cuenta
- **Backoff exponencial** — Retrasos crecientes para rate limits consecutivos

---

## Pools de cuota y ventanas

Para los modelos de Antigravity, el plugin monitorea las ventanas de uso oficiales de **5 horas** y **semanal** por cuenta:

| Ventana | Frecuencia | Descripción |
|--------|-----------|-------------|
| **Ventana de 5h** | Cada 5 horas | Bucket de ráfaga rotativo para sprints de desarrollo inmediatos |
| **Ventana semanal** | Cada 7 días | Límite macro para la capacidad de desarrollo semanal |

### Cómo funciona la rotación de cuentas

1. La petición usa la cuenta activa actual
2. Si hay rate limit o la cuota está agotada, el plugin verifica si ALGUNA otra cuenta está disponible
3. Si sí → cambia automáticamente a la siguiente cuenta sana
4. Los nombres de modelo y las configuraciones de thinking de las variantes se preservan sin fricción entre rotaciones

---

## Consultar cuotas

Consulta tu uso actual de la API en todas las cuentas:

```bash
opencode auth login
# Selecciona "Check quotas" en el menú
```

Esto muestra los porcentajes de cuota restante y los tiempos de reset de cada familia de modelos:
- **Claude & GPT** - Cuota de Claude Opus 4.6 / Sonnet 4.6 y GPT-OSS 120B
- **Gemini** - Cuota de Gemini Flash (en planes de consumidor `antigravity-gemini-3.8-flash` es el único modelo Gemini registrado)

> **Cómo leer el reporte:** la columna de 5h muestra lo que el backend le concede a esa cuenta, y **no** es un marcador de plan: el cliente oficial muestra ambas ventanas también en Free / AI Plus. Usa el conjunto de modelos para distinguir los planes (Argon y Claude 5.5 significan AI Pro de pago, Ultra o Enterprise; consulta `docs/models` upstream). Un bucket de 5h ausente significa que la cuenta no tiene ninguna ventana de ráfaga, lo que es una buena señal para podar el pool.

### Script independiente de cuota

Para consultar cuotas fuera de OpenCode (para depuración, CI, etc.):

```bash
node scripts/check-quota.mjs                    # Consulta todas las cuentas
node scripts/check-quota.mjs --account 2        # Consulta una cuenta concreta
node scripts/check-quota.mjs --path /path/to/accounts.json  # Ruta personalizada
```

---

## Gestionar cuentas

Habilita o deshabilita cuentas específicas para controlar cuáles se usan en las peticiones:

```bash
opencode auth login
# Selecciona "Manage accounts (enable/disable)"
```

O selecciona una cuenta de la lista y elige "Enable/Disable account".

**Cuentas deshabilitadas:**
- Quedan excluidas de la rotación automática
- Siguen apareciendo en las comprobaciones de cuota (marcadas como `[disabled]`)
- Se pueden volver a habilitar en cualquier momento

Útil cuando:
- Una cuenta está baneada o limitada temporalmente por un periodo prolongado
- Quieres reservar ciertas cuentas para casos de uso específicos
- Pruebas con un subconjunto de cuentas

---

## Añadir cuentas

Al ejecutar `opencode auth login` con cuentas ya existentes:

```
2 account(s) saved:
  1. user1@gmail.com
  2. user2@gmail.com

(a)dd new account(s) or (f)resh start? [a/f]:
```

Elige `a` para añadir más cuentas mientras conservas las existentes.

---

## Almacenamiento de cuentas

Las cuentas se almacenan en `~/.config/opencode/antigravity-accounts.json`:

```json
{
  "version": 3,
  "accounts": [
    {
      "email": "user1@gmail.com",
      "refreshToken": "1//0abc...",
      "projectId": "my-gcp-project",
      "enabled": true
    },
    {
      "email": "user2@gmail.com",
      "refreshToken": "1//0xyz...",
      "enabled": false
    }
  ],
  "activeIndex": 0,
  "activeIndexByFamily": {
    "claude": 0,
    "gemini": 0
  }
}
```

> **Seguridad:** Este archivo contiene tokens de refresco de OAuth. Trátalo como un archivo de contraseñas.

### Campos

| Campo | Descripción |
|-------|-------------|
| `email` | Correo de la cuenta de Google |
| `refreshToken` | Token de refresco de OAuth (gestionado automáticamente) |
| `projectId` | ID de proyecto de Google Cloud opcional (autodescubierto). |
| `enabled` | Opcional. Ponlo en `false` para deshabilitar la rotación de cuentas. Por defecto es `true`. |
| `activeIndex` | Índice de la cuenta activa actualmente |
| `activeIndexByFamily` | Cuenta activa por familia de modelos (claude/gemini se rastrean por separado) |

---

## Revocación de tokens

Si Google revoca un token (por ejemplo, cambio de contraseña, evento de seguridad), verás errores `invalid_grant`. El plugin elimina automáticamente las cuentas inválidas.

Para reiniciar manualmente:

```bash
rm ~/.config/opencode/antigravity-accounts.json
opencode auth login
```

---

## Sesiones en paralelo (oh-my-opencode)

Al usar oh-my-opencode con subagentes en paralelo, varios procesos pueden seleccionar la misma cuenta, lo que provoca errores de rate limit.

**Solución:** habilita el offset basado en PID en `antigravity.json`:

```json
{
  "pid_offset_enabled": true
}
```

Esto distribuye las sesiones entre las cuentas según el ID de proceso.

Alternativamente, añade más cuentas vía `opencode auth login`.

---

## Estrategias de selección de cuentas

Configúralo en `antigravity.json`:

```json
{
  "account_selection_strategy": "hybrid"
}
```

| Estrategia | Comportamiento | Ideal para |
|----------|----------|----------|
| `sticky` | La misma cuenta hasta que queda limitada | Preservación de la caché del prompt |
| `round-robin` | Rota a la siguiente cuenta en cada petición | Máximo throughput |
| `hybrid` | Selección determinista según health score + token bucket + LRU | La mejor distribución general |

Consulta [Configuración](CONFIGURATION.es.md#rotacion-de-cuentas) para más detalles.
