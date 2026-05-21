# 📊 Dashboard Ejecutivo — Grupo Águila v4

## Novedades de esta versión

- 🔐 **Login multi-usuario por departamento** — 3 cuentas: Ventas, Operaciones y Administración. Cada cuenta solo puede editar las tablas de su departamento.
- 🛡️ **Contraseñas hasheadas (PBKDF2-HMAC-SHA256, 100k iters, salt de 16 bytes por usuario)** almacenadas en `data/users.json`. Nunca se guardan en texto plano.
- 🛡️ **Hardening del login**: comparación de tiempo constante, sanitización de usuario, bloqueo 5 min tras 5 intentos, sesión en `sessionStorage` con expiración de 60 min, renovación por actividad.
- 💼 **Cartera Vigente y Cartera Vencida** — nuevos indicadores en Detalle Admón, Operaciones consolidadas, Consolidado y Resumen Empresa.
- 🛡️ **Margen Neto Proyectado** — amortiza con la cartera vigente esperada por cobrar para que no salga negativo cuando el flujo de efectivo es deficitario.

---

## Estructura del proyecto

```
dashboard-aguila/
├── index.html                  # App principal
├── data/
│   ├── dash.json               # Datos del dashboard (con CARTERA_VIGENTE/VENCIDA)
│   └── users.json              # Usuarios con hashes PBKDF2 (NO contraseñas)
├── assets/
│   ├── auth.js                 # Sistema de autenticación (PBKDF2 + roles)
│   ├── parser.js               # Lee dash.json → window.Dash
│   ├── ui.js                   # KPIs, tablas, sistema Admin con roles
│   ├── charts.js               # Gráficas (Chart.js)
│   └── style.css               # Estilos
└── tools/
    └── hash-password.html      # Generador local de hashes (uso del super-admin)
```

---

## Credenciales por defecto

| Usuario          | Contraseña     | Rol    | Puede editar              |
|------------------|----------------|--------|---------------------------|
| `b3t0`           | `4dm1nf4tum`   | super  | **TODO** (las 3 tablas)   |
| `ventas`         | `V3nt@s2026`   | ventas | 📋 Detalle Ventas         |
| `operaciones`    | `Op3r@2026`    | ope    | 📋 Detalle Operaciones    |
| `administracion` | `Adm0n@2026`   | admon  | 📋 Detalle Administración |

> ⚠️ **Cambia estas contraseñas al primer uso** desde el botón **🔑 Contraseña** de la toolbar admin. El sistema descargará un nuevo `users.json` que debes subir al repo.

> 🔐 El usuario `b3t0` (rol `super`) edita todas las secciones — úsalo para administración global o emergencias. Los otros 3 usuarios son por departamento y solo pueden editar su propia tabla.

---

## Seguridad — Qué hace y qué no

### Lo que SÍ hace este sistema
- ✅ Las contraseñas se guardan únicamente como **hash PBKDF2-HMAC-SHA256** con 100,000 iteraciones y salt único por usuario. Crackear una contraseña fuerte requeriría meses-CPU.
- ✅ La verificación se hace con **comparación de tiempo constante**, lo que evita ataques de timing.
- ✅ El sistema **calcula un hash dummy aunque el usuario no exista**, para no filtrar la lista de usuarios por timing.
- ✅ **Bloqueo automático** tras 5 intentos fallidos durante 5 minutos.
- ✅ Las sesiones viven en **`sessionStorage`** y caducan a los **60 minutos**. Se renuevan automáticamente con actividad.
- ✅ La UI gatea las ediciones por rol: la tabla de un departamento ajeno aparece como **solo lectura**.

### Limitaciones inherentes a un frontend estático
Este dashboard se despliega en GitHub Pages sin backend. Por tanto:

- ❌ **No hay servidor que valide las modificaciones**: si alguien clona el repo y edita `data/dash.json` localmente, vería sus cambios localmente. El "ground truth" es lo que se sube al repo.
- ❌ Un usuario con acceso a las DevTools del navegador podría manipular `window.Dash` en memoria para su propia sesión. Esto **no afecta** los datos del servidor ni los de otros usuarios — el `dashOverride` en localStorage solo afecta a ese navegador.
- ❌ Si alguien tiene acceso al repositorio de GitHub, puede sobrescribir cualquier archivo, incluido `users.json`. La seguridad del repo es la base.

