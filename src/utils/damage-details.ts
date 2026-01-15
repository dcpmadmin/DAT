import * as XLSX from 'xlsx';
import { DamageDetails } from '@/types/damage-report';

export interface DamageDetailsParseResult {
  detailsById: Record<string, DamageDetails>;
  sourceFileName?: string;
  error?: string;
}

export interface DamageDetailsHeadersResult {
  headers: string[];
  sourceFileName?: string;
  error?: string;
}

export interface DamageDetailsColumnMapping {
  damageId?: string;
  damageType?: string;
  treatment?: string;
  dimensions?: string;
  costAUD?: string;
  length?: string;
  width?: string;
  height?: string;
}

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/[\s_-]/g, '');

const findHeader = (headers: string[], candidates: string[]) => {
  const normalized = new Map<string, string>();
  headers.forEach((h) => normalized.set(normalizeHeader(h), h));
  for (const candidate of candidates) {
    const key = normalized.get(normalizeHeader(candidate));
    if (key) return key;
  }
  return undefined;
};

const toNumber = (value: unknown) => {
  if (value == null) return undefined;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getCellValue = (row: Record<string, unknown>, key?: string) => {
  if (!key) return undefined;
  const value = row[key];
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const buildDimensions = (row: Record<string, unknown>, headers: string[]) => {
  const lengthKey = findHeader(headers, ['length', 'len']);
  const widthKey = findHeader(headers, ['width', 'wid']);
  const heightKey = findHeader(headers, ['height', 'depth']);
  const length = getCellValue(row, lengthKey);
  const width = getCellValue(row, widthKey);
  const height = getCellValue(row, heightKey);
  if (!length && !width && !height) return undefined;
  return [length, width, height].filter(Boolean).join(' x ');
};

const isDetailsFile = (file: File) => {
  const name = file.name.toLowerCase();
  return name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls');
};

export const suggestColumnMapping = (headers: string[]): DamageDetailsColumnMapping => {
  return {
    damageId: findHeader(headers, ['damageid', 'damage_id', 'reportid', 'report_id', 'folderpath', 'folder']),
    damageType: findHeader(headers, ['damagetype', 'damage_type']),
    treatment: findHeader(headers, ['treatment', 'repair', 'action']),
    dimensions: findHeader(headers, ['dimensions', 'dimension', 'size']),
    costAUD: findHeader(headers, ['costaud', 'cost', 'estimate', 'price', 'amount']),
    length: findHeader(headers, ['length', 'len']),
    width: findHeader(headers, ['width', 'wid']),
    height: findHeader(headers, ['height', 'depth'])
  };
};

export async function getDetailsFileHeaders(files: FileList | File[]): Promise<DamageDetailsHeadersResult> {
  const fileArray = Array.isArray(files) ? files : Array.from(files);
  const detailsFile = fileArray.find(isDetailsFile);
  if (!detailsFile) return { headers: [] };

  const buffer = await detailsFile.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], sourceFileName: detailsFile.name, error: 'No worksheet found in details file.' };
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) {
    return { headers: [], sourceFileName: detailsFile.name, error: 'Details file contains no rows.' };
  }
  return { headers: Object.keys(rows[0]), sourceFileName: detailsFile.name };
}

export async function parseDamageDetailsFile(
  files: FileList | File[],
  mapping?: DamageDetailsColumnMapping
): Promise<DamageDetailsParseResult> {
  const fileArray = Array.isArray(files) ? files : Array.from(files);
  const detailsFile = fileArray.find(isDetailsFile);
  if (!detailsFile) {
    return { detailsById: {} };
  }

  const buffer = await detailsFile.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { detailsById: {}, sourceFileName: detailsFile.name, error: 'No worksheet found in details file.' };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) {
    return { detailsById: {}, sourceFileName: detailsFile.name, error: 'Details file contains no rows.' };
  }

  const headers = Object.keys(rows[0]);
  const defaults = suggestColumnMapping(headers);
  const mergedMapping = { ...defaults, ...mapping };
  const damageIdKey = mergedMapping.damageId;
  if (!damageIdKey) {
    return {
      detailsById: {},
      sourceFileName: detailsFile.name,
      error: 'Missing required column: damageId.'
    };
  }

  const damageTypeKey = mergedMapping.damageType;
  const treatmentKey = mergedMapping.treatment;
  const dimensionsKey = mergedMapping.dimensions;
  const costKey = mergedMapping.costAUD;
  const lengthKey = mergedMapping.length;
  const widthKey = mergedMapping.width;
  const heightKey = mergedMapping.height;

  const detailsById: Record<string, DamageDetails> = {};
  rows.forEach((row) => {
    const damageId = getCellValue(row, damageIdKey);
    if (!damageId) return;

    const dimensions = getCellValue(row, dimensionsKey) || (() => {
      if (lengthKey || widthKey || heightKey) {
        const length = getCellValue(row, lengthKey);
        const width = getCellValue(row, widthKey);
        const height = getCellValue(row, heightKey);
        if (!length && !width && !height) return undefined;
        return [length, width, height].filter(Boolean).join(' x ');
      }
      return buildDimensions(row, headers);
    })();
    const costAUD = toNumber(getCellValue(row, costKey));

    detailsById[damageId] = {
      damageType: getCellValue(row, damageTypeKey),
      treatment: getCellValue(row, treatmentKey),
      dimensions,
      costAUD
    };
  });

  return { detailsById, sourceFileName: detailsFile.name };
}
