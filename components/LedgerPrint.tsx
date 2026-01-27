import React, { useState, useRef, useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { LedgerEntry, ITEMS_PER_PAGE } from '../types';

interface Props {
  data: LedgerEntry[];
}

// Helper component to auto-shrink text to fit one line
const AutoFitText: React.FC<{ text: string; align?: 'left' | 'center' | 'right' }> = ({ text, align = 'center' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (containerRef.current && textRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const textWidth = textRef.current.scrollWidth;

      if (textWidth > containerWidth) {
        // Add a little padding (0.95) to prevent edge cutting
        setScale((containerWidth / textWidth) * 0.95);
      } else {
        setScale(1);
      }
    }
  }, [text]);

  const transformOrigin = align === 'left' ? 'left center' : align === 'right' ? 'right center' : 'center center';
  const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

  return (
    <div ref={containerRef} className={`w-full h-full overflow-hidden flex items-center ${justifyClass}`}>
      <span
        ref={textRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: transformOrigin,
          whiteSpace: 'nowrap',
          display: 'inline-block',
        }}
      >
        {text}
      </span>
    </div>
  );
};

const LedgerPrint: React.FC<Props> = ({ data }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [printRange, setPrintRange] = useState('');

  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE) || 1;
  const sortedData = [...data].sort((a, b) => a.id - b.id);

  // Function to get data for a specific page
  const getPageData = (page: number) => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleMultiPagePrint = () => {
    handlePrint();
  };

  // Helper to determine which pages to show in the "Print View"
  const getPagesToPrint = (): number[] => {
    if (!printRange.trim()) {
      return [currentPage];
    }
    
    // Simple parser for "1-3" or "1" or "1,2"
    const pages: Set<number> = new Set();
    const parts = printRange.split(',');
    
    parts.forEach(part => {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
             if (i >= 1 && i <= totalPages) pages.add(i);
          }
        }
      } else {
        const num = Number(part);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
          pages.add(num);
        }
      }
    });

    return Array.from(pages).sort((a, b) => a - b);
  };

  const printPages = getPagesToPrint();

  return (
    <div className="flex flex-col h-full">
      {/* Controls - Hidden when printing */}
      <div className="no-print bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-30"
            aria-label="이전 페이지"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className="font-medium text-lg" aria-live="polite">
             Page {currentPage} / {totalPages}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className="p-2 rounded hover:bg-gray-100 disabled:opacity-30"
            aria-label="다음 페이지"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600" id="print-range-label">출력 범위 (예: 1-3):</span>
            <input 
                type="text" 
                value={printRange}
                onChange={(e) => setPrintRange(e.target.value)}
                placeholder="현재 페이지"
                aria-labelledby="print-range-label"
                className="border rounded px-2 py-1 w-24 text-center"
            />
            <button
                onClick={handleMultiPagePrint}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors"
            >
                <Printer size={18} aria-hidden="true" />
                출력하기
            </button>
        </div>
      </div>

      {/* Screen Preview (Single Page) */}
      <div className="no-print flex-1 overflow-auto bg-gray-500 p-8 flex justify-center">
        {/* On screen, we keep padding to simulate A4 margin */}
        <div className="bg-white shadow-lg w-[297mm] min-h-[210mm] p-[10mm] relative box-border origin-top scale-90 md:scale-100">
           <PageContent data={getPageData(currentPage)} pageNum={currentPage} totalPages={totalPages} />
        </div>
      </div>

      {/* Actual Print Content (Multiple Pages support) */}
      <div className="print-only">
        {printPages.map((pageNum) => (
          /* For print, we remove padding (p-0) because @page margin handles it */
          <div key={pageNum} className="w-[297mm] h-[210mm] p-0 relative page-break box-border">
             <PageContent data={getPageData(pageNum)} pageNum={pageNum} totalPages={totalPages} />
          </div>
        ))}
      </div>
    </div>
  );
};

// The content of a single A4 page
const PageContent: React.FC<{ data: LedgerEntry[], pageNum: number, totalPages: number }> = ({ data, pageNum, totalPages }) => {
    // Ensure we always render 20 rows to keep layout consistent
    const rows = [...data];
    while (rows.length < ITEMS_PER_PAGE) {
        rows.push({ id: 0, date: '', docNum: '', content: '', recipient: '', author: '' });
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header Title */}
            <div className="text-center mb-2">
                <h1 className="text-3xl font-serif font-bold underline underline-offset-8">직 인 관 리 대 장</h1>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-black text-sm text-center table-fixed">
                <thead>
                    <tr className="bg-gray-100 h-8">
                        {/* Data Columns with RowSpan 2 */}
                        <th scope="col" rowSpan={2} className="border border-black w-10">연번</th>
                        <th scope="col" rowSpan={2} className="border border-black w-24">일자</th>
                        <th scope="col" rowSpan={2} className="border border-black w-24">문서번호</th>
                        <th scope="col" rowSpan={2} className="border border-black">내 용</th>
                        {/* Increased recipient width from w-32 to w-44 (~1cm) */}
                        <th scope="col" rowSpan={2} className="border border-black w-44">수신처</th>
                        <th scope="col" rowSpan={2} className="border border-black w-20">작성자</th>
                        
                        {/* Signature Block Header */}
                        <th scope="colgroup" colSpan={3} className="border border-black w-48 h-8">결 재</th>
                    </tr>
                    <tr className="bg-gray-100 h-8">
                        {/* Signature Sub-columns */}
                        <th scope="col" className="border border-black w-16">팀 장</th>
                        <th scope="col" className="border border-black w-16">국 장</th>
                        <th scope="col" className="border border-black w-16">지회장</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index} className="h-8">
                            <td className="border border-black px-1">
                                {row.id > 0 ? row.id : ''}
                            </td>
                            <td className="border border-black px-1">
                                <AutoFitText text={row.date} align="center" />
                            </td>
                            <td className="border border-black px-1">
                                <AutoFitText text={row.docNum} align="center" />
                            </td>
                            <td className="border border-black px-2 text-left">
                                <AutoFitText text={row.content} align="left" />
                            </td>
                            <td className="border border-black px-1">
                                <AutoFitText text={row.recipient} align="center" />
                            </td>
                            <td className="border border-black px-1">
                                <AutoFitText text={row.author} align="center" />
                            </td>
                            
                            {/* Empty Signature Cells */}
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Footer */}
            <div className="mt-auto text-center text-sm font-medium">
                - {pageNum} -
            </div>
        </div>
    );
};

export default LedgerPrint;