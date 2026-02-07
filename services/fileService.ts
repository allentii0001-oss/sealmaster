import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { LedgerEntry, FolderSyncConfig, CombinedDatabase, INITIAL_DB, LockState } from '../types';

// Safe XLSX accessor
const getXLSX = () => (XLSX as any).default || XLSX;

// --- Custom Error for Locking ---
export class LockedError extends Error {
    lockInfo: LockState;
    constructor(lockInfo: LockState) {
        super("Database is locked");
        this.name = "LockedError";
        this.lockInfo = lockInfo;
    }
}

// --- Helper Functions ---

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const base64ToBlob = (base64: string, contentType: string = 'application/pdf'): Blob => {
    const parts = base64.split(';base64,');
    const raw = window.atob(parts.length > 1 ? parts[1] : parts[0]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
};

const sanitizeForFileName = (text: string): string => {
    if (!text) return '';
    return text.replace(/[\\/:*?"<>|]/g, '_').trim();
};

const generateEntryFileName = (entry: Omit<LedgerEntry, 'fileData'>): string => {
    const dateStr = entry.date ? entry.date.replace(/-/g, '') : '00000000';
    const contentStr = sanitizeForFileName(entry.content).substring(0, 20);
    const recipientStr = sanitizeForFileName(entry.recipient).substring(0, 10);
    const authorStr = sanitizeForFileName(entry.author).substring(0, 10);
    // date_content_recipient_author.pdf
    return `${dateStr}_${contentStr}_${recipientStr}_${authorStr}.pdf`;
};

// --- Folder Sync Logic ---

export const connectToDirectory = async () => {
    return await (window as any).showDirectoryPicker();
};

export const connectAndLock = async (dirHandle: FileSystemDirectoryHandle, config: FolderSyncConfig, userName: string) => {
    // 1. Get or Create JSON DB File
    let dbHandle: FileSystemFileHandle;
    let db: CombinedDatabase = JSON.parse(JSON.stringify(INITIAL_DB));

    try {
        dbHandle = await dirHandle.getFileHandle(config.dbFileName, { create: true });
        const file = await dbHandle.getFile();
        const text = await file.text();
        if (text.trim()) {
            db = JSON.parse(text);
        }
    } catch (e) {
        dbHandle = await dirHandle.getFileHandle(config.dbFileName, { create: true });
    }

    // 2. Check Lock
    if (db.lock.status === 'LOCKED') {
        throw new LockedError(db.lock);
    }

    // 3. Lock it
    db.lock = {
        status: 'LOCKED',
        activeUser: userName,
        startTime: new Date().toISOString()
    };
    db.logs.push({
        timestamp: new Date().toISOString(),
        userName,
        action: 'CONNECT'
    });
    
    const writable = await dbHandle.createWritable();
    await writable.write(JSON.stringify(db, null, 2));
    await writable.close();

    // 4. Load Entries & Files
    const loadedEntries: LedgerEntry[] = [];
    
    let folderHandle: FileSystemDirectoryHandle;
    try {
        folderHandle = await dirHandle.getDirectoryHandle(config.folderName, { create: true });
    } catch (e) {
        folderHandle = await dirHandle.getDirectoryHandle(config.folderName, { create: true });
    }

    for (const entryMeta of db.entries) {
        const entry: LedgerEntry = { ...entryMeta };
        if (entry.fileName) {
            try {
                const fileHandle = await folderHandle.getFileHandle(entry.fileName);
                const file = await fileHandle.getFile();
                entry.fileData = await fileToBase64(file);
            } catch (e) {
                console.warn(`File not found: ${entry.fileName}`);
            }
        }
        loadedEntries.push(entry);
    }

    return loadedEntries;
};

export const saveAndUnlock = async (dirHandle: FileSystemDirectoryHandle, data: LedgerEntry[], config: FolderSyncConfig, userName: string) => {
    const cleanEntries: Omit<LedgerEntry, 'fileData'>[] = [];
    const folderHandle = await dirHandle.getDirectoryHandle(config.folderName, { create: true });
    const validFileNames = new Set<string>();

    // 1. Save Files
    for (const item of data) {
        let finalFileName = item.fileName;
        
        if (item.fileData) {
            // Force regenerate filename to ensure consistency
            const genName = generateEntryFileName(item); 
            finalFileName = genName; 
            
            const fileHandle = await folderHandle.getFileHandle(finalFileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(base64ToBlob(item.fileData));
            await writable.close();
        }

        if (finalFileName) validFileNames.add(finalFileName);

        cleanEntries.push({
            id: item.id,
            date: item.date,
            docNum: item.docNum,
            content: item.content,
            recipient: item.recipient,
            author: item.author,
            fileName: finalFileName
        });
    }

    // 2. Cleanup Orphans (Keep this per user request)
    for await (const [name, handle] of folderHandle.entries()) {
        if (handle.kind === 'file' && !validFileNames.has(name)) {
            await folderHandle.removeEntry(name);
        }
    }

    // 3. Update DB & Unlock
    const dbHandle = await dirHandle.getFileHandle(config.dbFileName, { create: true });
    const file = await dbHandle.getFile();
    const text = await file.text();
    let oldDb: CombinedDatabase = JSON.parse(text || JSON.stringify(INITIAL_DB));

    const newDb: CombinedDatabase = {
        lock: { status: 'UNLOCKED', activeUser: null, startTime: null },
        logs: [
            ...oldDb.logs, 
            { timestamp: new Date().toISOString(), userName, action: 'DISCONNECT_SAVE' }
        ],
        entries: cleanEntries
    };

    const writable = await dbHandle.createWritable();
    await writable.write(JSON.stringify(newDb, null, 2));
    await writable.close();
};

export const forceUnlock = async (dirHandle: FileSystemDirectoryHandle, config: FolderSyncConfig, userName: string) => {
     const dbHandle = await dirHandle.getFileHandle(config.dbFileName, { create: true });
     const file = await dbHandle.getFile();
     const text = await file.text();
     let db: CombinedDatabase = JSON.parse(text || JSON.stringify(INITIAL_DB));
     
     db.lock = { status: 'UNLOCKED', activeUser: null, startTime: null };
     db.logs.push({ timestamp: new Date().toISOString(), userName, action: 'FORCE_UNLOCK' });
     
     const writable = await dbHandle.createWritable();
     await writable.write(JSON.stringify(db, null, 2));
     await writable.close();
};

// --- Import / Export Logic ---

export const importExcelData = async (file: File): Promise<LedgerEntry[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = getXLSX().read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = getXLSX().utils.sheet_to_json(worksheet) as any[];
                
                const entries: LedgerEntry[] = jsonData.map((row: any) => ({
                    id: row['id'] || row['연번'],
                    date: row['date'] || row['일자'],
                    docNum: row['docNum'] || row['문서번호'],
                    content: row['content'] || row['내용'],
                    recipient: row['recipient'] || row['수신처'],
                    author: row['author'] || row['작성자'],
                    fileName: row['fileName'] || row['파일명'],
                }));
                resolve(entries);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

// Existing export (just Excel/basic zip) - renamed slightly to avoid conflict if needed, but keeping for compatibility
export const exportDataToZip = (data: LedgerEntry[]) => {
    const worksheet = getXLSX().utils.json_to_sheet(data.map(({fileData, ...rest}) => rest));
    const workbook = getXLSX().utils.book_new();
    getXLSX().utils.book_append_sheet(workbook, worksheet, "대장");
    getXLSX().writeFile(workbook, "직인관리대장.xlsx");
};

// NEW: Full Backup Function
export const backupFullDataToZip = async (data: LedgerEntry[]) => {
    const zip = new JSZip();
    
    // 1. Add Metadata JSON
    const metaData = data.map(({fileData, ...rest}) => rest);
    zip.file("직인 관리 대장.json", JSON.stringify(metaData, null, 2));

    // 2. Add Excel Backup
    const worksheet = getXLSX().utils.json_to_sheet(metaData);
    const workbook = getXLSX().utils.book_new();
    getXLSX().utils.book_append_sheet(workbook, worksheet, "대장");
    const excelBuffer = getXLSX().write(workbook, { bookType: 'xlsx', type: 'array' });
    zip.file("직인 관리 대장.xlsx", excelBuffer);

    // 3. Add PDFs
    const folder = zip.folder("직인문서스캔본");
    if (folder) {
        data.forEach(item => {
            if (item.fileData && item.fileName) {
                folder.file(item.fileName, base64ToBlob(item.fileData));
            }
        });
    }

    // 4. Download
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `직인관리대장_전체백업_${new Date().toISOString().split('T')[0]}.zip`);
};