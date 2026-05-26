import type { TfiComparisonLine, TfiUserPrecision, TfiSession, DashboardStats, UserRankingCounts, UserRankingRecounts, UserRankingGlobal } from '@/types/tfi.types';
import {
  sanitizeFilename,
  todayStr,
  precisionLevel,
  rankingLevel,
  fmtNum,
  fmtPct,
  calcDiffTemp,
  translateStatus,
} from './exportHelpers';

// ─── Helpers internos ────────────────────────────────────────────────────────

type CellValue = string | number | null;

function escapeCsvCell(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvString(rows: CellValue[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

function downloadCsv(content: string, filename: string): void {
  const bom = '\uFEFF'; // BOM para que Excel abra correctamente con UTF-8
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Filas reutilizables ─────────────────────────────────────────────────────

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
  'Situación toma 1',
  'Situación toma 2',
  'Situación reconteo',
  'Estado formulario toma 1',
  'Estado formulario toma 2',
  'Estado formulario reconteo',
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
    l.situation_1 ?? '-',
    l.situation_2 ?? '-',
    l.situation_recount ?? '-',
    l.estado_formulario_1 ?? '-',
    l.estado_formulario_2 ?? '-',
    l.estado_formulario_recount ?? '-',
  ];
}

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
    fmtPct(u.precision_percentage),
    precisionLevel(Number(u.precision_percentage)),
  ];
}

// ─── Ranking Conteos 1 y 2 ──────────────────────────────────────────────────

const RANKING_COUNTS_HEADER: CellValue[] = [
  'Posición',
  'Nombre',
  'Ficha/ID',
  'Conteo 1',
  'Errores C1',
  'Conteo 2',
  'Errores C2',
  'Total artículos',
  'Total errores',
  '% Precisión',
  'Nivel',
];

function rankingCountsRow(u: UserRankingCounts, pos: number): CellValue[] {
  return [
    pos,
    u.display_name,
    u.user_name,
    u.total_conteo_1,
    u.errores_conteo_1,
    u.total_conteo_2,
    u.errores_conteo_2,
    u.total_articulos,
    u.total_errores,
    fmtPct(u.precision),
    rankingLevel(u.precision, u.hasEnoughData),
  ];
}

// ─── Ranking Reconteos ──────────────────────────────────────────────────────

const RANKING_RECOUNTS_HEADER: CellValue[] = [
  'Posición',
  'Nombre',
  'Ficha/ID',
  'Total reconteos',
  'Errores reconteo',
  '% Precisión reconteo',
  'Nivel',
];

function rankingRecountsRow(u: UserRankingRecounts, pos: number): CellValue[] {
  return [
    pos,
    u.display_name,
    u.user_name,
    u.total_reconteos,
    u.errores_reconteo,
    fmtPct(u.precision),
    rankingLevel(u.precision, u.hasEnoughData),
  ];
}

// ─── Ranking Global Ponderado ───────────────────────────────────────────────

const RANKING_GLOBAL_HEADER: CellValue[] = [
  'Posición',
  'Nombre',
  'Ficha/ID',
  'Total conteos',
  'Errores conteos',
  'Total reconteos',
  'Errores reconteo',
  '% Precisión conteos',
  '% Precisión reconteo',
  '% Precisión global',
  'Nivel',
];

function rankingGlobalRow(u: UserRankingGlobal, pos: number): CellValue[] {
  return [
    pos,
    u.display_name,
    u.user_name,
    u.total_conteos,
    u.errores_conteos,
    u.total_reconteos,
    u.errores_reconteo,
    fmtPct(u.precision_conteos),
    fmtPct(u.precision_reconteo),
    fmtPct(u.precision_global),
    rankingLevel(u.precision_global, u.hasEnoughData),
  ];
}

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
  'Situación toma 1',
  'Situación toma 2',
  'Situación reconteo',
  'Estado formulario toma 1',
  'Estado formulario toma 2',
  'Estado formulario reconteo',
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
    l.situation_1 ?? '-',
    l.situation_2 ?? '-',
    l.situation_recount ?? '-',
    l.estado_formulario_1 ?? '-',
    l.estado_formulario_2 ?? '-',
    l.estado_formulario_recount ?? '-',
  ];
}

// ─── Comparación T1 vs T2 ────────────────────────────────────────────────────
// Exporta exactamente las líneas visibles (ya filtradas en el componente).

export function exportComparisonToCsv(
  lines: TfiComparisonLine[],
  sessionName: string,
  sessionNameMap: Record<string, string> = {}
): void {
  const rows = lines.map((l) => comparisonRow(l, sessionNameMap));
  const safe = sanitizeFilename(sessionName);
  downloadCsv(toCsvString([COMPARISON_HEADER, ...rows]), `TFI_COMPARACION_${safe}_${todayStr()}.csv`);
}

// ─── Ranking de Usuarios LEGADO ─────────────────────────────────────────────────────
// Agrega columna "Posición" según el orden visible.

