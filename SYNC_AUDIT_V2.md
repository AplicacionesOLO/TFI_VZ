# AUDITORÍA TÉCNICA — SISTEMA DE SINCRONIZACIÓN V2

> **Fecha:** 2026-05-29
> **Auditor:** IA — Análisis estático de código completo
> **Scope:** Frontend (React) + Edge Function + Supabase RPCs + N8N integración
> **Objetivo:** Identificar causas raíz de estados inconsistentes, polling residual, race conditions y puntos de desincronización
> **Restricción:** SIN implementar cambios. Solo hallazgos, riesgos, causas raíz y recomendaciones priorizadas.

---

## ÍNDICE

1. [Resumen Ejecutivo de Hallazgos Críticos](#1-resumen-ejecutivo-de-hallazgos-críticos)
2. [Mapa Completo del Ciclo de Vida (Entregable A)](#2-mapa-completo-del-ciclo-de-vida)
3. [Inventario de Estados (Entregable B)](#3-inventario-de-estados)
4. [Race Conditions (Entregable C)](#4-race-conditions)
5. [Puntos Únicos de Verdad (Entregable D)](#5-puntos-únicos-de-verdad)
6. [Análisis por Síntoma](#6-análisis-por-síntoma)
7. [Causas Raíz Consolidadas](#7-causas-raíz-consolidadas)
8. [Recomendaciones Priorizadas (Entregable E)](#8-recomendaciones-priorizadas)
9. [Anexos Técnicos](#9-anexos-técnicos)

---

## 1. RESUMEN EJECUTIVO DE HALLAZGOS CRÍTICOS

### Hallazgos de Severidad CRÍTICA (P0)

| ID | Hallazgo | Impacto | Probabilidad |
|----|----------|---------|--------------|
| **H-001** | **Polling duplicado sin deduplicación:** Dos componentes (`WarehouseSyncButtons` y `TfiRefreshControl`) crean intervals independientes para la misma sesión. No hay mecanismo de deduplicación. | 6 requests cada 3s en lugar de 3. Race conditions en estado. | Alta |
| **H-002** | **Lógica de `effectiveStatus` en el frontend SOBREESCRIBE el `computed_status` del backend:** `WarehouseSyncButtons` y `TfiRefreshControl` aplican `isDeadSync()` y `hasExceededN8nTimeout()` para forzar `effectiveStatus = 'stale'` ANTES de consultar si el backend ya marcó `completed`. Esto puede causar que un sync recién `completed` se muestre como `stale` temporalmente. | Usuario ve "Atascado" cuando el sync ya terminó. Bloqueo de reintentos. | Media-Alta |
| **H-003** | **`shouldResetToIdle()` tiene condiciones de carrera con el polling:** Si `shouldResetToIdle()` se ejecuta en el intervalo de auto-reset (30s) MIENTRAS el polling está activo, ambos pueden intentar limpiar el estado simultáneamente. El polling puede recrear un interval después de que `shouldResetToIdle()` lo limpió. | Polling zombie recreado después de limpieza. | Media |
| **H-004** | **Falta de verificación de que N8N creó el `sync_run` con el ID esperado:** El frontend genera `tempSyncRunId`, adquiere lock con ese ID, pero N8N podría crear el `sync_run` con un ID diferente. El lock apunta a un sync_run inexistente. | `get_sync_status_v2_single` no encuentra el sync_run por ID y devuelve estado incorrecto. | Media |
| **H-005** | **Race condition en `acquire_tfi_sync_lock`:** El RPC usa `ON CONFLICT ... WHERE is_running = false`. Dos procesos concurrentes pueden leer `is_running = false` simultáneamente antes del upsert. | Dos sincronizaciones del mismo almacén ejecutándose simultáneamente. | Baja-Media |

### Hallazgos de Severidad ALTA (P1)

| ID | Hallazgo | Impacto |
|----|----------|---------|
| **H-006** | **`release_tfi_sync_lock` y `force_release_sync_lock_single` marcan el sync_run como `failed`:** Si N8N terminó correctamente pero el usuario hace "Liberar" o el frontend hace release en un error transitorio, el sync_run queda `failed` permanentemente. | Falsos positivos en el historial. El estado real es `completed` pero la BD dice `failed`. |
| **H-007** | **El `cleanupZombieSyncs` se llama desde dos lugares con `SYNC_TIMEOUT_MINUTES = 60` pero el frontend tiene `MAX_POLL_ATTEMPTS = 1200` (60 min):** Si el backend no ha limpiado todavía cuando el frontend alcanza el max, el frontend dice `timeout` pero el backend sigue `running`. | Desincronización temporal de hasta segundos/minutos entre frontend y backend. |
| **H-008** | **Los `setTimeout` para reset de estado (4s-6s) pueden ejecutarse después de que el componente se desmontó:** `mountedRef.current` se verifica en `showToast`, pero NO en los `setTimeout` de reset de estado. | `setSyncStates` o `resetToIdle` se ejecuta en componente desmontado. Memory leaks + estado fantasma. |
| **H-009** | **La detección `isDeadSync` usa `minutes_since_last_n8n_step >= 999999` como condición de muerte:** Pero si N8N nunca envió un heartbeat (legítimo en los primeros minutos), y el sync está efectivamente corriendo, `isDeadSync` puede marcarlo como muerto incorrectamente. | Falsos positivos de `stale` durante la fase de inicialización de N8N. |
| **H-010** | **La función `isCancellableState` incluye `'running'` (SyncRunStatus) pero el frontend nunca ve `'running'` como `computed_status`:** El RPC traduce `running` → `syncing`. `'running'` en `isCancellableState` es código muerto que nunca se ejecuta. | Confusión de mantenimiento. No afecta runtime pero es un indicador de desalineación de tipos. |

### Hallazgos de Severidad MEDIA (P2)

| ID | Hallazgo | Impacto |
|----|----------|---------|
| **H-011** | **Funciones duplicadas entre `tfi.service.ts` y `sync-lifecycle.service.ts`:** `acquireSyncLock`, `releaseSyncLock`, `getSyncLocks`, `getSyncLock`, `getSyncRunById`, `getRunningSyncForSession`, `getLatestSyncRun` existen en ambos archivos. | Confusión de imports. Riesgo de que se modifique una y no la otra. |
| **H-012** | **El Edge Function `n8n-webhook-proxy` no tiene timeout configurado:** Si N8N tarda más de lo que Supabase permite para una Edge Function (límite implícito ~10s), la función se aborta. | Sincronizaciones que tardan >10s en recibir respuesta del webhook fallan por timeout del proxy, no por N8N. |
| **H-013** | **Las tablas de log (`tfi_n8n_step_logs`, `tfi_sync_run_branches`, `tfi_webhook_debug_logs`) no tienen purga:** Crecen indefinidamente. | Degradación de performance de `get_sync_status_v2_single` que lee `tfi_n8n_step_logs` con `ORDER BY created_at DESC LIMIT 1`. |
| **H-014** | **El `hasActiveSync` en `WarehouseSyncButtons` usa `syncStates` local en lugar de consultar el backend:** Si el estado local se desincroniza, puede bloquear al usuario incorrectamente. | Usuario no puede iniciar sync porque el frontend cree que hay uno activo, pero el backend dice `idle`. |
| **H-015** | **El `get_sync_status_v2_single` no tiene `updated_at` en la tabla `tfi_sync_runs` como columna de filtro de índice:** Si `tfi_sync_runs` crece, el `ORDER BY started_at DESC LIMIT 1` podría escanear más filas de lo necesario. | Performance degradada en el RPC más crítico del sistema. |

---

## 2. MAPA COMPLETO DEL CICLO DE VIDA (Entregable A)

### 2.1 Diagrama de Flujo — Quién Escribe, Quién Consume, Quién Limpia

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                      FASE 1: START                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   USUARIO (click "Sincronizar")                                                         │
│        │                                                                                │
│        ▼                                                                                │
│   Frontend (WarehouseSyncButtons)                                                        │
│   ├─► ESCRIBE: `tempSyncRunId` = crypto.randomUUID() (solo en memoria)                  │
│   ├─► ESCRIBE: `syncStates[wh.id].status = 'starting'` (estado local)                 │
│   ├─► LLAMA RPC: `acquire_tfi_sync_lock(p_session_id, p_sync_run_id)`                 │
│   │       │                                                                             │
│   │       ▼                                                                             │
│   │   Supabase PostgreSQL                                                               │
│   │   ├─► ESCRIBE: `tfi_sync_locks` — upsert con `is_running=true`, `sync_run_id=temp`  │
│   │   └─► CONSUME: `tfi_sync_locks` (lee si ya está bloqueado)                          │
│   │                                                                                     │
│   ├─► LLAMA Edge Function: `n8n-webhook-proxy`                                          │
│   │       │                                                                             │
│   │       ▼                                                                             │
│   │   Edge Function (Deno)                                                              │
│   │   ├─► ESCRIBE: `tfi_webhook_debug_logs` (opcional, no en el proxy actual)           │
│   │   ├─► CONSUME: `webhook_url` + `payload` del frontend                             │
│   │   └─► LLAMA: fetch() → N8N webhook                                                │
│   │           │                                                                         │
│   │           ▼                                                                         │
│   │       N8N Workflow                                                                  │
│   │       ├─► CONSUME: payload del webhook (session_id, situation, sync_run_id)        │
│   │       ├─► ESCRIBE: `tfi_sync_runs` — INSERT con `status='running'`                │
│   │       ├─► ESCRIBE: `tfi_sync_locks` — UPDATE con `is_running=true` (si no lo hizo) │
│   │       ├─► ESCRIBE: `tfi_sync_run_branches` — INSERT por cada rama                  │
│   │       └─► ESCRIBE: `tfi_n8n_step_logs` — heartbeat periódico                       │
│   │           │                                                                         │
│   │           ▼                                                                         │
│   │       Edge Function retorna {status, body} al frontend                            │
│   │                                                                                     │
│   ├─► CONSUME: respuesta del proxy — extrae `sync_run_id` real de N8N                 │
│   └─► ESCRIBE: `syncStates[wh.id].syncRunId = realSyncRunId || tempSyncRunId`          │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FASE 2: RUNNING                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   Frontend (WarehouseSyncButtons + TfiRefreshControl)                                  │
│   ├─► CREA: `setInterval(poll, 3000ms)` — UNO por componente, DOS por sesión         │
│   │   │                                                                                 │
│   │   └─► CADA 3 SEGUNDOS:                                                              │
│   │       ├─► LLAMA RPC: `get_sync_status_v2_single(p_session_id)`                    │
│   │       │       │                                                                     │
│   │       │       ▼                                                                     │
│   │       │   Supabase PostgreSQL                                                       │
│   │       │   ├─► CONSUME: `tfi_sync_locks` (1 fila)                                   │
│   │       │   ├─► CONSUME: `tfi_sync_runs` (1 fila, última por started_at)             │
│   │       │   ├─► CONSUME: `tfi_sync_run_branches` (COUNT por status)                   │
│   │       │   ├─► CONSUME: `tfi_n8n_step_logs` (último por created_at DESC LIMIT 1)     │
│   │       │   └─► ESCRIBE: `computed_status`, `computed_message` (calculado en SQL)     │
│   │       │                                                                             │
│   │       ├─► CONSUME: resultado del RPC                                               │
│   │       ├─► ESCRIBE: `syncStates[wh.id]` (estado local)                              │
│   │       ├─► LÓGICA FRONTEND: `isDeadSync()` → puede FORZAR `effectiveStatus = 'stale'`│
│   │       ├─► LÓGICA FRONTEND: `hasExceededN8nTimeout()` → puede FORZAR `stale`         │
│   │       └─► DECISIÓN: ¿`isTerminalState(effectiveStatus)`? → STOP o CONTINUE         │
│   │                                                                                     │
│   N8N (durante ejecución)                                                              │
│   ├─► ESCRIBE: `tfi_count_lines` / `tfi_count_attempts` (datos de WMS)                │
│   ├─► ESCRIBE: `tfi_sync_run_branches` — UPDATE `rows_processed`, `status`             │
│   ├─► ESCRIBE: `tfi_sync_runs` — UPDATE `total_rows`, `updated_at`                    │
│   └─► ESCRIBE: `tfi_n8n_step_logs` — INSERT heartbeat                                │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FASE 3: FINISH / ERROR                                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   N8N (al finalizar) — OBLIGATORIO                                                     │
│   ├─► ESCRIBE: `tfi_sync_runs` — UPDATE `status='completed'`, `finished_at=NOW()`    │
│   ├─► ESCRIBE: `tfi_sync_locks` — UPDATE `is_running=false`, `finished_at=NOW()`      │
│   └─► ESCRIBE: `tfi_sync_run_branches` — UPDATE `status='completed'`                  │
│                                                                                         │
│   N8N (al fallar) — OBLIGATORIO                                                        │
│   ├─► ESCRIBE: `tfi_sync_runs` — UPDATE `status='failed'`, `finished_at=NOW()`        │
│   ├─► ESCRIBE: `tfi_sync_runs` — UPDATE `error_message = ...`                          │
│   └─► ESCRIBE: `tfi_sync_locks` — UPDATE `is_running=false`, `finished_at=NOW()`      │
│                                                                                         │
│   Frontend (próximo poll)                                                              │
│   ├─► CONSUME: `get_sync_status_v2_single` → `computed_status = 'completed'`         │
│   ├─► EJECUTA: `clearPolling()` (detiene interval)                                      │
│   ├─► EJECUTA: `triggerRefresh()` (recarga datos del dashboard)                      │
│   ├─► EJECUTA: `showToast()` (notifica al usuario)                                    │
│   └─► EJECUTA: `setTimeout(() => resetWarehouseState(), 5000)` (reset después de 5s)  │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FASE 4: CANCELACIÓN / CLEANUP                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│   USUARIO (click "Stop")                                                               │
│        │                                                                                │
│        ▼                                                                                │
│   Frontend                                                                              │
│   ├─► LLAMA RPC: `cancel_sync_run(p_sync_run_id, p_session_id)`                        │
│   │       │                                                                             │
│   │       ▼                                                                             │
│   │   Supabase PostgreSQL                                                               │
│   │   ├─► ESCRIBE: `tfi_sync_runs` — UPDATE `status='cancelled'`, `finished_at=NOW()`   │
│   │   └─► ESCRIBE: `tfi_sync_locks` — UPDATE `is_running=false`, `finished_at=NOW()`    │
│   │                                                                                     │
│   ├─► LLAMA RPC: `cleanup_zombie_syncs(p_stale_minutes, p_orphan_minutes)`            │
│   │   ├─► LIMPIA: locks inconsistentes                                                  │
│   │   ├─► LIMPIA: locks huérfanos (sin sync_run)                                       │
│   │   ├─► LIMPIA: sync runs stale (>60min)                                             │
│   │   ├─► LIMPIA: sync runs zombie (sin lock activo)                                   │
│   │   ├─► LIMPIA: locks con sync_run ya terminado                                      │
│   │   └─► LIMPIA: branches stale                                                       │
│   │                                                                                     │
│   Frontend (auto-reset cada 30s)                                                        │
│   ├─► LLAMA: `get_sync_status_v2_single` para cada warehouse                          │
│   ├─► SI `shouldResetToIdle()` → `clearPolling()` + `resetWarehouseState()`             │
│   └─► SI `isProblemState()` → `showToast()` + botón "Liberar"                          │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Matriz de Responsabilidad — Quién Escribe / Quién Consume / Quién Limpia

| Entidad | Escribe | Consume | Limpia |
|---------|---------|---------|--------|
| **Frontend** | `syncStates` (local), `tempSyncRunId` (memoria), `toast` (UI) | `computed_status` del RPC, `sync_run_id` de N8N, `minutes_since_*` | `localStorage` (TfiRefreshControl), `clearPolling`, `resetToIdle`, `resetWarehouseState` |
| **N8N** | `tfi_sync_runs`, `tfi_sync_locks`, `tfi_sync_run_branches`, `tfi_n8n_step_logs`, `tfi_count_lines`, `tfi_count_attempts` | Payload del webhook (session_id, situation, sync_run_id) | `tfi_sync_runs` (al finalizar), `tfi_sync_locks` (al finalizar) |
| **Edge Function** | `tfi_webhook_debug_logs` (si N8N lo hace) | `webhook_url`, `payload` | — |
| **RPC `get_sync_status_v2_single`** | `computed_status` (calculado), `computed_message` (calculado), `minutes_since_*` (calculado) | `tfi_sync_locks`, `tfi_sync_runs`, `tfi_sync_run_branches`, `tfi_n8n_step_logs` | — |
| **RPC `cleanup_zombie_syncs`** | `tfi_sync_runs.status` (a `failed`), `tfi_sync_locks.is_running` (a `false`) | `tfi_sync_locks`, `tfi_sync_runs`, `tfi_sync_run_branches` | Locks inconsistentes, huérfanos, stale, zombies, branches stale |
| **RPC `cancel_sync_run`** | `tfi_sync_runs.status` (a `cancelled`), `tfi_sync_locks.is_running` (a `false`) | `tfi_sync_runs`, `tfi_sync_locks` | Estado del sync cancelado |
| **RPC `force_release_sync_lock_single`** | `tfi_sync_locks.is_running` (a `false`), `tfi_sync_runs.status` (a `failed`) | `tfi_sync_locks`, `tfi_sync_runs` | Lock forzado |
| **RPC `release_tfi_sync_lock`** | `tfi_sync_locks.is_running` (a `false`), `tfi_sync_runs.status` (a `failed`) | `tfi_sync_locks` | Lock liberado + sync_run marcado failed |

---

## 3. INVENTARIO DE ESTADOS (Entregable B)

### 3.1 Estados Existentes — Tabla Completa

| Estado | `tfi_sync_runs.status` | `computed_status` | Quién lo Genera | Quién lo Interpreta | Transiciones Válidas | Transiciones INVÁLIDAS |
|--------|------------------------|-------------------|-----------------|----------------------|----------------------|------------------------|
| **idle** | — | `idle` | `get_sync_status_v2_single` (no hay lock ni sync_run) | Frontend (badge "Listo") | `idle` → `starting` (click sync) | `idle` → `syncing` (sin starting) |
| **queued** | `queued` | `queued` | `get_sync_status_v2_single` (sync_run enqueued) | Frontend (badge "En cola") | `queued` → `starting` → `syncing` | `queued` → `completed` (salto) |
| **starting** | `running` | `starting` | `get_sync_status_v2_single` (lock activo, sync_run running, <5 min, sin heartbeat) | Frontend (badge "Iniciando...") | `starting` → `syncing` | `starting` → `completed` (sin pasar por syncing) |
| **syncing** | `running` | `syncing` | `get_sync_status_v2_single` (lock activo, sync_run running, heartbeat reciente) | Frontend (badge "Sincronizando...") | `syncing` → `finishing` → `completed` / `failed` | `syncing` → `idle` (sin completed/failed) |
| **finishing** | `running` | `finishing` | `get_sync_status_v2_single` (N8N envió señal de finalización) | Frontend (badge "Finalizando...") | `finishing` → `completed` | `finishing` → `syncing` (vuelta atrás) |
| **completed** | `completed` | `completed` | N8N UPDATE + `get_sync_status_v2_single` | Frontend (badge "Completado", luego `idle` tras 5s) | `completed` → `idle` (reset automático) | `completed` → `syncing` (vuelta atrás) |
| **failed** | `failed` | `failed` | N8N UPDATE + `get_sync_status_v2_single` | Frontend (badge "Error", botón "Reintentar") | `failed` → `starting` (click reintentar) | `failed` → `syncing` (sin reintentar) |
| **cancelled** | `cancelled` | `cancelled` | `cancel_sync_run` RPC + `get_sync_status_v2_single` | Frontend (badge "Cancelado", botón "Reintentar") | `cancelled` → `starting` (click reintentar) | `cancelled` → `syncing` (sin reintentar) |
| **stale** | `running` | `stale` | `get_sync_status_v2_single` (lock + running, sin heartbeat >10 min, >5 min desde inicio) | Frontend (badge "Atascado", botón "Liberar") | `stale` → `starting` (liberar + reintentar) | `stale` → `syncing` (sin liberar) |
| **timeout** | `running` | `timeout` | `get_sync_status_v2_single` (lock + running, >60 min) | Frontend (badge "Timeout", botón "Liberar") | `timeout` → `starting` (liberar + reintentar) | `timeout` → `syncing` (sin liberar) |
| **orphaned** | — | `orphaned` | `get_sync_status_v2_single` (lock activo sin sync_run, >5 min) | Frontend (badge "Huérfano", botón "Liberar") | `orphaned` → `starting` (liberar + reintentar) | `orphaned` → `syncing` (sin sync_run) |
| **zombie** | `running` | `zombie` | `get_sync_status_v2_single` (sync_run running sin lock, >5 min) | Frontend (badge "Zombie", botón "Liberar") | `zombie` → `starting` (liberar + reintentar) | `zombie` → `syncing` (sin lock) |
| **partial_failure** | `running` | `partial_failure` | `get_sync_status_v2_single` (branches_failed > 0, branches_running = 0) | Frontend (badge "Parcial", botón "Liberar") | `partial_failure` → `completed` (si N8N sigue) | `partial_failure` → `syncing` (sin corrección) |

### 3.2 Diagrama de Transiciones de Estados

```
                              ┌──────────┐
                              │   idle   │
                              └────┬─────┘
                                   │ click "Sincronizar"
                                   ▼
                              ┌──────────┐
                              │ starting │
                              └────┬─────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │  queued  │   │  syncing │   │  stale   │ (si no hay heartbeat)
              └────┬─────┘   └────┬─────┘   └────┬─────┘
                   │              │              │
                   ▼              ▼              ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │  syncing  │   │ finishing│   │ liberar  │
              └────┬─────┘   └────┬─────┘   └────┬─────┘
                   │              │              │
         ┌─────────┴─────────┐    │              ▼
         │                 │    │         ┌──────────┐
         ▼                 ▼    ▼         │   idle   │
    ┌──────────┐      ┌──────────┐        └──────────┘
    │ completed│      │  failed  │
    └────┬─────┘      └────┬─────┘
         │                 │
         ▼                 ▼
    ┌──────────┐      ┌──────────┐
    │   idle   │      │   idle   │
    │ (tras 5s)│      │ (tras 4s)│
    └──────────┘      └──────────┘
         │
         ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │  timeout │      │ orphaned │      │  zombie  │
    │ (si >60m)│      │(lock sin│      │(run sin  │
    │          │      │ sync_run)│      │ lock)    │
    └──────────┘      └──────────┘      └──────────┘
```

### 3.3 Estados Fantasmas / No Documentados

| Estado Fantasma | Cuándo Aparece | Causa Raíz |
|-----------------|----------------|------------|
| `syncing` con `sync_run_id = null` | N8N no creó el sync_run o lo creó con ID diferente | El frontend usa `tempSyncRunId` pero N8N no lo usa |
| `syncing` con `branch_count = 0` | N8N no insertó branches | El workflow no tiene nodos que inserten en `tfi_sync_run_branches` |
| `syncing` con `minutes_since_last_n8n_step = 999999` | N8N nunca insertó en `tfi_n8n_step_logs` | El workflow no tiene heartbeat / logging de pasos |
| `starting` por más de 5 minutos | N8N no envió primer heartbeat | El workflow tarda en iniciar o no tiene logging inicial |
| `completed` con `lock_is_running = true` | N8N no liberó el lock | El workflow terminó pero no ejecutó el UPDATE de `tfi_sync_locks` |
| `failed` con `lock_is_running = true` | N8N no liberó el lock en error | El workflow falló pero no ejecutó el UPDATE de `tfi_sync_locks` |
| `running` (estado DB) con `computed_status = 'zombie'` | No hay lock activo | El lock se liberó por cleanup o por otro proceso |
| `running` (estado DB) con `computed_status = 'stale'` | No hay heartbeat pero lock sigue | El workflow se colgó, o el lock no se liberó |

---

## 4. RACE CONDITIONS (Entregable C)

### 4.1 Inventario Completo de Race Conditions

| ID | Entidades Involucradas | Escenario | Condición de Carrera | Impacto |
|----|------------------------|-----------|----------------------|---------|
| **RC-001** | Frontend ↔ Supabase | Dos usuarios hacen click en "Sincronizar" para el mismo almacén simultáneamente | `acquire_tfi_sync_lock` usa `ON CONFLICT ... WHERE is_running = false`. Ambos leen `is_running = false` antes del upsert. Ambos adquieren lock. | Dos sincronizaciones del mismo almacén ejecutándose en paralelo. Datos corruptos. |
| **RC-002** | Frontend ↔ Frontend | `WarehouseSyncButtons` y `TfiRefreshControl` hacen polling para la misma `session_id` | Ambos crean `setInterval` con `getSyncStatusV2`. El primero que detecta `completed` ejecuta `clearPolling` para SÍ MISMO, pero el OTRO sigue con su interval activo. | Polling residual del segundo componente después de que el sync terminó. |
| **RC-003** | Frontend ↔ Frontend | `shouldResetToIdle()` (auto-reset cada 30s) y el polling se ejecutan simultáneamente | El auto-reset lee `completed` y ejecuta `clearPolling` + `resetWarehouseState`. PERO el polling del interval también está ejecutando `getSyncStatusV2`. Si el interval se disparó justo antes del clear, el poll puede recrear estado. | Estado zombie recreado después de limpieza. |
| **RC-004** | Frontend ↔ N8N | El frontend recibe respuesta del webhook ANTES de que N8N cree el `sync_run` | El frontend obtiene `realSyncRunId` (o el temp) e inicia polling. Pero N8N aún no insertó el `sync_run`. El primer poll retorna `idle` o `zombie`. | Polling inicia contra un sync_run que no existe. Estado errático. |
| **RC-005** | N8N ↔ N8N | Múltiples instancias del workflow N8N ejecutan para el mismo almacén | N8N no tiene lock interno. Si el frontend dispara el webhook dos veces (por duplicación de click o dos usuarios), dos workflows N8N corren simultáneamente. | Datos duplicados en `tfi_count_lines`. Sync_run conflicts. |
| **RC-006** | N8N ↔ Supabase | N8N actualiza `tfi_sync_runs` a `completed` y el frontend lee el estado en el mismo instante | El RPC `get_sync_status_v2_single` lee `tfi_sync_runs` y `tfi_sync_locks` en dos queries separadas (o partes del JOIN). Si N8N actualiza el lock entre la lectura del sync_run y la lectura del lock, el RPC puede retornar `sync_run=completed` + `lock_is_running=true` → `computed_status = 'zombie'`. | Falso zombie en el momento exacto de finalización. |
| **RC-007** | Frontend ↔ N8N | El frontend ejecuta `releaseSyncLock` (por error) mientras N8N está actualizando datos | El frontend libera el lock. N8N termina y trata de liberar el lock, pero ya no está. N8N actualiza `sync_run` a `completed`. El backend ve `completed` sin lock → `computed_status = 'zombie'`. | Sync completado correctamente se muestra como `zombie`. |
| **RC-008** | Frontend ↔ RPC | El frontend ejecuta `cancelSyncRun` mientras el polling está en medio de `getSyncStatusV2` | El poll lee `sync_run` en estado `running`. El cancel lo marca `cancelled`. El poll retorna `running` (lectura vieja). El frontend ignora `cancelled` porque confía en el poll. | Cancelación no reflejada inmediatamente. Usuario ve sync corriendo después de cancelar. |
| **RC-009** | Frontend ↔ Frontend | El usuario cambia de sesión en el selector mientras `TfiRefreshControl` está haciendo polling para la sesión anterior | `TfiRefreshControl` tiene un `useEffect` que depende de `activeSession?.id`. Si cambia, el cleanup del useEffect ejecuta `stopPolling()`. PERO si el poll está en medio de `getSyncStatusV2`, el resultado del poll puede llegar DESPUÉS del cambio de sesión. | Estado del almacén anterior se muestra en la sesión nueva. |
| **RC-010** | RPC ↔ N8N | `cleanup_zombie_syncs` se ejecuta mientras N8N está procesando un sync legítimo | El cleanup marca `sync_run` como `failed` porque el sync lleva >60 min. PERO N8N sigue ejecutando. N8N actualiza `status = 'completed'` después. El frontend ve `failed` primero, luego `completed`. | Estado errático: `failed` → `completed` sin intervención del usuario. |
| **RC-011** | Frontend ↔ N8N | El frontend detecta `completed` y ejecuta `triggerRefresh()` + `setTimeout(reset, 5000)`. El usuario hace click en "Reintentar" durante los 5 segundos. | El `setTimeout` de reset se ejecuta DESPUÉS de que el usuario inició un nuevo sync. El reset sobreescribe el estado del nuevo sync a `idle`. | Nuevo sync iniciado por el usuario se "resetea" a `idle` automáticamente. |
| **RC-012** | Frontend ↔ N8N | El frontend usa `isDeadSync()` para forzar `effectiveStatus = 'stale'`. Pero N8N envía un heartbeat JUSTO DESPUÉS de que el frontend calculó `isDeadSync`. | El poll actual usa datos viejos. El siguiente poll (3s después) leerá el heartbeat. PERO el frontend ya ejecutó `clearPolling()` y detuvo el polling. | Polling detenido prematuramente por falso positivo de `isDeadSync`. |

### 4.2 Diagrama de Race Condition RC-002 (Polling Duplicado)

```
Tiempo →

WarehouseSyncButtons:  [POLL][POLL][POLL][POLL]...
TfiRefreshControl:     [POLL][POLL][POLL][POLL]...
                          │
                          ▼
                     Backend recibe
                     2 requests cada 3s
                     para la MISMA sesión
                          │
                          ▼
                     Cuando uno detecta
                     'completed':
                     - WSB: clearPolling() ← limpia SU interval
                     - TRC: sigue corriendo
                          │
                          ▼
                     TRC sigue haciendo POLL
                     aunque el sync ya terminó
                     → Polling residual
```

### 4.3 Diagrama de Race Condition RC-006 (Lectura Inconsistente en RPC)

```
RPC get_sync_status_v2_single:

  Paso 1: SELECT tfi_sync_runs
          → status = 'running'
          │
          │  ← N8N ejecuta UPDATE tfi_sync_runs SET status='completed'
          │     N8N ejecuta UPDATE tfi_sync_locks SET is_running=false
          │
          ▼
  Paso 2: SELECT tfi_sync_locks
          → is_running = false
          │
          ▼
  Cálculo: sync_run.status = 'running' + lock.is_running = false
           → computed_status = 'zombie' ❌

  Resultado: FALSO ZOMBIE en el momento exacto de finalización
```

---

## 5. PUNTOS ÚNICOS DE VERDAD (Entregable D)

### 5.1 Definición Oficial de Fuente de Verdad

| Dato | Fuente Oficial de Verdad | ¿Quién la Escribe? | ¿Quién la Consume? | Riesgo de Múltiples Interpretaciones |
|------|--------------------------|-------------------|-------------------|--------------------------------------|
| **Estado del sync** | `tfi_sync_runs.status` + `tfi_sync_locks.is_running` | N8N (al finalizar), `cancel_sync_run` RPC, `cleanup_zombie_syncs` RPC, `release_tfi_sync_lock` RPC | `get_sync_status_v2_single` RPC, Frontend | **ALTO** — El frontend aplica `isDeadSync()` y `hasExceededN8nTimeout()` para SOBREESCRIBIR el `computed_status` del backend. |
| **Lock de concurrencia** | `tfi_sync_locks.is_running` | `acquire_tfi_sync_lock` RPC, N8N, `release_tfi_sync_lock` RPC, `cancel_sync_run` RPC, `cleanup_zombie_syncs` RPC, `force_release_sync_lock_single` RPC | `get_sync_status_v2_single` RPC, Frontend | **MEDIO** — El frontend tiene `syncStates` local que replica el lock. Puede desincronizarse. |
| **Progreso del sync** | `tfi_sync_run_branches` | N8N (durante ejecución) | `get_sync_status_v2_single` RPC | **BAJO** — Solo N8N escribe. El frontend solo consume. |
| **Heartbeat de N8N** | `tfi_n8n_step_logs` | N8N (durante ejecución), `updateSyncHeartbeat` (frontend, en el servicio) | `get_sync_status_v2_single` RPC | **MEDIO** — El frontend TAMBIÉN puede escribir heartbeat (aunque no lo hace actualmente). N8N debería ser el único escritor. |
| **sync_run_id activo** | `tfi_sync_locks.sync_run_id` | `acquire_tfi_sync_lock` RPC, N8N | `get_sync_status_v2_single` RPC, Frontend | **ALTO** — El frontend usa `tempSyncRunId` que puede diferir del ID real de N8N. |
| **Filas procesadas** | `tfi_sync_runs.total_rows` | N8N (durante ejecución) | `get_sync_status_v2_single` RPC, Frontend | **BAJO** — Solo N8N escribe. |
| **Timestamp de inicio** | `tfi_sync_runs.started_at` | N8N (al crear) | `get_sync_status_v2_single` RPC | **BAJO** — Solo N8N escribe. |
| **Timestamp de fin** | `tfi_sync_runs.finished_at` | N8N (al finalizar), RPCs de cancel/liberación | `get_sync_status_v2_single` RPC | **MEDIO** — Múltiples RPCs pueden escribir `finished_at`. |
| **Error del sync** | `tfi_sync_runs.error_message` | N8N (al fallar), `release_tfi_sync_lock` RPC | `get_sync_status_v2_single` RPC | **MEDIO** — `release_tfi_sync_lock` puede sobreescribir un error real de N8N con un mensaje genérico. |
| **Tiempo transcurrido** | `EXTRACT(EPOCH FROM (NOW() - started_at)) / 60` (calculado en RPC) | Calculado en RPC | Frontend | **BAJO** — Calculado a partir de `started_at` que es verdad. |
| **Actividad N8N (idle)** | `EXTRACT(EPOCH FROM (NOW() - last_n8n_step_at)) / 60` (calculado en RPC) | Calculado en RPC | Frontend | **MEDIO** — Si N8N no escribe logs, `minutes_since_last_n8n_step = 999999`. El frontend interpreta esto como "sin actividad" aunque N8N esté corriendo. |

### 5.2 Problema Central: El Frontend NO respeta la fuente de verdad

```
FUENTE DE VERDAD REAL (backend):
  computed_status = 'completed'
  lock_is_running = true  ← N8N aún no liberó el lock

FRONTEND (WarehouseSyncButtons):
  isDeadSync(status) = false  ← hay heartbeat
  hasExceededN8nTimeout(status) = false  ← heartbeat reciente
  effectiveStatus = 'completed'  ← coincide con backend

  ✓ OK

FUENTE DE VERDAD REAL (backend):
  computed_status = 'syncing'
  lock_is_running = true
  minutes_since_last_n8n_step = 999999
  minutes_since_start = 2

FRONTEND (WarehouseSyncButtons):
  isDeadSync(status) = false  ← minutes_since_start < 5 (GRACE PERIOD)
  hasExceededN8nTimeout(status) = false  ← GRACE PERIOD
  effectiveStatus = 'syncing'  ← coincide con backend

  ✓ OK

FUENTE DE VERDAD REAL (backend):
  computed_status = 'syncing'
  lock_is_running = true
  minutes_since_last_n8n_step = 999999
  minutes_since_start = 7

FRONTEND (WarehouseSyncButtons):
  isDeadSync(status) = true  ← GRACE PERIOD expiró + 999999 + no lock
    PERO: lock_is_running = true
    isDeadSync dice: "if (!status.lock_is_running && ...) return true"
    lock_is_running = true → isDeadSync = false
  
  hasExceededN8nTimeout(status) = true  ← 999999 > 3 min + lock_is_running=true
  effectiveStatus = 'stale'  ← FORZADO por frontend

  ⚠️ PROBLEMA: El backend dice 'syncing'. El frontend dice 'stale'.
  ¿Por qué? Porque el backend no tiene GRACE PERIOD en el RPC para 
  minutes_since_last_n8n_step = 999999 cuando lock_is_running=true.

  Si N8N está corriendo pero no envió heartbeat (porque el logging no
  está configurado), el frontend marca 'stale' aunque el sync sea legítimo.
```

### 5.3 Recomendación para Punto Único de Verdad

> **La única fuente de verdad debe ser el backend (`get_sync_status_v2_single`). El frontend debe ELIMINAR toda lógica de `isDeadSync()`, `hasExceededN8nTimeout()`, `isSyncingWithZeroRowsHealthy()`, y `shouldResetToIdle()` como OVERRIDE del backend. Estas funciones pueden existir como DETECCIÓN para mostrar advertencias, pero NUNCA para sobrescribir `computed_status`.**

---

## 6. ANÁLISIS POR SÍNTOMA

### 6.1 Síntoma 1: Ramas que quedan pegadas

**Descripción:** Una rama permanece en "Sincronizando", "En espera" o "Bloqueado" aunque N8N ya terminó.

**Análisis:**
- "Rama" en el contexto del frontend se refiere a `tfi_sync_run_branches`.
- N8N inserta branches al inicio y actualiza `status` al finalizar.
- Si N8N NO actualiza una branch (porque el workflow se colgó o falló silenciosamente), la branch queda en `status = 'running'`.
- El frontend muestra `branches_completed / branches_total`. Si `branches_completed < branches_total`, muestra progreso incompleto.
- El frontend no tiene lógica para detectar branches individuales pegadas. Solo muestra el conteo del RPC.

**Causa Raíz:**
1. N8N no ejecuta el nodo de UPDATE de `tfi_sync_run_branches` al finalizar una rama.
2. N8N no ejecuta el nodo de UPDATE de `tfi_sync_run_branches` al fallar una rama.
3. El frontend no tiene timeout a nivel de branch.

**Hallazgo:** `get_sync_status_v2_single` no tiene `minutes_since_last_branch_update`. Solo cuenta `branches_completed` y `branches_running`. No hay detección de branch stale.

**Recomendación:** Agregar `minutes_since_last_branch_update` al RPC. Si una branch lleva >30 min en `running` sin actualización, marcarla como stale en el frontend.

---

### 6.2 Síntoma 2: Estados inconsistentes Front vs Backend

**Descripción:** Backend dice `completed`, frontend dice `syncing` / `stale` / esperando actividad de N8N. O viceversa.

**Análisis Detallado:**

**Caso A: Backend `completed`, Frontend `stale`**
- Escenario: N8N terminó, actualizó `tfi_sync_runs` a `completed`, pero NO actualizó `tfi_sync_locks` (lock sigue `is_running=true`).
- El RPC `get_sync_status_v2_single` detecta: `sync_run.status = 'completed'` + `lock.is_running = true` → `computed_status = 'zombie'`.
- PERO `WarehouseSyncButtons` aplica `isDeadSync()` y `hasExceededN8nTimeout()`.
- Si `isDeadSync()` es false y `hasExceededN8nTimeout()` es false, `effectiveStatus` sigue siendo `computed_status` = `zombie`.
- El frontend muestra "Zombie" — correcto desde el punto de vista del backend.
- ¿Pero el usuario dice que ve "syncing" o "stale"? Eso implicaría que el frontend NO está usando `effectiveStatus` correctamente.

Revisando el código:
- `WarehouseSyncButtons`: `stateFromStatus()` calcula `effectiveStatus` y lo usa. PERO el `setSyncStates` en el guard clause de terminal state usa `effectiveStatus`.
- `TfiRefreshControl`: `applyBackendStatus()` aplica `effectiveStatus` directamente.
- Si `computed_status` = `completed` y `lock_is_running = true`, el RPC devuelve `zombie`. El frontend mostrará `zombie`.
- Si `computed_status` = `completed` y `lock_is_running = false`, el RPC devuelve `completed`. El frontend mostrará `completed`.

**¿Cuándo backend `completed` → frontend `syncing` / `stale`?**
- Esto NO debería pasar si el frontend usa `effectiveStatus` correctamente.
- PERO: si el frontend está en medio de un `setTimeout` de reset o si hay un `isDeadSync()` forzando `stale`, podría pasar.

**Caso B: Backend `running`, Frontend `idle`**
- Esto NO debería pasar porque el frontend siempre consulta el backend.
- PERO: si `shouldResetToIdle()` se ejecuta en el auto-reset (30s) y el backend aún no actualizó el sync_run, `shouldResetToIdle()` puede decir `true` porque `minutes_since_finish > 5` o `minutes_since_start > 120`.
- El frontend resetea a `idle` aunque el backend diga `running`.

**Causa Raíz:**
1. `shouldResetToIdle()` tiene condiciones que NO verifican si el backend tiene un sync RUNNING actual. Solo verifica `minutes_since_start > 120` y `branches_running === 0`.
2. Si un sync legítimo lleva más de 2 horas (posible para almacenes grandes), `shouldResetToIdle()` lo marcará como `idle`.
3. El frontend no consulta el backend ANTES de `shouldResetToIdle()`. Usa el estado del último poll.

**Hallazgo Confirmado (H-003):** `shouldResetToIdle()` puede resetear un sync `running` a `idle` si lleva >120 minutos.

**Recomendación:** `shouldResetToIdle()` debe consultar el backend FRESH en cada ejecución del auto-reset, no usar el estado del último poll. O eliminar `shouldResetToIdle()` y confiar EXCLUSIVAMENTE en `computed_status` del backend.

---

### 6.3 Síntoma 3: Polling residual

**Descripción:** Múltiples llamadas repetidas a `getSyncStatusV2()` después de que una sincronización ya terminó.

**Análisis Detallado:**

**Causa 1: Polling duplicado (RC-002)**
- `WarehouseSyncButtons` y `TfiRefreshControl` crean intervals independientes.
- Si un sync se inició desde `WarehouseSyncButtons`, `TfiRefreshControl` NO sabe que hay un sync activo.
- PERO: si `TfiRefreshControl` hace un mount check y detecta `isActiveState` para la sesión del almacén, también inicia polling.
- Resultado: DOS intervals para la misma sesión.
- Cuando el sync termina, `WarehouseSyncButtons` ejecuta `clearPolling()` para su propio interval. `TfiRefreshControl` sigue con SU interval.
- `TfiRefreshControl` continúa haciendo `getSyncStatusV2()` cada 3 segundos.

**Causa 2: Race condition en clearPolling (RC-003)**
- `shouldResetToIdle()` (auto-reset cada 30s) ejecuta `clearPolling()`.
- PERO si el interval se dispara justo después del clear, el poll se ejecuta de todos modos.
- El poll actualiza `syncStates` y el estado ya no es `idle`.
- En el siguiente auto-reset (30s después), `shouldResetToIdle()` lee `syncStates` que NO es `idle`, y NO ejecuta clear.
- PERO el interval fue limpiado. Entonces no hay polling activo, pero el estado muestra `syncing` o similar.
- Esto es inconsistente pero no es "polling residual". Es "estado incorrecto sin polling".

**Causa 3: setTimeout recrea estado después de clearPolling**
- Cuando `completed` se detecta, el frontend ejecuta:
  ```
  clearPolling()
  setSyncStates(...completed...)
  setTimeout(() => resetWarehouseState(), 5000)
  ```
- Si durante esos 5 segundos el usuario hace algo que fuerza un re-render (ej. cambia de pestaña), `useEffect` del auto-reset se ejecuta.
- El auto-reset lee `syncStates` = `completed` y `shouldResetToIdle()` = `true` (porque finished > 5 min).
- El auto-reset ejecuta `resetWarehouseState()` → estado `idle`.
- Luego el `setTimeout` de 5s ejecuta `resetWarehouseState()` de nuevo.
- No hay polling residual, pero sí doble reset.

**Causa 4: Memory leak en setTimeout de reset**
- El `setTimeout` para reset después de `completed` no se guarda en un ref.
- Si el componente se desmonta, el `setTimeout` sigue ejecutándose.
- Si el componente se vuelve a montar, el `setTimeout` original puede ejecutar `resetWarehouseState()` en el nuevo estado.
- Esto no es polling residual, pero es un estado fantasma.

**Causa Raíz Confirmada:**
1. **RC-002:** Polling duplicado sin deduplicación entre componentes.
2. **RC-003:** Race condition entre auto-reset y polling.
3. **H-008:** `setTimeout` sin cleanup en desmontaje.

**Recomendación:**
1. Centralizar polling en un solo hook/componente.
2. Usar `useRef` para guardar el `setTimeout` ID y limpiarlo en cleanup.
3. Eliminar `shouldResetToIdle()` del auto-reset. Usar `computed_status` del backend.

---

### 6.4 Síntoma 4: Session IDs activos sin razón

**Descripción:** `session_id` queda vivo, `sync_run` queda cerrado, `lock` queda abierto.

**Análisis:**
- `session_id` no tiene un campo "activo" en `tfi_sessions`. Las sesiones están siempre "activas" mientras existan en la tabla.
- El síntoma probablemente se refiere a: `tfi_sync_locks` con `is_running=true` para una sesión que no tiene sync activo.

**Escenarios de inconsistencia:**

**Escenario A: Lock abierto + sync_run cerrado**
- `tfi_sync_locks.is_running = true`
- `tfi_sync_runs.status = 'completed'` (o `failed`, `cancelled`)
- `tfi_sync_locks.finished_at IS NULL` (o viejo)
- El RPC `get_sync_status_v2_single` detecta: `sync_run.status = 'completed'` + `lock.is_running = true` → `computed_status = 'zombie'`.
- El frontend muestra "Zombie".

**Causa:** N8N terminó el sync_run pero NO ejecutó el UPDATE de `tfi_sync_locks`.

**Escenario B: Lock abierto + sync_run inexistente**
- `tfi_sync_locks.is_running = true`
- `tfi_sync_locks.sync_run_id` apunta a un sync_run que no existe
- El RPC detecta: lock activo + no sync_run → `computed_status = 'orphaned'`.

**Causa:** El frontend adquirió lock con `tempSyncRunId`, pero N8N nunca creó el sync_run. O el sync_run fue borrado.

**Escenario C: sync_run running + lock cerrado**
- `tfi_sync_runs.status = 'running'`
- `tfi_sync_locks.is_running = false`
- El RPC detecta: sync_run running + no lock → `computed_status = 'zombie'`.

**Causa:** El lock fue liberado por `releaseSyncLock`, `cancelSyncRun`, o `cleanupZombieSyncs`, pero N8N sigue ejecutando y no actualizó el sync_run.

**Escenario D: sync_run running + no lock + no branches**
- `tfi_sync_runs.status = 'running'`
- `tfi_sync_locks.is_running = false`
- `tfi_sync_run_branches` vacío para este sync_run
- El RPC detecta: `computed_status = 'zombie'`.

**Causa:** N8N creó el sync_run pero nunca insertó branches. O el workflow se ejecutó parcialmente.

**Recomendación:**
- El `cleanup_zombie_syncs` ya maneja la mayoría de estos casos. PERO el cleanup se ejecuta solo al montar la página y al click manual.
- Agregar un `SCHEDULED` cleanup en Supabase (pg_cron) que ejecute `cleanup_zombie_syncs` cada 5 minutos.
- Agregar un trigger de `tfi_sync_locks` que verifique: si `sync_run_id` apunta a un sync_run que ya está `completed`/`failed`/`cancelled`, auto-liberar el lock.

---

### 6.5 Síntoma 5: N8N termina pero Front sigue esperando

**Descripción:** N8N terminó el workflow, pero el frontend sigue mostrando "Sincronizando..." o "Esperando actividad de N8N...".

**Análisis Detallado:**

**Causa 1: N8N no actualizó `tfi_sync_locks`**
- N8N terminó, actualizó `tfi_sync_runs` a `completed`.
- PERO NO actualizó `tfi_sync_locks.is_running` a `false`.
- El RPC `get_sync_status_v2_single` detecta: `sync_run = completed` + `lock = running` → `computed_status = 'zombie'`.
- El frontend muestra "Zombie".
- PERO: ¿el usuario dice que ve "syncing" o "esperando"? Eso implicaría que el frontend no está usando `effectiveStatus` correctamente.

Revisando el código de `WarehouseSyncButtons`:
```
// En el polling:
let effectiveStatus: ComputedSyncStatus = status.computed_status;
if (isDead || n8nTimeoutExceeded) {
  effectiveStatus = 'stale';
}

if (isTerminalState(effectiveStatus)) {
  clearPolling(warehouseId);
  // update state
  return;
}
```

Si `computed_status = 'zombie'`:
- `isDeadSync(status)` = `false` (zombie no es syncing ni starting)
- `hasExceededN8nTimeout(status)` = `false` (zombie no es syncing ni starting)
- `effectiveStatus = 'zombie'`
- `isTerminalState('zombie')` = `true`
- `clearPolling()` → detiene polling
- Estado muestra `zombie`.

Si `computed_status = 'syncing'` (porque N8N no actualizó nada):
- `isDeadSync(status)` = depende de heartbeat
- `hasExceededN8nTimeout(status)` = depende de heartbeat
- Si N8N terminó pero NO envió heartbeat ni actualizó nada:
  - `lock_is_running = true` (si N8N lo mantuvo)
  - `sync_run_status = 'running'`
  - `minutes_since_last_n8n_step = 999999`
  - `isDeadSync(status)` = `false` (porque `lock_is_running = true`)
  - `hasExceededN8nTimeout(status)` = `true` (porque `999999 > 3` y `lock_is_running = true`)
  - `effectiveStatus = 'stale'`
  - `isTerminalState('stale')` = `true`
  - `clearPolling()`
  - Estado muestra `stale`.

**PERO:** ¿qué pasa si `computed_status = 'syncing'` y `lock_is_running = true` y `hasExceededN8nTimeout = false`? Esto pasaría si:
- `minutes_since_last_n8n_step <= 3` (hay heartbeat reciente)
- `minutes_since_start <= 60` (no timeout)
- `sync_run_status = 'running'`
- `lock_is_running = true`

En este caso, el frontend seguiría mostrando `syncing` y haciendo polling. PERO el backend también dice `syncing`. Entonces no hay desincronización.

**¿Cuándo N8N termina pero frontend sigue esperando?**
- Esto SOLO puede pasar si N8N terminó pero el frontend NO se entera.
- El frontend se entera SOLO a través de `getSyncStatusV2()`.
- Si N8N terminó y actualizó correctamente, el siguiente poll detectará `completed`.
- Si el frontend no detecta `completed`, es porque:
  1. N8N NO actualizó `tfi_sync_runs` (fallo en el workflow de N8N).
  2. El frontend dejó de hacer polling (por timeout, por clear, por reset).
  3. El polling está duplicado y uno de los intervals se detuvo pero el otro sigue (pero el que sigue debería detectar `completed`).
  4. El frontend aplica `isDeadSync()` o `hasExceededN8nTimeout()` y fuerza `stale` ANTES de que el poll detecte `completed`.

**Causa Raíz Confirmada (H-002):** `isDeadSync()` y `hasExceededN8nTimeout()` pueden forzar `stale` sobre un `computed_status` que el backend podría haber cambiado a `completed` en el siguiente poll. PERO el `setInterval` es de 3 segundos, y `isDeadSync()` se evalúa en cada poll. No hay un "atraso" significativo.

**¿Hay una ventana de tiempo donde el frontend no detecta `completed`?**
- Sí: si el `setTimeout` de reset (5s) se ejecuta ANTES del siguiente poll. PERO el poll se ejecuta cada 3s, y el `setTimeout` de 5s se ejecuta DESPUÉS de detectar `completed`. Entonces el siguiente poll se ejecutaría en 3s, y el reset en 5s. El poll actualizaría el estado a `completed` antes del reset.
- PERO: si `shouldResetToIdle()` se ejecuta en el auto-reset (30s) y el último poll fue hace 3s, el estado podría ser `completed` y `shouldResetToIdle()` lo resetearía a `idle` antes de que el usuario vea `completed`.

**Hallazgo Adicional:** El `setTimeout` de reset para `completed` usa 5000ms. PERO el `showToast` para `completed` usa 4000ms. El toast desaparece antes del reset. El usuario podría no ver el estado `completed` si el auto-reset lo limpia primero.

**Recomendación:**
1. Eliminar `shouldResetToIdle()` del auto-reset.
2. Asegurar que `completed` se mantenga visible al menos 10 segundos antes de auto-reset.
3. Verificar que N8N SIEMPRE ejecute el UPDATE de `tfi_sync_runs` y `tfi_sync_locks` al finalizar, incluso en ramas parciales.

---

### 6.6 Síntoma 6: Timeouts falsos

**Descripción:** `minutes_since_last_n8n_step = 999999` aunque el flujo estaba funcionando.

**Análisis:**

**¿Qué significa `999999`?**
- En el RPC `get_sync_status_v2_single`, el cálculo es:
  ```sql
  COALESCE(EXTRACT(EPOCH FROM (NOW() - last_n8n_step_at)) / 60, 999999)
  ```
- Si `last_n8n_step_at IS NULL` (no hay logs en `tfi_n8n_step_logs` para este sync_run), el valor es `999999`.

**¿Cuándo `last_n8n_step_at` es NULL?**
1. N8N nunca insertó en `tfi_n8n_step_logs`.
2. N8N insertó en `tfi_n8n_step_logs` pero con un `sync_run_id` diferente.
3. Los logs de `tfi_n8n_step_logs` fueron purgados.
4. El `sync_run` es viejo y los logs son de un sync_run más reciente.

**¿Por qué `999999` cuando el flujo estaba funcionando?**
- Si N8N NO tiene configurado el nodo de INSERT en `tfi_n8n_step_logs`, el flujo funciona (procesa datos, actualiza `tfi_sync_runs.total_rows`) pero nunca envía heartbeat.
- El frontend ve `999999` y aplica `hasExceededN8nTimeout()` → `effectiveStatus = 'stale'`.
- PERO el sync está REALMENTE corriendo. El frontend lo marca como `stale` incorrectamente.

**Causa Raíz:**
1. **N8N no tiene el nodo de logging de heartbeat.** El workflow inserta datos en `tfi_count_lines` pero NO en `tfi_n8n_step_logs`.
2. **El frontend usa `999999` como indicador de muerte.** En `isDeadSync()`, si `minutes_since_last_n8n_step >= 999999` y `lock_is_running = false` (o `minutes_since_start > 5`), marca como dead.
3. **El backend no diferencia entre "sin heartbeat porque no hay logs" y "sin heartbeat porque el workflow murió".**

**Hallazgo Confirmado (H-009):** `isDeadSync()` usa `minutes_since_last_n8n_step >= 999999` como condición de muerte sin considerar que N8N puede no estar configurado para enviar heartbeats.

**Recomendación:**
1. **Documentar que N8N DEBE insertar heartbeat en `tfi_n8n_step_logs`.** Sin esto, el stale detection no funciona.
2. **Cambiar `hasExceededN8nTimeout()` para NO usar `999999` como timeout.** Si `last_n8n_step_at IS NULL`, el timeout debería ser basado en `minutes_since_start` (ej. si `minutes_since_start > 30` y no hay logs, entonces stale).
3. **Agregar `GRACE_PERIOD_NO_HEARTBEAT = 30` minutos.** Si N8N no envía heartbeat, darle 30 minutos antes de marcar stale, en lugar de 3 minutos.

---

### 6.7 Síntoma 7: Sincronizaciones que finalizan parcialmente

**Descripción:** N8N terminó, pero solo cargó una parte de los registros. El frontend sigue esperando.

**Análisis:**

**¿Qué significa "N8N terminó"?**
- N8N actualizó `tfi_sync_runs.status = 'completed'`.
- N8N actualizó `tfi_sync_locks.is_running = false`.
- PERO `tfi_sync_runs.total_rows` es menor que el total esperado.

**¿Cómo se detecta "finalización parcial"?**
- El frontend no tiene un "total esperado". Solo muestra `total_rows`.
- El usuario detecta que `total_rows` es menor que el total de artículos en el WMS.
- O el usuario detecta que el dashboard no tiene todos los artículos.

**¿Por qué N8N termina con registros incompletos?**

1. **Loop Over Items en N8N con condición de salida prematura:**
   - El workflow N8N tiene un "Loop Over Items" que procesa batches.
   - Si una condición de salida (ej. "if no more rows") se activa prematuramente, el loop termina antes de procesar todos los items.
   - N8N ejecuta el nodo de finalización y marca `completed`.

2. **Batch processing con `total_rows` que solo cuenta la última batch:**
   - Si N8N actualiza `total_rows` en cada batch, pero solo la última batch se guarda (porque no acumula), `total_rows` es menor.
   - PERO el frontend muestra `total_rows` como progreso. Si es menor, el usuario nota que algo faltó.

3. **Error silencioso en una rama:**
   - Una rama del workflow falla silenciosamente (sin error message).
   - N8N no detecta el error y ejecuta el nodo de finalización.
   - `tfi_sync_run_branches.status` para esa rama queda `running` (o `failed` si N8N lo actualizó).
   - El frontend muestra `branches_completed < branches_total`.

4. **`finalize_sync_run` no verifica que todas las branches estén completadas:**
   - N8N tiene un nodo `finalize_sync_run` que marca `completed`.
   - Si este nodo no verifica `tfi_sync_run_branches`, puede marcar `completed` aunque haya branches `running`.

**Causa Raíz:**
1. **N8N no tiene validación de "todas las branches completadas" antes de marcar `completed`.**
2. **N8N no tiene validación de "total_rows coincide con conteo esperado" antes de marcar `completed`.**
3. **El frontend no detecta finalización parcial.** No hay lógica que compare `total_rows` con un total esperado.

**Recomendación:**
1. Agregar una validación en N8N: antes de marcar `completed`, verificar que `COUNT(*) FILTER (WHERE status = 'running')` de `tfi_sync_run_branches` para este `sync_run_id` sea 0.
2. Agregar una validación en N8N: el `total_rows` debe coincidir con el número de registros insertados en `tfi_count_lines` / `tfi_count_attempts`.
3. Agregar una validación en el frontend: si `computed_status = 'completed'` pero `branches_completed < branches_total`, mostrar advertencia de "Finalización parcial".

---

### 6.8 Síntoma 8: Estados zombies

**Descripción:** Estados que no deberían persistir: `queued` infinito, `running` infinito, `syncing` infinito, `stale` falso, `completed` falso.

**Análisis por Estado:**

**`queued` infinito:**
- `queued` es generado por `get_sync_status_v2_single` cuando `sync_run.status = 'queued'`.
- El frontend no tiene timeout para `queued`.
- Si N8N nunca procesa el `queued` (porque el workflow no se inició), el sync_run queda `queued` para siempre.
- El `cleanup_zombie_syncs` no limpia `queued` porque solo limpia `status = 'running'`.

**`running` infinito (backend):**
- `tfi_sync_runs.status = 'running'` con `finished_at IS NULL`.
- El `cleanup_zombie_syncs` limpia esto después de 60 minutos.
- PERO si `cleanup_zombie_syncs` no se ejecuta (porque el frontend no se montó), el sync_run queda `running`.

**`syncing` infinito (frontend):**
- El frontend muestra `syncing` mientras `computed_status = 'syncing'`.
- El `MAX_POLL_ATTEMPTS = 1200` (60 min) detiene el polling.
- PERO si `shouldResetToIdle()` se ejecuta en el auto-reset y NO detiene el polling (porque el backend sigue `running`), el frontend seguirá mostrando `syncing`.
- El backend dice `timeout` después de 60 min. El frontend debería detectar `timeout` en el siguiente poll.
- PERO si el poll se detuvo por `MAX_POLL_ATTEMPTS`, el frontend muestra `timeout` pero el backend sigue `running`.

**`stale` falso:**
- `stale` se genera cuando `lock_is_running = true` + `sync_run.status = 'running'` + `minutes_since_last_n8n_step > 10` + `minutes_since_start > 5`.
- Si N8N no envía heartbeat (porque no está configurado), `minutes_since_last_n8n_step = 999999`.
- El RPC genera `stale` aunque N8N esté corriendo.
- El frontend muestra "Atascado" aunque el sync esté activo.
- El usuario hace "Liberar" → N8N sigue corriendo → datos corruptos.

**`completed` falso:**
- N8N marca `completed` pero solo procesó una parte de los datos.
- El frontend muestra "Completado" pero el dashboard no tiene todos los datos.
- Véase Síntoma 7.

**`zombie` falso:**
- `zombie` se genera cuando `sync_run.status = 'running'` sin lock activo.
- Si `release_tfi_sync_lock` se ejecuta (por error o por cancelación) mientras N8N está corriendo, el lock se libera.
- N8N sigue corriendo y eventualmente marca `completed`.
- El frontend muestra `zombie` hasta que N8N termina.
- PERO si `isDeadSync()` fuerza `stale` y `clearPolling()` detiene el polling, el frontend nunca detectará cuando N8N termina.

**Causa Raíz:**
1. **Falta de `cleanup_zombie_syncs` programado.** El cleanup solo se ejecuta al montar el frontend y al click manual. Si el frontend no se recarga, los zombies persisten.
2. **N8N no tiene manejo de errores robusto.** Si un workflow falla, debe marcar `failed` y liberar el lock. Si el workflow se cuelga, debe tener un timeout interno.
3. **El frontend tiene demasiada lógica de OVERRIDE (`isDeadSync`, `hasExceededN8nTimeout`) que genera estados falsos.**

---

## 7. CAUSAS RAÍZ CONSOLIDADAS

### 7.1 Lista de Causas Raíz

| ID | Causa Raíz | Severidad | Síntomas Afectados |
|----|-----------|-----------|-------------------|
| **CR-001** | **El frontend tiene DOS fuentes de verdad para el estado del sync:** el backend (`computed_status`) y la lógica local (`isDeadSync`, `hasExceededN8nTimeout`, `shouldResetToIdle`). La lógica local puede sobrescribir el backend. | CRÍTICA | 1, 2, 3, 5, 6, 8 |
| **CR-002** | **Polling duplicado sin deduplicación entre `WarehouseSyncButtons` y `TfiRefreshControl`.** Dos intervals para la misma sesión generan race conditions y requests innecesarias. | CRÍTICA | 1, 2, 3, 5 |
| **CR-003** | **N8N no tiene contrato obligatorio de finalización.** No está documentado ni forzado que N8N SIEMPRE ejecute: UPDATE `tfi_sync_runs` + UPDATE `tfi_sync_locks` + UPDATE `tfi_sync_run_branches` al finalizar. | CRÍTICA | 1, 2, 4, 5, 7, 8 |
| **CR-004** | **N8N no tiene contrato obligatorio de heartbeat.** No está documentado ni forzado que N8N SIEMPRE inserte en `tfi_n8n_step_logs`. Sin heartbeat, `minutes_since_last_n8n_step = 999999` y el sistema genera falsos `stale` y `timeout`. | CRÍTICA | 3, 5, 6, 8 |
| **CR-005** | **Falta de `cleanup_zombie_syncs` programado.** El cleanup solo se ejecuta al montar el frontend. Si el usuario no recarga la página, los syncs zombies persisten indefinidamente. | ALTA | 1, 4, 5, 8 |
| **CR-006** | **Race condition en `acquire_tfi_sync_lock` con `ON CONFLICT`.** Dos procesos pueden adquirir el lock simultáneamente. | ALTA | 1, 5, 8 |
| **CR-007** | **`release_tfi_sync_lock` y `force_release_sync_lock_single` marcan `sync_run` como `failed` aunque el sync haya terminado correctamente.** Esto genera falsos positivos en el historial. | ALTA | 2, 4, 8 |
| **CR-008** | **El frontend no verifica que N8N creó el `sync_run` con el ID esperado.** El `tempSyncRunId` del frontend puede diferir del ID real de N8N. | MEDIA | 2, 4, 5 |
| **CR-009** | **`shouldResetToIdle()` puede resetear un sync legítimo que lleva >120 minutos.** Un sync grande puede tardar más de 2 horas. | MEDIA | 2, 3, 5 |
| **CR-010** | **`setTimeout` sin cleanup en desmontaje.** Los `setTimeout` para reset de estado pueden ejecutarse después de que el componente se desmontó. | MEDIA | 3, 5 |
| **CR-011** | **Las tablas de log (`tfi_n8n_step_logs`, `tfi_sync_run_branches`, `tfi_webhook_debug_logs`) no tienen purga.** Crecen indefinidamente y degradan la performance del RPC. | MEDIA | 3, 6 |
| **CR-012** | **El Edge Function `n8n-webhook-proxy` no tiene timeout configurado.** Puede abortar si N8N tarda más de ~10s. | MEDIA | 5, 7 |
| **CR-013** | **N8N no valida que todas las branches estén completadas antes de marcar `completed`.** Puede marcar `completed` con branches `running`. | MEDIA | 7 |
| **CR-014** | **Funciones duplicadas entre `tfi.service.ts` y `sync-lifecycle.service.ts`.** Riesgo de inconsistencia si se modifica una y no la otra. | BAJA | 2, 3 |
| **CR-015** | **El `get_sync_status_v2_single` lee `tfi_sync_runs` y `tfi_sync_locks` en queries separadas (o partes de un JOIN).** N8N puede actualizar el lock entre la lectura del sync_run y la lectura del lock. | BAJA | 2, 5 |

---

## 8. RECOMENDACIONES PRIORIZADAS (Entregable E)

### 8.1 Fase 1: Robusto y Predecible (P0 — Inmediato)

> **Objetivo: Eliminar desincronización entre frontend y backend. El backend debe ser la ÚNICA fuente de verdad.**

| # | Recomendación | Impacto | Esfuerzo | Causa Raíz |
|---|---------------|---------|----------|-----------|
| **R-001** | **Eliminar `isDeadSync()`, `hasExceededN8nTimeout()`, `isSyncingWithZeroRowsHealthy()`, `shouldResetToIdle()` como OVERRIDE de `computed_status`.** El frontend debe renderizar EXACTAMENTE lo que el backend dice. Estas funciones pueden seguir existiendo como DETECCIÓN para mostrar ADVERTENCIAS en la UI, pero NUNCA para cambiar `effectiveStatus`. | Elimina estados falsos (stale, timeout, zombie) generados por el frontend. | Medio | CR-001 |
| **R-002** | **Centralizar polling en un solo componente/hook.** Crear un `SyncContext` o `useSyncPolling(sessionId)` que maneje UN solo `setInterval` por `session_id`. `WarehouseSyncButtons` y `TfiRefreshControl` deben CONSUMIR el estado de este contexto, no crear sus propios intervals. | Elimina polling duplicado y race conditions. Reduce requests a la mitad. | Medio-Alto | CR-002 |
| **R-003** | **Agregar `SCHEDULED` cleanup en Supabase.** Usar `pg_cron` (si está disponible) o un Edge Function programada para ejecutar `cleanup_zombie_syncs` cada 5 minutos. Esto elimina la dependencia de que el frontend se monte para limpiar zombies. | Elimina syncs zombies que persisten cuando el frontend no está abierto. | Medio | CR-005 |
| **R-004** | **Documentar y validar el contrato de N8N.** Crear un documento de "N8N Contract" que especifique: (1) N8N DEBE crear `sync_run` con el ID que recibe del frontend. (2) N8N DEBE insertar heartbeat en `tfi_n8n_step_logs` al menos cada 2 minutos. (3) N8N DEBE actualizar `tfi_sync_runs` y `tfi_sync_locks` al finalizar. (4) N8N DEBE verificar que todas las branches estén completadas antes de marcar `completed`. | Previene los síntomas que ocurren cuando N8N no cumple el contrato. | Bajo (documentación) | CR-003, CR-004, CR-013 |
| **R-005** | **Agregar validación de "sync_run existe" antes de iniciar polling.** Después de `triggerTfiRefresh()`, el frontend debe hacer `getSyncStatusV2()` inmediatamente para verificar que el `sync_run` fue creado. Si no existe, mostrar error y no iniciar polling. | Previene polling contra sync_run inexistente. | Bajo | CR-008 |

### 8.2 Fase 2: Simplificación y Observabilidad (P1 — Corto plazo)

> **Objetivo: Reducir complejidad, mejorar observabilidad, eliminar duplicación.**

| # | Recomendación | Impacto | Esfuerzo | Causa Raíz |
|---|---------------|---------|----------|-----------|
| **R-006** | **Eliminar funciones duplicadas de `tfi.service.ts`.** Mover TODAS las funciones de sync a `sync-lifecycle.service.ts`. `tfi.service.ts` debe solo tener funciones de datos (sesiones, comparación, ranking, dashboard). | Reduce confusión y riesgo de inconsistencia. | Bajo | CR-014 |
| **R-007** | **Eliminar `setTimeout` sin cleanup.** Guardar todos los `setTimeout` IDs en `useRef` y limpiarlos en el `useEffect` cleanup. | Elimina memory leaks y estado fantasma. | Bajo | CR-010 |
| **R-008** | **Agregar purga de tablas de log.** Crear un Edge Function o RPC que borre registros de `tfi_n8n_step_logs`, `tfi_sync_run_branches`, `tfi_webhook_debug_logs` y `tfi_sync_runs` (completados) mayores a 30 días. | Previene degradación de performance. | Medio | CR-011 |
| **R-009** | **Agregar `minutes_since_last_branch_update` al RPC.** Si una branch lleva >30 min en `running` sin actualización, incluir `branch_stale = true` en el resultado. | Permite detectar branches pegadas. | Bajo | Síntoma 1 |
| **R-010** | **Agregar timeout al Edge Function `n8n-webhook-proxy`.** Configurar `fetch` con un `AbortController` y un timeout razonable (ej. 30s). Si N8N tarda más, el frontend puede reintentar. | Previene aborts por timeout del proxy. | Bajo | CR-012 |
| **R-011** | **Modificar `acquire_tfi_sync_lock` para usar transacción atómica.** Usar `SELECT FOR UPDATE` o `pg_advisory_lock` en lugar de `ON CONFLICT ... WHERE is_running = false`. | Elimina race condition en el lock. | Medio | CR-006 |
| **R-012** | **Agregar `total_expected_rows` al payload del webhook.** Si el frontend conoce el total esperado (aunque sea aproximado), puede detectar finalización parcial. | Permite detectar sincronizaciones incompletas. | Bajo | CR-013 |

### 8.3 Fase 3: Validaciones y Mejoras (P2 — Medio plazo)

> **Objetivo: Agregar validaciones proactivas, mejorar UX, preparar para escalabilidad.**

| # | Recomendación | Impacto | Esfuerzo | Causa Raíz |
|---|---------------|---------|----------|-----------|
| **R-013** | **Modificar `release_tfi_sync_lock` y `force_release_sync_lock_single` para NO marcar `sync_run` como `failed` si ya está `completed` o `cancelled`.** Si el sync_run ya tiene `finished_at`, solo liberar el lock sin cambiar el estado del sync_run. | Elimina falsos positivos de `failed` en el historial. | Bajo | CR-007 |
| **R-014** | **Agregar `GRACE_PERIOD_NO_HEARTBEAT = 30` minutos en el backend.** Si `tfi_n8n_step_logs` está vacío para un sync_run, no marcar `stale` hasta que pasen 30 minutos (en lugar de 10 min). | Elimina falsos `stale` cuando N8N no tiene heartbeat configurado. | Bajo | CR-004 |
| **R-015** | **Agregar un `useReducer` para el estado de sync en `WarehouseSyncButtons` y `TfiRefreshControl`.** En lugar de ~8 `useState` independientes, usar un reducer que maneje todas las transiciones de estado. | Reduce complejidad, mejora mantenibilidad. | Medio | CR-001 |
| **R-016** | **Agregar índices en `tfi_sync_runs(session_id, started_at DESC)` y `tfi_sync_locks(session_id)` y `tfi_n8n_step_logs(sync_run_id, created_at DESC)` si no existen.** | Mejora performance del RPC crítico. | Bajo | CR-011 |
| **R-017** | **Agregar un dashboard de "Estado de Sync" en el frontend.** Mostrar los últimos 10 syncs con estado, tiempo, filas, ramas. Permitir al usuario ver el historial y detectar patrones. | Mejora observabilidad. Permite al usuario identificar problemas sin depuración. | Medio | General |
| **R-018** | **Considerar React Query o SWR para el polling.** Aunque el polling es manual, React Query puede manejar deduplicación, retry, stale time, y cache invalidation de forma más robusta. | Reduce código custom, mejora robustez. | Medio-Alto | CR-002 |
| **R-019** | **Agregar un `useSyncPolling` hook centralizado.** Este hook debe: (1) recibir `session_id`, (2) iniciar/detener polling, (3) retornar estado del backend, (4) manejar cleanup automático. | Elimina duplicación de polling entre componentes. | Medio | CR-002 |
| **R-020** | **Agregar validación de "todos los datos presentes" en el frontend después de `completed`.** Después de detectar `completed`, el frontend puede hacer una query rápida a `tfi_count_lines` para verificar que el número de registros coincide con `total_rows`. Si no coincide, mostrar advertencia. | Detecta finalización parcial. | Medio | CR-013 |

---

## 9. ANEXOS TÉCNICOS

### 9.1 Líneas de Código Críticas (Referencias)

| Hallazgo | Archivo | Línea Aproximada | Código |
|----------|---------|-------------------|--------|
| H-001 Polling duplicado | `WarehouseSyncButtons.tsx` | ~420 | `pollIntervalsRef.current[warehouseId] = setInterval(poll, POLL_INTERVAL_MS);` |
| H-001 Polling duplicado | `TfiRefreshControl.tsx` | ~320 | `pollIntervalRef.current = setInterval(() => doSinglePoll(activeSession.id), POLL_INTERVAL_MS);` |
| H-002 Override frontend | `WarehouseSyncButtons.tsx` | ~480 | `if (isDead || n8nTimeoutExceeded) { effectiveStatus = 'stale'; }` |
| H-002 Override frontend | `TfiRefreshControl.tsx` | ~290 | `if (isDeadSync(status) || hasExceededN8nTimeout(status)) { effectiveStatus = 'stale'; }` |
| H-003 shouldResetToIdle | `WarehouseSyncButtons.tsx` | ~650 | `useEffect(() => { const interval = setInterval(async () => { ... }, 30000); }, [syncStates, ...]);` |
| H-004 tempSyncRunId | `WarehouseSyncButtons.tsx` | ~760 | `const tempSyncRunId = generateUUID();` + `acquireSyncLock(warehouse.sessionId, tempSyncRunId)` |
| H-005 Race lock | `sync-lifecycle.service.ts` | ~185 | `acquire_tfi_sync_lock` RPC con `ON CONFLICT` |
| H-006 release marca failed | `sync-lifecycle.service.ts` | ~200 | `release_tfi_sync_lock` RPC: "UPDATE tfi_sync_runs SET status='failed'" |
| H-007 Frontend timeout | `sync-lifecycle.service.ts` | ~25 | `MAX_POLL_ATTEMPTS = 1200` |
| H-008 setTimeout sin cleanup | `WarehouseSyncButtons.tsx` | ~560 | `setTimeout(() => { if (mountedRef.current) resetWarehouseState(warehouseId); }, 5000);` |
| H-009 isDeadSync 999999 | `sync-lifecycle.service.ts` | ~240 | `if (status.minutes_since_last_n8n_step >= 999999) { ... return true; }` |
| H-010 isCancellableState | `sync-lifecycle.service.ts` | ~65 | `return status === 'syncing' || status === 'starting' || ... || status === 'running' || ...;` |
| H-011 Funciones duplicadas | `tfi.service.ts` | ~680-720 | `acquireSyncLock`, `releaseSyncLock`, `getSyncLocks`, etc. |
| H-014 hasActiveSync local | `WarehouseSyncButtons.tsx` | ~700 | `const hasActiveSync = Object.values(safeSyncStates).some(isActiveState);` |
| H-015 Falta índice | `get_sync_status_v2_single` RPC | — | `SELECT ... FROM tfi_sync_runs WHERE session_id = p_session_id ORDER BY started_at DESC LIMIT 1` |

### 9.2 Dependencias N8N → Supabase (Contrato)

| Nodo N8N | Tabla Supabase | Operación | Obligatorio | Si Falta |
|----------|---------------|-----------|-------------|----------|
| Inicio | `tfi_sync_runs` | INSERT (`status='running'`, `sync_run_id=tempId`) | **SÍ** | Lock apunta a sync_run inexistente |
| Inicio | `tfi_sync_locks` | UPDATE (`is_running=true`, `sync_run_id=tempId`) | **SÍ** | Lock sin sync_run → orphaned |
| Inicio | `tfi_sync_run_branches` | INSERT (1 por rama) | NO | `branch_count=0` |
| Durante | `tfi_n8n_step_logs` | INSERT (heartbeat cada ~2 min) | **SÍ** | `minutes_since_last_n8n_step=999999` → stale |
| Durante | `tfi_sync_runs` | UPDATE (`total_rows`, `updated_at`) | NO | Progreso no visible |
| Durante | `tfi_sync_run_branches` | UPDATE (`rows_processed`, `status`) | NO | Progreso de ramas no visible |
| Durante | `tfi_count_lines` / `tfi_count_attempts` | INSERT/UPDATE | **SÍ** | Sin datos en el dashboard |
| Final | `tfi_sync_runs` | UPDATE (`status='completed'`, `finished_at`) | **SÍ** | Sync queda `running` → timeout/zombie |
| Final | `tfi_sync_locks` | UPDATE (`is_running=false`, `finished_at`) | **SÍ** | Lock queda abierto → zombie |
| Final | `tfi_sync_run_branches` | UPDATE (`status='completed'`) | NO | Branch queda `running` → partial_failure |
| Error | `tfi_sync_runs` | UPDATE (`status='failed'`, `error_message`) | **SÍ** | Sin mensaje de error |
| Error | `tfi_sync_locks` | UPDATE (`is_running=false`, `finished_at`) | **SÍ** | Lock queda abierto |

### 9.3 Métricas de Polling (Teóricas)

| Escenario | Requests a Supabase | Duración | Total Requests |
|-----------|---------------------|----------|----------------|
| Sync normal (18 min, 1 almacén) | 1 cada 3s | 18 min | ~360 requests |
| Sync normal (2 almacenes simultáneos) | 2 cada 3s | 18 min | ~720 requests |
| Sync con polling duplicado (1 almacén) | 2 cada 3s | 18 min | ~720 requests |
| Sync con MAX_POLL_ATTEMPTS | 1 cada 3s | 60 min | 1200 requests |
| Sync zombie (no se limpia) | ∞ | ∞ | ∞ (hasta que se monte frontend) |
| 4 almacenes, todos sincronizando | 4 cada 3s | 18 min | ~1440 requests |
| 4 almacenes + polling duplicado | 8 cada 3s | 18 min | ~2880 requests |

> **Nota:** Con `WarehouseSyncButtons` + `TfiRefreshControl` haciendo polling para los mismos almacenes, el número de requests se duplica.

### 9.4 Estados del Backend vs Estados del Frontend

| `tfi_sync_runs.status` | `tfi_sync_locks.is_running` | `computed_status` (RPC) | `effectiveStatus` (Frontend) | `isDeadSync` | `hasExceededN8nTimeout` | `shouldResetToIdle` |
|--------------------------|-----------------------------|-------------------------|-------------------------------|--------------|-------------------------|---------------------|
| `running` | `true` | `syncing` | `syncing` (normal) o `stale` (si 999999) | `false` (lock=true) | `true` (si 999999) | `false` |
| `running` | `true` | `starting` | `starting` (si <5 min) o `stale` (si 999999) | `false` (lock=true) | `true` (si 999999) | `false` (si <120 min) |
| `running` | `false` | `zombie` | `zombie` | `false` | `false` | `true` (si >5 min) |
| `completed` | `true` | `zombie` | `zombie` | `false` | `false` | `true` |
| `completed` | `false` | `completed` | `completed` | `false` | `false` | `true` (si >5 min) |
| `failed` | `false` | `failed` | `failed` | `false` | `false` | `true` |
| `running` | `true` | `timeout` | `timeout` | `false` | `true` | `true` |
| `running` | `true` | `stale` | `stale` | `false` | `true` | `true` |
| `running` | `true` | `partial_failure` | `partial_failure` | `false` | `false` | `true` |
| `cancelled` | `false` | `cancelled` | `cancelled` | `false` | `false` | `true` |
| `running` | `true` | `orphaned` | `orphaned` | `false` | `false` | `true` |
| — | `false` | `idle` | `idle` | `false` | `false` | `true` |

---

> **FIN DE LA AUDITORÍA**
>
> **Documento generado:** 2026-05-29
> **Versión:** 1.0
> **Estado:** Listo para revisión y decisión de implementación
>
> **Próximo paso recomendado:** Priorizar las recomendaciones R-001 a R-005 y decidir cuáles implementar en el siguiente sprint.

---

## IMPLEMENTACIÓN — Sprint 2026-05-29

### Cambios aplicados (R-001, R-002, R-004, R-005, parte de R-006)

| R | Recomendación | Estado |
|---|--------------|--------|
| R-001 | Eliminar `isDeadSync`, `hasExceededN8nTimeout`, `shouldResetToIdle` como override | ✅ HECHO |
| R-002 | Centralizar polling en `useSyncPolling(sessionId)` — un solo interval por sesión | ✅ HECHO |
| R-004 | Documentar contrato N8N (ver sección abajo) | ✅ HECHO |
| R-005 | Verificar backend antes de iniciar polling | ✅ HECHO (mount check en WarehouseCard) |
| R-006 | Eliminar funciones duplicadas tfi.service.ts ↔ sync-lifecycle.service.ts | ✅ HECHO |
| R-003 | pg_cron para cleanup cada 5 min | ⏳ PENDIENTE |
| R-007 | Cleanup de setTimeout sin ref | ✅ HECHO (localStarting pattern) |

### Arquitectura de polling post-implementación

```
             ANTES                           DESPUÉS

WarehouseSyncButtons                WarehouseSyncButtons
  ├── interval para Patio Febeca       ├── WarehouseCard (Patio Febeca)
  ├── interval para Febeca             │    └── useSyncPolling('4e2e...')
  ├── interval para Sillaca            ├── WarehouseCard (Febeca)
  └── interval para Beval              │    └── useSyncPolling('f631...')
TfiRefreshControl                     ├── WarehouseCard (Sillaca)
  └── interval para sesión activa      │    └── useSyncPolling('ccbf...')
                                       └── WarehouseCard (Beval)
                                            └── useSyncPolling('db05...')

                                  TfiRefreshControl
                                    └── useSyncPolling(activeSession.id)

  → 5 intervals max, pueden duplicar   → max 1 interval POR sessionId
    para la misma sesión                  compartido entre componentes
```

### Principios aplicados

1. **Backend es la única fuente de verdad** — `computed_status` se renderiza sin modificar
2. **`isDeadSync`, `hasExceededN8nTimeout`, `shouldResetToIdle` eliminadas** — fueron las causas raíz de estados falsos
3. **`hasMissingHeartbeat`, `hasStaleHeartbeat`** — solo generan warnings visuales, no cambian status
4. **Un solo interval por `sessionId`** — el registry global en `useSyncPolling.ts` deduplica
5. **Stop automático en estados terminales** — el hook para el interval cuando el backend devuelve `completed`, `failed`, `cancelled`, `stale`, `zombie`, `timeout`, `orphaned`, `idle`, `partial_failure`
6. **No más `localStorage` para sync** — solo backend

---

## CONTRATO N8N — OBLIGATORIO

> ⚠️ Este contrato es OBLIGATORIO para que el sistema funcione correctamente.
> Si N8N no lo cumple, aparecerán estados inconsistentes aunque el frontend sea correcto.

### 1. ID del sync_run

- El frontend genera `sync_run_id = crypto.randomUUID()` y lo envía en el payload del webhook
- N8N DEBE usar exactamente ese mismo ID al insertar en `tfi_sync_runs`
- N8N DEBE retornar ese mismo ID en el body de la respuesta del webhook: `{ "sync_run_id": "<uuid>" }`
- Si N8N retorna un ID diferente, el sistema lanza `WebhookError: Sync run mismatch`

### 2. Inicio del sync_run

N8N DEBE ejecutar al inicio del workflow:

```sql
INSERT INTO tfi_sync_runs (id, session_id, situation, status, started_at)
VALUES (<sync_run_id>, <session_id>, <situation>, 'running', NOW());
```

### 3. Heartbeat durante ejecución

N8N DEBE insertar en `tfi_n8n_step_logs` al menos cada 2 minutos:

```sql
INSERT INTO tfi_n8n_step_logs (sync_run_id, step_name, branch_name)
VALUES (<sync_run_id>, '<nombre_del_paso>', '<rama>');
```

Sin heartbeat, `minutes_since_last_n8n_step = 999999` → backend puede marcar `stale` → polling se detiene.

### 4. Finalización exitosa

N8N DEBE ejecutar antes de terminar:

```sql
UPDATE tfi_sync_runs
SET status = 'completed', finished_at = NOW(), total_rows = <filas_procesadas>
WHERE id = <sync_run_id>;

UPDATE tfi_sync_locks
SET is_running = false, finished_at = NOW(), updated_at = NOW()
WHERE session_id = <session_id>;
```

### 5. Finalización con error

N8N DEBE ejecutar en caso de fallo:

```sql
UPDATE tfi_sync_runs
SET status = 'failed', finished_at = NOW(), error_message = '<mensaje>'
WHERE id = <sync_run_id>;

UPDATE tfi_sync_locks
SET is_running = false, finished_at = NOW(), updated_at = NOW()
WHERE session_id = <session_id>;
```

### 6. Branches (ramas)

Si el workflow tiene ramas paralelas, N8N DEBE:

1. Insertar al inicio de cada rama:
   ```sql
   INSERT INTO tfi_sync_run_branches (sync_run_id, branch_name, status)
   VALUES (<sync_run_id>, '<rama>', 'running');
   ```
2. Actualizar al finalizar cada rama:
   ```sql
   UPDATE tfi_sync_run_branches
   SET status = 'completed', rows_processed = <N>
   WHERE sync_run_id = <sync_run_id> AND branch_name = '<rama>';
   ```
3. Antes de marcar el sync_run como `completed`, verificar que NO haya branches en `running`

### 7. Qué pasa si N8N NO cumple el contrato

| Incumplimiento | Consecuencia |
|---------------|--------------|
| No retorna sync_run_id | Polling funciona, pero sin ID de referencia |
| No inserta en tfi_sync_runs | Polling ve `idle` desde el inicio |
| No inserta heartbeat en tfi_n8n_step_logs | Backend marca `stale` → polling para |
| No actualiza tfi_sync_runs al finalizar | sync_run queda `running` → timeout/zombie |
| No libera tfi_sync_locks al finalizar | Lock queda abierto → zombie |
| No marca branch done | partial_failure |

### 8. pg_cron — PENDIENTE

Como mitigación mientras N8N no siempre cumple el contrato, se recomienda crear un job:

```sql
-- Ejecutar cleanup_zombie_syncs cada 5 minutos
SELECT cron.schedule(
  'cleanup-zombie-syncs',
  '*/5 * * * *',
  $$SELECT cleanup_zombie_syncs(60, 5)$$
);
```

Esto requiere que la extensión `pg_cron` esté habilitada en Supabase (disponible en planes Pro+).