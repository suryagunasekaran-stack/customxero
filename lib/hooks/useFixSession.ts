/**
 * @fileoverview Custom React hook for managing fix sessions with real-time SSE updates
 * @module lib/hooks/useFixSession
 * @description Provides a comprehensive hook for managing deal fix operations with
 * Server-Sent Events (SSE) for real-time progress tracking. Handles session state,
 * progress updates, error handling, and cancellation capabilities.
 * @since 1.0.0
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { 
  FixSessionUI, 
  FixProgressUI, 
  FixValidationIssue, 
  FixConfigUI, 
  UseFixSessionReturn,
  UseFixSessionState,
  UseFixSessionActions,
  FixStep,
  FixSummary
} from '@/lib/types/fix';

/**
 * Custom React hook for managing fix sessions with SSE streaming
 * 
 * @description Provides comprehensive state management and real-time communication
 * for deal fix operations. Handles Server-Sent Events (SSE) streaming, progress tracking,
 * error handling, and cancellation. Maintains session state and provides actions
 * for controlling fix operations.
 * 
 * @function useFixSession
 * @returns {UseFixSessionReturn} Object containing state properties and action functions
 * 
 * @example
 * ```tsx
 * function FixInterface() {
 *   const fixSession = useFixSession();
 *   
 *   const handleStartFix = async () => {
 *     await fixSession.startFix('tenant-123', validationIssues, {
 *       enableDryRun: false,
 *       batchSize: 10
 *     });
 *   };
 *   
 *   return (
 *     <div>
 *       {fixSession.isFixing ? (
 *         <div>
 *           <p>Current Step: {fixSession.currentStep?.name}</p>
 *           <p>Progress: {fixSession.currentStep?.progress}%</p>
 *         </div>
 *       ) : (
 *         <button onClick={handleStartFix}>Start Fix</button>
 *       )}
 *       
 *       {fixSession.error && (
 *         <p>Error: {fixSession.error}</p>
 *       )}
 *       
 *       {fixSession.results && (
 *         <p>Fixed: {fixSession.results.fixedCount}</p>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 * 
 * @since 1.0.0
 */
