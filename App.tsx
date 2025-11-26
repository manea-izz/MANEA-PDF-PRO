

import React, { useState, useCallback, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { FilePreviewCard } from './components/FilePreviewCard';
import { Spinner } from './components/Spinner';
import { mergeFilesToPdf, isPdfEncrypted, unlockPdfFile, MergeOptions } from './services/pdfService';
import { DownloadIcon, MergeIcon, ResetIcon, WhatsappIcon, FacebookIcon, SortAscendingIcon, SortDescendingIcon, OrganizeIcon, ConvertIcon, EyeIcon, LayoutIcon, MarginIcon, CheckIcon } from './components/icons';
import { PdfOrganizer } from './components/PdfOrganizer';
import { FileConverter } from './components/FileConverter';

type SortCriteria = 'name' | 'size' | 'date';
type SortOrder = 'asc' | 'desc';
type ActiveTab = 'merger' | 'organizer' | 'converter';

interface ExtendedFile {
    file: File;
    isProtected: boolean;
    isUnlocking?: boolean;
}

const App: React.FC = () => {
  const [files, setFiles] = useState<ExtendedFile[]>([]);
  const [filePasswords, setFilePasswords] = useState<Record<string, string>>({});
  
  const [firstPageFileName, setFirstPageFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [processingFileName, setProcessingFileName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('merger');

  // Merge Options
  const [pageSize, setPageSize] = useState<MergeOptions['pageSize']>('A4');
  const [margin, setMargin] = useState<MergeOptions['margin']>('Small');

  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    const newFiles = selectedFiles.filter(sf => !files.some(pf => pf.file.name === sf.name && pf.file.size === sf.size));
    
    const processedNewFiles: ExtendedFile[] = [];
    for (const f of newFiles) {
        let isProtected = false;
        if (f.type === 'application/pdf') {
            isProtected = await isPdfEncrypted(f);
        }
        processedNewFiles.push({ file: f, isProtected });
    }

    setFiles(prevFiles => [...prevFiles, ...processedNewFiles]);
    setError(null);
    setPdfUrl(null);
  }, [files]);
  
  const handlePasswordChange = async (fileName: string, password: string) => {
      setFilePasswords(prev => ({ ...prev, [fileName]: password }));

      // Debounce slightly or check length to assume a valid password attempt
      if (password.length > 0) {
          // Attempt to unlock automatically
          const targetFileWrapper = files.find(f => f.file.name === fileName);
          if (targetFileWrapper && targetFileWrapper.isProtected) {
              setFiles(prev => prev.map(f => f.file.name === fileName ? { ...f, isUnlocking: true } : f));
              
              const unlockedFile = await unlockPdfFile(targetFileWrapper.file, password);
              
              if (unlockedFile) {
                  // Success! Replace the file with the unlocked version
                  setFiles(prev => prev.map(f => {
                      if (f.file.name === fileName) {
                          return { file: unlockedFile, isProtected: false, isUnlocking: false };
                      }
                      return f;
                  }));
                  // Clear password from state as it's no longer needed
                  setFilePasswords(prev => {
                      const next = { ...prev };
                      delete next[fileName];
                      return next;
                  });
              } else {
                  // Failed (wrong password), stop spinner
                   setFiles(prev => prev.map(f => f.file.name === fileName ? { ...f, isUnlocking: false } : f));
              }
          }
      }
  };

  const sortFiles = (criteria: SortCriteria, order: SortOrder, currentFiles: ExtendedFile[], pinnedFileName: string | null): ExtendedFile[] => {
    const firstFile = pinnedFileName ? currentFiles.find(f => f.file.name === pinnedFileName) : null;
    const filesToSort = firstFile ? currentFiles.filter(f => f.file.name !== pinnedFileName) : [...currentFiles];

    filesToSort.sort((a, b) => {
        let comparison = 0;
        switch (criteria) {
            case 'size': comparison = a.file.size - b.file.size; break;
            case 'date': comparison = a.file.lastModified - b.file.lastModified; break;
            case 'name': default: comparison = a.file.name.localeCompare(b.file.name); break;
        }
        return order === 'asc' ? comparison : -comparison;
    });

    return firstFile ? [firstFile, ...filesToSort] : filesToSort;
  };

  const handleSortCriteriaChange = (criteria: SortCriteria) => {
    const newSortedFiles = sortFiles(criteria, sortOrder, files, firstPageFileName);
    setSortCriteria(criteria);
    setFiles(newSortedFiles);
  };

  const handleSortOrderChange = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    const newSortedFiles = sortFiles(sortCriteria, newOrder, files, firstPageFileName);
    setSortOrder(newOrder);
    setFiles(newSortedFiles);
  };

  const handleRemoveFile = useCallback((fileName: string) => {
    setFiles(prevFiles => prevFiles.filter(f => f.file.name !== fileName));
    if (fileName === firstPageFileName) {
      setFirstPageFileName(null);
    }
    setFilePasswords(prev => {
        const next = {...prev};
        delete next[fileName];
        return next;
    });
  }, [firstPageFileName]);
  
  const handleSetFirstPage = useCallback((fileName: string) => {
    if (fileName === firstPageFileName) {
        setFirstPageFileName(null);
        setFiles(currentFiles => sortFiles(sortCriteria, sortOrder, currentFiles, null));
    } else {
        setFirstPageFileName(fileName);
        setFiles(prevFiles => {
            const fileToMove = prevFiles.find(f => f.file.name === fileName);
            if (!fileToMove) return prevFiles;
            const remainingFiles = prevFiles.filter(f => f.file.name !== fileName);
            return [fileToMove, ...remainingFiles];
        });
    }
  }, [firstPageFileName, sortCriteria, sortOrder]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if(activeTab !== 'merger') return;
      const items = event.clipboardData?.files;
      if (items && items.length > 0) {
        const pastedFiles = Array.from(items).filter(
          (file) => file.type.startsWith('image/') || file.type === 'application/pdf' || file.type.includes('word') || file.type.includes('sheet')
        );
        if (pastedFiles.length > 0) {
            event.preventDefault();
            handleFilesSelected(pastedFiles);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFilesSelected, activeTab]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragEnter = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    if (firstPageFileName && (index === 0 || files[draggedIndex].file.name === firstPageFileName)) return;
  
    let newFiles = [...files];
    const draggedItem = newFiles.splice(draggedIndex, 1)[0];
    newFiles.splice(index, 0, draggedItem);
    
    setDraggedIndex(index);
    setFiles(newFiles);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleMerge = async () => {
    if (files.length === 0) {
      setError("الرجاء اختيار ملف واحد على الأقل.");
      return;
    }
    
    // Check if any protected files remain
    const protectedFiles = files.filter(f => f.isProtected);
    if (protectedFiles.length > 0) {
        setError(`يرجى إدخال كلمة المرور للملفات المحمية: ${protectedFiles.map(f => f.file.name).join(', ')}`);
        return;
    }

    setIsLoading(true);
    setError(null);
    setPdfUrl(null);
    try {
      const plainFiles = files.map(f => f.file);
      const pdfBytes = await mergeFilesToPdf(
          plainFiles, 
          (fileName) => setProcessingFileName(fileName), 
          {}, // No passwords needed as we pre-decrypted everything
          { pageSize, margin }
      );
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (e) {
      console.error(e);
      setError("حدث خطأ غير متوقع أثناء دمج الملفات. يرجى التأكد من أن الملفات غير تالفة والمحاولة مرة أخرى.");
    } finally {
      setIsLoading(false);
      setProcessingFileName(null);
    }
  };

  const handleReset = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setFiles([]);
    setFilePasswords({});
    setFirstPageFileName(null);
    setPdfUrl(null);
    setError(null);
    setIsLoading(false);
  };

  const getSortButtonClass = (criteria: SortCriteria) => `px-3 py-1.5 rounded-full text-xs font-medium transition-all ${sortCriteria === criteria ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200' : 'text-gray-500 hover:bg-gray-100'}`;
  
  const getTabClass = (tab: ActiveTab) => `
    flex-1 py-4 px-2 text-center font-bold transition-all duration-300 relative flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer z-10
    ${activeTab === tab ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}
  `;

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col items-center p-4 sm:p-6 selection:bg-indigo-100 selection:text-indigo-700">
      <div className="w-full max-w-5xl mx-auto flex-grow flex flex-col">
        {/* Header - Professional */}
        <header className="flex flex-col items-center mb-10 pt-4 animate-fade-in">
          <div className="mb-4">
               {/* Favicon/Logo SVG included inline for visual consistency if needed, but we rely on text primarily */}
               <div className="w-16 h-16 bg-white rounded-2xl shadow-lg shadow-indigo-100 flex items-center justify-center border border-indigo-50">
                    <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
               </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 tracking-tight mb-2">
            MANEA PDF
          </h1>
          <p className="text-slate-500 text-base font-medium">
            أدوات احترافية لإدارة المستندات الرقمية
          </p>
        </header>
        
        {/* Main Interface */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col transition-all duration-500">
          
          {/* Navigation */}
          <div className="flex bg-slate-50 border-b border-slate-100 p-1">
            <button onClick={() => setActiveTab('merger')} className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all ${activeTab === 'merger' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}>
              <MergeIcon /> <span>دمج الملفات</span>
            </button>
            <button onClick={() => setActiveTab('organizer')} className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all ${activeTab === 'organizer' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}>
              <OrganizeIcon /> <span>تنظيم PDF</span>
            </button>
            <button onClick={() => setActiveTab('converter')} className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all ${activeTab === 'converter' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100/50'}`}>
              <ConvertIcon /> <span>تحويل الصيغ</span>
            </button>
          </div>

          <main className="p-6 md:p-10 flex-grow min-h-[500px]">
            {activeTab === 'merger' && (
              pdfUrl ? (
                <div className="flex flex-col items-center justify-center py-12 animate-fade-in-up">
                  <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 border border-emerald-100">
                    <CheckIcon />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">تم إنشاء الملف بنجاح</h2>
                  <p className="text-slate-500 mb-10 text-sm">الملف جاهز للعرض أو التحميل</p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                    <button onClick={() => window.open(pdfUrl, '_blank')} className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 font-bold py-3.5 px-6 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                        <EyeIcon /> معاينة
                    </button>
                    <a href={pdfUrl} download={`merged-${Date.now()}.pdf`} className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 hover:shadow-indigo-200">
                        <DownloadIcon /> تحميل PDF
                    </a>
                  </div>
                  <button onClick={handleReset} className="mt-8 text-sm text-slate-400 hover:text-indigo-600 font-medium transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50">
                    <ResetIcon /> دمج ملفات أخرى
                  </button>
                </div>
              ) : (
                <div className="animate-fade-in space-y-8">
                  <FileUpload 
                    onFilesSelected={handleFilesSelected} 
                    disabled={isLoading} 
                    descriptionText="اسحب وأفلت صور أو ملفات PDF أو مستندات Office هنا" 
                    acceptTypes="image/png, image/jpeg, application/pdf, .docx, .xlsx, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
                  />
                  
                  {files.length > 0 && (
                    <div className="animate-fade-in">
                      {/* Controls Bar */}
                      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                         {/* Sorting */}
                        <div className="flex flex-wrap items-center gap-2">
                             <div className="text-sm font-bold text-slate-700 flex items-center gap-2 ml-4">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                {files.length} ملفات
                             </div>
                             <div className="h-6 w-px bg-slate-200 mx-2 hidden sm:block"></div>
                             <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                                <button onClick={() => handleSortCriteriaChange('name')} className={getSortButtonClass('name')}>الاسم</button>
                                <button onClick={() => handleSortCriteriaChange('size')} className={getSortButtonClass('size')}>الحجم</button>
                                <button onClick={handleSortOrderChange} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                                    {sortOrder === 'asc' ? <SortAscendingIcon /> : <SortDescendingIcon />}
                                </button>
                             </div>
                        </div>

                        {/* Output Settings */}
                        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 w-full sm:w-auto">
                                <LayoutIcon />
                                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">حجم الصفحة:</span>
                                <select 
                                    value={pageSize} 
                                    onChange={(e) => setPageSize(e.target.value as any)}
                                    className="bg-transparent text-sm font-bold text-indigo-600 outline-none w-full"
                                >
                                    <option value="A4">A4</option>
                                    <option value="Letter">Letter</option>
                                    <option value="Legal">Legal</option>
                                    <option value="Original">الأصلي</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 w-full sm:w-auto">
                                <MarginIcon />
                                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">الهوامش:</span>
                                <select 
                                    value={margin} 
                                    onChange={(e) => setMargin(e.target.value as any)}
                                    className="bg-transparent text-sm font-bold text-indigo-600 outline-none w-full"
                                >
                                    <option value="Small">صغيرة</option>
                                    <option value="Normal">عادية</option>
                                    <option value="Big">كبيرة</option>
                                    <option value="None">بدون</option>
                                </select>
                            </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {files.map((wrapper, index) => (
                          <FilePreviewCard 
                            key={`${wrapper.file.name}-${wrapper.file.lastModified}`} 
                            file={wrapper.file} 
                            isProtected={wrapper.isProtected}
                            isUnlocking={wrapper.isUnlocking}
                            onPasswordChange={handlePasswordChange}
                            passwordValue={filePasswords[wrapper.file.name] || ''}
                            isFirstPage={wrapper.file.name === firstPageFileName} 
                            isDragging={draggedIndex === index} 
                            onRemove={handleRemoveFile} 
                            onSetFirstPage={handleSetFirstPage} 
                            onDragStart={() => handleDragStart(index)} 
                            onDragEnter={() => handleDragEnter(index)} 
                            onDragEnd={handleDragEnd} 
                            isProcessing={processingFileName === wrapper.file.name} 
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-sm font-medium">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <p>{error}</p>
                    </div>
                  )}
                  <div className="pt-6 border-t border-slate-100">
                    <button onClick={handleMerge} disabled={files.length === 0 || isLoading} className="w-full bg-indigo-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-3 text-lg">
                      {isLoading ? (<><Spinner className="h-6 w-6 text-white"/><span>جاري المعالجة...</span></>) : (<><MergeIcon /><span>دمج وإنشاء PDF</span></>)}
                    </button>
                  </div>
                </div>
              )
            )}
            {activeTab === 'organizer' && <PdfOrganizer />}
            {activeTab === 'converter' && <FileConverter />}
          </main>
        </div>
        
        <footer className="text-center mt-12 mb-6 animate-fade-in">
            <p className="text-slate-400 text-sm font-medium">تم التطوير بإتقان بواسطة <span className="text-indigo-600 font-bold">مانع عزالدين</span></p>
            <div className="flex justify-center items-center gap-6 mt-4 opacity-70 hover:opacity-100 transition-opacity">
                <a href="https://wa.me/967772655825" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-emerald-500 transition-colors transform hover:scale-110"><WhatsappIcon /></a>
                <a href="https://www.facebook.com/9l7iz" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 transition-colors transform hover:scale-110"><FacebookIcon /></a>
            </div>
        </footer>
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
        @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
            animation: fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in-up {
            animation: fade-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
