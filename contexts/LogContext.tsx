'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface LogEntry {
  id: string;
  timestamp: Date;
  source: string;
  message: string;
}

interface AddLogOptions {
  message: string;
  source?: string; // Required if idToUpdate is not provided
  idToUpdate?: string;
  mode?: 'append' | 'replace'; // Default to 'append' if idToUpdate is provided
}

export interface LogContextType {
  logs: LogEntry[];
  addLog: (options: AddLogOptions) => string; // Returns the ID of the log
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export const LogProvider = ({ children }: { children: ReactNode }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  /**
   * Adds a new log entry or updates an existing one
   * @param {AddLogOptions} options - Log options including message, source, and update mode
   * @param {string} options.message - Log message content
   * @param {string} [options.source] - Log source identifier (required for new logs)
   * @param {string} [options.idToUpdate] - ID of existing log to update
   * @param {'append' | 'replace'} [options.mode='append'] - Update mode for existing logs
   * @returns {string} ID of the log entry (new or updated)
   */
  const addLog = useCallback((options: AddLogOptions) => {
    const { message, source, idToUpdate, mode = 'append' } = options;

    if (idToUpdate) {
      let found = false;
      setLogs(prevLogs => {
        const newLogs = prevLogs.map(log => {
          if (log.id === idToUpdate) {
            found = true;
            const newMessage = mode === 'replace' ? message : log.message + message;
            return { ...log, message: newMessage }; // Keep original timestamp, source, id
          }
          return log;
        });
        if (!found) {
          console.warn(`[LogContext] addLog: Attempted to update non-existent log ID: ${idToUpdate}. Message: "${message}"`);
          // Optionally, create a new log here if the ID to update wasn't found,
          // though this might indicate a logic error in the calling code.
          // For now, it fails to update silently if ID not found, returning the original idToUpdate.
        }
        return newLogs;
      });
      return idToUpdate;
    } else {
      if (!source) {
        console.error("[LogContext] addLog: Log source is required for new log entries.");
        // Return a dummy ID or throw error to indicate failure
        return `error-no-source-${Date.now().toString()}`;
      }
      const newLogEntry: LogEntry = {
        id: Date.now().toString() + Math.random().toString(), // Unique ID for new logs
        timestamp: new Date(),
        source: source,
        message: message,
      };
      setLogs(prevLogs => [...prevLogs, newLogEntry]);
      return newLogEntry.id;
    }
  }, []);

  /**
   * Clears all log entries from the log history
   * @returns {void}
   */
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
};

export const useLog = () => {
  const context = useContext(LogContext);
  if (context === undefined) {
    throw new Error('useLog must be used within a LogProvider');
  }
  return context;
};
