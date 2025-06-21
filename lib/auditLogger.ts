import { createServerClient } from './supabase';
import { Session } from 'next-auth';
import { NextRequest } from 'next/server';

export type ActionGroup = 'TIMESHEET_PROCESSING' | 'PROJECT_SYNC';
export type ActionType = 
  | 'TIMESHEET_UPLOAD' 
  | 'TIMESHEET_PROCESS' 
  | 'PROJECT_UPDATE' 
  | 'PROJECT_SYNC'
  | 'PROJECT_SYNC_COMPLETE';
export type LogStatus = 'SUCCESS' | 'FAILURE' | 'IN_PROGRESS';

export interface AuditLogEntry {
  id?: string;
  user_id: string;
  user_name?: string;
  tenant_id: string;
  tenant_name?: string;
  action_group: ActionGroup;
  action_type: ActionType;
  status: LogStatus;
  details?: any;
  error_message?: string;
  execution_time_ms?: number;
  ip_address?: string;
  user_agent?: string;
  created_at?: Date;
  completed_at?: Date;
}

export interface LogActionParams {
  actionType: ActionType;
  status: LogStatus;
  details?: any;
  errorMessage?: string;
  executionTimeMs?: number;
  req?: NextRequest;
}

/**
 * Audit Logger class for tracking user actions and system operations
 * Provides methods to log actions to Supabase with proper error handling
 */
export class AuditLogger {
  private supabase;
  private session: Session | null;
  private tenantId: string;
  private tenantName?: string;

  constructor(session: Session | null, tenantId: string, tenantName?: string) {
    this.supabase = createServerClient();
    this.session = session;
    this.tenantId = tenantId;
    this.tenantName = tenantName;
  }

  /**
   * Determines the action group based on action type
   */
  private getActionGroup(actionType: ActionType): ActionGroup {
    if (['TIMESHEET_UPLOAD', 'TIMESHEET_PROCESS', 'PROJECT_UPDATE'].includes(actionType)) {
      return 'TIMESHEET_PROCESSING';
    }
    return 'PROJECT_SYNC';
  }

  /**
   * Extracts IP address from request
   */
  private getIpAddress(req?: NextRequest): string | undefined {
    if (!req) return undefined;
    
    // Try various headers that might contain the real IP
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    
    return req.headers.get('x-real-ip') || undefined;
  }

  /**
   * Logs an action to the audit table
   */
  async logAction(params: LogActionParams): Promise<string | null> {
    try {
      const logEntry: Partial<AuditLogEntry> = {
        user_id: this.session?.user?.email || 'system',
        user_name: this.session?.user?.name || this.session?.user?.email || 'System',
        tenant_id: this.tenantId,
        tenant_name: this.tenantName,
        action_group: this.getActionGroup(params.actionType),
        action_type: params.actionType,
        status: params.status,
        details: params.details,
        error_message: params.errorMessage,
        execution_time_ms: params.executionTimeMs,
        ip_address: this.getIpAddress(params.req),
        user_agent: params.req?.headers.get('user-agent') || undefined,
        created_at: new Date(),
        completed_at: params.status !== 'IN_PROGRESS' ? new Date() : undefined,
      };

      const { data, error } = await this.supabase
        .from('audit_logs')
        .insert(logEntry)
        .select('id')
        .single();

      if (error) {
        console.error('[AuditLogger] Failed to insert log:', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error('[AuditLogger] Error logging action:', error);
      return null;
    }
  }

  /**
   * Starts a new log entry for an action that might take time
   */
  async startAction(actionType: ActionType, details?: any, req?: NextRequest): Promise<string | null> {
    return this.logAction({
      actionType,
      status: 'IN_PROGRESS',
      details,
      req,
    });
  }

  /**
   * Completes a previously started log entry
   */
  async completeAction(
    logId: string, 
    status: 'SUCCESS' | 'FAILURE', 
    additionalDetails?: any,
    errorMessage?: string,
    executionTimeMs?: number
  ): Promise<boolean> {
    try {
      // First get existing details if we need to merge
      let finalDetails = additionalDetails;
      if (additionalDetails) {
        const { data: existingLog } = await this.supabase
          .from('audit_logs')
          .select('details')
          .eq('id', logId)
          .single();
        
        if (existingLog?.details) {
          finalDetails = { ...existingLog.details, ...additionalDetails };
        }
      }

      const { error } = await this.supabase
        .from('audit_logs')
        .update({
          status,
          completed_at: new Date(),
          execution_time_ms: executionTimeMs,
          error_message: errorMessage,
          details: finalDetails,
        })
        .eq('id', logId);

      if (error) {
        console.error('[AuditLogger] Failed to update log:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AuditLogger] Error completing action:', error);
      return false;
    }
  }

  /**
   * Quick method to log a successful action
   */
  async logSuccess(actionType: ActionType, details?: any, req?: NextRequest): Promise<string | null> {
    return this.logAction({
      actionType,
      status: 'SUCCESS',
      details,
      req,
    });
  }

  /**
   * Quick method to log a failed action
   */
  async logFailure(
    actionType: ActionType, 
    error: Error | string, 
    details?: any, 
    req?: NextRequest
  ): Promise<string | null> {
    return this.logAction({
      actionType,
      status: 'FAILURE',
      details,
      errorMessage: typeof error === 'string' ? error : error.message,
      req,
    });
  }

  /**
   * Static method to create an AuditLogger instance from session and tenant info
   */
  static fromSession(session: Session | null, tenantId: string, tenantName?: string): AuditLogger {
    return new AuditLogger(session, tenantId, tenantName);
  }
} 