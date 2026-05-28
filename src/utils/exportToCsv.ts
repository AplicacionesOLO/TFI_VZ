import type { TfiComparisonLine, TfiUserPrecision, TfiSession, DashboardStats, UserRankingCounts, UserRankingRecounts, UserRankingGlobal, UserRankingV2, DashboardV2Stats } from '@/types/tfi.types';
import type { ComparisonV2Line } from '@/types/comparison-v2.types';
import {
  sanitizeFilename,
  todayStr,
  precisionLevel,
  rankingLevel,
  rankingLevelV2,
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

export function exportDashboardV2ToCsv(
  stats: DashboardV2Stats,
  session: TfiSession | null
): void {
  const sessionLabel = session
    ? session.location
      ? `${session.name} — ${session.location}`
      : session.name
    : 'Sin sesión';

  const rows: CellValue[][] = [
    ['Campo', 'Valor'],
    ['Sesión', sessionLabel],
    ['Total conteos', fmtNum(stats.total_conteos)],
    ['Total artículos', fmtNum(stats.total_articulos)],
    ['Total ubicaciones', fmtNum(stats.total_ubicaciones)],
    ['Total usuarios', fmtNum(stats.total_usuarios)],
    ['Total tomas', fmtNum(stats.total_tomas)],
    ['Conteos exactos', fmtNum(stats.conteos_exactos)],
    ['Conteos con diferencia', fmtNum(stats.conteos_con_diferencia)],
    ['Precisión global', fmtPct(stats.precision_global)],
    ['Diferencia absoluta total', fmtNum(stats.diferencia_absoluta_total)],
    ['Tomas NORMAL', fmtNum(stats.tomas_normal)],
    ['Tomas RECONTEO', fmtNum(stats.tomas_reconteo)],
    ['Artículos sin diferencia', fmtNum(stats.articulos_sin_diferencia)],
    ['Artículos con diferencia', fmtNum(stats.articulos_con_diferencia)],
    ['Conteos faltantes', fmtNum(stats.conteos_faltantes)],
    [],
    ['--- Distribución por tipo ---'],
    ['Tipo', 'Total', 'Porcentaje'],
    ['NORMAL', stats.tomas_normal, fmtPct((stats.tomas_normal / stats.total_conteos) * 100)],
    ['RECONTEO', stats.tomas_reconteo, fmtPct((stats.tomas_reconteo / stats.total_conteos) * 100)],
    [],
    ['--- Distribución por artículo ---'],
    ['Estado', 'Total', 'Porcentaje'],
    ['Sin diferencia', stats.articulos_sin_diferencia, fmtPct((stats.articulos_sin_diferencia / stats.total_articulos) * 100)],
    ['Con diferencia', stats.articulos_con_diferencia, fmtPct((stats.articulos_con_diferencia / stats.total_articulos) * 100)],
  ];

  const safeName = sanitizeFilename(session?.name ?? 'sesion');
  downloadCsv(toCsvString(rows), `TFI_RESUMEN_V2_${safeName}_${todayStr()}.csv`);
}

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

// ─── Ranking V2 (Arquitectura Normalizada) ─────────────────────────────────

const RANKING_V2_HEADER: CellValue[] = [
  'Posición',
  'Ficha/ID',
  'Artículos contados',
  'Ubicaciones',
  'Total conteos',
  'Conteos exactos',
  'Conteos con diferencia',
  'Diferencia absoluta total',
  '% Precisión',
  'Nivel Indicador',
  'Reconocimiento',
];

function rankingV2Row(u: UserRankingV2, pos: number): CellValue[] {
  const precision = Number(u.precision_porcentaje);
  const nivel = rankingLevelV2(precision);
  return [
    pos,
    u.user_id,
    u.total_articulos_contados,
    u.total_ubicaciones,
    u.total_conteos,
    u.conteos_exactos,
    u.conteos_con_diferencia,
    Number(u.diferencia_absoluta_total),
    fmtPct(u.precision_porcentaje),
    nivel.label,
    nivel.reconocimiento,
  ];
}

export function exportRankingV2ToCsv(
  users: UserRankingV2[],
  sessionName: string,
  tabLabel: string,
): void {
  const rows = users.map((u, i) => rankingV2Row(u, i + 1));
  const safe = sanitizeFilename(sessionName);
  const safeTab = sanitizeFilename(tabLabel.replace(/\s+/g, '_'));
  downloadCsv(toCsvString([RANKING_V2_HEADER, ...rows]), `TFI_RANKING_V2_${safeTab}_${safe}_${todayStr()}.csv`);
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

// ─── Comparación V2 (Arquitectura Normalizada) ────────────────────────────

const COMPARISON_V2_HEADER: CellValue[] = [
  'Artículo',
  'Descripción',
  'Ubicación A',
  'Ubicación B',
  'Teórico',
  'Nombre Toma A',
  'Conteo Toma A',
  'Usuario Toma A',
  'Nombre Toma B',
  'Conteo Toma B',
  'Usuario Toma B',
  'Reconteo',
  'Usuario Reconteo',
  'Nombre Reconteo',
  'Estado',
  'Dif. Final',
];

function comparisonV2Row(l: ComparisonV2Line): CellValue[] {
  const statusLabels: Record<string, string> = {
    MATCH: 'MATCH',
    DIFFERENT: 'DIFFERENT',
    PENDING_RECOUNT: 'PEND. RECONTEO',
    RECOUNT_MATCH_A: 'REC. MATCH A',
    RECOUNT_MATCH_B: 'REC. MATCH B',
    ALL_DIFFERENT: 'TODOS DIFF.',
    PENDING_TAKE_A: 'PEND. TOMA A',
    PENDING_TAKE_B: 'PEND. TOMA B',
    NO_DATA: 'SIN DATOS',
  };
  return [
    l.article_id,
    l.article_description ?? '-',
    l.location_id ?? '-',
    l.location_b_id ?? '-',
    fmtNum(l.theoretical_qty),
    l.take_a_name,
    fmtNum(l.take_a_qty),
    l.take_a_user ?? '-',
    l.take_b_name,
    fmtNum(l.take_b_qty),
    l.take_b_user ?? '-',
    fmtNum(l.recount_qty),
    l.recount_user ?? '-',
    l.recount_name ?? '-',
    statusLabels[l.comparison_status] ?? l.comparison_status,
    fmtNum(l.final_difference),
  ];
}

export function exportComparisonV2ToCsv(
  lines: ComparisonV2Line[],
  title: string,
  sessionName: string,
): void {
  const rows = lines.map((l) => comparisonV2Row(l));
  const safe = sanitizeFilename(sessionName);
  downloadCsv(toCsvString([COMPARISON_V2_HEADER, ...rows]), `TFI_COMPARACION_V2_${safe}_${todayStr()}.csv`);
}