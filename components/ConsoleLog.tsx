'use client';

import React, { useEffect, useRef } from 'react';
import { useLog } from '../contexts/LogContext';

const ConsoleLog = () => {
  const { logs } = useLog();
  const scrollableDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollableDivRef.current) {
      scrollableDivRef.current.scrollTop = scrollableDivRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-lg font-medium text-gray-900 mb-2">Console</h3>
      <div
        ref={scrollableDivRef}
        className="flex-grow min-h-0 bg-gray-800 text-white p-4 rounded-md shadow-inner overflow-y-auto text-sm font-mono max-h-[60vh]"
      >
        {logs.length === 0 ? (
          <p className="text-gray-400">No logs yet...</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-green-400">
                [{log.timestamp.toLocaleTimeString()}]
              </span>
              {log.source && (
                <span className="text-blue-400 ml-1">[{log.source}]</span>
              )}
              <span className="ml-2">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ConsoleLog;
