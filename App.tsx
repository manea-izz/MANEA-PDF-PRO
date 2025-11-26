
import React, { useState, useCallback, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { FilePreviewCard } from './components/FilePreviewCard';
import { Spinner } from './components/Spinner';
import { mergeFilesToPdf, isPdfEncrypted } from './services/pdfService';
import { DownloadIcon, MergeIcon, ResetIcon, WhatsappIcon, FacebookIcon, SortAscendingIcon, SortDescendingIcon, OrganizeIcon, ConvertIcon, EyeIcon } from './components/icons';
import { PdfOrganizer } from './components/PdfOrganizer';
import { FileConverter } from './components/FileConverter';

type SortCriteria = 'name' | 'size' | 'date';
type SortOrder = 'asc' | 'desc';
type ActiveTab = 'merger' | 'organizer' | 'converter';

interface ExtendedFile {
    file: File;
    isProtected: boolean;
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

  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    // Check for duplicates
    const newFiles = selectedFiles.filter(sf => !files.some(pf => pf.file.name === sf.name && pf.file.size === sf.size));
    
    // Quick check for encryption
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
  
  const handlePasswordChange = (fileName: string, password: string) => {
      setFilePasswords(prev => ({ ...prev, [fileName]: password }));
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
    // Cleanup password
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
    
    // Check if passwords needed
    const protectedFilesWithoutPassword = files.filter(f => f.isProtected && !filePasswords[f.file.name]);
    if (protectedFilesWithoutPassword.length > 0) {
        setError(`يرجى إدخال كلمة المرور للملفات المحمية: ${protectedFilesWithoutPassword.map(f => f.file.name).join(', ')}`);
        return;
    }

    setIsLoading(true);
    setError(null);
    setPdfUrl(null);
    try {
      const plainFiles = files.map(f => f.file);
      const pdfBytes = await mergeFilesToPdf(plainFiles, (fileName) => setProcessingFileName(fileName), filePasswords);
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/50 via-slate-50 to-purple-50/50 font-sans flex flex-col items-center p-4 sm:p-6 selection:bg-indigo-100 selection:text-indigo-700">
      <div className="w-full max-w-5xl mx-auto flex-grow flex flex-col">
        {/* Header */}
        <header className="text-center mb-10 pt-6 animate-fade-in">
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-xl shadow-indigo-100 mb-6 border border-indigo-50">
             <div className="bg-gradient-to-tr from-indigo-500 to-purple-500 p-2.5 rounded-xl text-white">
                 <MergeIcon />
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-gray-800 via-indigo-900 to-gray-800 tracking-tight mb-4 drop-shadow-sm">
            MANEA PDF
          </h1>
          <p className="text-gray-500 text-lg max-w-lg mx-auto leading-relaxed font-medium">
            الرفيق الذكي لمستنداتك الرقمية
          </p>
        </header>
        
        {/* Main Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-[2rem] shadow-2xl shadow-indigo-200/40 border border-white/50 overflow-hidden flex flex-col transition-all duration-500">
          
          {/* Custom Tabs */}
          <div className="flex p-1.5 mx-4 mt-4 bg-gray-100/50 rounded-2xl relative">
            <div 
                className="absolute top-1.5 bottom-1.5 bg-white rounded-xl shadow-sm transition-all duration-300 ease-out"
                style={{ 
                    left: activeTab === 'converter' ? '0.5%' : activeTab === 'organizer' ? '33.33%' : '66.66%',
                    right: activeTab === 'converter' ? '66.66%' : activeTab === 'organizer' ? '33.33%' : '0.5%'
                }}
            />
            
            <button onClick={() => setActiveTab('merger')} className={getTabClass('merger')}>
              <MergeIcon /> 
              <span>دمج الملفات</span>
            </button>
            <button onClick={() => setActiveTab('organizer')} className={getTabClass('organizer')}>
              <OrganizeIcon /> 
              <span>تنظيم PDF</span>
            </button>
            <button onClick={() => setActiveTab('converter')} className={getTabClass('converter')}>
              <ConvertIcon /> 
              <span>تحويل للمستندات</span>
            </button>
          </div>

          <main className="p-6 md:p-10 flex-grow min-h-[400px]">
            {activeTab === 'merger' && (
              pdfUrl ? (
                <div className="flex flex-col items-center justify-center py-12 animate-fade-in-up">
                  <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-green-100">
                    <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-bold text-gray-800 mb-3">تم إنشاء الملف بنجاح!</h2>
                  <p className="text-gray-500 mb-10">ملفك جاهز للمعاينة والتحميل بجودة عالية</p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
                    <button onClick={() => window.open(pdfUrl, '_blank')} className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 font-bold py-4 px-6 rounded-2xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                        <EyeIcon /> معاينة
                    </button>
                    <a href={pdfUrl} download={`merged-${Date.now()}.pdf`} className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold py-4 px-6 rounded-2xl hover:shadow-lg hover:shadow-indigo-500/30 transition-all hover:translate-y-[-2px]">
                        <DownloadIcon /> تحميل PDF
                    </a>
                  </div>
                  <button onClick={handleReset} className="mt-8 text-sm text-gray-400 hover:text-indigo-600 font-medium transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-50">
                    <ResetIcon /> دمج ملفات أخرى
                  </button>
                </div>
              ) : (
                <div className="animate-fade-in">
                  <FileUpload 
                    onFilesSelected={handleFilesSelected} 
                    disabled={isLoading} 
                    descriptionText="صور (PNG, JPG), PDF, Word (DOCX), Excel (XLSX)" 
                    acceptTypes="image/png, image/jpeg, application/pdf, .docx, .xlsx, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
                  />
                  
                  {files.length > 0 && (
                    <div className="mt-10">
                      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
                            <span className="bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-lg shadow-sm shadow-indigo-200">{files.length}</span>
                            الملفات المحددة
                        </h2>
                        <div className="flex items-center gap-2 text-sm bg-white p-1.5 rounded-full border border-gray-100 shadow-sm">
                            <span className="text-gray-400 px-3 text-xs font-medium">ترتيب حسب:</span>
                            <button onClick={() => handleSortCriteriaChange('name')} className={getSortButtonClass('name')}>الاسم</button>
                            <button onClick={() => handleSortCriteriaChange('size')} className={getSortButtonClass('size')}>الحجم</button>
                            <button onClick={() => handleSortCriteriaChange('date')} className={getSortButtonClass('date')}>التاريخ</button>
                            <div className="w-px h-4 bg-gray-200 mx-1"></div>
                            <button onClick={handleSortOrderChange} className="p-1.5 rounded-full text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                                {sortOrder === 'asc' ? <SortAscendingIcon /> : <SortDescendingIcon />}
                            </button>
                        </div>
                      </div>
                      
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar p-1">
                        {files.map((wrapper, index) => (
                          <FilePreviewCard 
                            key={`${wrapper.file.name}-${wrapper.file.lastModified}`} 
                            file={wrapper.file} 
                            isProtected={wrapper.isProtected}
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
                    <div className="mt-6 p-4 bg-red-50/50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 animate-pulse">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <p className="font-medium">{error}</p>
                    </div>
                  )}
                  <div className="mt-10 pt-6 border-t border-gray-100">
                    <button onClick={handleMerge} disabled={files.length === 0 || isLoading} className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold py-5 px-6 rounded-2xl hover:shadow-xl hover:shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-3 text-lg transform active:scale-[0.99] group">
                      {isLoading ? (<><Spinner className="h-6 w-6 text-white"/><span>جاري المعالجة...</span></>) : (<><MergeIcon /><span>دمج وإنشاء PDF</span><span className="hidden group-hover:inline-block transition-all mr-2">✨</span></>)}
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
            <p className="text-gray-400 text-sm font-medium">تم التطوير بإتقان بواسطة <span className="text-indigo-500 font-bold">مانع عزالدين</span></p>
            <div className="flex justify-center items-center gap-6 mt-4">
                <a href="https://wa.me/967772655825" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-green-500 transition-colors transform hover:scale-110" aria-label="Contact on WhatsApp"><WhatsappIcon /></a>
                <a href="https://www.facebook.com/9l7iz" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-blue-600 transition-colors transform hover:scale-110" aria-label="Visit Facebook profile"><FacebookIcon /></a>
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
          background-color: #e0e7ff;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #c7d2fe;
        }
        @keyframes fade-in {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
            animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in-up {
            animation: fade-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default App;
