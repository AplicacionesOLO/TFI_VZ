import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { TfiComparisonLine, TfiUserPrecision, TfiSession, DashboardStats } from '@/types/tfi.types';
import {
  sanitizeFilename,
  todayStr,
  precisionLevel,
  fmtNum,
  calcDiffTemp,
  applyAutoWidth,
  translateStatus,
} from './exportHelpers';

// ─── Tipos internos ──────────────────────────────────────────────────────────

type CellValue = string | number | null;
type AoA = CellValue[][];

// ─── Helpers internos ────────────────────────────────────────────────────────

function makeSheet(data: AoA): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(data);
  applyAutoWidth(ws);
  return ws;
}

function buildWorkbook(sheets: { name: string; data: AoA }[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = makeSheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return wb;
}

function writeFile(wb: XLSX.WorkBook, filename: string): void {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  saveAs(blob, filename);
}

// ─── Filas de comparación (reutilizado en Comparación y Resumen Ejecutivo) ──

const COMPARISON_HEADER: CellValue[] = [
  'Sesión',
  'Artículo',
  'Descripción',
  'Teórico',
  'Nombre toma 1',
  'Conteo toma 1',
  'Usuario toma 1',
  'Diferencia usuario 1',
  'Nombre toma 2',
  'Conteo toma 2',
  'Usuario toma 2',
  'Diferencia usuario 2',
  'Reconteo',
  'Usuario reconteo',
  'Estado',
  'Conteo final',
  'Diferencia final vs teórico',
];

function comparisonRow(l: TfiComparisonLine, sessionNameMap: Record<string, string>): CellValue[] {
  return [
    sessionNameMap[l.session_id] ?? l.session_id,
    l.article_id,
    l.article_description ?? '-',
    fmtNum(l.theoretical_qty),
    l.take_1_name ?? '-',
    fmtNum(l.count_1_qty),
    l.user_1 ?? '-',
    fmtNum(l.difference_user_1),
    l.take_2_name ?? '-',
    fmtNum(l.count_2_qty),
    l.user_2 ?? '-',
    fmtNum(l.difference_user_2),
    fmtNum(l.recount_qty),
    l.recount_user ?? '-',
    translateStatus(l.comparison_status),
    fmtNum(l.final_count_qty),
    fmtNum(l.final_difference_vs_theoretical),
  ];
}

// ─── Filas de pendientes (reutilizado en Pendientes y Resumen Ejecutivo) ─────

const PENDING_HEADER: CellValue[] = [
  'Sesión',
  'Artículo',
  'Descripción',
  'Teórico',
  'Conteo toma 1',
  'Usuario toma 1',
  'Conteo toma 2',
  'Usuario toma 2',
  'Estado',
  'Diferencia temporal',
];

function pendingRow(l: TfiComparisonLine, sessionNameMap: Record<string, string>): CellValue[] {
  return [
    sessionNameMap[l.session_id] ?? l.session_id,
    l.article_id,
    l.article_description ?? '-',
    fmtNum(l.theoretical_qty),
    fmtNum(l.count_1_qty),
    l.user_1 ?? '-',
    fmtNum(l.count_2_qty),
    l.user_2 ?? '-',
    translateStatus(l.comparison_status),
    calcDiffTemp(l.count_1_qty, l.count_2_qty),
  ];
}

// ─── Filas de ranking (reutilizado en Ranking y Resumen Ejecutivo) ────────────

const RANKING_HEADER: CellValue[] = [
  'Posición',
  'Sesión',
  'Usuario',
  'Total artículos evaluados',
  'Diferencias',
  '% Precisión',
  'Nivel',
];

function rankingRow(u: TfiUserPrecision, pos: number, sessionNameMap: Record<string, string>): CellValue[] {
  return [
    pos,
    sessionNameMap[u.session_id] ?? u.session_id,
    u.user_name,
    Number(u.total_articles),
    Number(u.differences),
    Number(Number(u.precision_percentage).toFixed(2)),
    precisionLevel(Number(u.precision_percentage)),
  ];
}

// ─── Comparación T1 vs T2 ────────────────────────────────────────────────────
// Exporta exactamente las líneas visibles (ya filtradas en el componente).
// Incluye hoja extra "Diferencias críticas" con both_different / ok_user1 / ok_user2.

export function exportComparisonToExcel(
  lines: TfiComparisonLine[],
  sessionName: string,
  sessionNameMap: Record<string, string> = {}
): void {
  const compRows: AoA = lines.map((l) => comparisonRow(l, sessionNameMap));
  const compData: AoA = [COMPARISON_HEADER, ...compRows];

  // Diferencias críticas: subset de las líneas filtradas con esos estados
  const criticalStatuses = new Set(['both_different', 'ok_user1', 'ok_user2']);
  const criticalLines = lines.filter((l) => criticalStatuses.has(l.comparison_status));
  const criticalData: AoA = [COMPARISON_HEADER, ...criticalLines.map((l) => comparisonRow(l, sessionNameMap))];

  const wb = buildWorkbook([
    { name: 'Comparación', data: compData },
    { name: 'Diferencias críticas', data: criticalData },
  ]);

  const safe = sanitizeFilename(sessionName);
  writeFile(wb, `TFI_COMPARACION_${safe}_${todayStr()}.xlsx`);
}

// ─── Ranking de Usuarios ─────────────────────────────────────────────────────
// Agrega columna "Posición" según el orden visible (ya ordenado por el servicio).

export function exportRankingToExcel(
  users: TfiUserPrecision[],
  sessionName: string,
  sessionNameMap: Record<string, string> = {}
): void {
  const rows: AoA = users.map((u, i) => rankingRow(u, i + 1, sessionNameMap));
  const data: AoA = [RANKING_HEADER, ...rows];

  const wb = buildWorkbook([{ name: 'Ranking', data }]);
  const safe = sanitizeFilename(sessionName);
  writeFile(wb, `TFI_RANKING_${safe}_${todayStr()}.xlsx`);
}

// ─── Pendientes de Reconteo ──────────────────────────────────────────────────
// Exporta solo líneas pending_recount con Diferencia temporal calculada.

export function exportPendingToExcel(
  lines: TfiComparisonLine[],
  sessionName: string,
  sessionNameMap: Record<string, string> = {}
): void {
  const rows: AoA = lines.map((l) => pendingRow(l, sessionNameMap));
  const data: AoA = [PENDING_HEADER, ...rows];

  const wb = buildWorkbook([{ name: 'Pendientes', data }]);
  const safe = sanitizeFilename(sessionName);
  writeFile(wb, `TFI_PENDIENTES_RECONTEO_${safe}_${todayStr()}.xlsx`);
}

// ─── Resumen Ejecutivo (5 hojas) ─────────────────────────────────────────────

export interface DashboardExportPayload {
  session: TfiSession | null;
  stats: DashboardStats;
  ranking: TfiUserPrecision[];
  allLines: TfiComparisonLine[];
  sessionNameMap?: Record<string, string>;
}

export function exportDashboardToExcel(payload: DashboardExportPayload): void {
  const { session, stats, ranking, allLines, sessionNameMap = {} } = payload;

  const sessionLabel = session
    ? session.location
      ? `${session.name} — ${session.location}`
      : session.name
    : 'Sin sesión';

  // ── Hoja 1: Resumen ──────────────────────────────────────────────────────
  const resumenData: AoA = [
    ['Campo', 'Valor'],
    ['Sesión', sessionLabel],
    ['Ubicación', session?.location ?? '-'],
    ['Estado', session?.status ?? '-'],
    ['Total conteos', fmtNum(stats.totalCounts)],
    ['Total diferencias', fmtNum(stats.totalDiffs)],
    ['Precisión global ponderada', Number(Number(stats.weightedPrecision).toFixed(2))],
    ['Precisión global promedio', Number(Number(stats.avgPrecision).toFixed(2))],
    ['Pendientes de reconteo', fmtNum(stats.pendingRecount)],
    ['Coincide', fmtNum(stats.matches)],
    ['Toma 1 correcta', fmtNum(stats.okUser1)],
    ['Toma 2 correcta', fmtNum(stats.okUser2)],
    ['Ambas diferentes', fmtNum(stats.bothDifferent)],
    ['Pendientes Toma 2', fmtNum(stats.pendingT2)],
    ['Pendientes Toma 1', fmtNum(stats.pendingT1)],
    ['Total líneas', fmtNum(stats.totalLines)],
  ];

  // ── Hoja 2: Distribución de estados ──────────────────────────────────────
  const totalLinesDiv = stats.totalLines || 1;
  const estadosData: AoA = [
    ['Estado', 'Total', 'Porcentaje'],
    ['Coincide', stats.matches, Number(((stats.matches / totalLinesDiv) * 100).toFixed(2))],
    ['Toma 1 correcta', stats.okUser1, Number(((stats.okUser1 / totalLinesDiv) * 100).toFixed(2))],
    ['Toma 2 correcta', stats.okUser2, Number(((stats.okUser2 / totalLinesDiv) * 100).toFixed(2))],
    ['Pendiente de reconteo', stats.pendingRecount, Number(((stats.pendingRecount / totalLinesDiv) * 100).toFixed(2))],
    ['Ambas diferentes', stats.bothDifferent, Number(((stats.bothDifferent / totalLinesDiv) * 100).toFixed(2))],
    ['Pendiente Toma 2', stats.pendingT2, Number(((stats.pendingT2 / totalLinesDiv) * 100).toFixed(2))],
    ['Pendiente Toma 1', stats.pendingT1, Number(((stats.pendingT1 / totalLinesDiv) * 100).toFixed(2))],
  ];

  // ── Hoja 3: Ranking ───────────────────────────────────────────────────────
  const rankingData: AoA = [RANKING_HEADER, ...ranking.map((u, i) => rankingRow(u, i + 1, sessionNameMap))];

  // ── Hoja 4: Pendientes ────────────────────────────────────────────────────
  const pendingLines = allLines.filter((l) => l.comparison_status === 'pending_recount');
  const pendingData: AoA = [PENDING_HEADER, ...pendingLines.map((l) => pendingRow(l, sessionNameMap))];

  // ── Hoja 5: Diferencias críticas ──────────────────────────────────────────
  const criticalStatuses = new Set(['both_different', 'ok_user1', 'ok_user2']);
  const criticalLines = allLines.filter((l) => criticalStatuses.has(l.comparison_status));
  const criticalData: AoA = [COMPARISON_HEADER, ...criticalLines.map((l) => comparisonRow(l, sessionNameMap))];

  const wb = buildWorkbook([
    { name: 'Resumen', data: resumenData },
    { name: 'Distribución de estados', data: estadosData },
    { name: 'Ranking', data: rankingData },
    { name: 'Pendientes', data: pendingData },
    { name: 'Diferencias críticas', data: criticalData },
  ]);

  const safeName = sanitizeFilename(session?.name ?? 'sesion');
  writeFile(wb, `TFI_RESUMEN_EJECUTIVO_${safeName}_${todayStr()}.xlsx`);
}