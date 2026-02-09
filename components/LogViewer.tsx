import React, { useState, useEffect } from 'react';
import { ShieldCheck, X, RefreshCw, KeyRound, History, AlertTriangle } from 'lucide-react';
import { FolderSyncConfig, LogSession } from '../types';
import { checkPassword, changePassword, resetPassword, getLogSessions } from '../services/fileService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  dirHandle: FileSystemDirectoryHandle;
  syncConfig: FolderSyncConfig;
}

type ViewMode = 'AUTH' | 'LOGS' | 'CHANGE_PW';

const LogViewer: React.FC<Props> = ({ isOpen, onClose, dirHandle, syncConfig }) => {
  const [mode, setMode] = useState<ViewMode>('AUTH');
  const [inputPw, setInputPw] = useState('');
  
  // Change PW State
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  
  // Logs State
  const [logs, setLogs] = useState<LogSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
        setMode('AUTH');
        setInputPw('');
        setOldPw('');
        setNewPw('');
        setLogs([]);
    }
  }, [isOpen]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
        const isValid = await checkPassword(dirHandle, syncConfig, inputPw);
        if (isValid) {
            await loadLogs();
            setMode('LOGS');
        } else {
            alert('비밀번호가 일치하지 않습니다.');
        }
    } catch (err: any) {
        alert('오류 발생: ' + err.message);
    } finally {
        setIsLoading(false);
    }
  };

  const loadLogs = async () => {
      const data = await getLogSessions(dirHandle, syncConfig);
      setLogs(data);
  };

  const handleResetPassword = async () => {
      if (!window.confirm("비밀번호를 초기화 하시겠습니까?\n비밀번호가 '2888'로 변경됩니다.")) return;
      setIsLoading(true);
      try {
          await resetPassword(dirHandle, syncConfig);
          alert("비밀번호가 '2888'로 초기화되었습니다.");
          // If we were on auth screen, clear input
          setInputPw('');
      } catch (err: any) {
          alert("초기화 실패: " + err.message);
      } finally {
          setIsLoading(false);
      }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPw || newPw.length < 4) {
          alert("새 비밀번호는 4자리 이상이어야 합니다.");
          return;
      }
      setIsLoading(true);
      try {
          const success = await changePassword(dirHandle, syncConfig, oldPw, newPw);
          if (success) {
              alert("비밀번호가 변경되었습니다.");
              setMode('LOGS'); // Return to logs or Auth? Let's go to Logs assuming they verified old pw
          } else {
              alert("기존 비밀번호가 일치하지 않습니다.");
          }
      } catch (err: any) {
          alert("변경 실패: " + err.message);
      } finally {
          setIsLoading(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center gap-2">
             <ShieldCheck className="text-blue-600" />
             <h2 className="text-xl font-bold text-gray-800">
                {mode === 'AUTH' && '관리자 인증'}
                {mode === 'LOGS' && '접속 기록 확인'}
                {mode === 'CHANGE_PW' && '비밀번호 변경'}
             </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-500">
             <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto flex-1">
            
            {/* AUTH VIEW */}
            {mode === 'AUTH' && (
                <div className="max-w-xs mx-auto text-center space-y-6">
                    <p className="text-gray-600">접속 기록을 확인하려면 비밀번호를 입력하세요.</p>
                    <form onSubmit={handleAuth} className="space-y-4">
                        <input 
                            type="password" 
                            value={inputPw}
                            onChange={(e) => setInputPw(e.target.value)}
                            className="w-full border-2 border-gray-300 rounded-lg p-3 text-center text-lg focus:border-blue-500 focus:outline-none"
                            placeholder="비밀번호 입력"
                            autoFocus
                        />
                        <button 
                            type="submit" 
                            disabled={isLoading || !inputPw}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isLoading ? '확인 중...' : '확인'}
                        </button>
                    </form>
                    
                    <div className="pt-4 border-t flex flex-col gap-2">
                        <button 
                            onClick={handleResetPassword}
                            className="text-sm text-red-500 hover:underline flex items-center justify-center gap-1"
                        >
                            <RefreshCw size={14} /> 비밀번호 초기화 (2888)
                        </button>
                    </div>
                </div>
            )}

            {/* LOGS VIEW */}
            {mode === 'LOGS' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-500">총 {logs.length}개의 기록이 있습니다.</span>
                        <div className="flex gap-2">
                             <button 
                                onClick={() => { setOldPw(''); setNewPw(''); setMode('CHANGE_PW'); }}
                                className="text-xs px-3 py-1.5 bg-gray-100 border rounded hover:bg-gray-200 flex items-center gap-1"
                             >
                                <KeyRound size={12} /> 비밀번호 변경
                             </button>
                        </div>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-700 uppercase">
                                <tr>
                                    <th className="px-4 py-2 border-b">접속시간</th>
                                    <th className="px-4 py-2 border-b">이름</th>
                                    <th className="px-4 py-2 border-b">상태</th>
                                    <th className="px-4 py-2 border-b">접속 종료 시간</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {logs.map((log, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2">{new Date(log.startTime).toLocaleString()}</td>
                                        <td className="px-4 py-2 font-medium">{log.userName}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                log.status === '접속 중' ? 'bg-green-100 text-green-700 animate-pulse' :
                                                log.status === '정상 종료' ? 'bg-blue-50 text-blue-700' :
                                                log.status === '강제 종료' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-200 text-gray-700'
                                            }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">
                                            {log.endTime ? new Date(log.endTime).toLocaleString() : '-'}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-4 text-center text-gray-500">기록이 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* CHANGE PW VIEW */}
            {mode === 'CHANGE_PW' && (
                <div className="max-w-xs mx-auto text-center space-y-6">
                    <div className="flex items-center justify-center gap-2 text-gray-700 mb-2">
                        <KeyRound className="text-blue-500" />
                        <h3 className="font-bold">비밀번호 변경</h3>
                    </div>
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div>
                            <input 
                                type="password" 
                                value={oldPw}
                                onChange={(e) => setOldPw(e.target.value)}
                                className="w-full border rounded-lg p-2 text-center focus:border-blue-500 focus:outline-none"
                                placeholder="기존 비밀번호"
                                required
                            />
                        </div>
                        <div>
                            <input 
                                type="password" 
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                                className="w-full border rounded-lg p-2 text-center focus:border-blue-500 focus:outline-none"
                                placeholder="새 비밀번호"
                                required
                            />
                        </div>
                        <div className="flex gap-2">
                            <button 
                                type="button" 
                                onClick={() => setMode('LOGS')}
                                className="w-1/2 border border-gray-300 py-2 rounded-lg hover:bg-gray-50"
                            >
                                취소
                            </button>
                            <button 
                                type="submit" 
                                disabled={isLoading}
                                className="w-1/2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                변경하기
                            </button>
                        </div>
                    </form>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default LogViewer;