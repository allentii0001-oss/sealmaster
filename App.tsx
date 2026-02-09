import React, { useState, useEffect } from 'react';
import { Book, Printer, UserCircle, History } from 'lucide-react';
import LedgerManagement from './components/LedgerManagement';
import LedgerPrint from './components/LedgerPrint';
import LogViewer from './components/LogViewer';
import { LedgerEntry, Tab, FolderSyncConfig, DEFAULT_SYNC_CONFIG } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MANAGEMENT);
  
  // Login State
  const [userName, setUserName] = useState<string>('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(true);
  const [tempName, setTempName] = useState('');

  // Load initial data from localStorage if available, else empty
  const [data, setData] = useState<LedgerEntry[]>(() => {
    const saved = localStorage.getItem('sealLedgerData');
    return saved ? JSON.parse(saved) : [];
  });

  // Folder Sync State
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [syncConfig, setSyncConfig] = useState<FolderSyncConfig>(DEFAULT_SYNC_CONFIG);

  // Log Viewer Modal State
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('sealLedgerData', JSON.stringify(data));
  }, [data]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      setUserName(tempName.trim());
      setIsLoginModalOpen(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-slate-900 font-sans relative">
      
      {/* Login Modal (Force User Name) */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-slate-900 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-8 text-center">
             <div className="mx-auto bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <UserCircle size={40} className="text-blue-600" />
             </div>
             <h2 className="text-2xl font-bold text-slate-800 mb-2">사용자 확인</h2>
             <p className="text-gray-500 mb-6">직인 관리 대장을 이용하기 위해<br/>성함을 입력해 주세요.</p>
             <form onSubmit={handleLogin}>
               <input 
                 type="text" 
                 value={tempName}
                 onChange={(e) => setTempName(e.target.value)}
                 placeholder="예: 홍길동"
                 className="w-full border-2 border-gray-300 rounded-lg p-3 text-lg text-center focus:border-blue-500 focus:outline-none mb-4"
                 autoFocus
                 required
               />
               <button 
                 type="submit" 
                 disabled={!tempName.trim()}
                 className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
               >
                 시작하기
               </button>
             </form>
          </div>
        </div>
      )}

      {/* Log Viewer Modal */}
      {dirHandle && (
        <LogViewer 
          isOpen={isLogViewerOpen} 
          onClose={() => setIsLogViewerOpen(false)} 
          dirHandle={dirHandle}
          syncConfig={syncConfig}
        />
      )}

      {/* Header / Navigation */}
      <header className="bg-slate-900 text-white shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-16 justify-between">
            <div className="flex items-center gap-3">
              <Book className="text-blue-400" />
              <div className="flex items-baseline gap-1.5">
                <h1 className="text-xl font-bold tracking-tight">직인 관리 시스템</h1>
                <span className="text-xs text-slate-400 font-medium">v_1.0</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
               {/* Log Button - Only visible if folder connected */}
               {dirHandle && (
                   <button 
                      onClick={() => setIsLogViewerOpen(true)}
                      className="hidden md:flex items-center gap-1 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1 rounded-full transition-colors border border-slate-700"
                      title="접속 기록 관리자 메뉴"
                   >
                       <History size={14} />
                       <span>접속 기록 확인</span>
                   </button>
               )}

               {userName && (
                 <div className="hidden md:flex items-center gap-2 text-sm text-slate-300 bg-slate-800 px-3 py-1 rounded-full">
                    <UserCircle size={14} />
                    <span>{userName}님 접속 중</span>
                 </div>
               )}
                <nav className="flex space-x-1">
                  <button
                    onClick={() => setActiveTab(Tab.MANAGEMENT)}
                    className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === Tab.MANAGEMENT
                        ? 'bg-slate-700 text-white shadow'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Book className="mr-2 h-4 w-4" />
                    대장 관리
                  </button>
                  <button
                    onClick={() => setActiveTab(Tab.PRINT)}
                    className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      activeTab === Tab.PRINT
                        ? 'bg-slate-700 text-white shadow'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    대장 출력
                  </button>
                </nav>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeTab === Tab.MANAGEMENT ? (
          <LedgerManagement 
            userName={userName}
            data={data} 
            setData={setData} 
            dirHandle={dirHandle}
            setDirHandle={setDirHandle}
            syncConfig={syncConfig}
            setSyncConfig={setSyncConfig}
          />
        ) : (
          <LedgerPrint data={data} />
        )}
      </main>
    </div>
  );
};

export default App;