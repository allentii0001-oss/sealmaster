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
  recipient: boolean;
  author: boolean;
}

export interface FolderSyncConfig {
  dbFileName: string; // Merged JSON file (Data + Log + Lock)
  folderName: string; // PDF storage folder
  backupExcelName: string; // For human readability/backup
}

export const DEFAULT_SYNC_CONFIG: FolderSyncConfig = {
  dbFileName: '직인 관리 대장.json',
  folderName: '직인문서스캔본',
  backupExcelName: '직인관리대장_백업.xlsx',
};

// --- New Types for Locking & Logging ---

export type LockStatus = 'LOCKED' | 'UNLOCKED';

export interface LockState {
  status: LockStatus;
  activeUser: string | null;
  startTime: string | null; // ISO Date String
}

export interface LogEntry {
  timestamp: string;
  userName: string;
  action: 'CONNECT' | 'DISCONNECT_SAVE' | 'FORCE_UNLOCK';
  details?: string;
}

// The single file structure
export interface CombinedDatabase {
  password?: string; // App Password (default "2888")
  lock: LockState;
  logs: LogEntry[];
  entries: Omit<LedgerEntry, 'fileData'>[]; // Metadata only in JSON to keep it small
}

export const INITIAL_DB: CombinedDatabase = {
  password: "2888",
  lock: { status: 'UNLOCKED', activeUser: null, startTime: null },
  logs: [],
  entries: [],
};

// Log Session View Type
export interface LogSession {
  userName: string;
  startTime: string;
  endTime: string | null;
  status: '접속 중' | '정상 종료' | '강제 종료' | '비정상 종료';
}