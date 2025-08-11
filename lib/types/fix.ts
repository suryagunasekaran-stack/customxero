/**
 * @fileoverview TypeScript interfaces and type definitions for the fix UI functionality
 * @module lib/types/fix
 * @description Provides comprehensive type definitions for the deal fix feature including
 * validation issue extensions, session management, progress tracking, and UI state management.
 * These types support the fix orchestration system with real-time updates via Server-Sent Events.
 * @since 1.0.0
 */

import { ValidationIssue as BaseValidationIssue } from './validation';

/**
 * Extended validation issue interface for UI display and user interaction
 */
export interface FixValidationIssue extends BaseValidationIssue {
  selected?: boolean;
  category?: 'title' | 'pipeline' | 'quote' | 'other';
  id?: string;
}

/**
 * Base fix session interface
 */
export interface FixSessionUI {
  id: string;
  tenantId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  currentStep?: FixStep;
  logs: string[];
  progressPercentage: number;
}

/**
 * Fix step interface
 */
export interface FixStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  progress?: number;
  result?: any;
  error?: string;
}

/**
 * Fix result interface
 */
export interface FixResult {
  issueCode: string;
  dealId: number;
  originalTitle: string;
  newTitle?: string;
  status: 'fixed' | 'skipped' | 'failed';
  error?: string;
  timestamp: Date;
}

/**
 * Fix summary interface
 */
export interface FixSummary {
  totalIssues: number;
  fixableIssues: number;
  fixedCount: number;
  skippedCount: number;
  failedCount: number;
  duration: number;
  fixResults: FixResult[];
  recommendations: string[];
}

/**
 * Fix progress update interface for SSE communication
 */
export interface FixProgressUI {
  type: 'session_started' | 'progress' | 'session_completed' | 'error' | 'done';
  session?: FixSessionUI;
  step?: FixStep;
  log?: string;
  error?: string;
  results?: {
    summary: FixSummary;
    fixResults: FixResult[];
  };
}

/**
 * Fix confirmation dialog data interface
 */
export interface FixConfirmationData {
  issues: FixValidationIssue[];
  tenantId: string;
  issuesByCategory: {
    title: FixValidationIssue[];
    pipeline: FixValidationIssue[];
    quote: FixValidationIssue[];
    other: FixValidationIssue[];
  };
  totalCount: number;
  errorCount: number;
  warningCount: number;
}

/**
 * Fix configuration options for UI operations
 */
export interface FixConfigUI {
  enableDryRun?: boolean;
  batchSize?: number;
  selectedIssues?: string[];
}

/**
 * Hook state interface for fix session management
 */
export interface UseFixSessionState {
  isFixing: boolean;
  session: FixSessionUI | null;
  logs: string[];
  error: string | null;
  results: FixSummary | null;
  currentStep: FixStep | null;
}

/**
 * Hook actions interface for fix session management
 */
export interface UseFixSessionActions {
  startFix: (tenantId: string, issues: FixValidationIssue[], config?: FixConfigUI) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

/**
 * Combined hook return type interface
 */
export interface UseFixSessionReturn extends UseFixSessionState, UseFixSessionActions {}