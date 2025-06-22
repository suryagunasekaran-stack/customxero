// FileValidationService.ts
// Service for validating and processing uploaded files

import { FilePreview } from '../types';

export class FileValidationService {
  private readonly ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];
  private readonly MAX_FILE_SIZE_MB = 50; // Maximum file size in MB

  validateFile(file: File): {
    isValid: boolean;
    preview: FilePreview | null;
    error?: string;
  } {
    const fileName = file.name.toLowerCase();
    const fileExtension = this.getFileExtension(fileName);

    // Validate file extension
    if (!this.ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return {
        isValid: false,
        preview: null,
        error: 'Invalid file format. Please upload an Excel file (.xlsx or .xls).'
      };
    }

    // Validate file size
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > this.MAX_FILE_SIZE_MB) {
      return {
        isValid: false,
        preview: null,
        error: `File size exceeds ${this.MAX_FILE_SIZE_MB}MB limit.`
      };
    }

    // Create file preview
    const preview: FilePreview = {
      fileName: file.name,
      fileSize: `${fileSizeInMB.toFixed(2)} MB`,
      lastModified: new Date(file.lastModified).toLocaleString()
    };

    return {
      isValid: true,
      preview,
      error: undefined
    };
  }

  private getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex > -1 ? fileName.substring(lastDotIndex) : '';
  }
} 