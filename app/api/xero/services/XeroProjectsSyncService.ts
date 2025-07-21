import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall, waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';
import clientPromise from '@/lib/mongodb';
import { 
  XeroProjectResponse, 
  XeroTaskResponse, 
  XeroProjectWithTasks,
  XeroProjectsDocument,
  XeroProjectsSyncResult,
  XeroProjectsResponse,
  XeroTasksResponse
} from '@/types/xero-projects';

export class XeroProjectsSyncService {
  private static readonly COLLECTION_PREFIX = 'xeroProjects';
  private static readonly DB_NAME = 'customxero';

  private static getCollectionName(tenantId: string): string {
    // Use tenant ID as part of collection name for complete data isolation
    return `${this.COLLECTION_PREFIX}_${tenantId}`;
  }

  static async syncProjectsForTenant(tenantId: string): Promise<XeroProjectsSyncResult> {
    const startTime = Date.now();
    const errors: Array<{ projectId: string; projectName: string; error: string }> = [];
    let projectsSynced = 0;
    let projectsFailed = 0;
    let tasksSynced = 0;

    try {
      const { access_token, effective_tenant_id } = await ensureValidToken();
      
      if (effective_tenant_id !== tenantId) {
        throw new Error(`Tenant mismatch: expected ${tenantId}, got ${effective_tenant_id}`);
      }

      const projects = await this.fetchAllProjects(access_token, tenantId);
      console.log(`[XeroProjectsSyncService] Fetched ${projects.length} projects from Xero`);

      const client = await clientPromise;
      const db = client.db(this.DB_NAME);
      const collectionName = this.getCollectionName(tenantId);
      const collection = db.collection<XeroProjectsDocument>(collectionName);

      for (const project of projects) {
        try {
          const tasks = await this.fetchProjectTasks(access_token, tenantId, project.projectId);
          tasksSynced += tasks.length;

          const projectWithTasks = this.mergeProjectWithTasks(project, tasks);
          
          // Validate critical task data before storing
          const validationIssues: string[] = [];
          tasks.forEach((task, index) => {
            if (task.rate?.value === 0 && task.chargeType === 'FIXED') {
              validationIssues.push(`Task "${task.name}" has zero rate value`);
            }
            if (!task.taskId) {
              validationIssues.push(`Task at index ${index} missing taskId`);
            }
          });
          
          if (validationIssues.length > 0) {
            console.warn(`[XeroProjectsSyncService] Validation issues for project ${project.projectId} (${project.name}):`, validationIssues);
          }
          
          // Log what we're about to store for specific project
          if (project.projectId === '951dcd9c-9d36-4079-b151-00399b17efd5') {
            console.log('[XeroProjectsSyncService] STORING DATA for NY250004:');
            tasks.forEach(task => {
              console.log(`  - ${task.name}: rate=${task.rate?.value}, minutes=${task.estimateMinutes}`);
            });
          }
          
          await collection.replaceOne(
            { 
              projectId: project.projectId 
            },
            {
              projectId: project.projectId,
              lastSyncedAt: new Date(),
              projectData: project,
              tasks,
              projectCode: this.extractProjectCode(project.name),
              totalTasks: tasks.length,
              totalProjectValue: this.calculateTotalProjectValue(projectWithTasks),
              syncStatus: 'synced'
            },
            { upsert: true }
          );

          projectsSynced++;
          console.log(`[XeroProjectsSyncService] Successfully synced project ${project.projectId} with ${tasks.length} tasks`);

        } catch (error) {
          projectsFailed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          errors.push({
            projectId: project.projectId,
            projectName: project.name,
            error: errorMessage
          });
          console.error(`[XeroProjectsSyncService] Failed to sync project ${project.projectId}:`, errorMessage);
        }
      }

      await collection.createIndex({ projectId: 1 }, { unique: true });
      await collection.createIndex({ 'projectData.name': 1 });
      await collection.createIndex({ projectCode: 1 });
      await collection.createIndex({ 'projectData.status': 1 });

      const syncDuration = Date.now() - startTime;
      
      return {
        success: projectsFailed === 0,
        projectsSynced,
        projectsFailed,
        tasksSynced,
        errors,
        syncDuration,
        tenantId
      };

    } catch (error) {
      console.error('[XeroProjectsSyncService] Failed to sync projects:', error);
      throw error;
    }
  }

