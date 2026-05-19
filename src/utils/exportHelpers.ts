import * as XLSX from 'xlsx';
import type { ComparisonStatus } from '@/types/tfi.types';

/** Mapa de estados de comparación (inglés → español legible) */
const STATUS_LABELS: Record<ComparisonStatus, string> = {
  match: 'Coincide',
  ok_user1: 'Toma 1 correcta',
  ok_user2: 'Toma 2 correcta',
  pending_recount: 'Pendiente de reconteo',
  pending_t2: 'Pendiente Toma 2',
  pending_t1: 'Pendiente Toma 1',
  both_different: 'Ambas diferentes',
};

/**
 * Traduce un comparison_status a su etiqueta en español.
 */
export function translateStatus(status: string): string {
  return STATUS_LABELS[status as ComparisonStatus] ?? status;
}

/**
 * Sanitiza un string para usarlo como parte de nombre de archivo.
 * Reemplaza espacios y caracteres especiales por guión bajo.
 */
export function sanitizeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Devuelve la fecha actual formateada como YYYYMMDD.
 */
export function todayStr(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/**
 * Calcula el nivel de precisión igual que el frontend de ranking.
 */
export function precisionLevel(pct: number): string {
  if (pct >= 98) return 'Excelente';
  if (pct >= 95) return 'Buena';
  return 'Atención';
}

/**
 * Formatea un porcentaje a string con 2 decimales + símbolo % (para CSV).
 */
export function fmtPct(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const n = Number(value);
  return isNaN(n) ? '-' : `${n.toFixed(2)}%`;
}

/**
 * Devuelve el valor numérico para Excel o "-" si es null/undefined.
 * Mantiene números como números (no string) para que Excel los trate correctamente.
 */
export function fmtNum(value: number | null | undefined): number | string {
  if (value === null || value === undefined) return '-';
  return value;
}

/**
 * Calcula la diferencia temporal count_1_qty - count_2_qty.
 * Si alguno de los dos es null, devuelve '-'.
 */
export function calcDiffTemp(
  count1: number | null | undefined,
  count2: number | null | undefined
): number | string {
  if (count1 === null || count1 === undefined) return '-';
  if (count2 === null || count2 === undefined) return '-';
  return count1 - count2;
}

/**
 * Aplica auto-width básico a todas las columnas de un worksheet.
 * Recorre las celdas de cada columna y usa el largo máximo como ancho.
 */
export function applyAutoWidth(ws: XLSX.WorkSheet): void {
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const colWidths: number[] = [];

  for (let C = range.s.c; C <= range.e.c; C++) {
    let maxLen = 8; // mínimo
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellAddr];
      if (cell && cell.v !== undefined) {
        const len = String(cell.v).length;
        if (len > maxLen) maxLen = len;
      }
    }
    colWidths[C] = Math.min(maxLen + 2, 50); // cap a 50 chars
  }

  ws['!cols'] = colWidths.map((w) => ({ wch: w }));
}