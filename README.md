# 📊 Dashboard Ejecutivo — Grupo Águila v4.1

## ✅ DESPLIEGUE EN GITHUB PAGES — PASO A PASO

Si el dashboard **no aparece** en `https://tornillosaguila.github.io/bottest/`, es porque **GitHub Pages no está habilitado** aún. Sigue estos pasos:

1. Ve a la pestaña **Settings** del repositorio.
2. En el menú lateral izquierdo, busca **Pages**.
3. En **Build and deployment**, elige:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main`
   - **Folder:** `/ (root)`
4. Haz clic en **Save**.
5. Espera 1–3 minutos. La URL pública será:
   ```
   https://tornillosaguila.github.io/bottest/
   ```
6. Si después de 5 minutos sigue dando 404, verifica que existe `index.html` en la raíz del branch.

> ⚠️ Si el dashboard carga pero queda atascado en *“Cargando datos…”* con un error rojo, revisa la sección **Solución de problemas** al final de este README.

---

## Novedades v4.1

- 🔐 **Login multi-usuario por departamento** — 4 cuentas: super-admin, Ventas, Operaciones, Administración. Cada cuenta departamental solo edita las tablas de su área. El super-admin edita todo.
- 🛡️ **Contraseñas hasheadas (PBKDF2-HMAC-SHA256, 100k iters, salt único)** en `data/users.json`. Jamás en texto plano.
- 🛡️ **Hardening del login**: comparación de tiempo constante, sanitización de username, bloqueo 5 min tras 5 intentos, sesión en `sessionStorage` con expiración de 60 min, renovación por actividad.
- 💼 **Cartera Vigente y Vencida** — nuevos indicadores en Detalle Admón, Consolidado, Resumen Empresa.
- 🛡️ **Margen Neto Proyectado** — amortiza con cartera vigente esperada para que no salga negativo cuando el flujo es deficitario.
- 🔁 **Catálogo de respaldo embebido** — si `data/users.json` falta, el sistema usa credenciales por defecto embebidas (no hay caída total).
- 🪶 **`.nojekyll`** — bypasea el procesamiento Jekyll de GitHub Pages.

---

## Estructura del proyecto

```
bottest/
├── .nojekyll                       (bypass Jekyll de GitHub Pages)
├── index.html                      (app principal)
├── README.md                       (este documento)
├── data/
│   ├── dash.json                   (datos del dashboard, con CARTERA_*)
│   └── users.json                  (usuarios con hashes PBKDF2)
├── assets/
│   ├── auth.js                     (autenticación PBKDF2 + roles)
│   ├── parser.js                   (lee dash.json → window.Dash)
│   ├── ui.js                       (KPIs, tablas, modos admin)
│   ├── charts.js                   (gráficas Chart.js)
│   └── style.css                   (estilos)
└── tools/
    └── hash-password.html          (generador local de hashes para nuevos usuarios)
```

---

## Credenciales por defecto

| Usuario          | Contraseña     | Rol    | Puede editar              |
|------------------|----------------|--------|---------------------------|
| **`b3t0`**       | **`4dm1nf4tum`** | **super**  | **TODO (las 3 tablas)** |
| `ventas`         | `V3nt@s2026`   | ventas | 📋 Detalle Ventas         |
| `operaciones`    | `Op3r@2026`    | ope    | 📋 Detalle Operaciones    |
| `administracion` | `Adm0n@2026`   | admon  | 📋 Detalle Administración |

> ⚠️ **Cambia estas contraseñas al primer uso** desde **🔑 Contraseña** en la toolbar admin. El sistema descargará un nuevo `users.json` que debes subir al repo.

---

## 🩺 Solución de problemas

### El dashboard no aparece (URL devuelve 404)
- GitHub Pages no está habilitado o el branch/folder es incorrecto. Revisa la sección **DESPLIEGUE** arriba.

### Carga pero se queda en *"Cargando datos…"*
- El archivo `data/dash.json` falta o tiene ruta incorrecta. Verifica que esté en `data/dash.json` (minúsculas, GitHub Pages es case-sensitive).
- Abre las DevTools (F12) → pestaña Console y Network para ver el error 404 exacto.

### El login no funciona o se ve "❌ Credenciales inválidas" siempre
- **No es un problema** si `data/users.json` falta — el sistema tiene catálogo de respaldo embebido con las mismas credenciales. Funciona igual.
- Si AÚN así no puedes entrar, revisa que la URL sea HTTPS (Web Crypto API lo requiere). GitHub Pages siempre lo es.
- Verifica que no estás escribiendo el usuario con mayúsculas u otros caracteres raros.

### Los cambios no se guardan en el repo
- Solo se guardan en `localStorage` del navegador. Para que todos los vean, usa **📥 Exportar JSON** y sube el archivo `dash.json` a `data/dash.json` en GitHub.

### Veo gráficas vacías pero datos cargados
- Probablemente el CDN de Chart.js está bloqueado en tu red. Verifica que `https://cdnjs.cloudflare.com` sea accesible.

### "Web Crypto API no disponible" en consola
- Estás abriendo el archivo localmente con `file://`. Usa GitHub Pages o `python -m http.server`.

---

## Cómo dar de alta usuarios o cambiar contraseñas

### Opción A — Desde la app (recomendado)
1. Inicia sesión con tu usuario.
2. En la toolbar de tu tabla, presiona **🔑 Contraseña**.
3. Ingresa contraseña actual y nueva (mínimo 8 caracteres).
4. Se descarga un nuevo `users.json`.
5. Súbelo a `data/users.json` en GitHub.

### Opción B — Crear nuevo usuario desde cero
1. Abre `tools/hash-password.html` localmente (doble clic o Live Server).
2. Llena los campos y presiona **Generar JSON del usuario**.
3. Copia el bloque JSON resultante.
4. Pégalo en el array `users` de `data/users.json`.
5. Sube `users.json` al repo.

> El hash se calcula en tu navegador con Web Crypto API. La contraseña nunca sale de tu equipo.

---

## Seguridad — Qué hace y qué no

### Lo que SÍ hace
- ✅ Hashes PBKDF2-HMAC-SHA256 (100k iters) con salt único por usuario.
- ✅ Verificación con comparación de tiempo constante (anti-timing).
- ✅ Hash dummy si el usuario no existe (anti-enumeration).
- ✅ Bloqueo automático tras 5 intentos fallidos durante 5 min.
- ✅ Sesiones en `sessionStorage` con expiración 60 min, renovadas por actividad.
- ✅ UI gatea ediciones por rol.

### Limitaciones (frontend estático sin backend)
- ❌ Quien tiene acceso al repo puede sobrescribir cualquier archivo.
- ❌ Un usuario con DevTools puede manipular `window.Dash` en su navegador, pero esto NO afecta el servidor ni a otros usuarios.

Para seguridad de nivel empresarial, se necesita un backend (Node + DB + JWT). Este sistema ofrece la mejor seguridad posible bajo la restricción de "GitHub Pages estático".