export function exportRankingToCsv(
  users: TfiUserPrecision[],
  sessionName: string,
  sessionNameMap: Record<string, string> = {}
): void {
  const rows = users.map((u, i) => rankingRow(u, i + 1, sessionNameMap));
  const safe = sanitizeFilename(sessionName);
  downloadCsv(toCsvString([RANKING_HEADER, ...rows]), `TFI_RANKING_${safe}_${todayStr()}.csv`);
}

// ─── Ranking Conteos 1 y 2 ──────────────────────────────────────────────────

export function exportRankingCountsToCsv(
  users: UserRankingCounts[],
  sessionName: string
): void {
  const rows = users.map((u, i) => rankingCountsRow(u, i + 1));
  const safe = sanitizeFilename(sessionName);
  downloadCsv(toCsvString([RANKING_COUNTS_HEADER, ...rows]), `TFI_RANKING_CONTEOS_${safe}_${todayStr()}.csv`);
}

// ─── Ranking Reconteos ──────────────────────────────────────────────────────

export function exportRankingRecountsToCsv(
  users: UserRankingRecounts[],
  sessionName: string
): void {
  const rows = users.map((u, i) => rankingRecountsRow(u, i + 1));
  const safe = sanitizeFilename(sessionName);
  downloadCsv(toCsvString([RANKING_RECOUNTS_HEADER, ...rows]), `TFI_RANKING_RECONTEOS_${safe}_${todayStr()}.csv`);
}

// ─── Ranking Global Ponderado ───────────────────────────────────────────────

export function exportRankingGlobalToCsv(
  users: UserRankingGlobal[],
  sessionName: string
): void {
  const rows = users.map((u, i) => rankingGlobalRow(u, i + 1));
  const safe = sanitizeFilename(sessionName);
  downloadCsv(toCsvString([RANKING_GLOBAL_HEADER, ...rows]), `TFI_RANKING_GLOBAL_${safe}_${todayStr()}.csv`);
}

// ─── Pendientes de Reconteo ──────────────────────────────────────────────────
// Diferencia temporal = count_1_qty - count_2_qty (calculado en frontend).

export function exportPendingToCsv(
  lines: TfiComparisonLine[],
  sessionName: string,
  sessionNameMap: Record<string, string> = {}
): void {
  const rows = lines.map((l) => pendingRow(l, sessionNameMap));
  const safe = sanitizeFilename(sessionName);
  downloadCsv(toCsvString([PENDING_HEADER, ...rows]), `TFI_PENDIENTES_RECONTEO_${safe}_${todayStr()}.csv`);
}

// ─── Resumen Ejecutivo CSV (solo hoja Resumen) ───────────────────────────────
// CSV no soporta múltiples hojas; se exporta solo el resumen ejecutivo.

export function exportDashboardToCsv(
  session: TfiSession | null,
  stats: DashboardStats
): void {
  const sessionLabel = session
    ? session.location
      ? `${session.name} — ${session.location}`
      : session.name
    : 'Sin sesión';

  const totalLinesDiv = stats.totalLines || 1;

  const rows: CellValue[][] = [
    ['Campo', 'Valor'],
    ['Sesión', sessionLabel],
    ['Ubicación', session?.location ?? '-'],
    ['Estado', session?.status ?? '-'],
    ['Total conteos', fmtNum(stats.totalCounts)],
    ['Total diferencias', fmtNum(stats.totalDiffs)],
    ['Precisión global ponderada', fmtPct(stats.weightedPrecision)],
    ['Precisión global promedio', fmtPct(stats.avgPrecision)],
    ['Pendientes de reconteo', fmtNum(stats.pendingRecount)],
    ['Coincide', fmtNum(stats.matches)],
    ['Toma 1 correcta', fmtNum(stats.okUser1)],
    ['Toma 2 correcta', fmtNum(stats.okUser2)],
    ['Ambas diferentes', fmtNum(stats.bothDifferent)],
    ['Pendientes Toma 2', fmtNum(stats.pendingT2)],
    ['Pendientes Toma 1', fmtNum(stats.pendingT1)],
    ['Total líneas', fmtNum(stats.totalLines)],
    [],
    ['--- Distribución de estados ---'],
    ['Estado', 'Total', 'Porcentaje'],
    ['Coincide', stats.matches, fmtPct((stats.matches / totalLinesDiv) * 100)],
    ['Toma 1 correcta', stats.okUser1, fmtPct((stats.okUser1 / totalLinesDiv) * 100)],
    ['Toma 2 correcta', stats.okUser2, fmtPct((stats.okUser2 / totalLinesDiv) * 100)],
    ['Pendiente de reconteo', stats.pendingRecount, fmtPct((stats.pendingRecount / totalLinesDiv) * 100)],
    ['Ambas diferentes', stats.bothDifferent, fmtPct((stats.bothDifferent / totalLinesDiv) * 100)],
    ['Pendiente Toma 2', stats.pendingT2, fmtPct((stats.pendingT2 / totalLinesDiv) * 100)],
    ['Pendiente Toma 1', stats.pendingT1, fmtPct((stats.pendingT1 / totalLinesDiv) * 100)],
  ];

  const safeName = sanitizeFilename(session?.name ?? 'sesion');
  downloadCsv(toCsvString(rows), `TFI_RESUMEN_EJECUTIVO_${safeName}_${todayStr()}.csv`);
}