
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  descriptionText: string;
  acceptTypes: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, disabled, descriptionText, acceptTypes }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [disabled, onFilesSelected]);

  const dropzoneClasses = `
    relative group flex flex-col items-center justify-center w-full h-64 
    border-2 border-dashed rounded-[1.2rem] cursor-pointer transition-all duration-300 
    ${disabled 
      ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60' 
      : isDragging 
        ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01] shadow-lg shadow-indigo-100' 
        : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5'
    }
  `;

  return (
    <label
      htmlFor="dropzone-file"
      className={dropzoneClasses}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center z-10 px-4">
        <div className={`p-4 rounded-2xl mb-4 transition-colors shadow-sm border ${isDragging ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-indigo-600 border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100'}`}>
            <UploadIcon />
        </div>
        <p className="mb-2 text-lg text-slate-700 font-bold">
          <span className="text-indigo-600 hover:underline decoration-2 underline-offset-4 decoration-indigo-200">اضغط للرفع</span> أو اسحب الملفات هنا
        </p>
        <p className="text-sm text-slate-400 max-w-sm leading-relaxed font-medium">{descriptionText}</p>
      </div>
      <input
        id="dropzone-file"
        type="file"
        className="hidden"
        multiple
        accept={acceptTypes}
        onChange={handleFileChange}
        disabled={disabled}
      />
    </label>
  );
};
