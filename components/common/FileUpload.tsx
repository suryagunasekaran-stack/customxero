import React, { useRef, useState } from 'react';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  maxSize?: number; // in bytes
  onError?: (error: string) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileSelect, 
  accept, 
  disabled = false, 
  children,
  className = '',
  maxSize,
  onError
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    if (maxSize && file.size > maxSize) {
      const sizeMB = (maxSize / 1024 / 1024).toFixed(2);
      onError?.(`File size exceeds ${sizeMB}MB limit`);
      return;
    }
    onFileSelect(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled) return;
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      // Check if file type matches accept pattern
      if (accept && !file.type.match(accept.replace('*', '.*'))) {
        onError?.(`Please select a file matching: ${accept}`);
        return;
      }
      handleFileSelect(file);
    }
  };

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
      
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          ${className}
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          ${isDragging ? 'ring-2 ring-blue-400 bg-blue-50' : ''}
          transition-all duration-200
        `}
      >
        {children || (
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400">
            <CloudArrowUpIcon className="h-10 w-10 text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">
              Click to upload or drag and drop
            </p>
            {accept && (
              <p className="text-xs text-gray-500 mt-1">
                {accept}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// Specialized file upload button component
interface FileUploadButtonProps extends Omit<FileUploadProps, 'children'> {
  buttonText?: string;
  buttonClassName?: string;
  icon?: React.ReactNode;
}

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  buttonText = 'Choose File',
  buttonClassName = '',
  icon,
  ...props
}) => {
  return (
    <FileUpload {...props}>
      <button
        type="button"
        disabled={props.disabled}
        className={`
          inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg
          ${props.disabled 
            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
          ${buttonClassName}
        `}
      >
        {icon || <CloudArrowUpIcon className="h-4 w-4 mr-2" />}
        {buttonText}
      </button>
    </FileUpload>
  );
};

export default FileUpload;