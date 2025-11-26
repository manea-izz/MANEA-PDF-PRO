

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './FileUpload';
import { Spinner } from './Spinner';
import { DownloadIcon, ResetIcon, SaveIcon, TrashIcon, RotateIcon, CheckCircleIcon, CheckIcon, EyeIcon, MarginIcon, LockIcon } from './icons';
import { unlockPdfFile } from '../services/pdfService';

// PDF.js worker setup
(window as any).pdfjsWorker = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;

interface PageInfo {
  id: string;
  pdf: any; // PDFDocumentProxy
  pageNumber: number;
  rotation: number;
  originalFileIndex: number;
}

type PageSizeOption = 'A4' | 'Letter' | 'Original';
type MarginOption = 'None' | 'Small' | 'Normal' | 'Big';

const PageThumbnail: React.FC<{ 
    pageInfo: PageInfo; 
    onDelete: () => void; 
    onRotate: (e: React.MouseEvent) => void; 
    isSelected: boolean;
    onToggleSelect: () => void;
}> = ({ pageInfo, onDelete, onRotate, isSelected, onToggleSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { pdf, pageNumber, rotation } = pageInfo;

  useEffect(() => {
    let isMounted = true;
    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.3 }); // Reduced scale for thumbnails
        const canvas = canvasRef.current;
        if (!canvas || !isMounted) return;

        const context = canvas.getContext('2d');
        if (!context) return;
        
        // Add visual rotation
        const rotatedViewport = page.getViewport({ scale: 0.3, rotation });
        canvas.height = rotatedViewport.height;
        canvas.width = rotatedViewport.width;
        
        const renderContext = {
          canvasContext: context,
          viewport: rotatedViewport,
        };
        await page.render(renderContext).promise;
      } catch (error) {
        console.error(`Failed to render page ${pageNumber}`, error);
      }
    };

    renderPage();
    return () => { isMounted = false; };
  }, [pdf, pageNumber, rotation]);

  return (
    <div 
        onClick={onToggleSelect}
        className={`
            relative group flex flex-col items-center cursor-pointer transition-all duration-300
            ${isSelected ? 'transform translate-y-[-4px]' : 'hover:translate-y-[-2px]'}
        `}
    >
      <div className={`
        relative overflow-hidden mb-3 transition-all duration-300 bg-white
        ${isSelected 
            ? 'ring-2 ring-indigo-500 shadow-xl shadow-indigo-200/50 rounded-xl' 
            : 'ring-1 ring-slate-200 shadow-sm hover:shadow-lg hover:ring-indigo-300 rounded-xl'
        }
      `}>
        <canvas ref={canvasRef} className="w-full h-auto pointer-events-none block" />
        
        <div className={`absolute inset-0 bg-indigo-900/10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`}></div>
        
        {isSelected && (
            <div className="absolute top-2 left-2 text-indigo-600 bg-white rounded-full shadow-md p-0.5">
                <CheckCircleIcon />
            </div>
        )}

         {/* Overlay actions - visible on hover */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-white/30 backdrop-blur-[1px] transition-opacity z-10">
            <button 
                onClick={(e) => { e.stopPropagation(); onRotate(e); }} 
                className="p-2 bg-white text-indigo-600 rounded-full shadow-lg hover:bg-indigo-50 transition-transform hover:scale-110 border border-indigo-100" 
                title="تدوير الصفحة"
            >
                <RotateIcon />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                className="p-2 bg-white text-red-500 rounded-full shadow-lg hover:bg-red-50 transition-transform hover:scale-110 border border-red-100" 
                title="حذف الصفحة"
            >
                <TrashIcon />
            </button>
        </div>
      </div>
      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${isSelected ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
        صفحة {pageNumber}
      </span>
    </div>
  );
};

export const PdfOrganizer: React.FC = () => {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  
  // Password Handling
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentLockedFile, setCurrentLockedFile] = useState<File | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]); // Files waiting to be processed

  // Settings
  const [targetPageSize, setTargetPageSize] = useState<PageSizeOption>('A4');
  const [targetMargin, setTargetMargin] = useState<MarginOption>('Small');

  const processFile = async (file: File, fileIndex: number) => {
      try {
          const arrayBuffer = await file.arrayBuffer();
          // First attempt to load standard way
          const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          
          const newPages: PageInfo[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
              newPages.push({
                  id: `${file.name}-${i}-${Date.now()}-${Math.random()}`,
                  pdf,
                  pageNumber: i,
                  rotation: 0,
                  originalFileIndex: fileIndex,
              });
          }
          return newPages;
      } catch (e: any) {
          if (e.name === 'PasswordException') {
              throw e; // Bubble up to be caught in loop
          } else {
              console.error("Error loading PDF", e);
              return [];
          }
      }
  };

  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    setIsLoading(true);
    setError(null);
    setPdfUrl(null);
    setPages([]);
    setSelectedPageIds(new Set());
    
    // We will process files sequentially. If one is locked, we stop and ask password.
    // To simplify, we'll maintain a "queue" of files to process.
    setPendingFiles(selectedFiles);
    
    // Trigger the processing effect
  }, []);

  // Effect to process the queue
  useEffect(() => {
    const processQueue = async () => {
        if (pendingFiles.length === 0 || passwordModalOpen || unlocking) {
            if (pendingFiles.length === 0 && isLoading) setIsLoading(false);
            return;
        }

        const currentFile = pendingFiles[0];
        
        try {
            const newPages = await processFile(currentFile, pages.length); // Use pages.length as index proxy
            setPages(prev => [...prev, ...newPages]);
            setPendingFiles(prev => prev.slice(1)); // Remove processed file
        } catch (e: any) {
            if (e.name === 'PasswordException') {
                setCurrentLockedFile(currentFile);
                setPasswordModalOpen(true);
                // Don't remove from queue yet
            } else {
                // Unknown error, skip file
                setPendingFiles(prev => prev.slice(1));
            }
        }
    };

    if (isLoading && !passwordModalOpen) {
        processQueue();
    }
  }, [pendingFiles, isLoading, passwordModalOpen, unlocking]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentLockedFile || !passwordInput) return;

      setUnlocking(true);
      try {
          // Attempt to unlock and create a new clean file
          const unlockedFile = await unlockPdfFile(currentLockedFile, passwordInput);
          
          if (unlockedFile) {
              // Replace the locked file in the queue with the unlocked one
              const newQueue = [unlockedFile, ...pendingFiles.slice(1)];
              setPendingFiles(newQueue);
              setPasswordModalOpen(false);
              setPasswordInput('');
              setCurrentLockedFile(null);
          } else {
              alert("كلمة المرور غير صحيحة");
          }
      } catch (e) {
          console.error(e);
          alert("فشل فك تشفير الملف");
      } finally {
          setUnlocking(false);
      }
  };

  const skipLockedFile = () => {
      setPendingFiles(prev => prev.slice(1));
      setPasswordModalOpen(false);
      setPasswordInput('');
      setCurrentLockedFile(null);
  };
  
  const handleSave = async (onlySelected: boolean = false) => {
    const pagesToProcess = onlySelected 
        ? pages.filter(p => selectedPageIds.has(p.id))
        : pages;

    if(pagesToProcess.length === 0) return;
    
    setIsSaving(true);
    setError(null);
    try {
        const { PDFDocument, PageSizes } = (window as any).PDFLib;
        const mergedPdfDoc = await PDFDocument.create();

        // Map originalFileIndex to loaded docs to avoid reloading
        // Note: The pages have 'pdf' proxy objects already.
        // But for PDF-Lib, we need the underlying array buffer again.
        // Since we are using PDF.js for rendering, we can get data from it.
        
        const loadedOriginalDocs: any = {}; // map of pdf proxy id -> pdf-lib doc
        
        const getSourceDoc = async (pageInfo: PageInfo) => {
             // We can use the pdf proxy object reference as a key
             // But we need to load it into pdf-lib
             // pdf.js proxy allows getting data
             if (!loadedOriginalDocs[pageInfo.originalFileIndex]) {
                 const data = await pageInfo.pdf.getData();
                 loadedOriginalDocs[pageInfo.originalFileIndex] = await PDFDocument.load(data);
             }
             return loadedOriginalDocs[pageInfo.originalFileIndex];
        };
        
        const getMarginSize = () => {
            switch (targetMargin) {
                case 'None': return 0;
                case 'Normal': return 40; 
                case 'Big': return 72;
                case 'Small': default: return 20; 
            }
        };
        const margin = getMarginSize();

        for (const pageInfo of pagesToProcess) {
            const sourceDoc = await getSourceDoc(pageInfo);
            if (!sourceDoc) continue;

            if (targetPageSize === 'Original') {
                // If original size is kept, we mostly ignore margins unless we were to crop, 
                // but typically "Original" means keep as is.
                const [copiedPage] = await mergedPdfDoc.copyPages(sourceDoc, [pageInfo.pageNumber - 1]);
                const currentRotation = copiedPage.getRotation().angle;
                copiedPage.setRotation((window as any).PDFLib.degrees(currentRotation + pageInfo.rotation));
                mergedPdfDoc.addPage(copiedPage);
            } else {
                const [embeddedPage] = await mergedPdfDoc.embedPdf(sourceDoc, [pageInfo.pageNumber - 1]);
                const dims = targetPageSize === 'A4' ? PageSizes.A4 : PageSizes.Letter;
                const newPage = mergedPdfDoc.addPage(dims);
                
                const userRotation = pageInfo.rotation % 360;
                
                const isRotatedSides = userRotation === 90 || userRotation === 270;
                
                const srcWidth = isRotatedSides ? embeddedPage.height : embeddedPage.width;
                const srcHeight = isRotatedSides ? embeddedPage.width : embeddedPage.height;
                const destWidth = newPage.getWidth();
                const destHeight = newPage.getHeight();

                const availableWidth = destWidth - (margin * 2);
                const availableHeight = destHeight - (margin * 2);

                const scale = Math.min(availableWidth / srcWidth, availableHeight / srcHeight);
                
                // Drawing logic needs to account for rotation to center correctly
                // Simple case: no rotation
                if (userRotation === 0) {
                     newPage.drawPage(embeddedPage, {
                        x: (destWidth - embeddedPage.width * scale) / 2,
                        y: (destHeight - embeddedPage.height * scale) / 2,
                        width: embeddedPage.width * scale,
                        height: embeddedPage.height * scale,
                    });
                } else if (userRotation === 90) {
                     newPage.drawPage(embeddedPage, {
                        x: (destWidth + embeddedPage.height * scale) / 2,
                        y: (destHeight - embeddedPage.width * scale) / 2,
                        width: embeddedPage.width * scale,
                        height: embeddedPage.height * scale,
                        rotation: (window as any).PDFLib.degrees(90),
                    });
                } else if (userRotation === 180) {
                     newPage.drawPage(embeddedPage, {
                        x: (destWidth + embeddedPage.width * scale) / 2,
                        y: (destHeight + embeddedPage.height * scale) / 2,
                        width: embeddedPage.width * scale,
                        height: embeddedPage.height * scale,
                        rotation: (window as any).PDFLib.degrees(180),
                    });
                } else if (userRotation === 270) {
                     newPage.drawPage(embeddedPage, {
                        x: (destWidth - embeddedPage.height * scale) / 2,
                        y: (destHeight + embeddedPage.width * scale) / 2,
                        width: embeddedPage.width * scale,
                        height: embeddedPage.height * scale,
                        rotation: (window as any).PDFLib.degrees(270),
                    });
                }
            }
        }

        const pdfBytes = await mergedPdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
    } catch(e) {
        console.error(e);
        setError("حدث خطأ أثناء حفظ الملف الجديد.");
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleReset = () => {
      if(pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPages([]);
      setSelectedPageIds(new Set());
      setPendingFiles([]);
      setError(null);
      setPdfUrl(null);
  };
  
  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragEnter = (id: string) => {
      if(draggedId === null || draggedId === id) return;
      const draggedIndex = pages.findIndex(p => p.id === draggedId);
      const targetIndex = pages.findIndex(p => p.id === id);
      
      const newPages = [...pages];
      const [draggedItem] = newPages.splice(draggedIndex, 1);
      newPages.splice(targetIndex, 0, draggedItem);
      setPages(newPages);
  };
  const handleDragEnd = () => setDraggedId(null);
  
  const handleDeletePage = (id: string) => {
      setPages(p => p.filter(page => page.id !== id));
      setSelectedPageIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
      });
  };

  const handleRotatePage = (id: string) => {
      setPages(p => p.map(page => page.id === id ? {...page, rotation: (page.rotation + 90) % 360} : page));
  };
  
  const togglePageSelection = (id: string) => {
      setSelectedPageIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
      });
  };

  const selectAll = () => {
      if (selectedPageIds.size === pages.length) {
          setSelectedPageIds(new Set());
      } else {
          setSelectedPageIds(new Set(pages.map(p => p.id)));
      }
  };
  
  const rotateSelected = () => {
      setPages(p => p.map(page => selectedPageIds.has(page.id) ? {...page, rotation: (page.rotation + 90) % 360} : page));
  };

  if (pdfUrl) {
    return (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in-up">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-6 border border-emerald-100">
                <CheckIcon />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">تم تنظيم الملف بنجاح</h2>
            <div className="flex flex-col sm:flex-row gap-4 mb-8 mt-4 w-full max-w-md">
                <button onClick={() => window.open(pdfUrl, '_blank')} className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 font-bold py-3.5 px-6 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                    <EyeIcon /> معاينة
                </button>
                <a href={pdfUrl} download={`organized-${Date.now()}.pdf`} className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200">
                    <DownloadIcon /> تحميل PDF
                </a>
            </div>
            <button onClick={handleReset} className="text-sm text-slate-400 hover:text-indigo-600 font-medium transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50">
                <ResetIcon /> تنظيم ملف جديد
            </button>
        </div>
    );
  }

  return (
    <div className="animate-fade-in relative">
      {passwordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center gap-3">
                      <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                          <LockIcon />
                      </div>
                      <h3 className="font-bold text-slate-800">ملف محمي بكلمة مرور</h3>
                  </div>
                  <div className="p-6">
                      <p className="text-sm text-slate-500 mb-4">
                          الملف <span className="font-bold text-slate-800">{currentLockedFile?.name}</span> محمي. يرجى إدخال كلمة المرور لفك تشفيره واستيراد صفحاته.
                      </p>
                      <form onSubmit={handlePasswordSubmit}>
                          <input 
                              type="password" 
                              autoFocus
                              value={passwordInput}
                              onChange={(e) => setPasswordInput(e.target.value)}
                              placeholder="أدخل كلمة المرور"
                              className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all mb-4"
                          />
                          <div className="flex gap-3">
                              <button 
                                type="button" 
                                onClick={skipLockedFile}
                                className="flex-1 px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                              >
                                  تخطـي
                              </button>
                              <button 
                                type="submit" 
                                disabled={unlocking || !passwordInput}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                              >
                                  {unlocking ? <Spinner className="w-4 h-4 text-white" /> : 'فك القفل'}
                              </button>
                          </div>
                      </form>
                  </div>
              </div>
          </div>
      )}

      <FileUpload onFilesSelected={handleFilesSelected} disabled={isLoading || isSaving} descriptionText="ملفات PDF فقط" acceptTypes="application/pdf" />
      
      {isLoading && !passwordModalOpen && (
          <div className="mt-8 flex flex-col items-center justify-center gap-3 text-indigo-600">
              <Spinner className="h-8 w-8 text-indigo-600"/>
              <span className="font-medium animate-pulse">جاري تحليل الصفحات... ({pendingFiles.length} متبقي)</span>
          </div>
      )}
      
      {pages.length > 0 && (
          <div className="mt-10">
              {/* Toolbar */}
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-slate-50 border border-slate-100 p-3 rounded-2xl mb-6 gap-4 sticky top-2 z-30 shadow-lg shadow-slate-200/50 backdrop-blur-md">
                  <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                    <button 
                        onClick={selectAll} 
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all text-sm font-bold ${selectedPageIds.size === pages.length && pages.length > 0 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                    >
                        <CheckIcon /> {selectedPageIds.size === pages.length ? 'إلغاء' : 'تحديد الكل'}
                    </button>
                    <span className="bg-white px-4 py-2.5 rounded-xl text-sm font-bold text-indigo-600 border border-slate-200">
                        {selectedPageIds.size} <span className="font-normal text-slate-400">محدد</span>
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
                      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                          <span className="text-xs font-bold text-slate-400 whitespace-nowrap">الحجم:</span>
                          <select 
                            value={targetPageSize} 
                            onChange={(e) => setTargetPageSize(e.target.value as PageSizeOption)}
                            className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                          >
                              <option value="A4">A4</option>
                              <option value="Letter">Letter</option>
                              <option value="Original">الأصلي</option>
                          </select>
                      </div>

                      <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                          <span className="text-xs font-bold text-slate-400 whitespace-nowrap">الهوامش:</span>
                          <select 
                            value={targetMargin} 
                            onChange={(e) => setTargetMargin(e.target.value as MarginOption)}
                            className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
                          >
                                <option value="Small">صغيرة</option>
                                <option value="Normal">عادية</option>
                                <option value="Big">كبيرة</option>
                                <option value="None">بدون</option>
                          </select>
                      </div>

                      <div className="w-px h-8 bg-slate-200 mx-1 hidden sm:block"></div>

                      <button 
                        onClick={rotateSelected} 
                        disabled={selectedPageIds.size === 0}
                        className="p-2.5 text-slate-600 bg-white border border-slate-200 rounded-xl hover:text-indigo-600 hover:border-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        title="تدوير المحدد"
                      >
                        <RotateIcon />
                      </button>
                      
                       <button 
                        onClick={() => handleSave(true)} 
                        disabled={selectedPageIds.size === 0}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed transition-all whitespace-nowrap"
                      >
                        <SaveIcon /> حفظ المحدد
                      </button>
                  </div>
              </div>
          
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
                  {pages.map(pageInfo => (
                      <div 
                        key={pageInfo.id} 
                        draggable 
                        onDragStart={() => handleDragStart(pageInfo.id)} 
                        onDragEnter={() => handleDragEnter(pageInfo.id)} 
                        onDragEnd={handleDragEnd} 
                        onDragOver={e => e.preventDefault()} 
                        className={`transition-all duration-300 ${draggedId === pageInfo.id ? 'opacity-20 scale-90' : 'opacity-100'}`}
                      >
                          <PageThumbnail 
                            pageInfo={pageInfo} 
                            onDelete={() => handleDeletePage(pageInfo.id)} 
                            onRotate={(e) => handleRotatePage(pageInfo.id)} 
                            isSelected={selectedPageIds.has(pageInfo.id)}
                            onToggleSelect={() => togglePageSelection(pageInfo.id)}
                          />
                      </div>
                  ))}
              </div>
          </div>
      )}
      
      {error && <div className="mt-6 text-center p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 font-medium">{error}</div>}

      <div className="mt-8 pt-6 border-t border-slate-100">
        <button onClick={() => handleSave(false)} disabled={pages.length === 0 || isLoading || isSaving || pendingFiles.length > 0} className="w-full bg-emerald-500 text-white font-bold py-4 px-6 rounded-xl hover:bg-emerald-600 hover:shadow-xl hover:shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-3 text-lg transform active:scale-[0.99] group">
            {isSaving ? (<><Spinner className="h-6 w-6 text-white"/><span>جاري الحفظ...</span></>) : (<><SaveIcon /><span>حفظ جميع الصفحات ({pages.length})</span></>)}
        </button>
      </div>
    </div>
  );
};
