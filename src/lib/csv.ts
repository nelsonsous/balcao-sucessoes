// Exportação CSV pensada para o Excel em português: separador «;», vírgula decimal, BOM UTF-8.
import { downloadFile } from './utils';

export type CsvCell = string | number | null | undefined | boolean;

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  const s = String(v);
  // Evita a interpretação como fórmula no Excel/Sheets.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Constrói o texto CSV (com BOM para o Excel reconhecer UTF-8). */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header, ...rows].map((r) => r.map(cell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename: string, header: string[], rows: CsvCell[][]): void {
  downloadFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, toCsv(header, rows), 'text/csv;charset=utf-8');
}

/** Nome de ficheiro seguro a partir de um rótulo. */
export function csvName(label: string): string {
  return `${label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60)}-${new Date().toISOString().slice(0, 10)}.csv`;
}
