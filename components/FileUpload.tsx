
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
    border-2 border-dashed rounded-[1.5rem] cursor-pointer transition-all duration-300 
    ${disabled 
      ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60' 
      : isDragging 
        ? 'border-indigo-500 bg-indigo-50/60 scale-[1.01] shadow-lg shadow-indigo-100' 
        : 'border-indigo-100/80 bg-white hover:bg-indigo-50/40 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100/50'
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
        <div className={`p-5 rounded-2xl mb-4 transition-colors shadow-sm ${isDragging ? 'bg-indigo-200 text-indigo-700' : 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
            <UploadIcon />
        </div>
        <p className="mb-3 text-lg text-gray-700 font-medium">
          <span className="font-bold text-indigo-600 hover:underline decoration-2 underline-offset-4 decoration-indigo-200">اضغط للرفع</span> أو اسحب الملفات هنا
        </p>
        <p className="text-sm text-gray-400 max-w-sm leading-relaxed">{descriptionText}</p>
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
