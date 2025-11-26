
import React, { useState, useCallback } from 'react';
import { FileUpload } from './FileUpload';
import { Spinner } from './Spinner';
import { mergeFilesToPdf } from '../services/pdfService';
import { DownloadIcon, FileIcon, WordIcon, ExcelIcon, ConvertIcon, EyeIcon } from './icons';

interface ConvertedFile {
    originalFile: File;
    status: 'pending' | 'converting' | 'done' | 'error';
    pdfUrl?: string;
    errorMessage?: string;
}

export const FileConverter: React.FC = () => {
  const [fileList, setFileList] = useState<ConvertedFile[]>([]);
  
  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    const newFiles = selectedFiles.map(file => ({
        originalFile: file,
        status: 'pending' as const
    }));
    setFileList(prev => [...prev, ...newFiles]);
  }, []);

  const convertFile = async (index: number) => {
      const item = fileList[index];
      if (item.status === 'converting' || item.status === 'done') return;

      setFileList(prev => prev.map((f, i) => i === index ? { ...f, status: 'converting' } : f));

      try {
          const pdfBytes = await mergeFilesToPdf([item.originalFile]);
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
      return <FileIcon className="w-8 h-8 text-gray-500" />;
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
          <FileUpload 
            onFilesSelected={handleFilesSelected} 
            descriptionText="Word (DOCX/DOC), Excel (XLSX/XLS), صور" 
            acceptTypes=".docx, .doc, .xlsx, .xls, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/msword, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, image/*" 
          />
      </div>

      <div className="space-y-4">
          {fileList.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row items-center p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center w-full sm:w-auto mb-3 sm:mb-0">
                      <div className="mr-4 p-2 bg-gray-50 rounded-lg">
                          {getIcon(item.originalFile)}
                      </div>
                      <div className="flex-grow min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{item.originalFile.name}</p>
                          <p className="text-xs text-gray-400">{(item.originalFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                  </div>
                  
                  <div className="flex-shrink-0 w-full sm:w-auto flex items-center gap-3 sm:mr-auto justify-end mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-gray-50">
                      {item.status === 'pending' && (
                          <button 
                            onClick={() => convertFile(index)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
                          >
                              <ConvertIcon /> تحويل الآن
                          </button>
                      )}
                      {item.status === 'converting' && (
                          <div className="flex items-center gap-2 text-indigo-600 text-sm font-bold bg-indigo-50 px-4 py-2 rounded-lg">
                              <Spinner className="h-4 w-4 text-indigo-600" /> جاري المعالجة...
                          </div>
                      )}
                      {item.status === 'done' && item.pdfUrl && (
                          <>
                            <button 
                                onClick={() => handlePreview(item.pdfUrl!)}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-200 text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors"
                                title="معاينة الملف"
                            >
                                <EyeIcon /> معاينة
                            </button>
                            <a 
                                href={item.pdfUrl} 
                                download={`${item.originalFile.name.split('.')[0]}.pdf`}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-200"
                            >
                                <DownloadIcon /> تحميل
                            </a>
                          </>
                      )}
                      {item.status === 'error' && (
                          <span className="text-red-500 bg-red-50 px-3 py-1.5 rounded-lg text-sm font-bold">{item.errorMessage}</span>
                      )}
                  </div>
              </div>
          ))}
          
          {fileList.length === 0 && (
              <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p className="text-gray-400 text-sm">لم يتم اختيار أي ملفات للتحويل بعد</p>
              </div>
          )}
      </div>
    </div>
  );
};
