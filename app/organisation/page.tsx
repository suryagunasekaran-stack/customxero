'use client';

import { useEffect, useState, useRef } from 'react';

export default function Organisation() {
    const [orgData, setOrgData] = useState<any>(null);
    const [projects, setProjects] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    
    // Interactive features state
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [projectsLoaded, setProjectsLoaded] = useState(false);
    const [projectCount, setProjectCount] = useState(0);
    const [projectMap, setProjectMap] = useState<Record<string, any>>({});
    
    // File handling states
    const [isFileUploaded, setIsFileUploaded] = useState(false);
    const [isFileUploading, setIsFileUploading] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isProcessed, setIsProcessed] = useState(false);
    const [processingError, setProcessingError] = useState(false);
    const [processedData, setProcessedData] = useState<any>(null);
    
    // Merge states
    const [isMerging, setIsMerging] = useState(false);
    const [isMerged, setIsMerged] = useState(false);
    const [mergeError, setMergeError] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Fetch organisation
        fetch('/api/organisation')
            .then((res) => {
                if (!res.ok) throw new Error(`Organisation: ${res.status}`);
                return res.json();
            })
            .then((data) => {
                console.log('Organisation data:', data);
                setOrgData(data);
            })
            .catch((e) => setError(e.message));
    }, []);

    // Function to fetch projects from Xero
    const fetchProjects = async () => {
        setIsLoadingProjects(true);
        try {
            const res = await fetch('/api/projects-inprogress');
            if (!res.ok) throw new Error(`Projects: ${res.status}`);
            const data = await res.json();
            setProjects(data);
            setProjectCount(data.length);
            setProjectsLoaded(true);
            
            // Create project map
            const projectMap: Record<string, { id: string; name: string; status: string }> = {};
            data.forEach((proj: any) => {
                const prefix = proj.name.split(" ")[0];
                projectMap[prefix] = {
                    id: proj.projectId,
                    name: proj.name,
                    status: proj.status
                };
            });
            console.log('Project map:', projectMap);
            setProjectMap(projectMap);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsLoadingProjects(false);
        }
    };

    // Function to handle file upload
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // Check if it's an xlsx file
        if (!file.name.endsWith('.xlsx')) {
            setError('Please upload an XLSX file');
            return;
        }
        
        setIsFileUploading(true);
        
        // Store the file and update UI
        setTimeout(() => {
            setUploadedFile(file);
            setIsFileUploaded(true);
            setIsFileUploading(false);
            setIsProcessed(false);
            setProcessingError(false);
        }, 1000);
    };

    // Function to process the uploaded file
    const processFile = async () => {
        if (!uploadedFile) return;
        
        setIsProcessing(true);
        setIsProcessed(false);
        setProcessingError(false);
        setError(null); // Clear any previous errors
        
        try {
            const formData = new FormData();
            formData.append('file', uploadedFile);
            
            const response = await fetch('http://127.0.0.1:5001/process-excel', {
                method: 'POST',
                body: formData,
            });
            
            // This should handle your {"message": "File processed and data printed to terminal"}, 200 response
            if (response.ok) {
                setIsProcessed(true);
                // You can also parse the response message if needed
                const data = await response.json();
                console.log("Processing response:", data);
                setProcessedData(data);
            } else {
                setProcessingError(true);
                setError(`Processing failed: ${response.status}`);
            }
        } catch (err: any) {
            setProcessingError(true);
            setError(`Error: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    // Function to merge project data with processed data
    const mergeData = async () => {
        if (!projectMap || !processedData) return;
        
        setIsMerging(true);
        setIsMerged(false);
        setMergeError(false);
        setError(null); // Clear any previous errors
        
        try {
            const response = await fetch('/mergedata', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    projectMap,
                    processedData
                }),
            });
            
            if (response.ok) {
                setIsMerged(true);
                const data = await response.json();
                console.log("Merge response:", data);
            } else {
                setMergeError(true);
                setError(`Merge failed: ${response.status}`);
            }
        } catch (err: any) {
            setMergeError(true);
            setError(`Error: ${err.message}`);
        } finally {
            setIsMerging(false);
        }
    };

    // Trigger file input click
    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };
    
    // Reset file upload to select a new file
    const resetFileUpload = () => {
        setIsFileUploaded(false);
        setUploadedFile(null);
        setIsProcessed(false);
        setProcessingError(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <div className="p-10 bg-white rounded-lg shadow-xl text-center">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
                    <p className="text-black">{error}</p>
                </div>
            </div>
        );
    }

    if (!orgData) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <div className="p-10 bg-white rounded-lg shadow-xl text-center">
                    <p className="text-xl font-semibold text-black">Loading…</p>
                </div>
            </div>
        );
    }

    const orgName = orgData.Organisations?.[0]?.Name || 'Organisation';

    return (
        <div>
            <div className="sm:flex sm:items-center">
                <div className="sm:flex-auto">
                    <h1 className="text-base font-semibold text-gray-900">{orgName}</h1>
                    <p className="mt-2 text-sm text-gray-700">
                        Project Management Console
                    </p>
                </div>
            </div>
            
            <div className="mt-8 flex-grow">
                <div className="max-w-3xl mx-auto space-y-8">
                    {/* Project retrieval section */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Xero Project Sync</h3>
                        <div className="flex items-center">
                            <button
                                onClick={fetchProjects}
                                disabled={isLoadingProjects}
                                className={`px-4 py-2 rounded-md text-white font-medium flex items-center space-x-2 ${
                                    isLoadingProjects ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                            >
                                {isLoadingProjects ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Loading Projects...</span>
                                    </>
                                ) : projectsLoaded ? (
                                    <>
                                        <svg className="h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span>{projectCount} Projects Downloaded</span>
                                    </>
                                ) : (
                                    <span>Fetch Projects from Xero</span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* File upload section */}
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Update Projects</h3>
                        
                        <input 
                            type="file" 
                            accept=".xlsx" 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleFileUpload} 
                        />
                        
                        {/* File display and processing button */}
                        {isFileUploaded && uploadedFile ? (
                            <div className="space-y-6"> {/* Increased spacing between elements */}
                                {/* Streamlined file info card with premium look */}
                                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-lg border border-indigo-100 shadow-sm overflow-hidden">
                                    <div className="flex items-center p-4">
                                        <div className="shrink-0">
                                            <div className="flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white shadow-inner">
                                                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                        </div>
                                        <div className="ml-4 flex-1 flex justify-between items-center">
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-900 truncate">{uploadedFile.name}</h4>
                                                <p className="text-xs text-gray-500">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                            <button 
                                                onClick={resetFileUpload} 
                                                className="ml-4 inline-flex items-center px-3 py-1.5 border border-indigo-300 text-xs font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                                            >
                                                <svg className="mr-1.5 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                Change
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Process button - improved visibility in all states */}
                                <button
                                    onClick={processFile}
                                    disabled={isProcessing || isProcessed}
                                    className={`w-full py-4 px-4 rounded-md text-white font-medium text-base flex items-center justify-center transition-colors shadow-md ${
                                        isProcessing 
                                            ? 'bg-blue-600 cursor-not-allowed' 
                                            : isProcessed 
                                                ? 'bg-green-700 hover:bg-green-800 cursor-pointer' /* Darker shade of green */
                                                : processingError 
                                                    ? 'bg-red-600 hover:bg-red-700' 
                                                    : 'bg-indigo-600 hover:bg-indigo-700'
                                    }`}
                                >
                                    {isProcessing ? (
                                        <>
                                            <svg className="animate-spin h-5 w-5 text-white mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span className="text-white font-medium">Processing...</span>
                                        </>
                                    ) : isProcessed ? (
                                        <>
                                            <svg className="h-5 w-5 text-white mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-white font-medium">Data Processed Successfully</span>
                                        </>
                                    ) : processingError ? (
                                        <>
                                            <svg className="h-5 w-5 text-white mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <span className="text-white font-medium">Try Again</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="h-5 w-5 text-white mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-white font-medium">Process Data</span>
                                        </>
                                    )}
                                </button>

                                {/* Console-like component for message display */}
                                <div className="mt-4 border rounded-lg overflow-hidden shadow-inner bg-gray-900">
                                    <div className="flex items-center px-4 py-2 bg-gray-800">
                                        <div className="flex space-x-1.5">
                                            <div className="h-3 w-3 rounded-full bg-red-500"></div>
                                            <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                                            <div className="h-3 w-3 rounded-full bg-green-500"></div>
                                        </div>
                                        <div className="ml-2 text-xs font-medium text-gray-400">Console Output</div>
                                    </div>
                                    <div className="px-4 py-3 font-mono text-sm">
                                        {error ? (
                                            <p className="text-red-400">[ERROR] {error}</p>
                                        ) : mergeError ? (
                                            <p className="text-red-400">[ERROR] Failed to get final payload</p>
                                        ) : isMerged ? (
                                            <p className="text-green-400">[SUCCESS] Final payload received successfully</p>
                                        ) : isMerging ? (
                                            <p className="text-blue-400">[INFO] Getting final payload...</p>
                                        ) : isProcessed ? (
                                            <p className="text-green-400">[SUCCESS] File processed and data printed to terminal</p>
                                        ) : isProcessing ? (
                                            <p className="text-blue-400">[INFO] Processing file...</p>
                                        ) : (
                                            <p className="text-gray-400">[READY] Waiting for processing to start...</p>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Get Final Payload section - only shown after processing */}
                                {isProcessed && (
                                    <div className="mt-6 p-5 bg-green-50 border border-green-200 rounded-lg">
                                        <h3 className="text-lg font-medium text-green-900 mb-3">Final Payload</h3>
                                        <p className="text-sm text-green-700 mb-4">
                                            Your data has been processed successfully. You can now get the final payload for your Xero projects.
                                        </p>
                                        <button
                                            onClick={mergeData}
                                            disabled={isMerging || isMerged}
                                            className={`px-4 py-2 rounded-md text-white font-medium flex items-center shadow-sm transition-colors ${
                                                isMerging 
                                                    ? 'bg-indigo-400 cursor-not-allowed' 
                                                    : isMerged 
                                                        ? 'bg-green-700 hover:bg-green-800' 
                                                        : mergeError 
                                                            ? 'bg-red-600 hover:bg-red-700' 
                                                            : 'bg-indigo-600 hover:bg-indigo-700'
                                            }`}
                                        >
                                            {isMerging ? (
                                                <>
                                                    <svg className="animate-spin h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span>Getting Payload...</span>
                                                </>
                                            ) : isMerged ? (
                                                <>
                                                    <svg className="h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    <span>Payload Retrieved</span>
                                                </>
                                            ) : mergeError ? (
                                                <>
                                                    <svg className="h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                    <span>Try Again</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="h-5 w-5 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                                    </svg>
                                                    <span>Get Final Payload</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div 
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer ${
                                    isFileUploading 
                                        ? 'border-indigo-300 bg-indigo-50' 
                                        : 'border-gray-300 hover:border-indigo-500'
                                }`} 
                                onClick={triggerFileInput}
                            >
                                {isFileUploading ? (
                                    <div className="flex flex-col items-center">
                                        <svg className="animate-spin h-8 w-8 text-indigo-600 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <p className="text-sm text-gray-600">Processing file...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <svg className="h-8 w-8 text-gray-400 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <p className="text-sm text-gray-600">Drag and drop your XLSX file here, or click to browse</p>
                                        <p className="text-xs text-gray-500 mt-1">Only .xlsx files are accepted</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