  private static async fetchAllProjects(
    accessToken: string, 
    tenantId: string
  ): Promise<XeroProjectResponse[]> {
    const allProjects: XeroProjectResponse[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMorePages = true;

    while (hasMorePages) {
      // Wait for rate limit BEFORE making the API call
      await waitForXeroRateLimit(tenantId);
      
      const url = `https://api.xero.com/projects.xro/2.0/Projects?page=${page}&pageSize=${pageSize}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });

      // Track the API call and update rate limit info from headers
      await trackXeroApiCall(tenantId);
      await updateXeroRateLimitFromHeaders(response.headers, tenantId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch projects page ${page}: ${response.status} ${errorText}`);
      }

      const data: XeroProjectsResponse = await response.json();
      allProjects.push(...data.items);

      hasMorePages = data.items.length === pageSize && page < 50;
      page++;
    }

    return allProjects;
  }

  private static async fetchProjectTasks(
    accessToken: string,
    tenantId: string,
    projectId: string
  ): Promise<XeroTaskResponse[]> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait for rate limit BEFORE making the API call
        await waitForXeroRateLimit(tenantId);
        
        const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          cache: 'no-store'
        });

        // Track the API call and update rate limit info from headers
        await trackXeroApiCall(tenantId);
        await updateXeroRateLimitFromHeaders(response.headers, tenantId);

        if (!response.ok) {
          if (response.status === 404) {
            return [];
          }
          const errorText = await response.text();
          throw new Error(`Failed to fetch tasks for project ${projectId}: ${response.status} ${errorText}`);
        }

        const data: XeroTasksResponse = await response.json();
        
        // Log task details for debugging
        console.log(`[XeroProjectsSyncService] Fetched ${data.items?.length || 0} tasks for project ${projectId}`);
        data.items?.forEach(task => {
          if (task.name === 'Overtime' || task.name === 'External Manpower') {
            console.log(`[XeroProjectsSyncService] Task: ${task.name}, Rate: ${task.rate?.value}, Minutes: ${task.estimateMinutes}`);
          }
        });
        
        return data.items || [];
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`[XeroProjectsSyncService] Failed to fetch tasks for project ${projectId}, attempt ${attempt}:`, lastError.message);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Failed to fetch tasks after retries');
  }

  private static mergeProjectWithTasks(
    project: XeroProjectResponse,
    tasks: XeroTaskResponse[]
  ): XeroProjectWithTasks {
    const totalProjectValue = tasks.reduce((sum, task) => sum + task.totalAmount.value, 0);
    
    return {
      ...project,
      tasks,
      projectCode: this.extractProjectCode(project.name),
      totalTasks: tasks.length,
      totalProjectValue
    };
  }

  private static extractProjectCode(projectName: string | undefined | null): string {
    if (!projectName || typeof projectName !== 'string') {
      return '';
    }
    
    const patterns = [
      /^([A-Z]{2,3}\d{3,6})/,
      /^([A-Z]+\d+)/,
    ];

    for (const pattern of patterns) {
      const match = projectName.match(pattern);
      if (match) {
        return match[1];
      }
    }

    const firstWord = projectName.split(/[\s\-_:]/)[0];
    return firstWord || projectName;
  }

  private static calculateTotalProjectValue(project: XeroProjectWithTasks): number {
    return project.totalTaskAmount.value + project.totalExpenseAmount.value;
  }

  static async getStoredProjects(tenantId: string): Promise<XeroProjectsDocument[]> {
    const client = await clientPromise;
    const db = client.db(this.DB_NAME);
    const collectionName = this.getCollectionName(tenantId);
    const collection = db.collection<XeroProjectsDocument>(collectionName);
    
    return await collection.find({}).toArray();
  }

  static async getProjectByCode(tenantId: string, projectCode: string): Promise<XeroProjectsDocument | null> {
    const client = await clientPromise;
    const db = client.db(this.DB_NAME);
    const collectionName = this.getCollectionName(tenantId);
    const collection = db.collection<XeroProjectsDocument>(collectionName);
    
    return await collection.findOne({ projectCode });
  }

  static async getLastSyncInfo(tenantId: string): Promise<{ lastSyncedAt: Date | null; projectCount: number }> {
    const client = await clientPromise;
    const db = client.db(this.DB_NAME);
    const collectionName = this.getCollectionName(tenantId);
    const collection = db.collection<XeroProjectsDocument>(collectionName);
    
    const lastSynced = await collection.findOne(
      {},
      { sort: { lastSyncedAt: -1 }, projection: { lastSyncedAt: 1 } }
    );
    
    const projectCount = await collection.countDocuments({});
    
    return {
      lastSyncedAt: lastSynced?.lastSyncedAt || null,
      projectCount
    };
  }
}