**Para seguridad de nivel empresarial, se necesita un backend** (Node + DB + JWT). Este sistema ofrece la mejor seguridad posible bajo la restricción de "GitHub Pages estático".

---

## Cómo dar de alta usuarios o cambiar contraseñas

### Opción A — Desde la app (recomendado)
1. Inicia sesión con tu usuario.
2. En la toolbar de tu tabla, presiona **🔑 Contraseña**.
3. Ingresa contraseña actual y nueva (mínimo 8 caracteres).
4. Se descarga automáticamente un nuevo `users.json`.
5. Sube ese archivo a `data/users.json` en GitHub.

### Opción B — Crear un nuevo usuario desde cero
1. Abre `tools/hash-password.html` en tu navegador (haz doble clic o usa Live Server).
2. Llena los campos y presiona **Generar JSON del usuario**.
3. Copia el bloque JSON resultante.
4. Pégalo dentro del array `users` de `data/users.json`.
5. Sube `users.json` al repo.

> El hash se calcula 100% en tu navegador (con Web Crypto API). La contraseña nunca sale de tu equipo.

---

## Cómo actualizar los datos (flujo admin)

1. Abre el dashboard en el navegador.
2. Haz clic en el ícono 🔒 (esquina superior derecha).
3. Ingresa con el usuario que corresponda a tu departamento.
4. Ve a la pestaña **📋 Detalle [tu departamento]**.
5. Haz clic en **➕ Nueva semana** para agregar un corte, o clic directo en cualquier celda para editar.
6. **💾 Guardar cambios** — guarda en tu navegador.
7. **📥 Exportar JSON** — descarga `dash.json` actualizado.
8. Sube el archivo a `data/dash.json` en GitHub.

---

## Estructura de datos — `data/dash.json`

La sección `admon` ahora incluye dos nuevas series:

```json
{
  "admon": {
    "metas": {
      "INGRESOS": 3544582.81,
      "PLAZO_COBRO": 35,
      "RECUPERACION": 0.33,
      "EGRESOS": 3055000.0,
      "GASTOS_OPERACION": 555000.0,
      "CARTERA_VIGENTE": 2200000.0,   // ← NUEVO
      "CARTERA_VENCIDA": 250000.0     // ← NUEVO
    },
    "data": {
      "INGRESOS": [ ... ],
      "EGRESOS":  [ ... ],
      "FLUJO":    [ ... ],
      "CARTERA_VIGENTE": [ ... ],     // ← NUEVO
      "CARTERA_VENCIDA": [ ... ]      // ← NUEVO
    }
  }
}
```

---

## Cómo se calcula el Margen Neto Proyectado

El **Margen Neto contable** clásico es `Flujo de Efectivo ÷ Ingresos × 100`. Cuando los Egresos + Gastos exceden los Ingresos del período, el flujo es negativo y por tanto el margen neto también.

El **Margen Neto Proyectado** amortiza esta cifra con la cartera vigente esperada por cobrar:

```
Ingreso esperado x cartera  =  promedio(CARTERA_VIGENTE) × promedio(% RECUPERACION) × N cortes
Margen Neto Proyectado      =  (Flujo + Ingreso esperado x cartera) ÷ (Ingresos + Ingreso esperado x cartera) × 100
```

Cuando el margen neto contable sale negativo y la cartera vigente esperada es suficiente, el dashboard muestra el proyectado como indicador principal. Ambos se exhiben en el bloque KPI de Resumen Empresa.

---

## Despliegue en GitHub Pages

1. Sube todos los archivos a tu repositorio.
2. Ve a **Settings → Pages → Branch: main / root**.
3. El dashboard estará en `https://<usuario>.github.io/<repo>/`.

> **IMPORTANTE**: El sistema usa Web Crypto API que requiere contexto seguro (HTTPS o `localhost`). GitHub Pages siempre sirve HTTPS, por lo que funcionará sin problema. Para pruebas locales, usa `python -m http.server` o Live Server (NO uses `file://`).
