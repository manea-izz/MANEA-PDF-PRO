
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
    relative group flex flex-col items-center justify-center w-full h-56 
    border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 
    ${disabled 
      ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-60' 
      : isDragging 
        ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' 
        : 'border-indigo-100 bg-white hover:bg-indigo-50/30 hover:border-indigo-300 shadow-sm hover:shadow-md'
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
      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center z-10">
        <div className={`p-4 rounded-full mb-3 transition-colors ${isDragging ? 'bg-indigo-100' : 'bg-indigo-50 group-hover:bg-indigo-100'}`}>
            <UploadIcon />
        </div>
        <p className="mb-2 text-lg text-gray-700 font-medium">
          <span className="font-bold text-indigo-600">انقر للرفع</span> أو اسحب الملفات هنا
        </p>
        <p className="text-sm text-gray-400 max-w-xs leading-relaxed">{descriptionText}</p>
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
