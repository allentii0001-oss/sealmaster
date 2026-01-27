export interface LedgerEntry {
  id: number;
  date: string;
  docNum: string;
  content: string;
  recipient: string;
  author: string;
  fileName?: string;
  fileData?: string; // Base64 string for PDF
}

export enum Tab {
  MANAGEMENT = 'MANAGEMENT',
  PRINT = 'PRINT',
}

export const ITEMS_PER_PAGE = 20;

export interface SearchCriteria {
  date: boolean;
  docNum: boolean;
  content: boolean;
  author: boolean;
}

export interface FolderSyncConfig {
  excelName: string;
  folderName: string;
}

export const DEFAULT_SYNC_CONFIG: FolderSyncConfig = {
  excelName: '직인관리대장.xlsx',
  folderName: '다.직인관리대장 스캔',
};