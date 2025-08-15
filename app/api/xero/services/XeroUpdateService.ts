/**
 * XeroUpdateService - Handles Xero project task updates
 */

import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall, waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';
import { logger } from '@/lib/logger';

interface TaskUpdate {
  projectId: string;
  taskId: string;
  payload: {
    name: string;
    rate: {
      currency: string;
      value: number;
    };
    chargeType: string;
    estimateMinutes: number;
  };
}

interface TaskCreate {
  projectId: string;
  payload: {
    name: string;
    rate: {
      currency: string;
      value: number;
    };
    chargeType: string;
    estimateMinutes: number;
  };
}

interface UpdateResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  results: {
    updates: Array<{
      projectId: string;
      taskId?: string;
      taskName: string;
      status: 'success' | 'failed' | 'skipped';
      error?: string;
    }>;
    creates: Array<{
      projectId: string;
      taskName: string;
      status: 'success' | 'failed' | 'skipped';
      error?: string;
    }>;
  };
  duration?: number;
}

export class XeroUpdateService {
  /**
   * Apply updates and creates to Xero
   */
  static async applyUpdates(
    tenantId: string, 
    updates: TaskUpdate[], 
    creates: TaskCreate[]
  ): Promise<UpdateResult> {
    const startTime = Date.now();
    const results: UpdateResult = {
      success: false,
      successCount: 0,
      failureCount: 0,
      results: {
        updates: [],
        creates: []
      }
    };

    try {
      // Get access token
      const { access_token } = await ensureValidToken();
      
      logger.info({
        tenantId,
        updatesCount: updates.length,
        createsCount: creates.length
      }, 'Starting Xero updates');

      // Process updates
      for (const update of updates) {
        try {
          await waitForXeroRateLimit(tenantId);
          
          const taskPayload = {
            name: update.payload.name,
            rate: {
              currency: update.payload.rate.currency,
              value: update.payload.rate.value
            },
            chargeType: update.payload.chargeType || 'TIME',
            estimateMinutes: update.payload.estimateMinutes || 0
          };

          const response = await fetch(
            `https://api.xero.com/projects.xro/2.0/projects/${update.projectId}/tasks/${update.taskId}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Xero-Tenant-Id': tenantId,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(taskPayload)
            }
          );

          await trackXeroApiCall(tenantId);
          await updateXeroRateLimitFromHeaders(response.headers, tenantId);

          if (response.ok) {
            results.successCount++;
            results.results.updates.push({
              projectId: update.projectId,
              taskId: update.taskId,
              taskName: update.payload.name,
              status: 'success'
            });
            
            logger.info({
              projectId: update.projectId,
              taskId: update.taskId,
              taskName: update.payload.name
            }, 'Task updated successfully');
          } else {
            const errorText = await response.text();
            results.failureCount++;
            results.results.updates.push({
              projectId: update.projectId,
              taskId: update.taskId,
              taskName: update.payload.name,
              status: 'failed',
              error: `${response.status}: ${errorText}`
            });
            
            logger.error({
              projectId: update.projectId,
              taskId: update.taskId,
              status: response.status,
              error: errorText
            }, 'Failed to update task');
          }
        } catch (error) {
          results.failureCount++;
          results.results.updates.push({
            projectId: update.projectId,
            taskId: update.taskId,
            taskName: update.payload.name,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          logger.error({
            projectId: update.projectId,
            taskId: update.taskId,
            error
          }, 'Error updating task');
        }
      }

      // Process creates
      for (const create of creates) {
        try {
          await waitForXeroRateLimit(tenantId);
          
          const taskPayload = {
            name: create.payload.name,
            rate: {
              currency: create.payload.rate.currency,
              value: create.payload.rate.value
            },
            chargeType: create.payload.chargeType || 'TIME',
            estimateMinutes: create.payload.estimateMinutes || 0
          };

          const response = await fetch(
            `https://api.xero.com/projects.xro/2.0/projects/${create.projectId}/tasks`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Xero-Tenant-Id': tenantId,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(taskPayload)
            }
          );

          await trackXeroApiCall(tenantId);
          await updateXeroRateLimitFromHeaders(response.headers, tenantId);

          if (response.ok) {
            results.successCount++;
            results.results.creates.push({
              projectId: create.projectId,
              taskName: create.payload.name,
              status: 'success'
            });
            
            logger.info({
              projectId: create.projectId,
              taskName: create.payload.name
            }, 'Task created successfully');
          } else {
            const errorText = await response.text();
            results.failureCount++;
            results.results.creates.push({
              projectId: create.projectId,
              taskName: create.payload.name,
              status: 'failed',
              error: `${response.status}: ${errorText}`
            });
            
            logger.error({
              projectId: create.projectId,
              status: response.status,
              error: errorText
            }, 'Failed to create task');
          }
        } catch (error) {
          results.failureCount++;
          results.results.creates.push({
            projectId: create.projectId,
            taskName: create.payload.name,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          logger.error({
            projectId: create.projectId,
            error
          }, 'Error creating task');
        }
      }

      // Set overall success
      results.success = results.failureCount === 0;
      results.duration = Date.now() - startTime;

      logger.info({
        tenantId,
        successCount: results.successCount,
        failureCount: results.failureCount,
        duration: results.duration
      }, 'Xero updates completed');

      return results;

    } catch (error) {
      logger.error({
        tenantId,
        error
      }, 'Fatal error in XeroUpdateService');

      results.success = false;
      results.duration = Date.now() - startTime;
      
      return results;
    }
  }
}