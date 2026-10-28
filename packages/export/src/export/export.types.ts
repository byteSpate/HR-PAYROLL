export type ExportFormat = 'xlsx' | 'csv';
export type ExportCellType = 'text' | 'integer' | 'decimal' | 'date' | 'boolean';
export type ExportValue = string | number | boolean | Date | null;

export interface ExportColumn {
  /** Heading in Excel and CSV. Matches the import example where the column exists there. */
  header: string;
  type: ExportCellType;
  /** Digits after the point for `decimal`. Default 2. */
  decimals?: number;
}

export interface ExportSpec {
  title: string;
  subtitle?: string;
  /** Says which filter produced the rows, for example "Year 2026". */
  filterNote?: string;
  columns: ExportColumn[];
  /** One array per row, in the same order as `columns`. */
  rows: ExportValue[][];
}
