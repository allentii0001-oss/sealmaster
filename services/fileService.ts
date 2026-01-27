import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { LedgerEntry, FolderSyncConfig } from '../types';

// Safe XLSX accessor for different ESM environments
const getXLSX = () => {
  return (XLSX as any).default || XLSX;
};

// Convert file to Base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

// Helper: Base64 to Blob (for file system writing)
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

// --- Helper: File Name Generation & Sanitization ---

const sanitizeForFileName = (text: string): string => {
    // Replace invalid file system characters with underscore
    if (!text) return '';
    return text.replace(/[\\/:*?"<>|]/g, '_').trim();
};

const generateEntryFileName = (entry: LedgerEntry): string => {
    // 1. Format Date: YYYY-MM-DD -> YYYYMMDD
    const dateStr = entry.date ? entry.date.replace(/-/g, '') : '00000000';
    
    // 2. Truncate and Sanitize Content (Limit 20 chars)
    const contentStr = sanitizeForFileName(entry.content).substring(0, 20);
    
    // 3. Truncate and Sanitize Recipient (Limit 10 chars)
    const recipientStr = sanitizeForFileName(entry.recipient).substring(0, 10);
    
    // 4. Sanitize Author
    const authorStr = sanitizeForFileName(entry.author);

    // Combine: 20231025_Content_Recipient_Author.pdf
    // Handle empty fields gracefully although they are required
    return `${dateStr}_${contentStr || '내용없음'}_${recipientStr || '수신처없음'}_${authorStr || '작성자미상'}.pdf`;
};


// --- File System Access API Features ---

export const connectToDirectory = async (): Promise<FileSystemDirectoryHandle> => {
    if (!('showDirectoryPicker' in window)) {
        throw new Error("이 브라우저는 폴더 직접 연결을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.");
    }
    // @ts-ignore - TypeScript might not have showDirectoryPicker types by default in all envs
    const dirHandle = await window.showDirectoryPicker();
    return dirHandle;
};

export const syncLoadFromDirectory = async (
    dirHandle: FileSystemDirectoryHandle, 
    config: FolderSyncConfig
): Promise<LedgerEntry[]> => {
    try {
        // 1. Get Excel File Handle
        const fileHandle = await dirHandle.getFileHandle(config.excelName);
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        
        // 2. Parse Excel
        let entries = parseExcelBuffer(buffer);

        // 3. Try to access Attachment Folder
        try {
            const folderHandle = await dirHandle.getDirectoryHandle(config.folderName);
            
            // 4. Load PDFs based on generated filenames
            const updatedEntriesPromises = entries.map(async (entry) => {
                try {
                    // Generate expected filename based on data
                    const pdfName = generateEntryFileName(entry);
                    
                    const pdfHandle = await folderHandle.getFileHandle(pdfName);
                    const pdfFile = await pdfHandle.getFile();
                    const base64 = await fileToBase64(pdfFile);
                    return {
                        ...entry,
                        fileName: pdfName, 
                        fileData: base64
                    };
                } catch (e) {
                    // File matching the rule doesn't exist
                    return entry;
                }
            });
            
            entries = await Promise.all(updatedEntriesPromises);

        } catch (folderError) {
            console.warn("Attachment folder not found or empty. Skipping PDF load.");
        }

        return entries;

    } catch (error: any) {
        if (error.name === 'NotFoundError') {
            throw new Error(`폴더 내에 '${config.excelName}' 파일이 없습니다.`);
        }
        throw error;
    }
};

export const syncSaveToDirectory = async (
    dirHandle: FileSystemDirectoryHandle,
    data: LedgerEntry[],
    config: FolderSyncConfig
): Promise<void> => {
    const X = getXLSX();

    // Prepare data
    // Note: We do NOT rely on item.fileName stored in state for saving logic anymore.
    // We regenerate it fresh from the data to ensure consistency.

    // 1. Write Excel File (Without FileName Column)
    const excelData = data.map((item) => ({
        '연번': item.id,
        '일자': item.date,
        '문서번호': item.docNum,
        '내용': item.content,
        '수신처': item.recipient,
        '작성자': item.author,
        // '첨부파일명' column is intentionally omitted
    }));

    const worksheet = X.utils.json_to_sheet(excelData);
    const workbook = X.utils.book_new();
    X.utils.book_append_sheet(workbook, worksheet, '직인대장');
    const excelBuffer = X.write(workbook, { bookType: 'xlsx', type: 'array' });

    // Create/Open Excel File
    const excelFileHandle = await dirHandle.getFileHandle(config.excelName, { create: true });
    // @ts-ignore
    const writable = await excelFileHandle.createWritable();
    await writable.write(excelBuffer);
    await writable.close();

    // 2. Write PDFs to Folder (and Cleanup Orphans)
    
    // Create/Open Attachment Folder
    const folderHandle = await dirHandle.getDirectoryHandle(config.folderName, { create: true });
    
    // Set of valid filenames that SHOULD exist based on current data
    const validPdfNames = new Set<string>();

    // A. Write current files
    if (data.some(d => d.fileData)) {
        for (const item of data) {
            if (item.fileData) {
                // Generate the authoritative filename based on current data
                const pdfName = generateEntryFileName(item);
                validPdfNames.add(pdfName);

                const pdfBlob = base64ToBlob(item.fileData);
                
                const pdfFileHandle = await folderHandle.getFileHandle(pdfName, { create: true });
                // @ts-ignore
                const pdfWritable = await pdfFileHandle.createWritable();
                await pdfWritable.write(pdfBlob);
                await pdfWritable.close();
            }
        }
    }

    // B. Cleanup Orphans: Remove files in the folder that are NOT in the valid list
    // @ts-ignore - Iterating over directory entries
    for await (const [name, handle] of folderHandle.entries()) {
        // Check if it is a file and looks like a PDF
        if (handle.kind === 'file' && name.endsWith('.pdf')) {
            if (!validPdfNames.has(name)) {
                // This file exists in the folder but is not in our current ledger -> Delete it
                // This handles deleted rows, renamed contents, or old ID-based files
                await folderHandle.removeEntry(name);
            }
        }
    }
};


// --- Legacy Export/Import Features ---

// Export Data to Zip (Excel + PDFs)
export const exportDataToZip = async (data: LedgerEntry[]) => {
  const zip = new JSZip();
  const X = getXLSX();

  // 1. Create Excel Data (Without FileName Column)
  const excelData = data.map((item) => ({
    '연번': item.id,
    '일자': item.date,
    '문서번호': item.docNum,
    '내용': item.content,
    '수신처': item.recipient,
    '작성자': item.author,
  }));

  const worksheet = X.utils.json_to_sheet(excelData);
  const workbook = X.utils.book_new();
  X.utils.book_append_sheet(workbook, worksheet, '직인대장');
  const excelBuffer = X.write(workbook, { bookType: 'xlsx', type: 'array' });

  // Add Excel to Zip
  zip.file('직인관리대장.xlsx', excelBuffer);

  // 2. Add PDFs to Zip
  // Create a folder for files
  const fileFolder = zip.folder('첨부파일');
  
  if (fileFolder) {
    data.forEach((item) => {
      if (item.fileData) {
        // Use the generated filename for the zip entry
        const name = generateEntryFileName(item);
        const parts = item.fileData.split(',');
        const base64Content = parts.length > 1 ? parts[1] : parts[0];
        if (base64Content) {
           fileFolder.file(name, base64Content, { base64: true });
        }
      }
    });
  }

  // 3. Generate and Save Zip
  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `직인관리대장_백업_${new Date().toISOString().split('T')[0]}.zip`);
};

// Helper: Excel Serial Date to JS Date String
const excelDateToJSDate = (serial: number) => {
   const utc_days  = Math.floor(serial - 25569);
   const utc_value = utc_days * 86400;                                        
   const date_info = new Date(utc_value * 1000);
   return date_info.toISOString().split('T')[0];
}

// Helper to normalize date to YYYY-MM-DD
const normalizeDate = (val: any): string => {
  if (!val) return '';
  
  // Handle Excel Serial Date (numbers around 45000 are years 2023ish)
  if (typeof val === 'number' && val > 30000 && val < 60000) {
      return excelDateToJSDate(val);
  }

  const str = String(val).trim();

  // Handle number-like string serial date
  if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 60000) {
      return excelDateToJSDate(Number(str));
  }
  
  // Replace dots and slashes with hyphens
  let normalized = str.replace(/[./]/g, '-');
  normalized = normalized.replace(/\s/g, '');

  // Format checking
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
      const parts = normalized.split('-');
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  
  return normalized;
};

