# 📊 Dashboard Ejecutivo — Grupo Águila v3

## Cambios en esta versión

- ✅ **Base de datos JSON** — `data/dash.json` (4.6 KB) reemplaza el Excel de 30 KB
- ✅ **Carga más rápida** — sin dependencia de XLSX.js, lectura directa desde JSON
- ✅ **Botón Admin** 🔒 — acceso seguro en la esquina superior derecha
- ✅ **Edición en línea** — las tablas Detalle se vuelven editables al iniciar sesión
- ✅ **Nueva semana** — agrega cortes semanales con un formulario guiado
- ✅ **Persistencia local** — los cambios se guardan en el navegador automáticamente
- ✅ **Exportar JSON** — descarga `dash.json` actualizado para subir al repo

---

## Estructura del proyecto

```
dashboard-aguila-v3/
├── index.html              # App principal
├── data/
│   └── dash.json           # Base de datos (4.6 KB) ← editar aquí los datos
└── assets/
    ├── parser.js            # Lee dash.json → expone window.Dash
    ├── ui.js                # KPIs, tablas, sistema Admin
    ├── charts.js            # Gráficas con Chart.js
    └── style.css            # Estilos + estilos admin
```

---

## Despliegue en GitHub Pages

1. Sube todos los archivos a tu repositorio `tornillosaguila/dashboard-aguila`
2. Ve a **Settings → Pages → Branch: main / root**
3. El dashboard estará en `https://tornillosaguila.github.io/dashboard-aguila/`

---

## Cómo actualizar datos (flujo admin)

### Opción A — Edición directa en el dashboard (recomendada)
1. Abre el dashboard en el navegador
2. Haz clic en el ícono 🔒 (esquina superior derecha)
3. Ingresa: **Usuario:** `Admin` | **Contraseña:** `b3t0`
4. Ve a **📋 Detalle Ventas**, **📋 Detalle Ope.** o **📋 Detalle Admon.**
5. Haz clic en **➕ Nueva semana** para agregar un corte nuevo
6. O haz clic directamente en cualquier celda para editar un valor
7. Haz clic en **💾 Guardar cambios** (guarda en el navegador)
8. Haz clic en **📥 Exportar JSON** para descargar `dash.json` actualizado
9. Sube el archivo `dash.json` a `data/dash.json` en GitHub

### Opción B — Editar el JSON directamente
Abre `data/dash.json` y edita los arrays de datos.  
Cada posición del array corresponde a un corte semanal en el mismo orden que `cortes[]`.

```json
{
  "ventas": {
    "cortes": [
      {"mes": "MAYO", "label": "May/22"},   ← nuevo corte
      ...
    ],
    "data": {
      "PUNTO DE VENTA": [522974, 401365, ..., 485000],  ← agrega valor al final
      "CALL CENTER":    [519139, 698603, ..., 612000],
      ...
    }
  }
}
```

---

## Credenciales Admin

| Campo    | Valor  |
|----------|--------|
| Usuario  | Admin  |
| Password | b3t0   |

> **Nota de seguridad:** Las credenciales están en el código del frontend.
> Este dashboard está diseñado para uso interno en red privada o GitHub Pages.
> No almacena ni transmite datos sensibles a servidores externos.

---

## Persistencia de cambios

| Tipo | Dónde se guarda | Visible para otros usuarios |
|------|-----------------|-----------------------------|
| Edición de celda | `localStorage` del navegador | ❌ Solo en tu browser |
| Exportar + subir a GitHub | `data/dash.json` en el repo | ✅ Todos los usuarios |

**Para que todos vean los cambios:** usa el botón **📥 Exportar JSON** y sube el archivo al repositorio.
