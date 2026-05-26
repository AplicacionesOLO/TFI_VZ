# TFI — Toma Física de Inventario

## 1. Descripción del Proyecto
Aplicación web para visualizar y gestionar reportes de toma física de inventario. Los datos son alimentados por N8N desde un WMS hacia una base de datos Supabase. El frontend solo consulta, filtra y muestra información — sin cálculos de métricas en el cliente.

**Usuarios objetivo**: Operadores y supervisores de bodega/almacén.  
**Valor core**: Reemplazar Google Sheets/Excel con un dashboard operativo profesional y en tiempo real.

---

## 2. Estructura de Páginas

- `/` — Dashboard Principal (KPIs globales)
- `/comparison` — Reporte Comparación Toma 1 vs Toma 2
- `/ranking` — Reporte Ranking de Usuarios
- `/pending` — Reporte Pendientes de Reconteo

---

## 3. Funcionalidades Core

- [x] Layout global con navegación superior
- [x] Dashboard con 8 KPI cards
- [x] Reporte comparación línea por línea con filtros
- [x] Ranking de usuarios con barras de precisión y colores semáforo
- [x] Reporte de pendientes de reconteo (solo PENDING_RECOUNT)
- [x] Selector de sesión global (session_id)
- [x] Exportación de reportes (Excel / CSV)
- [x] Integración con Supabase (vistas SQL: v_tfi_comparison_lines, v_tfi_user_precision, v_tfi_global_precision)
- [x] Panel de actualización desde WMS (N8N webhook)
- [x] Filtro por situación (APLICADO / DISPONIBLE / CANCELADO)

---

## 4. Modelo de Datos (Vistas SQL en Supabase)

### Tabla: tfi_sessions
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | text | ID de sesión de inventario (PK) |
| name | text | Nombre descriptivo de la sesión |
| status | text | Estado: `open`, `reviewing`, `closed`, `cancelled`, `draft` |
| location | text | Ubicación del inventario |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Fecha de actualización |

### Tabla: tfi_count_lines
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | bigint | ID autoincremental |
| session_id | text | FK a tfi_sessions |
| article_id | text | Código de artículo |
| article_description | text | Descripción del artículo |
| theoretical_qty | numeric | Cantidad teórica |
| count_1_qty | numeric | Conteo toma 1 |
| user_1 | text | Usuario toma 1 |
| take_1_name | text | Nombre/descripción toma 1 |
| count_2_qty | numeric | Conteo toma 2 |
| user_2 | text | Usuario toma 2 |
| take_2_name | text | Nombre/descripción toma 2 |
| recount_qty | numeric | Cantidad reconteo |
| recount_user | text | Usuario reconteo |
| situation_1 | text | Situación toma 1 |
| situation_2 | text | Situación toma 2 |
| situation_recount | text | Situación reconteo |
| estado_formulario_1 | text | Estado formulario toma 1 |
| estado_formulario_2 | text | Estado formulario toma 2 |
| estado_formulario_recount | text | Estado formulario reconteo |
| comparison_status | text | Estado calculado (match, pending_recount, ok_user1, ok_user2, pending_t2, pending_t1, both_different) |
| final_count_qty | numeric | Conteo final |
| final_difference_vs_theoretical | numeric | Diferencia final vs teórico |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Fecha de actualización |

### Vista: v_tfi_comparison_lines
Proyección enriquecida de `tfi_count_lines` con columnas computadas:
- `difference_user_1` (integer): 0 si coincide con teórico/recount, 1 si difiere
- `difference_user_2` (integer): 0 si coincide con teórico/recount, 1 si difiere
- Incluye todas las columnas descriptivas: article_description, take_1_name, take_2_name, situation_*, estado_formulario_*

### Vista: v_tfi_user_precision
| Campo | Tipo | Descripción |
|-------|------|-------------|
| session_id | text | ID de sesión |
| user_name | text | Nombre de usuario |
| total_articles | numeric | Total artículos contados |
| differences | numeric | Cantidad de diferencias |
| precision_percentage | numeric | % precisión |

### Vista: v_tfi_global_precision
| Campo | Tipo | Descripción |
|-------|------|-------------|
| session_id | text | ID de sesión |
| total_user_counts | numeric | Total conteos de usuarios |
| total_differences | numeric | Total diferencias |
| weighted_global_precision | numeric | Precisión global ponderada |
| average_global_precision | numeric | Precisión global promedio |

---

## 5. Integraciones

- **Supabase**: Base de datos principal. N8N alimenta los datos desde el WMS. El frontend consulta las vistas SQL.
- **N8N**: Alimenta la base de datos desde el WMS (externo, no se integra en frontend).
- **Shopify**: No requerido.
- **Stripe**: No requerido.

---

## 6. Plan de Fases

### Fase 1: UI Base + Dashboard (COMPLETADO ✅)
- Objetivo: Layout, navegación y dashboard con mock data
- Entregable: App navegable con KPIs y diseño operativo profesional

### Fase 2: Reportes Completos con Mock Data (COMPLETADO ✅)
- Objetivo: Las 3 pantallas de reporte con filtros funcionales
- Entregable: Comparación, Ranking y Pendientes navegables

### Fase 3: Integración Supabase (COMPLETADO ✅)
- Objetivo: Conectar el frontend a las vistas SQL reales
- Entregable: App mostrando datos reales, mock eliminado, selector global de sesión en TopNav

### Fase 4: Funcionalidades Avanzadas (COMPLETADO ✅)
- Objetivo: Exportación Excel/CSV, filtros avanzados, sincronización desde WMS
- Entregable: App lista para producción

### Fase 5: Correcciones de Conexión y Robustez (EN PROGRESO)
- Objetivo: Corregir conexión a base de datos correcta, agregar columnas faltantes a tfi_count_lines, recrear vistas con campos descriptivos y normalización de estados
- Entregable: SQL manual a ejecutar en Supabase + frontend robusto con paginación completa

---

## 7. SQL Requerido en Supabase (Ejecutar manualmente)

Ver archivo `supabase_schema_update.sql` o la sección de SQL provista en la documentación del proyecto para el script completo de ALTER TABLE y CREATE OR REPLACE VIEW.