import React, { useState, useEffect } from 'react';
import { Book, Printer } from 'lucide-react';
import LedgerManagement from './components/LedgerManagement';
import LedgerPrint from './components/LedgerPrint';
import { LedgerEntry, Tab } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.MANAGEMENT);
  
  // Load initial data from localStorage if available, else empty
  const [data, setData] = useState<LedgerEntry[]>(() => {
    const saved = localStorage.getItem('sealLedgerData');
    return saved ? JSON.parse(saved) : [];
  });

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem('sealLedgerData', JSON.stringify(data));
  }, [data]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-slate-900 font-sans">
      {/* Header / Navigation */}
      <header className="bg-slate-900 text-white shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-16 justify-between">
            <div className="flex items-center gap-3">
              <Book className="text-blue-400" />
              <h1 className="text-xl font-bold tracking-tight">직인 관리 시스템</h1>
            </div>
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
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeTab === Tab.MANAGEMENT ? (
          <LedgerManagement data={data} setData={setData} />
        ) : (
          <LedgerPrint data={data} />
        )}
      </main>
    </div>
  );
};

export default App;