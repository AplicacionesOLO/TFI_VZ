import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { TfiComparisonLine, TfiUserPrecision, TfiSession, DashboardStats, UserRankingCounts, UserRankingRecounts, UserRankingGlobal, UserRankingV2, DashboardV2Stats, DashboardV2Diff } from '@/types/tfi.types';
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

// ─── Filas de ranking LEGADO (reutilizado en Ranking y Resumen Ejecutivo) ────────────

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
    Number(u.precision.toFixed(2)),
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
    Number(u.precision.toFixed(2)),
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
    Number(u.precision_conteos.toFixed(2)),
    Number(u.precision_reconteo.toFixed(2)),
    Number(u.precision_global.toFixed(2)),
    rankingLevel(u.precision_global, u.hasEnoughData),
  ];
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
    precision,
    nivel.label,
    nivel.reconocimiento,
  ];
}

export function exportRankingV2ToExcel(
  users: UserRankingV2[],
  sessionName: string,
  tabLabel: string,
): void {
  const rows: AoA = users.map((u, i) => rankingV2Row(u, i + 1));
  const data: AoA = [RANKING_V2_HEADER, ...rows];

  const wb = buildWorkbook([{ name: 'Ranking V2', data }]);
  const safe = sanitizeFilename(sessionName);
  const safeTab = sanitizeFilename(tabLabel.replace(/\s+/g, '_'));
  writeFile(wb, `TFI_RANKING_V2_${safeTab}_${safe}_${todayStr()}.xlsx`);
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

export function exportDashboardV2ToExcel(
  stats: DashboardV2Stats,
  diffs: DashboardV2Diff[],
  session: TfiSession | null,
  sessionNameMap: Record<string, string> = {}
): void {
  const sessionLabel = session
    ? session.location
      ? `${session.name} — ${session.location}`
      : session.name
    : 'Sin sesión';

  // ── Hoja 1: Resumen ──────────────────────────────────────────────────────
  const resumenData: AoA = [
    ['Campo', 'Valor'],
    ['Sesión', sessionLabel],
    ['Total conteos', fmtNum(stats.total_conteos)],
    ['Total artículos', fmtNum(stats.total_articulos)],
    ['Total ubicaciones', fmtNum(stats.total_ubicaciones)],
    ['Total usuarios', fmtNum(stats.total_usuarios)],
    ['Total tomas', fmtNum(stats.total_tomas)],
    ['Conteos exactos', fmtNum(stats.conteos_exactos)],
    ['Conteos con diferencia', fmtNum(stats.conteos_con_diferencia)],
    ['Precisión global', fmtNum(stats.precision_global)],
    ['Diferencia absoluta total', fmtNum(stats.diferencia_absoluta_total)],
    ['Tomas NORMAL', fmtNum(stats.tomas_normal)],
    ['Tomas RECONTEO', fmtNum(stats.tomas_reconteo)],
    ['Artículos sin diferencia', fmtNum(stats.articulos_sin_diferencia)],
    ['Artículos con diferencia', fmtNum(stats.articulos_con_diferencia)],
    ['Conteos faltantes', fmtNum(stats.conteos_faltantes)],
  ];

  // ── Hoja 2: Distribución por tipo ───────────────────────────────────────
  const tipoData: AoA = [
    ['Tipo', 'Total', 'Porcentaje'],
    ['NORMAL', stats.tomas_normal, fmtPct((stats.tomas_normal / stats.total_conteos) * 100)],
    ['RECONTEO', stats.tomas_reconteo, fmtPct((stats.tomas_reconteo / stats.total_conteos) * 100)],
  ];

  // ── Hoja 3: Distribución por artículo ───────────────────────────────────
  const artData: AoA = [
    ['Estado', 'Total', 'Porcentaje'],
    ['Sin diferencia', stats.articulos_sin_diferencia, fmtPct((stats.articulos_sin_diferencia / stats.total_articulos) * 100)],
    ['Con diferencia', stats.articulos_con_diferencia, fmtPct((stats.articulos_con_diferencia / stats.total_articulos) * 100)],
  ];

  // ── Hoja 4: Top diferencias ────────────────────────────────────────────
  const diffHeader: CellValue[] = [
    'Artículo', 'Descripción', 'Conteos', 'Exactos', 'Con dif.', 'Ubicaciones', 'Última toma', 'Tipo', 'Usuario', 'Máx. dif.', 'Teórico',
  ];
  const diffData: AoA = [
    diffHeader,
    ...diffs.map((d) => [
      d.article_id,
      d.article_description ?? '-',
      d.total_conteos,
      d.exactos,
      d.con_diferencia,
      d.ubicaciones,
      d.last_take_name ?? '-',
      d.last_take_type ?? '-',
      d.last_user ?? '-',
      d.max_difference,
      d.theoretical_qty,
    ]),
  ];

  const wb = buildWorkbook([
    { name: 'Resumen', data: resumenData },
    { name: 'Distribución tipo', data: tipoData },
    { name: 'Distribución artículos', data: artData },
    { name: 'Top diferencias', data: diffData },
  ]);

  const safeName = sanitizeFilename(session?.name ?? 'sesion');
  writeFile(wb, `TFI_RESUMEN_V2_${safeName}_${todayStr()}.xlsx`);
}

// ─── Ranking de Usuarios LEGADO ─────────────────────────────────────────────
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

// ─── Ranking Conteos 1 y 2 ──────────────────────────────────────────────────

export function exportRankingCountsToExcel(
  users: UserRankingCounts[],
  sessionName: string
): void {
  const rows: AoA = users.map((u, i) => rankingCountsRow(u, i + 1));
  const data: AoA = [RANKING_COUNTS_HEADER, ...rows];

  const wb = buildWorkbook([{ name: 'Conteos 1 y 2', data }]);
  const safe = sanitizeFilename(sessionName);
  writeFile(wb, `TFI_RANKING_CONTEOS_${safe}_${todayStr()}.xlsx`);
}

// ─── Ranking Reconteos ──────────────────────────────────────────────────────

export function exportRankingRecountsToExcel(
  users: UserRankingRecounts[],
  sessionName: string
): void {
  const rows: AoA = users.map((u, i) => rankingRecountsRow(u, i + 1));
  const data: AoA = [RANKING_RECOUNTS_HEADER, ...rows];

  const wb = buildWorkbook([{ name: 'Reconteos', data }]);
  const safe = sanitizeFilename(sessionName);
  writeFile(wb, `TFI_RANKING_RECONTEOS_${safe}_${todayStr()}.xlsx`);
}

// ─── Ranking Global Ponderado ───────────────────────────────────────────────

export function exportRankingGlobalToExcel(
  users: UserRankingGlobal[],
  sessionName: string
): void {
  const rows: AoA = users.map((u, i) => rankingGlobalRow(u, i + 1));
  const data: AoA = [RANKING_GLOBAL_HEADER, ...rows];

  const wb = buildWorkbook([{ name: 'Global', data }]);
  const safe = sanitizeFilename(sessionName);
  writeFile(wb, `TFI_RANKING_GLOBAL_${safe}_${todayStr()}.xlsx`);
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

export function exportComparisonV2ToExcel(
  lines: ComparisonV2Line[],
  title: string,
  sessionName: string,
): void {
  const rows: AoA = lines.map((l) => comparisonV2Row(l));
  const data: AoA = [COMPARISON_V2_HEADER, ...rows];

  const wb = buildWorkbook([{ name: 'Comparación V2', data }]);
  const safe = sanitizeFilename(sessionName);
  writeFile(wb, `TFI_COMPARACION_V2_${safe}_${todayStr()}.xlsx`);
}