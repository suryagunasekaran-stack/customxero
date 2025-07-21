import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall, waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';
import { XeroProjectsSyncService } from './XeroProjectsSyncService';

export interface TaskUpdatePayload {
  projectId: string;
  taskId?: string;
  payload: {
    name: string;
    rate: {
      currency: string;
      value: number | string;
    };
    chargeType: string;
    estimateMinutes: number;
  };
}

export interface UpdateResult {
  projectId: string;
  taskId?: string;
  taskName: string;
  action: 'updated' | 'created';
  success: boolean;
  error?: string;
  response?: any;
  projectDetails?: {
    projectCode?: string;
    projectName?: string;
  };
}

export interface XeroUpdateSummary {
  success: boolean;
  totalAttempted: number;
  successCount: number;
  failureCount: number;
  results: UpdateResult[];
  duration: number;
}

export class XeroUpdateService {
  static async applyUpdates(
    tenantId: string,
    updates: TaskUpdatePayload[],
    creates: TaskUpdatePayload[]
  ): Promise<XeroUpdateSummary> {
    const startTime = Date.now();
    const results: UpdateResult[] = [];
    
    try {
      const { access_token } = await ensureValidToken();
      
      // Fetch all project details for better error reporting
      const projectIds = new Set([
        ...updates.map(u => u.projectId),
        ...creates.map(c => c.projectId)
      ]);
      
      const projectDetailsMap = new Map<string, { projectCode?: string; projectName?: string }>();
      
      // Fetch project details from stored data once
      try {
        const projects = await XeroProjectsSyncService.getStoredProjects(tenantId);
        
        for (const projectId of projectIds) {
          const project = projects.find(p => p.projectId === projectId);
          if (project) {
            projectDetailsMap.set(projectId, {
              projectCode: project.projectCode,
              projectName: project.projectData.name
            });
          }
        }
      } catch (error) {
        console.error('[XeroUpdateService] Error fetching project details:', error);
      }
      
      // Process updates
      for (const update of updates) {
        const result = await this.updateTask(
          access_token,
          tenantId,
          update.projectId,
          update.taskId!,
          update.payload
        );
        results.push({
          ...result,
          action: 'updated' as const,
          projectDetails: projectDetailsMap.get(update.projectId)
        });
      }
      
      // Process creates
      for (const create of creates) {
        const result = await this.createTask(
          access_token,
          tenantId,
          create.projectId,
          create.payload
        );
        results.push({
          ...result,
          action: 'created' as const,
          projectDetails: projectDetailsMap.get(create.projectId)
        });
      }
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      return {
        success: failureCount === 0,
        totalAttempted: updates.length + creates.length,
        successCount,
        failureCount,
        results,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('[XeroUpdateService] Error applying updates:', error);
      throw error;
    }
  }

  private static async updateTask(
    accessToken: string,
    tenantId: string,
    projectId: string,
    taskId: string,
    payload: TaskUpdatePayload['payload']
  ): Promise<Omit<UpdateResult, 'action'>> {
    try {
      // Wait for rate limit BEFORE making the API call
      await waitForXeroRateLimit(tenantId);
      
      const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks/${taskId}`;
      
      // Ensure rate.value is a number
      const requestBody = {
        ...payload,
        rate: {
          ...payload.rate,
          value: typeof payload.rate.value === 'string' 
            ? parseFloat(payload.rate.value) 
            : payload.rate.value
        }
      };
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      // Track the API call and update rate limit info from headers
      await trackXeroApiCall(tenantId);
      await updateXeroRateLimitFromHeaders(response.headers, tenantId);

      const responseData = await response.text();
      
      if (!response.ok) {
        console.error(`[XeroUpdateService] Failed to update task ${taskId}:`, responseData);
        
        // Try to parse error message from Xero
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(responseData);
          if (errorJson.Message) {
            errorMessage = errorJson.Message;
          } else if (errorJson.message) {
            errorMessage = errorJson.message;
          } else if (errorJson.ValidationErrors) {
            errorMessage = errorJson.ValidationErrors.map((e: any) => e.Message).join(', ');
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${responseData}`;
        }
        
        return {
          projectId,
          taskId,
          taskName: payload.name,
          success: false,
          error: errorMessage
        };
      }

      return {
        projectId,
        taskId,
        taskName: payload.name,
        success: true,
        response: responseData ? JSON.parse(responseData) : null
      };
      
    } catch (error) {
      console.error(`[XeroUpdateService] Error updating task ${taskId}:`, error);
      return {
        projectId,
        taskId,
        taskName: payload.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private static async createTask(
    accessToken: string,
    tenantId: string,
    projectId: string,
    payload: TaskUpdatePayload['payload']
  ): Promise<Omit<UpdateResult, 'action'>> {
    try {
      // Wait for rate limit BEFORE making the API call
      await waitForXeroRateLimit(tenantId);
      
      const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;
      
      // Ensure rate.value is a number
      const requestBody = {
        ...payload,
        rate: {
          ...payload.rate,
          value: typeof payload.rate.value === 'string' 
            ? parseFloat(payload.rate.value) 
            : payload.rate.value
        }
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      // Track the API call and update rate limit info from headers
      await trackXeroApiCall(tenantId);
      await updateXeroRateLimitFromHeaders(response.headers, tenantId);

      const responseData = await response.text();
      
      if (!response.ok) {
        console.error(`[XeroUpdateService] Failed to create task for project ${projectId}:`, responseData);
        
        // Try to parse error message from Xero
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(responseData);
          if (errorJson.Message) {
            errorMessage = errorJson.Message;
          } else if (errorJson.message) {
            errorMessage = errorJson.message;
          } else if (errorJson.ValidationErrors) {
            errorMessage = errorJson.ValidationErrors.map((e: any) => e.Message).join(', ');
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${responseData}`;
        }
        
        return {
          projectId,
          taskName: payload.name,
          success: false,
          error: errorMessage
        };
      }

      const parsedResponse = responseData ? JSON.parse(responseData) : null;
      
      return {
        projectId,
        taskId: parsedResponse?.taskId,
        taskName: payload.name,
        success: true,
        response: parsedResponse
      };
      
    } catch (error) {
      console.error(`[XeroUpdateService] Error creating task for project ${projectId}:`, error);
      return {
        projectId,
        taskName: payload.name,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}