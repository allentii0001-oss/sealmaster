import React, { useState, useRef, ChangeEvent } from 'react';
import { Upload, FileText, Search, Save, Download, Edit2, Check, X, FileSpreadsheet, AlertCircle, CheckCircle2, Trash2, RefreshCw, FolderOpen, Settings, FolderInput, FolderOutput } from 'lucide-react';
import { LedgerEntry, SearchCriteria, FolderSyncConfig } from '../types';
import { fileToBase64, exportDataToZip, importExcelData, connectToDirectory, syncLoadFromDirectory, syncSaveToDirectory } from '../services/fileService';

interface Props {
  data: LedgerEntry[];
  setData: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  // Props for lifted state
  dirHandle: FileSystemDirectoryHandle | null;
  setDirHandle: React.Dispatch<React.SetStateAction<FileSystemDirectoryHandle | null>>;
  syncConfig: FolderSyncConfig;
  setSyncConfig: React.Dispatch<React.SetStateAction<FolderSyncConfig>>;
}

const LedgerManagement: React.FC<Props> = ({ 
  data, 
  setData,
  dirHandle,
  setDirHandle,
  syncConfig,
  setSyncConfig
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
    author: false,
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Note: dirHandle and syncConfig are now passed via props
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // Import Modal State (Manual File)
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingData, setPendingData] = useState<LedgerEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers: Folder Sync ---

  const handleConnectFolder = async () => {
    try {
        const handle = await connectToDirectory();
        setDirHandle(handle);
        setImportStatus({ type: 'success', message: `폴더 연결 성공: ${handle.name}` });
    } catch (error: any) {
        if (error.name !== 'AbortError') { // Ignore if user cancels
            alert(`폴더 연결 실패: ${error.message}`);
        }
    }
  };

  const handleSyncLoad = async () => {
    if (!dirHandle) return;
    if (!window.confirm('폴더의 엑셀 파일에서 데이터를 불러오시겠습니까?\n현재 입력된 데이터는 덮어씌워집니다.')) return;

    setIsLoading(true);
    try {
        const entries = await syncLoadFromDirectory(dirHandle, syncConfig);
        setData(entries);
        setImportStatus({ type: 'success', message: `폴더에서 ${entries.length}건을 불러왔습니다.` });
    } catch (error: any) {
        setImportStatus({ type: 'error', message: `불러오기 실패: ${error.message}` });
        alert(`데이터를 불러오지 못했습니다.\n\n${error.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleSyncSave = async () => {
    if (!dirHandle) return;
    if (data.length === 0) {
        alert('저장할 데이터가 없습니다.');
        return;
    }
    if (!window.confirm(`'${syncConfig.excelName}' 파일과 PDF 파일들을 저장하시겠습니까?\n경고: 폴더 내 대장과 일치하지 않는 PDF 파일은 삭제됩니다.`)) return;

    setIsLoading(true);
    try {
        await syncSaveToDirectory(dirHandle, data, syncConfig);
        setImportStatus({ type: 'success', message: '폴더에 모든 데이터를 저장했습니다.' });
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

    const newEntry: LedgerEntry = {
      ...formData,
      id: data.length > 0 ? Math.max(...data.map(d => d.id)) + 1 : 1,
    };

    setData((prev) => [...prev, newEntry]);
    
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
      setData(pendingData);
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

  const handleCellEdit = (id: number, field: keyof LedgerEntry, value: string) => {
    setData((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
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
        return filtered.map((item, index) => ({
          ...item,
          id: index + 1
        }));
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
    if (searchCriteria.author) matches.push(item.author.toLowerCase().includes(query));

    if (!searchCriteria.date && !searchCriteria.docNum && !searchCriteria.content && !searchCriteria.author) {
        return false;
    }
    
    if (matches.length === 0) return false; 
    return matches.some(m => m);
  });

  const sortedData = [...filteredData].sort((a, b) => a.id - b.id);

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

      {/* Configuration Modal */}
      {showConfigModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                  <div className="flex items-center gap-3 mb-6 border-b pb-4">
                      <Settings className="text-gray-700" size={24} aria-hidden="true" />
                      <h3 id="modal-title" className="text-xl font-bold">폴더 동기화 설정</h3>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                      <div>
                          <label htmlFor="configExcelName" className="block text-sm font-medium text-gray-700 mb-1">엑셀 파일명 (확장자 포함)</label>
                          <input 
                              id="configExcelName"
                              type="text" 
                              value={syncConfig.excelName}
                              onChange={(e) => setSyncConfig(p => ({ ...p, excelName: e.target.value }))}
                              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <p className="text-xs text-gray-500 mt-1">예: 직인관리대장.xlsx</p>
                      </div>
                      <div>
                          <label htmlFor="configFolderName" className="block text-sm font-medium text-gray-700 mb-1">첨부파일 저장 폴더명</label>
                          <input 
                              id="configFolderName"
                              type="text" 
                              value={syncConfig.folderName}
                              onChange={(e) => setSyncConfig(p => ({ ...p, folderName: e.target.value }))}
                              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <p className="text-xs text-gray-500 mt-1">이 폴더 내에 PDF 파일들이 '일자_내용_수신처_작성자.pdf' 형식으로 저장됩니다.</p>
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
                       className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                   >
                       <FolderOpen size={18} aria-hidden="true" />
                       폴더 연결 (탐색기)
                   </button>
               ) : (
                   <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1 rounded border border-indigo-200">
                       <FolderOpen size={16} className="text-indigo-600" aria-hidden="true"/>
                       <span className="text-sm font-medium text-indigo-900 truncate max-w-[150px]">연결됨: {dirHandle.name}</span>
                       <button 
                           onClick={() => setShowConfigModal(true)}
                           className="p-1 hover:bg-indigo-200 rounded text-indigo-700 ml-1"
                           title="동기화 설정"
                           aria-label="폴더 동기화 설정"
                       >
                           <Settings size={16} />
                       </button>
                   </div>
               )}

               {/* Sync Buttons (Visible only when connected) */}
               {dirHandle && (
                   <>
                       <button
                           onClick={handleSyncLoad}
                           className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm"
                           title="폴더의 엑셀 파일에서 불러오기"
                       >
                           <FolderInput size={16} aria-hidden="true" />
                           폴더에서 불러오기
                       </button>
                       <button
                           onClick={handleSyncSave}
                           className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm"
                           title="폴더에 저장하기"
                       >
                           <FolderOutput size={16} aria-hidden="true" />
                           폴더에 저장하기
                       </button>
                   </>
               )}
           </div>

           {/* Row 2: Manual Fallback (Always visible but visually secondary) */}
           <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-400 text-xs hidden md:inline">수동 파일:</span>
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
                    파일 열기
                </button>
                <button
                    onClick={handleExcelExport}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                >
                    <Download size={14} aria-hidden="true" />
                    PC에 저장
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
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-bold mb-4 text-gray-800">새로운 항목 입력</h3>
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