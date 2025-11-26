
import React from 'react';
import { Spinner } from './Spinner';
import { FileIcon, ImageIcon, PdfIcon, RemoveIcon, PinIcon, PinFilledIcon, WordIcon, ExcelIcon, DragHandleIcon, LockIcon, UnlockIcon } from './icons';

interface FilePreviewCardProps {
  file: File;
  onRemove: (fileName: string) => void;
  isFirstPage: boolean;
  onSetFirstPage: (fileName: string) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  isProcessing?: boolean;
  isProtected?: boolean;
  onPasswordChange?: (fileName: string, password: string) => void;
  passwordValue?: string;
}

const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
};

export const FilePreviewCard: React.FC<FilePreviewCardProps> = ({ 
    file, 
    onRemove, 
    isFirstPage, 
    onSetFirstPage,
    isDragging,
    onDragStart,
    onDragEnter,
    onDragEnd,
    isProcessing = false,
    isProtected = false,
    onPasswordChange,
    passwordValue = ''
}) => {
  const getFileIcon = () => {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileType.startsWith('image/')) {
      return <ImageIcon className="w-8 h-8 text-purple-600" />;
    }
    if (fileType === 'application/pdf') {
      return <PdfIcon className="w-8 h-8 text-red-500" />;
    }
    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
      return <WordIcon className="w-8 h-8 text-blue-600" />;
    }
    if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileName.endsWith('.xlsx')) {
      return <ExcelIcon className="w-8 h-8 text-emerald-600" />;
    }
    return <FileIcon className="w-8 h-8 text-gray-400" />;
  };

  const cardClasses = `
    relative flex items-center p-4 rounded-xl border transition-all duration-300 group
    ${isFirstPage 
        ? 'bg-indigo-50/50 border-indigo-200 shadow-sm ring-1 ring-indigo-200' 
        : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-lg hover:shadow-indigo-500/5'
    } 
    ${isDragging ? 'opacity-40 scale-[0.98]' : 'scale-100'}
  `;

  return (
    <div 
      className={cardClasses}
      draggable={!isFirstPage && !isProcessing}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
    >
      {!isFirstPage && !isProcessing && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
            <DragHandleIcon />
        </div>
      )}
      
      <div className={`flex-shrink-0 transition-transform ${!isFirstPage && !isProcessing ? 'group-hover:translate-x-[-8px]' : ''}`}>
        {getFileIcon()}
      </div>
      
      <div className="flex-grow min-w-0 mx-4">
        <div className="flex items-center gap-2">
            <p className={`text-sm font-bold truncate mb-1 ${isFirstPage ? 'text-indigo-900' : 'text-gray-800'}`}>
                {file.name}
            </p>
            {isProtected && (
                 <span title="ملف محمي" className="animate-pulse">{passwordValue ? <UnlockIcon /> : <LockIcon />}</span>
            )}
        </div>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
             <p className="text-xs text-gray-400 flex items-center gap-2">
                <span className="font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">{formatBytes(file.size)}</span>
                <span>{formatDate(file.lastModified)}</span>
            </p>

            {isProtected && onPasswordChange && (
                <input 
                    type="password" 
                    placeholder="كلمة مرور الملف"
                    value={passwordValue}
                    onChange={(e) => onPasswordChange(file.name, e.target.value)}
                    className="text-xs border border-red-200 rounded-md px-2 py-1 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200 bg-red-50 text-gray-700 w-32 placeholder-red-300"
                    onClick={(e) => e.stopPropagation()}
                />
            )}
        </div>
      </div>
      
      <div className="flex items-center gap-1 flex-shrink-0">
        {isProcessing ? (
          <Spinner className="h-5 w-5 text-indigo-600" />
        ) : (
          <>
            <button
              onClick={() => onSetFirstPage(file.name)}
              className={`p-2 rounded-lg transition-all ${
                isFirstPage 
                    ? 'text-indigo-600 bg-indigo-100' 
                    : 'text-gray-300 hover:text-indigo-600 hover:bg-gray-50'
                }`}
              title={isFirstPage ? `إلغاء تثبيت كصفحة أولى` : `تعيين كصفحة أولى`}
            >
              {isFirstPage ? <PinFilledIcon /> : <PinIcon />}
            </button>
            <button
              onClick={() => onRemove(file.name)}
              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title={`إزالة الملف`}
            >
              <RemoveIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
