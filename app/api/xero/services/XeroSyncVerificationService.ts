import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall } from '@/lib/xeroApiTracker';
import { waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';
import clientPromise from '@/lib/mongodb';
import { XeroProjectsSyncService } from './XeroProjectsSyncService';

export interface DataMismatch {
  projectId: string;
  projectCode: string;
  projectName: string;
  taskId: string;
  taskName: string;
  field: string;
  storedValue: any;
  xeroValue: any;
  lastSyncedAt: Date;
}

export interface SyncVerificationResult {
  projectsChecked: number;
  projectsWithMismatches: number;
  totalMismatches: number;
  mismatches: DataMismatch[];
  summary: {
    rateValueMismatches: number;
    estimateMinutesMismatches: number;
    statusMismatches: number;
    otherMismatches: number;
  };
}

export class XeroSyncVerificationService {
  static async verifyProjectSync(
    tenantId: string,
    projectId: string
  ): Promise<SyncVerificationResult> {
    const mismatches: DataMismatch[] = [];
    
    try {
      const { access_token } = await ensureValidToken();
      
      // Get stored project data
      const client = await clientPromise;
      const db = client.db('customxero');
      const collectionName = `xeroProjects_${tenantId}`;
      const collection = db.collection(collectionName);
      
      const storedProject = await collection.findOne({ projectId });
      if (!storedProject) {
        throw new Error(`Project ${projectId} not found in database`);
      }
      
      // Fetch current tasks from Xero
      await waitForXeroRateLimit(tenantId);
      const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json'
        }
      });
      
      await trackXeroApiCall(tenantId);
      await updateXeroRateLimitFromHeaders(response.headers, tenantId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks from Xero: ${response.status}`);
      }
      
      const xeroResponse = await response.json();
      const xeroTasks = xeroResponse.items || [];
      
      // Create a map of Xero tasks for easy lookup
      const xeroTaskMap = new Map();
      xeroTasks.forEach((task: any) => {
        xeroTaskMap.set(task.taskId, task);
      });
      
      // Check each stored task against Xero
      for (const storedTask of storedProject.tasks || []) {
        const xeroTask = xeroTaskMap.get(storedTask.taskId);
        
        if (!xeroTask) {
          mismatches.push({
            projectId: storedProject.projectId,
            projectCode: storedProject.projectCode || '',
            projectName: storedProject.projectData?.name || '',
            taskId: storedTask.taskId,
            taskName: storedTask.name,
            field: 'existence',
            storedValue: 'exists',
            xeroValue: 'not found',
            lastSyncedAt: storedProject.lastSyncedAt
          });
          continue;
        }
        
        // Compare key fields
        const fieldsToCompare = [
          { field: 'name', stored: storedTask.name, xero: xeroTask.name },
          { field: 'rate.value', stored: storedTask.rate?.value, xero: xeroTask.rate?.value },
          { field: 'rate.currency', stored: storedTask.rate?.currency, xero: xeroTask.rate?.currency },
          { field: 'chargeType', stored: storedTask.chargeType, xero: xeroTask.chargeType },
          { field: 'status', stored: storedTask.status, xero: xeroTask.status },
          { field: 'estimateMinutes', stored: storedTask.estimateMinutes, xero: xeroTask.estimateMinutes },
          { field: 'totalAmount.value', stored: storedTask.totalAmount?.value, xero: xeroTask.totalAmount?.value }
        ];
        
        for (const { field, stored, xero } of fieldsToCompare) {
          // Handle number comparisons with tolerance for floating point
          if (typeof stored === 'number' && typeof xero === 'number') {
            if (Math.abs(stored - xero) > 0.01) {
              mismatches.push({
                projectId: storedProject.projectId,
                projectCode: storedProject.projectCode || '',
                projectName: storedProject.projectData?.name || '',
                taskId: storedTask.taskId,
                taskName: storedTask.name,
                field,
                storedValue: stored,
                xeroValue: xero,
                lastSyncedAt: storedProject.lastSyncedAt
              });
            }
          } else if (stored !== xero) {
            mismatches.push({
              projectId: storedProject.projectId,
              projectCode: storedProject.projectCode || '',
              projectName: storedProject.projectData?.name || '',
              taskId: storedTask.taskId,
              taskName: storedTask.name,
              field,
              storedValue: stored,
              xeroValue: xero,
              lastSyncedAt: storedProject.lastSyncedAt
            });
          }
        }
      }
      
      // Check for tasks in Xero that are not in stored data
      for (const [taskId, xeroTask] of xeroTaskMap) {
        const storedTask = storedProject.tasks?.find((t: any) => t.taskId === taskId);
        if (!storedTask) {
          mismatches.push({
            projectId: storedProject.projectId,
            projectCode: storedProject.projectCode || '',
            projectName: storedProject.projectData?.name || '',
            taskId: taskId,
            taskName: xeroTask.name,
            field: 'existence',
            storedValue: 'not found',
            xeroValue: 'exists',
            lastSyncedAt: storedProject.lastSyncedAt
          });
        }
      }
      
      // Categorize mismatches
      const summary = {
        rateValueMismatches: mismatches.filter(m => m.field === 'rate.value').length,
        estimateMinutesMismatches: mismatches.filter(m => m.field === 'estimateMinutes').length,
        statusMismatches: mismatches.filter(m => m.field === 'status').length,
        otherMismatches: mismatches.filter(m => 
          !['rate.value', 'estimateMinutes', 'status'].includes(m.field)
        ).length
      };
      
      return {
        projectsChecked: 1,
        projectsWithMismatches: mismatches.length > 0 ? 1 : 0,
        totalMismatches: mismatches.length,
        mismatches,
        summary
      };
      
    } catch (error) {
      console.error('[XeroSyncVerificationService] Error verifying sync:', error);
      throw error;
    }
  }
  
  static async verifyAllProjects(
    tenantId: string,
    limit: number = 10
  ): Promise<SyncVerificationResult> {
    const allMismatches: DataMismatch[] = [];
    let projectsChecked = 0;
    let projectsWithMismatches = 0;
    
    try {
      // Get all stored projects
      const projects = await XeroProjectsSyncService.getStoredProjects(tenantId);
      const projectsToCheck = projects.slice(0, limit);
      
      for (const project of projectsToCheck) {
        try {
          const result = await this.verifyProjectSync(tenantId, project.projectId);
          projectsChecked++;
          if (result.totalMismatches > 0) {
            projectsWithMismatches++;
            allMismatches.push(...result.mismatches);
          }
        } catch (error) {
          console.error(`[XeroSyncVerificationService] Error checking project ${project.projectId}:`, error);
        }
      }
      
      // Categorize all mismatches
      const summary = {
        rateValueMismatches: allMismatches.filter(m => m.field === 'rate.value').length,
        estimateMinutesMismatches: allMismatches.filter(m => m.field === 'estimateMinutes').length,
        statusMismatches: allMismatches.filter(m => m.field === 'status').length,
        otherMismatches: allMismatches.filter(m => 
          !['rate.value', 'estimateMinutes', 'status'].includes(m.field)
        ).length
      };
      
      return {
        projectsChecked,
        projectsWithMismatches,
        totalMismatches: allMismatches.length,
        mismatches: allMismatches,
        summary
      };
      
    } catch (error) {
      console.error('[XeroSyncVerificationService] Error verifying all projects:', error);
      throw error;
    }
  }
}