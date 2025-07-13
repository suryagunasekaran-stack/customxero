/**
 * Utility function to download content as a file
 * @param content - The content to download (string or Blob)
 * @param filename - The name of the file to download
 * @param type - MIME type of the content (default: 'text/csv')
 */
export const downloadFile = (
  content: string | Blob, 
  filename: string, 
  type: string = 'text/csv'
): void => {
  const blob = content instanceof Blob 
    ? content 
    : new Blob([content], { type });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
};

/**
 * Download JSON content as a file
 * @param data - The data to download
 * @param filename - The name of the file to download
 */
export const downloadJSON = (data: any, filename: string): void => {
  const jsonString = JSON.stringify(data, null, 2);
  downloadFile(jsonString, filename, 'application/json');
};

/**
 * Download CSV content as a file
 * @param content - The CSV content to download
 * @param filename - The name of the file to download
 */
export const downloadCSV = (content: string, filename: string): void => {
  downloadFile(content, filename, 'text/csv');
};

/**
 * Download text content as a file
 * @param content - The text content to download
 * @param filename - The name of the file to download
 */
export const downloadText = (content: string, filename: string): void => {
  downloadFile(content, filename, 'text/plain');
};