export function useFixSession(): UseFixSessionReturn {
  // Hook state management - tracks current fix session status and data
  const [state, setState] = useState<UseFixSessionState>({
    isFixing: false,
    session: null,
    logs: [],
    error: null,
    results: null,
    currentStep: null
  });
  
  // AbortController for cancelling ongoing fetch requests
  const abortControllerRef = useRef<AbortController | null>(null);
  
  /**
   * Initiates a new fix session with Server-Sent Events (SSE) streaming
   * 
   * @description Starts a fix operation by calling the API endpoint and processing
   * real-time updates via SSE. Handles streaming data parsing, state updates,
   * and error recovery. The function returns when the SSE stream starts, not
   * when the fix operation completes.
   * 
   * @async
   * @function startFix
   * @param {string} tenantId - Xero tenant identifier for the fix operation
   * @param {FixValidationIssue[]} issues - Array of validation issues to fix
   * @param {FixConfigUI} [config] - Optional configuration for fix behavior
   * @returns {Promise<void>} Promise that resolves when SSE stream starts
   * @throws {Error} Throws error if API request fails or stream cannot be established
   * 
   * @example
   * ```typescript
   * try {
   *   await startFix('tenant-123', issuesArray, {
   *     enableDryRun: true,
   *     batchSize: 5
   *   });
   *   // SSE stream is now active, progress updates will arrive automatically
   * } catch (error) {
   *   console.error('Failed to start fix:', error);
   * }
   * ```
   */
  const startFix = useCallback(async (
    tenantId: string, 
    issues: FixValidationIssue[], 
    config?: FixConfigUI
  ): Promise<void> => {
    // Reset state to initial values for new fix session
    setState({
      isFixing: true,
      session: null,
      logs: [],
      error: null,
      results: null,
      currentStep: null
    });
    
    // Create new AbortController for cancellation support
    abortControllerRef.current = new AbortController();
    
    try {
      // Send POST request to fix-deals API with SSE streaming enabled
      const response = await fetch('/api/xero/fix-deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream', // Enable Server-Sent Events
        },
        body: JSON.stringify({
          tenantId,
          issues: issues.filter(issue => issue.selected !== false), // Only process selected issues
          config: {
            enableDryRun: config?.enableDryRun || false,
            batchSize: config?.batchSize || 10,
          }
        }),
        signal: abortControllerRef.current.signal // Enable cancellation
      });
      
      // Handle HTTP errors before processing stream
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Fix operation failed' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      // Set up streaming response processing
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }
      
      // Buffer for handling partial UTF-8 sequences and incomplete lines
      let buffer = '';
      
      // Main SSE processing loop - continues until stream ends or is cancelled
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode chunk with stream option to handle partial UTF-8 sequences correctly
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Split buffer into lines for processing (SSE events are line-based)
        const lines = buffer.split('\n');
        
        // Keep the last potentially incomplete line in buffer for next iteration
        buffer = lines.pop() || '';
        
        // Process each complete line
        for (const line of lines) {
          if (line.trim() === '') continue; // Skip empty lines (part of SSE spec)
          
          // Process SSE data lines (format: "data: <json>")
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim(); // Remove "data: " prefix
              if (!jsonStr || jsonStr === '[DONE]') continue; // Skip empty or completion markers
              
              const data: FixProgressUI = JSON.parse(jsonStr);
              
              // Update React state based on the event type received
              setState(prev => {
                const newState = { ...prev };
                
                switch (data.type) {
                  case 'session_started':
                    // Fix session has been created and started
                    newState.session = data.session || null;
                    newState.logs = [...prev.logs, `Fix session started: ${data.session?.id}`];
                    break;
                    
                  case 'progress':
                    // Progress update with current step and/or log message
                    if (data.step) {
                      newState.currentStep = data.step;
                      if (data.step.status === 'running' && data.step.name) {
                        newState.logs = [...prev.logs, `${data.step.name}: ${data.step.description}`];
                      }
                    }
                    if (data.log) {
                      newState.logs = [...prev.logs, data.log];
                    }
                    break;
                    
                  case 'session_completed':
                    // Fix operation has completed successfully
                    newState.isFixing = false;
                    newState.currentStep = null;
                    if (data.results) {
                      newState.results = data.results.summary;
                      newState.logs = [
                        ...prev.logs, 
                        `Fix completed: ${data.results.summary.fixedCount} fixed, ${data.results.summary.skippedCount} skipped, ${data.results.summary.failedCount} failed`
                      ];
                    }
                    break;
                    
                  case 'error':
                    // An error occurred during fix operation
                    newState.error = data.error || 'Unknown error occurred';
                    newState.isFixing = false;
                    newState.currentStep = null;
                    if (data.error) {
                      newState.logs = [...prev.logs, `Error: ${data.error}`];
                    }
                    break;
                    
                  case 'done':
                    // Stream completion marker
                    newState.isFixing = false;
                    newState.currentStep = null;
                    break;
                }
                
                return newState;
              });
            } catch (e) {
              // Log JSON parsing errors but continue processing stream
              console.error('Failed to parse SSE data:', e, 'Line:', line);
            }
          }
        }
      }
      
      // Process any remaining buffered data after stream ends
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const jsonStr = buffer.slice(6).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            const data: FixProgressUI = JSON.parse(jsonStr);
            // Handle final completion event if it was in the buffer
            if (data.type === 'session_completed' && data.results) {
              setState(prev => ({
                ...prev,
                isFixing: false,
                currentStep: null,
                results: data.results!.summary
              }));
            }
          }
        } catch (e) {
          console.error('Failed to parse final SSE data:', e);
        }
      }
    } catch (err: any) {
      // Handle errors but ignore cancellation errors (those are intentional)
      if (err.name !== 'AbortError') {
        console.error('Fix error:', err);
        setState(prev => ({
          ...prev,
          isFixing: false,
          error: err.message || 'Fix operation failed',
          currentStep: null
        }));
      }
    } finally {
      // Clean up abort controller reference
      abortControllerRef.current = null;
    }
  }, []);
  
  /**
   * Cancels the currently running fix operation
   * 
   * @description Immediately aborts the fetch request using AbortController,
   * which terminates the SSE stream and updates the state to reflect cancellation.
   * Safe to call even when no operation is running.
   * 
   * @function cancel
   * @returns {void}
   * 
   * @example
   * ```typescript
   * const fixSession = useFixSession();
   * 
   * // Start a fix operation
   * await fixSession.startFix(tenantId, issues);
   * 
   * // Cancel it if user clicks cancel button
   * fixSession.cancel();
   * ```
   * 
   * @since 1.0.0
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      // Abort the fetch request, which will terminate the SSE stream
      abortControllerRef.current.abort();
      setState(prev => ({
        ...prev,
        isFixing: false,
        currentStep: null,
        error: 'Fix operation cancelled'
      }));
    }
  }, []);
  
  /**
   * Resets the hook state to initial values
   * 
   * @description Clears all state including session data, logs, errors, and results.
   * Useful for preparing for a new fix operation or cleaning up after viewing results.
   * Does not cancel any running operations - use cancel() first if needed.
   * 
   * @function reset
   * @returns {void}
   * 
   * @example
   * ```typescript
   * const fixSession = useFixSession();
   * 
   * // After viewing results, reset for next operation
   * fixSession.reset();
   * 
   * // Or reset after cancelling an operation
   * fixSession.cancel();
   * fixSession.reset();
   * ```
   * 
   * @since 1.0.0
   */
  const reset = useCallback(() => {
    setState({
      isFixing: false,
      session: null,
      logs: [],
      error: null,
      results: null,
      currentStep: null
    });
  }, []);
  
  return {
    ...state,
    startFix,
    cancel,
    reset
  };
}