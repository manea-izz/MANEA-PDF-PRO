

import React, { useState, useCallback } from 'react';
import { FileUpload } from './FileUpload';
import { Spinner } from './Spinner';
import { mergeFilesToPdf, isPdfEncrypted, unlockPdfFile } from '../services/pdfService';
import { DownloadIcon, FileIcon, WordIcon, ExcelIcon, ConvertIcon, EyeIcon, LockIcon, UnlockIcon } from './icons';

interface ConvertedFile {
    originalFile: File;
    status: 'pending' | 'converting' | 'done' | 'error';
    pdfUrl?: string;
    errorMessage?: string;
    isProtected: boolean;
    password?: string;
    isUnlocking?: boolean;
}

export const FileConverter: React.FC = () => {
  const [fileList, setFileList] = useState<ConvertedFile[]>([]);
  
  const handleFilesSelected = useCallback(async (selectedFiles: File[]) => {
    // Process files to check for encryption initially
    const newFilesData = await Promise.all(selectedFiles.map(async (file) => {
        let isProtected = false;
        if (file.type === 'application/pdf') {
            isProtected = await isPdfEncrypted(file);
        }
        return {
            originalFile: file,
            status: 'pending' as const,
            isProtected,
            password: '',
            isUnlocking: false
        };
    }));
    
    setFileList(prev => [...prev, ...newFilesData]);
  }, []);

  const handlePasswordChange = async (index: number, val: string) => {
      // Update password text
      setFileList(prev => prev.map((f, i) => i === index ? { ...f, password: val } : f));

      // Attempt auto-unlock if password length is reasonable
      if (val.length > 0) {
          const targetFile = fileList[index];
          if (targetFile.isProtected && !targetFile.isUnlocking) {
               // Optimistic UI for unlocking
               setFileList(prev => prev.map((f, i) => i === index ? { ...f, isUnlocking: true } : f));
               
               const unlockedFile = await unlockPdfFile(targetFile.originalFile, val);
               
               if (unlockedFile) {
                   // Success! Replace original file with unlocked one
                   setFileList(prev => prev.map((f, i) => i === index ? { 
                       ...f, 
                       originalFile: unlockedFile, 
                       isProtected: false, 
                       isUnlocking: false,
                       password: '',
                       // We can even set status to done? No, let user convert still to choose options if any, 
                       // but for a converter, maybe we just want to offer the unlocked PDF?
                       // Let's stick to standard flow: now it's just a normal PDF ready to convert/download.
                   } : f));
               } else {
                   // Failed, stop spinner
                   setFileList(prev => prev.map((f, i) => i === index ? { ...f, isUnlocking: false } : f));
               }
          }
      }
  };

  const convertFile = async (index: number) => {
      const item = fileList[index];
      if (item.status === 'converting' || item.status === 'done') return;

      if (item.isProtected && !item.password) {
          alert('هذا الملف محمي. يرجى إدخال كلمة المرور أولاً.');
          return;
      }

      setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'converting' } : f));

      try {
          // If already unlocked (replaced), password not needed. If still protected (shouldn't happen if auto-unlock works, but fallback), use pass.
          const passwords = item.password ? { [item.originalFile.name]: item.password } : {};
          
          const pdfBytes = await mergeFilesToPdf([item.originalFile], undefined, passwords);
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          
          setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'done', pdfUrl: url } : f));
      } catch (e) {
          console.error(e);
          setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'error', errorMessage: 'فشل التحويل' } : f));
      }
  };

  const handlePreview = (url: string) => {
      if (!url) return;
      window.open(url, '_blank');
  };

  const getIcon = (file: File) => {
      const name = file.name.toLowerCase();
      if (name.endsWith('.docx') || name.endsWith('.doc') || file.type.includes('word')) return <WordIcon className="w-8 h-8 text-blue-600" />;
      if (name.endsWith('.xlsx') || name.endsWith('.xls') || file.type.includes('sheet') || file.type.includes('excel')) return <ExcelIcon className="w-8 h-8 text-emerald-600" />;
      return <FileIcon className="w-8 h-8 text-slate-500" />;
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-10">
          <FileUpload 
            onFilesSelected={handleFilesSelected} 
            descriptionText="Word, Excel, صور, PDF محمي" 
            acceptTypes=".docx, .doc, .xlsx, .xls, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/msword, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, image/*" 
          />
      </div>

      <div className="space-y-4">
          {fileList.map((item, index) => (
              <div key={index} className="flex flex-col md:flex-row items-center p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300">
                  <div className="flex items-center w-full md:w-auto mb-3 md:mb-0">
                      <div className="mr-4 p-2.5 bg-slate-50 rounded-xl border border-slate-100 relative">
                          {getIcon(item.originalFile)}
                          {item.isProtected && (
                              <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-red-100 animate-pulse">
                                  {item.isUnlocking ? <Spinner className="w-3 h-3 text-indigo-500" /> : <LockIcon />}
                              </div>
                          )}
                      </div>
                      <div className="flex-grow min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{item.originalFile.name}</p>
                          <div className="flex items-center gap-2">
                             <p className="text-xs text-slate-400">{(item.originalFile.size / 1024).toFixed(1)} KB</p>
                             {item.isProtected && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100">محمي</span>}
                          </div>
                      </div>
                  </div>

                  {item.isProtected && item.status === 'pending' && (
                      <div className="w-full md:w-auto md:mx-4 mb-3 md:mb-0 relative">
                          <input 
                            type="password" 
                            placeholder="أدخل كلمة المرور..." 
                            value={item.password || ''}
                            onChange={(e) => handlePasswordChange(index, e.target.value)}
                            disabled={item.isUnlocking}
                            className="w-full md:w-48 text-sm px-3 py-2 border border-red-200 rounded-lg bg-red-50 focus:bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100 outline-none transition-all placeholder-red-300 text-slate-700 font-medium disabled:opacity-70"
                          />
                           {item.isUnlocking && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2">
                                    <Spinner className="w-4 h-4 text-indigo-500" />
                                </div>
                           )}
                      </div>
                  )}
                  
                  <div className="flex-shrink-0 w-full md:w-auto flex items-center gap-3 md:mr-auto justify-end mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-0 border-slate-50">
                      {item.status === 'pending' && (
                          <button 
                            onClick={() => convertFile(index)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={item.isUnlocking}
                          >
                              <ConvertIcon /> {item.isProtected ? 'فك القفل وتحويل' : 'تحويل PDF'}
                          </button>
                      )}
                      {item.status === 'converting' && (
                          <div className="flex items-center gap-2 text-indigo-600 text-sm font-bold bg-indigo-50 px-5 py-2.5 rounded-xl animate-pulse">
                              <Spinner className="h-4 w-4 text-indigo-600" /> جاري المعالجة...
                          </div>
                      )}
                      {item.status === 'done' && item.pdfUrl && (
                          <>
                            <button 
                                onClick={() => handlePreview(item.pdfUrl!)}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors"
                                title="معاينة الملف"
                            >
                                <EyeIcon /> معاينة
                            </button>
                            <a 
                                href={item.pdfUrl} 
                                download={`${item.originalFile.name.split('.')[0]}_converted.pdf`}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-200"
                            >
                                <DownloadIcon /> تحميل
                            </a>
                          </>
                      )}
                      {item.status === 'error' && (
                          <span className="text-red-500 bg-red-50 px-4 py-2 rounded-xl text-sm font-bold border border-red-100">{item.errorMessage}</span>
                      )}
                  </div>
              </div>
          ))}
          
          {fileList.length === 0 && (
              <div className="text-center py-16 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <div className="inline-block p-4 bg-white rounded-full mb-3 text-slate-300 shadow-sm border border-slate-100">
                     <ConvertIcon />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">لم يتم اختيار أي ملفات للتحويل بعد</p>
              </div>
          )}
      </div>
    </div>
  );
};
