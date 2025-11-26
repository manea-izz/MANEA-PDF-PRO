
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './FileUpload';
import { Spinner } from './Spinner';
import { DownloadIcon, ResetIcon, SaveIcon, TrashIcon, RotateIcon, CheckCircleIcon, CheckIcon, EyeIcon } from './icons';

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
            ? 'ring-2 ring-indigo-500 shadow-xl shadow-indigo-200/50 rounded-lg' 
            : 'ring-1 ring-gray-200 shadow-sm hover:shadow-lg hover:ring-indigo-300 rounded-lg'
        }
      `}>
        <canvas ref={canvasRef} className="w-full h-auto pointer-events-none block" />
        
        <div className={`absolute inset-0 bg-indigo-900/10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`}></div>
        
        {isSelected && (
            <div className="absolute top-2 left-2 text-indigo-600 bg-white rounded-full shadow-md">
                <CheckCircleIcon />
            </div>
        )}

         {/* Overlay actions - visible on hover */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-black/5 transition-opacity z-10">
            <button 
                onClick={(e) => { e.stopPropagation(); onRotate(e); }} 
                className="p-2 bg-white text-indigo-600 rounded-full shadow-lg hover:bg-indigo-50 transition-transform hover:scale-110" 
                title="تدوير الصفحة"
            >
                <RotateIcon />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                className="p-2 bg-white text-red-500 rounded-full shadow-lg hover:bg-red-50 transition-transform hover:scale-110" 
                title="حذف الصفحة"
            >
                <TrashIcon />
            </button>
        </div>
      </div>
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${isSelected ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
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
  const [targetPageSize, setTargetPageSize] = useState<PageSizeOption>('A4');

  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    setIsLoading(true);
    setError(null);
    setPdfUrl(null);
    setPages([]);
    setSelectedPageIds(new Set());
    
    try {
      const newPages: PageInfo[] = [];
      for (const [fileIndex, file] of selectedFiles.entries()) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          newPages.push({
            id: `${file.name}-${i}-${Date.now()}-${Math.random()}`,
            pdf,
            pageNumber: i,
            rotation: 0,
            originalFileIndex: fileIndex,
          });
        }
      }
      setPages(newPages);
    } catch (e) {
      console.error(e);
      setError("حدث خطأ أثناء معالجة ملفات PDF. تأكد من أنها ملفات صالحة.");
    } finally {
      setIsLoading(false);
    }
  }, []);
  
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

        const loadedOriginalDocs: any[] = [];
        const getSourceDoc = async (index: number) => {
             if (!loadedOriginalDocs[index]) {
                 const pageInfo = pages.find(p => p.originalFileIndex === index);
                 if (pageInfo) {
                    const arrayBuffer = await pageInfo.pdf.getData();
                    loadedOriginalDocs[index] = await PDFDocument.load(arrayBuffer);
                 }
             }
             return loadedOriginalDocs[index];
        };

        for (const pageInfo of pagesToProcess) {
            const sourceDoc = await getSourceDoc(pageInfo.originalFileIndex);
            if (!sourceDoc) continue;

            if (targetPageSize === 'Original') {
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
                const scale = Math.min(destWidth / srcWidth, destHeight / srcHeight);
                
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
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <CheckCircleIcon />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">تم تنظيم الملف بنجاح!</h2>
            <div className="flex flex-col sm:flex-row gap-4 mb-8 mt-4 w-full max-w-md">
                <button onClick={() => window.open(pdfUrl, '_blank')} className="flex-1 inline-flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-200 font-bold py-4 px-6 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                    <EyeIcon /> معاينة
                </button>
                <a href={pdfUrl} download={`organized-${Date.now()}.pdf`} className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 px-6 rounded-xl hover:shadow-lg hover:shadow-green-500/30 transition-all">
                    <DownloadIcon /> تحميل PDF
                </a>
            </div>
            <button onClick={handleReset} className="text-sm text-gray-400 hover:text-indigo-600 font-medium transition-colors flex items-center gap-1">
                <ResetIcon /> تنظيم ملف جديد
            </button>
        </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <FileUpload onFilesSelected={handleFilesSelected} disabled={isLoading || isSaving} descriptionText="ملفات PDF فقط" acceptTypes="application/pdf" />
      
      {isLoading && <div className="mt-8 flex flex-col items-center justify-center gap-3 text-indigo-600"><Spinner className="h-8 w-8 text-indigo-600"/><span className="font-medium">جاري تحليل الصفحات...</span></div>}
      
      {pages.length > 0 && (
          <div className="mt-8">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row justify-between items-center bg-gray-50 border border-gray-200 p-2 rounded-xl mb-6 gap-3 sticky top-0 z-30 shadow-sm backdrop-blur-sm bg-opacity-90">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button 
                        onClick={selectAll} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-bold ${selectedPageIds.size === pages.length && pages.length > 0 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
                    >
                        <CheckIcon /> {selectedPageIds.size === pages.length ? 'إلغاء' : 'تحديد الكل'}
                    </button>
                    <span className="bg-white px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-indigo-600">
                        {selectedPageIds.size} صفحة
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                      <select 
                        value={targetPageSize} 
                        onChange={(e) => setTargetPageSize(e.target.value as PageSizeOption)}
                        className="bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none"
                      >
                          <option value="A4">حجم A4</option>
                          <option value="Letter">حجم Letter</option>
                          <option value="Original">الحجم الأصلي</option>
                      </select>

                      <button 
                        onClick={rotateSelected} 
                        disabled={selectedPageIds.size === 0}
                        className="p-2.5 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="تدوير المحدد"
                      >
                        <RotateIcon />
                      </button>
                      
                       <button 
                        onClick={() => handleSave(true)} 
                        disabled={selectedPageIds.size === 0}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed transition-all whitespace-nowrap"
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
      
      {error && <div className="mt-6 text-center p-3 bg-red-50 text-red-600 rounded-lg border border-red-100">{error}</div>}

      <div className="mt-8 pt-6 border-t border-gray-100">
        <button onClick={() => handleSave(false)} disabled={pages.length === 0 || isLoading || isSaving} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-4 px-6 rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-3 text-lg transform active:scale-[0.99]">
            {isSaving ? (<><Spinner className="h-6 w-6 text-white"/><span>جاري الحفظ...</span></>) : (<><SaveIcon /><span>حفظ جميع الصفحات ({pages.length})</span></>)}
        </button>
      </div>
    </div>
  );
};
