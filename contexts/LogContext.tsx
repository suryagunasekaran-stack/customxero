'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface LogEntry {
  message: string;
  timestamp: Date;
  source?: string;
}

interface LogContextType {
  logs: LogEntry[];
  addLog: (message: string, source?: string) => void;
}

const LogContext = createContext<LogContextType | undefined>(undefined);

export const LogProvider = ({ children }: { children: ReactNode }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (message: string, source?: string) => {
    setLogs((prevLogs) => [
      ...prevLogs,
      { message, timestamp: new Date(), source },
    ]);
  };

  return (
    <LogContext.Provider value={{ logs, addLog }}>
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
