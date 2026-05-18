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
- [ ] Integración con Supabase (vistas SQL: v_tfi_comparison_lines, v_tfi_user_precision, v_tfi_global_precision)
- [ ] Selector de sesión global (session_id)
- [ ] Exportación de reportes (PDF/Excel)

---

## 4. Modelo de Datos (Vistas SQL en Supabase)

### Vista: v_tfi_comparison_lines
| Campo | Tipo | Descripción |
|-------|------|-------------|
| session_id | text | ID de sesión de inventario |
| article_id | text | Código de artículo |
| theoretical_qty | number | Cantidad teórica |
| count_1_qty | number | Conteo toma 1 |
| user_1 | text | Usuario toma 1 |
| count_2_qty | number | Conteo toma 2 |
| user_2 | text | Usuario toma 2 |
| recount_qty | number | Cantidad reconteo |
| recount_user | text | Usuario reconteo |
| difference_user_1 | number | Diferencia usuario 1 (0 o 1) |
| difference_user_2 | number | Diferencia usuario 2 (0 o 1) |
| comparison_status | text | MATCH / PENDING_RECOUNT / TAKE_1_CORRECT / TAKE_2_CORRECT / BOTH_DIFFERENT_FROM_RECOUNT |
| final_count_qty | number | Conteo final |
| final_difference_vs_theoretical | number | Diferencia final vs teórico |

### Vista: v_tfi_user_precision
| Campo | Tipo | Descripción |
|-------|------|-------------|
| session_id | text | ID de sesión |
| user_name | text | Nombre de usuario |
| total_articles | number | Total artículos contados |
| differences | number | Cantidad de diferencias |
| precision_percentage | number | % precisión |

### Vista: v_tfi_global_precision
| Campo | Tipo | Descripción |
|-------|------|-------------|
| session_id | text | ID de sesión |
| total_user_counts | number | Total conteos de usuarios |
| total_differences | number | Total diferencias |
| weighted_global_precision | number | Precisión global ponderada |
| average_global_precision | number | Precisión global promedio |

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

### Fase 4: Funcionalidades Avanzadas
- Objetivo: Exportación, filtros avanzados, mejoras operativas
- Entregable: App lista para producción