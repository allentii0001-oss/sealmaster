import React, { useState, useRef, ChangeEvent } from 'react';
import { Upload, FileText, Search, Save, Download, Edit2, Check, X, FileSpreadsheet, AlertCircle, CheckCircle2, Trash2, RefreshCw, FolderOpen, Settings, FolderInput, FolderOutput, Lock, Unlock, Archive } from 'lucide-react';
import { LedgerEntry, SearchCriteria, FolderSyncConfig, LockState } from '../types';
import { fileToBase64, exportDataToZip, backupFullDataToZip, importExcelData, connectToDirectory, connectAndLock, saveAndUnlock, forceUnlock, LockedError } from '../services/fileService';

interface Props {
  data: LedgerEntry[];
  setData: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  dirHandle: FileSystemDirectoryHandle | null;
  setDirHandle: React.Dispatch<React.SetStateAction<FileSystemDirectoryHandle | null>>;
  syncConfig: FolderSyncConfig;
  setSyncConfig: React.Dispatch<React.SetStateAction<FolderSyncConfig>>;
  userName: string; // Passed from App
}

const LedgerManagement: React.FC<Props> = ({ 
  data, 
  setData,
  dirHandle,
  setDirHandle,
  syncConfig,
  setSyncConfig,
  userName
}) => {
  // Form State
  const [formData, setFormData] = useState<Omit<LedgerEntry, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    docNum: '',
    content: '',
    recipient: '',
    author: '',
    fileName: undefined,
    fileData: undefined,
  });

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCriteria, setSearchCriteria] = useState<SearchCriteria>({
    date: false,
    docNum: false,
    content: true, // Default
    recipient: false,
    author: false,
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingData, setPendingData] = useState<LedgerEntry[]>([]);

  // Lock Error Modal
  const [lockedError, setLockedError] = useState<{ handle: FileSystemDirectoryHandle, info: LockState } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // --- Helper: Sort by Date and Renumber IDs ---
  const sortAndRenumber = (entries: LedgerEntry[]): LedgerEntry[] => {
    return entries
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry, index) => ({
        ...entry,
        id: index + 1
      }));
  };

  // --- Handlers: Folder Sync (Connect & Lock) ---

  const handleConnectFolder = async () => {
    if (!userName) {
        alert("사용자 이름이 확인되지 않았습니다. 새로고침 후 다시 시도해주세요.");
        return;
    }
    
    try {
        const handle = await connectToDirectory();
        
        // Attempt to Lock and Load
        setIsLoading(true);
        try {
            const entries = await connectAndLock(handle, syncConfig, userName);
            setDirHandle(handle);
            // Ensure loaded data is sorted and numbered correctly
            setData(sortAndRenumber(entries));
            setImportStatus({ type: 'success', message: `연결 성공: ${handle.name} (편집 가능)` });
        } catch (err: any) {
            if (err instanceof LockedError) {
                // Show Lock Modal
                setLockedError({ handle, info: err.lockInfo });
            } else {
                throw err;
            }
        }
    } catch (error: any) {
        if (error.name !== 'AbortError') {
            alert(`연결 오류: ${error.message}`);
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleForceUnlock = async () => {
      if (!lockedError) return;
      if (!window.confirm("강제 종료 하시겠습니까?\n이전 사용자의 작업 내용이 저장되지 않았을 수 있습니다.")) return;

      setIsLoading(true);
      try {
          // 1. Force Unlock
          await forceUnlock(lockedError.handle, syncConfig, userName);
          
          // 2. Retry Connect & Lock
          const entries = await connectAndLock(lockedError.handle, syncConfig, userName);
          
          setDirHandle(lockedError.handle);
          setData(sortAndRenumber(entries));
          setImportStatus({ type: 'success', message: `강제 종료 후 연결 성공` });
          setLockedError(null); // Close modal
      } catch (error: any) {
          alert(`강제 종료 실패: ${error.message}`);
      } finally {
          setIsLoading(false);
      }
  };

  const handleSyncSaveAndExit = async () => {
    if (!dirHandle) return;
    if (data.length === 0) {
        alert('저장할 데이터가 없습니다.');
        return;
    }
    if (!window.confirm(`데이터를 저장하고 접속을 종료하시겠습니까?\n'${syncConfig.dbFileName}' 및 PDF 파일들이 업데이트됩니다.`)) return;

    setIsLoading(true);
    try {
        await saveAndUnlock(dirHandle, data, syncConfig, userName);
        
        // Success -> Reset State (Simulate Disconnect)
        alert('성공적으로 저장되었으며, 다른 사용자가 이용할 수 있도록 접속이 종료되었습니다.');
        setDirHandle(null);
        setData([]); // Clear data for security
        setImportStatus(null);

    } catch (error: any) {
        setImportStatus({ type: 'error', message: `저장 실패: ${error.message}` });
        alert(`저장 중 오류가 발생했습니다.\n\n${error.message}`);
    } finally {
        setIsLoading(false);
    }
  };


  // --- Handlers: Manual Import/Export ---

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('PDF 파일만 업로드 가능합니다.');
        return;
      }
      const base64 = await fileToBase64(file);
      setFormData((prev) => ({
        ...prev,
        fileName: file.name,
        fileData: base64,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.content || !formData.recipient || !formData.author) {
      alert('필수 항목을 입력해주세요 (일자, 내용, 수신처, 작성자)');
      return;
    }

    // Temporary ID, will be recalculated
    const newEntry: LedgerEntry = {
      ...formData,
      id: 0,
    };

    // Add, Sort, Renumber
    setData((prev) => sortAndRenumber([...prev, newEntry]));
    
    // Reset form
    setFormData({
      date: new Date().toISOString().split('T')[0],
      docNum: '',
      content: '',
      recipient: '',
      author: '',
      fileName: undefined,
      fileData: undefined,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExcelImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImportStatus(null); 

    if (file) {
      try {
        const importedData = await importExcelData(file);
        if (importedData.length === 0) {
            alert('불러올 데이터가 없습니다.');
            return;
        }
        setPendingData(importedData);
        setShowImportModal(true);
      } catch (error: any) {
        console.error("Import failed:", error);
        setImportStatus({ type: 'error', message: `오류: ${error.message || '파일을 처리할 수 없습니다.'}` });
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    }
  };
  
  const confirmImport = () => {
      // Sort and renumber imported data as well
      setData(sortAndRenumber(pendingData));
      setImportStatus({ type: 'success', message: `총 ${pendingData.length}건을 성공적으로 불러왔습니다.` });
      setShowImportModal(false);
      setPendingData([]);
  };

  const cancelImport = () => {
      setImportStatus({ type: 'error', message: '불러오기가 취소되었습니다.' });
      setShowImportModal(false);
      setPendingData([]);
  };

  const handleExcelExport = () => {
    if (data.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    exportDataToZip(data);
  };
  
  const handleFullBackup = () => {
      if (data.length === 0) {
          alert('백업할 데이터가 없습니다.');
          return;
      }
      backupFullDataToZip(data);
  };

  const handleCellEdit = (id: number, field: keyof LedgerEntry, value: string) => {
    setData((prev) => {
      const updatedList = prev.map((item) => (item.id === id ? { ...item, [field]: value } : item));
      
      // If date changes, we must re-sort and re-number
      if (field === 'date') {
        return sortAndRenumber(updatedList);
      }
      return updatedList;
    });
  };

  const handleRowFileUpload = async (id: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('PDF 파일만 업로드 가능합니다.');
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        setData((prev) => 
          prev.map((item) => (item.id === id ? { ...item, fileName: file.name, fileData: base64 } : item))
        );
      } catch (error) {
        alert('파일 업로드 중 오류가 발생했습니다.');
      }
    }
  };

  const handleDeleteRow = (idToDelete: number) => {
    if (window.confirm('정말 이 항목을 삭제하시겠습니까?\n삭제 후 연번은 자동으로 재정렬됩니다.')) {
      setData((prev) => {
        const filtered = prev.filter((item) => item.id !== idToDelete);
        // Renumber after delete (Sort should be maintained, but re-run just in case)
        return sortAndRenumber(filtered);
      });
    }
  };

  const openPdf = (base64Data?: string) => {
    if (!base64Data) return;
    const win = window.open();
    if (win) {
      win.document.write(
        `<iframe src="${base64Data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
      );
    }
  };

  // Filter Logic
  const filteredData = data.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    const matches: boolean[] = [];
    if (searchCriteria.date) matches.push(item.date.includes(query));
    if (searchCriteria.docNum) matches.push(item.docNum.toLowerCase().includes(query));
    if (searchCriteria.content) matches.push(item.content.toLowerCase().includes(query));
    if (searchCriteria.recipient) matches.push(item.recipient.toLowerCase().includes(query));
    if (searchCriteria.author) matches.push(item.author.toLowerCase().includes(query));

    if (!searchCriteria.date && !searchCriteria.docNum && !searchCriteria.content && !searchCriteria.recipient && !searchCriteria.author) {
        return false;
    }
    
    if (matches.length === 0) return false; 
    return matches.some(m => m);
  });

  const sortedData = [...filteredData]; // Already sorted by ID/Date thanks to sortAndRenumber

  return (
    <div className="space-y-6 relative">
      {/* Loading Overlay */}
      {isLoading && (
          <div className="fixed inset-0 bg-white bg-opacity-70 z-[60] flex items-center justify-center" aria-live="assertive">
              <div className="flex flex-col items-center">
                <RefreshCw className="animate-spin text-blue-600 mb-2" size={40} />
                <span className="text-lg font-bold text-gray-700">작업 중입니다...</span>
              </div>
          </div>
      )}

      {/* Lock Error Modal (Collision Detection) */}
      {lockedError && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center border-t-4 border-red-500">
                  <div className="flex justify-center mb-4 text-red-500">
                      <Lock size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">접속 제한 (잠김)</h3>
                  <div className="bg-red-50 rounded-lg p-4 mb-6 text-left">
                      <p className="font-semibold text-red-800 mb-1">현재 다른 사용자가 접속 중입니다.</p>
                      <ul className="text-sm text-red-700 space-y-1">
                          <li>• 사용자: <span className="font-bold">{lockedError.info.activeUser}</span></li>
                          <li>• 접속시간: {new Date(lockedError.info.startTime || '').toLocaleString()}</li>
                      </ul>
                  </div>
                  <p className="text-gray-600 text-sm mb-6">
                      해당 사용자가 저장을 완료할 때까지 기다리거나,<br/>
                      문제가 있는 경우 <strong>강제 종료</strong>하여 접속할 수 있습니다.
                  </p>
                  <div className="flex gap-3 justify-center">
                      <button 
                          onClick={() => setLockedError(null)}
                          className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                          취소
                      </button>
                      <button 
                          onClick={handleForceUnlock}
                          className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-bold shadow-md"
                      >
                          <Unlock size={18} />
                          강제 접속 종료
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Configuration Modal */}
      {showConfigModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                  <div className="flex items-center gap-3 mb-6 border-b pb-4">
                      <Settings className="text-gray-700" size={24} aria-hidden="true" />
                      <h3 id="modal-title" className="text-xl font-bold">동기화 파일 설정</h3>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">DB 파일명 (JSON)</label>
                          <input 
                              type="text" 
                              value={syncConfig.dbFileName}
                              onChange={(e) => setSyncConfig(p => ({ ...p, dbFileName: e.target.value }))}
                              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                              readOnly
                          />
                          <p className="text-xs text-gray-500 mt-1">데이터와 로그가 통합된 파일입니다.</p>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">백업 엑셀 파일명</label>
                          <input 
                              type="text" 
                              value={syncConfig.backupExcelName}
                              onChange={(e) => setSyncConfig(p => ({ ...p, backupExcelName: e.target.value }))}
                              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">첨부파일 폴더명</label>
                          <input 
                              type="text" 
                              value={syncConfig.folderName}
                              onChange={(e) => setSyncConfig(p => ({ ...p, folderName: e.target.value }))}
                              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                      </div>
                  </div>

                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={() => setShowConfigModal(false)}
                          className="px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors"
                      >
                          닫기
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Import Confirmation Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4 text-slate-800">
              <AlertCircle className="text-blue-600" size={28} aria-hidden="true" />
              <h3 id="import-title" className="text-xl font-bold">데이터 불러오기 확인</h3>
            </div>
            
            <p className="text-gray-600 mb-6 leading-relaxed">
              파일에서 총 <span className="font-bold text-blue-600 text-lg">{pendingData.length}</span>개의 데이터를 발견했습니다.<br/>
              기존 목록을 모두 지우고 새로운 데이터로 덮어쓰시겠습니까?
            </p>

            <div className="flex justify-end gap-3">
              <button 
                onClick={cancelImport}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button 
                onClick={confirmImport}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
              >
                <Check size={16} aria-hidden="true" />
                덮어쓰기 (실행)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        
        {/* Left Side: Sync & File Actions */}
        <div className="flex flex-col gap-3 w-full xl:w-auto">
           {/* Row 1: Folder Connection */}
           <div className="flex flex-wrap items-center gap-2 pb-2 border-b xl:border-b-0 xl:pb-0">
               {!dirHandle ? (
                   <button
                       onClick={handleConnectFolder}
                       className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-medium shadow-sm"
                   >
                       <FolderOpen size={18} aria-hidden="true" />
                       폴더 연결 및 시작
                   </button>
               ) : (
                   <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded border border-green-200">
                       <CheckCircle2 size={16} className="text-green-600" aria-hidden="true"/>
                       <span className="text-sm font-bold text-green-900 truncate max-w-[150px]">연결됨: {dirHandle.name}</span>
                       <button 
                           onClick={() => setShowConfigModal(true)}
                           className="p-1 hover:bg-green-200 rounded text-green-700 ml-1"
                           title="설정"
                       >
                           <Settings size={16} />
                       </button>
                   </div>
               )}

               {/* Sync Buttons (Visible only when connected) */}
               {dirHandle && (
                   <button
                       onClick={handleSyncSaveAndExit}
                       className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800 transition-colors text-sm font-bold shadow-sm animate-pulse"
                       title="저장 후 접속을 종료합니다"
                   >
                       <FolderOutput size={18} aria-hidden="true" />
                       저장 및 접속 종료
                   </button>
               )}
           </div>

           {/* Row 2: Manual Fallback (Always visible but visually secondary) */}
           <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-400 text-xs hidden md:inline">개인 PC 파일:</span>
                <label htmlFor="manual-import-file" className="sr-only">엑셀 또는 zip 파일 불러오기</label>
                <input
                    id="manual-import-file"
                    type="file"
                    accept=".xlsx, .xls, .zip"
                    className="hidden"
                    ref={importInputRef}
                    onChange={handleExcelImport}
                />
                <button
                    onClick={() => importInputRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                >
                    <FileSpreadsheet size={14} aria-hidden="true" />
                    열기
                </button>
                <button
                    onClick={handleExcelExport}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                >
                    <Download size={14} aria-hidden="true" />
                    엑셀 저장
                </button>
                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                <button
                    onClick={handleFullBackup}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                    title="현재 데이터와 모든 PDF를 압축하여 다운로드합니다"
                >
                    <Archive size={14} aria-hidden="true" />
                    PDF 통째로 백업
                </button>
           </div>
           
           {/* Status Message */}
           {importStatus && (
               <div 
                  className={`flex items-center gap-2 text-sm font-medium ${importStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
                  role="status"
                  aria-live="polite"
               >
                   {importStatus.type === 'success' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
                   {importStatus.message}
               </div>
           )}
        </div>

        {/* Right Side: Search */}
        <div className="flex flex-col gap-2 w-full xl:w-auto" role="search">
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={searchCriteria.date}
                onChange={(e) => setSearchCriteria(p => ({ ...p, date: e.target.checked }))}
                className="rounded text-blue-600"
              />
              일자
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={searchCriteria.docNum}
                onChange={(e) => setSearchCriteria(p => ({ ...p, docNum: e.target.checked }))}
                className="rounded text-blue-600"
              />
              문서번호
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={searchCriteria.content}
                onChange={(e) => setSearchCriteria(p => ({ ...p, content: e.target.checked }))}
                className="rounded text-blue-600"
              />
              내용
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={searchCriteria.recipient}
                onChange={(e) => setSearchCriteria(p => ({ ...p, recipient: e.target.checked }))}
                className="rounded text-blue-600"
              />
              수신처
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={searchCriteria.author}
                onChange={(e) => setSearchCriteria(p => ({ ...p, author: e.target.checked }))}
                className="rounded text-blue-600"
              />
              작성자
            </label>
          </div>
          <div className="relative">
            <label htmlFor="search-input" className="sr-only">검색어 입력</label>
            <input
              id="search-input"
              type="text"
              placeholder="검색어를 입력하세요..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full xl:w-80 pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className={`bg-white p-6 rounded-lg shadow-sm border border-gray-200 ${dirHandle ? '' : 'opacity-70 pointer-events-none'}`}>
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">새로운 항목 입력</h3>
            {!dirHandle && <span className="text-red-500 text-sm font-bold animate-pulse">※ 폴더 연결 후 입력 가능</span>}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
          <div className="col-span-1">
            <label htmlFor="form-date" className="block text-sm font-medium text-gray-700 mb-1">일자 <span className="text-red-500">*</span></label>
            <input
              id="form-date"
              type="date"
              name="date"
              value={formData.date}
              onChange={handleInputChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>
          <div className="col-span-1">
            <label htmlFor="form-docNum" className="block text-sm font-medium text-gray-700 mb-1">문서번호</label>
            <input
              id="form-docNum"
              type="text"
              name="docNum"
              value={formData.docNum}
              onChange={handleInputChange}
              placeholder="Ex. 2023-001"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="col-span-1 md:col-span-2">
            <label htmlFor="form-content" className="block text-sm font-medium text-gray-700 mb-1">내용 <span className="text-red-500">*</span></label>
            <input
              id="form-content"
              type="text"
              name="content"
              value={formData.content}
              onChange={handleInputChange}
              placeholder="문서 제목 또는 내용"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>
          <div className="col-span-1">
            <label htmlFor="form-recipient" className="block text-sm font-medium text-gray-700 mb-1">수신처 <span className="text-red-500">*</span></label>
            <input
              id="form-recipient"
              type="text"
              name="recipient"
              value={formData.recipient}
              onChange={handleInputChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>
          <div className="col-span-1">
            <label htmlFor="form-author" className="block text-sm font-medium text-gray-700 mb-1">작성자 <span className="text-red-500">*</span></label>
            <input
              id="form-author"
              type="text"
              name="author"
              value={formData.author}
              onChange={handleInputChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>
        </div>
        
        <div className="mt-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="w-full md:w-auto">
            <label htmlFor="form-file" className="block text-sm font-medium text-gray-700 mb-1">첨부파일 (PDF)</label>
            <div className="flex items-center gap-2">
              <input
                id="form-file"
                type="file"
                accept="application/pdf"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                "
              />
              {formData.fileName && (
                 <span className="text-xs text-green-600 flex items-center gap-1">
                   <Check size={12} aria-hidden="true" /> {formData.fileName}
                 </span>
              )}
            </div>
          </div>
          <button
            type="submit"
            className="w-full md:w-auto px-6 py-2.5 bg-slate-800 text-white font-medium rounded hover:bg-slate-900 transition-colors flex items-center justify-center gap-2"
          >
            <Save size={18} aria-hidden="true" />
            등록하기
          </button>
        </div>
      </form>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-800">등록 현황 ({sortedData.length}건)</h3>
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              isEditMode 
                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            aria-label={isEditMode ? "수정 모드 종료" : "수정 모드 활성화"}
          >
            {isEditMode ? <><X size={14} aria-hidden="true"/> 수정 종료</> : <><Edit2 size={14} aria-hidden="true"/> 수정 활성화</>}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <caption className="sr-only">직인 관리 대장 등록 현황 데이터 목록</caption>
            <thead className="bg-gray-100 text-gray-700 uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 w-16 text-center border-r">연번</th>
                <th scope="col" className="px-4 py-3 w-32 border-r">일자</th>
                <th scope="col" className="px-4 py-3 w-32 border-r">문서번호</th>
                <th scope="col" className="px-4 py-3 border-r">내용</th>
                <th scope="col" className="px-4 py-3 w-40 border-r">수신처</th>
                <th scope="col" className="px-4 py-3 w-32 border-r">작성자</th>
                <th scope="col" className="px-4 py-3 w-20 text-center border-r">파일</th>
                {isEditMode && <th scope="col" className="px-4 py-3 w-16 text-center text-red-600">관리</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-center font-medium text-gray-900 border-r" scope="row">{item.id}</td>
                  
                  {/* Date */}
                  <td className="px-4 py-3 border-r">
                    {isEditMode ? (
                      <input 
                        type="date" 
                        value={item.date} 
                        onChange={(e) => handleCellEdit(item.id, 'date', e.target.value)}
                        className="w-full border p-1 rounded"
                        aria-label={`연번 ${item.id}번 일자 수정`}
                      />
                    ) : item.date}
                  </td>

                  {/* Doc Num */}
                  <td className="px-4 py-3 border-r">
                    {isEditMode ? (
                      <input 
                        type="text" 
                        value={item.docNum} 
                        onChange={(e) => handleCellEdit(item.id, 'docNum', e.target.value)}
                        className="w-full border p-1 rounded"
                        aria-label={`연번 ${item.id}번 문서번호 수정`}
                      />
                    ) : item.docNum}
                  </td>

                  {/* Content */}
                  <td className="px-4 py-3 border-r">
                    {isEditMode ? (
                      <input 
                        type="text" 
                        value={item.content} 
                        onChange={(e) => handleCellEdit(item.id, 'content', e.target.value)}
                        className="w-full border p-1 rounded"
                        aria-label={`연번 ${item.id}번 내용 수정`}
                      />
                    ) : item.content}
                  </td>

                  {/* Recipient */}
                  <td className="px-4 py-3 border-r">
                    {isEditMode ? (
                      <input 
                        type="text" 
                        value={item.recipient} 
                        onChange={(e) => handleCellEdit(item.id, 'recipient', e.target.value)}
                        className="w-full border p-1 rounded"
                        aria-label={`연번 ${item.id}번 수신처 수정`}
                      />
                    ) : item.recipient}
                  </td>

                  {/* Author */}
                  <td className="px-4 py-3 border-r">
                    {isEditMode ? (
                      <input 
                        type="text" 
                        value={item.author} 
                        onChange={(e) => handleCellEdit(item.id, 'author', e.target.value)}
                        className="w-full border p-1 rounded"
                        aria-label={`연번 ${item.id}번 작성자 수정`}
                      />
                    ) : item.author}
                  </td>

                  {/* File */}
                  <td className="px-4 py-3 text-center border-r">
                    <div className="flex flex-col items-center gap-1 justify-center">
                      {/* View Icon if file exists */}
                      {item.fileData && !isEditMode && (
                        <button 
                          onClick={() => openPdf(item.fileData)}
                          className="flex items-center justify-center text-red-600 hover:text-red-800 transition-colors p-1"
                          title="미리보기 (클릭)"
                          aria-label={`연번 ${item.id}번 파일 미리보기`}
                        >
                          <FileText size={20} className="fill-current" aria-hidden="true" />
                        </button>
                      )}

                      {/* Edit Mode: Upload Button (Replace or New) */}
                      {isEditMode && (
                        <label 
                          className={`cursor-pointer inline-flex items-center px-2 py-1 text-xs rounded transition-colors ${item.fileData ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                          aria-label={`연번 ${item.id}번 파일 ${item.fileData ? '교체' : '업로드'}`}
                        >
                          {item.fileData ? <RefreshCw size={10} className="mr-1" aria-hidden="true"/> : <Upload size={10} className="mr-1" aria-hidden="true"/>}
                          {item.fileData ? '교체' : '업로드'}
                          <input 
                            type="file" 
                            accept="application/pdf" 
                            className="sr-only" // Changed from 'hidden' to 'sr-only' for keyboard accessibility
                            onChange={(e) => handleRowFileUpload(item.id, e)} 
                          />
                        </label>
                      )}

                      {!isEditMode && !item.fileData && (
                        <span className="text-gray-300" aria-label="파일 없음">-</span>
                      )}
                    </div>
                  </td>

                  {/* Action Column (Edit Mode Only) */}
                  {isEditMode && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteRow(item.id)}
                        className="p-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                        title="삭제"
                        aria-label={`연번 ${item.id}번 항목 삭제`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {sortedData.length === 0 && (
                <tr>
                  <td colSpan={isEditMode ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LedgerManagement;