// Helper to find value by loosely matching keys (ignoring spaces)
const getValue = (row: any, keyName: string): any => {
    // 1. Direct match
    if (row[keyName] !== undefined) return row[keyName];

    // 2. Trimmed match (e.g., " 문서번호 " in Excel vs "문서번호")
    const foundKey = Object.keys(row).find(k => k.trim() === keyName);
    if (foundKey) return row[foundKey];

    return undefined;
};

// Parse Excel ArrayBuffer to LedgerEntry[]
const parseExcelBuffer = (buffer: ArrayBuffer): LedgerEntry[] => {
    const X = getXLSX();
    const data = new Uint8Array(buffer);
    const workbook = X.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 1. Find Header Row (Scan first 20 rows)
    const jsonArrays = X.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    let headerRowIndex = 0;
    const requiredColumns = ['일자', '내용', '작성자']; // Identify headers by these columns
    
    for (let i = 0; i < Math.min(jsonArrays.length, 20); i++) {
        const row = jsonArrays[i];
        if (!row) continue;
        
        // Normalize row content for checking: remove spaces
        const rowStr = row.map(c => String(c).replace(/\s/g, ''));
        
        const matchCount = requiredColumns.reduce((acc, col) => {
            return acc + (rowStr.some(cell => cell.includes(col)) ? 1 : 0);
        }, 0);
        
        // If we find enough columns, assume this is the header row
        if (matchCount >= requiredColumns.length) {
            headerRowIndex = i;
            break;
        }
    }
    
    // 2. Parse Data using the found header row
    const jsonData = X.utils.sheet_to_json(worksheet, { 
        raw: false, 
        range: headerRowIndex 
    });

    return jsonData.map((row: any, index: number) => {
        let id = parseInt(getValue(row, '연번'));
        if (!id || isNaN(id)) {
            id = index + 1; 
        }

        const docNumRaw = getValue(row, '문서번호');
        const contentRaw = getValue(row, '내용');
        const recipientRaw = getValue(row, '수신처');
        const authorRaw = getValue(row, '작성자');
        // Legacy support: Try reading '첨부파일명' if it exists, though we don't save it anymore
        const fileNameRaw = getValue(row, '첨부파일명');

        return {
            id: id,
            date: normalizeDate(getValue(row, '일자')),
            docNum: docNumRaw ? String(docNumRaw).trim() : '',
            content: contentRaw ? String(contentRaw).trim() : '',
            recipient: recipientRaw ? String(recipientRaw).trim() : '',
            author: authorRaw ? String(authorRaw).trim() : '',
            fileName: fileNameRaw ? String(fileNameRaw).trim() : undefined,
            fileData: undefined
        };
    });
};

// Import Data (supports .xlsx or .zip)
export const importExcelData = (file: File): Promise<LedgerEntry[]> => {
  return new Promise(async (resolve, reject) => {
    try {
        const isZip = file.name.endsWith('.zip') || file.type.includes('zip') || file.type.includes('compressed');
        
        if (isZip) {
            // Handle Zip Backup (Excel + PDFs)
            const zip = new JSZip();
            const loadedZip = await zip.loadAsync(file);
            
            // Find Excel file
            const excelFile: any = Object.values(loadedZip.files).find((f: any) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
            
            if (!excelFile) {
                reject(new Error("압축 파일 내에 엑셀 파일(.xlsx)이 없습니다."));
                return;
            }

            const excelBuffer = await excelFile.async('arraybuffer');
            let entries = parseExcelBuffer(excelBuffer);

            // Restore PDFs
            const fileFolder = loadedZip.folder('첨부파일');
            if (fileFolder) {
                 const updatedEntriesPromises = entries.map(async (entry) => {
                    // We now primarily rely on the generated filename to find the PDF
                    const generatedName = generateEntryFileName(entry);
                    
                    // Try exact match with generated name
                    let pdfFile = fileFolder.file(generatedName);
                    
                    // Fallback 1: Check if legacy 'fileName' from Excel exists and works
                    if (!pdfFile && entry.fileName) {
                        pdfFile = fileFolder.file(entry.fileName);
                    }
                    
                    // Fallback 2: Legacy ID based name
                    if (!pdfFile) {
                         pdfFile = fileFolder.file(`${entry.id}.pdf`);
                    }

                    if (pdfFile) {
                        const base64 = await pdfFile.async('base64');
                        // Update the entry with the actual filename found and data
                        return {
                            ...entry,
                            fileName: pdfFile.name,
                            fileData: `data:application/pdf;base64,${base64}`
                        };
                    }
                    return entry;
                 });
                 entries = await Promise.all(updatedEntriesPromises);
            }

            resolve(entries);

        } else {
            // Handle Single Excel File
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const result = e.target?.result as ArrayBuffer;
                    const entries = parseExcelBuffer(result);
                    resolve(entries);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsArrayBuffer(file);
        }

    } catch (error) {
        console.error("Import Error:", error);
        reject(error);
    }
  });
};