import { ensureValidToken } from './ensureXeroToken';
import { trackXeroApiCall } from './xeroApiTracker';
import { SmartRateLimit } from './smartRateLimit';

export interface XeroProject {
  projectId: string;
  name: string;
  status: string;
  contactId?: string;
  deadlineUtc?: string;
  projectCode?: string;
}

export interface XeroTask {
  taskId: string;
  name: string;
  rate: {
    currency: string;
    value: number;
  };
  chargeType: string;
  estimateMinutes: number;
  status: string;
  projectId: string;
  totalMinutes?: number;
  totalAmount?: {
    currency: string;
    value: number;
  };
}

export interface XeroTimeEntry {
  timeEntryId: string;
  date: string;
  duration: number;
  description: string;
  userId: string;
  taskId: string;
  taskName?: string;
  projectId: string;
}

export interface ProjectCodeData {
  projects: XeroProject[];
  tasks: { [taskName: string]: { taskId: string; projectId: string; projectName: string } };
  timeEntries: { [taskName: string]: XeroTimeEntry[] };
}

export interface ProjectDataCache {
  projects: XeroProject[];
  projectTasks: { [projectId: string]: XeroTask[] };
  projectCodes: { [code: string]: ProjectCodeData };
  timeEntries: { [projectId: string]: XeroTimeEntry[] };
  lastUpdated: Date;
  expiresAt: Date;
  tenantId: string;
  tenantName: string;
}

export class XeroProjectService {
  private static cache: Map<string, ProjectDataCache> = new Map();
  private static readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
  private static readonly BATCH_SIZE = 5; // Xero's concurrent limit

  static async getProjectData(forceRefresh = false): Promise<ProjectDataCache> {
    const { effective_tenant_id, available_tenants } = await ensureValidToken();
    
    const cachedData = this.cache.get(effective_tenant_id);
    if (!forceRefresh && cachedData && new Date() < cachedData.expiresAt) {
      console.log('[XeroProjectService] Returning cached data');
      return cachedData;
    }

    // Find tenant name from available tenants
    const currentTenant = available_tenants.find((t: any) => t.tenantId === effective_tenant_id);
    const tenant_name = currentTenant ? currentTenant.tenantName : 'Unknown Tenant';

    console.log('[XeroProjectService] Fetching fresh project data');
    const data = await this.fetchAllProjectData(effective_tenant_id, tenant_name);
    
    const cacheEntry: ProjectDataCache = {
      ...data,
      lastUpdated: new Date(),
      expiresAt: new Date(Date.now() + this.CACHE_DURATION),
      tenantId: effective_tenant_id,
      tenantName: tenant_name
    };
    
    this.cache.set(effective_tenant_id, cacheEntry);
    return cacheEntry;
  }

  static clearCache(tenantId?: string) {
    if (tenantId) {
      this.cache.delete(tenantId);
    } else {
      this.cache.clear();
    }
  }

  private static async fetchAllProjectData(
    tenantId: string, 
    tenantName: string
  ): Promise<Omit<ProjectDataCache, 'lastUpdated' | 'expiresAt' | 'tenantId' | 'tenantName'>> {
    const { access_token } = await ensureValidToken();
    
    // Fetch all INPROGRESS projects
    const projects = await this.fetchAllProjects(access_token, tenantId);
    console.log(`[XeroProjectService] Fetched ${projects.length} INPROGRESS projects`);
    
    // Extract project codes
    projects.forEach(project => {
      project.projectCode = this.extractProjectCode(project.name);
    });
    
    // Batch fetch tasks for all projects
    const projectTasks = await this.batchFetchProjectTasks(projects, access_token, tenantId);
    
    // Batch fetch time entries
    const timeEntries = await this.batchFetchTimeEntries(projects, access_token, tenantId);
    
    // Build project code mapping
    const projectCodes = this.buildProjectCodeMapping(projects, projectTasks, timeEntries);
    
    return { projects, projectTasks, projectCodes, timeEntries };
  }

  private static extractProjectCode(projectName: string): string {
    const parts = projectName.split('-');
    return parts[0].trim();
  }

  private static async fetchAllProjects(accessToken: string, tenantId: string): Promise<XeroProject[]> {
    const allProjects: XeroProject[] = [];
    let page = 1;
    const pageSize = 50;
    let hasMorePages = true;

    while (hasMorePages) {
      await SmartRateLimit.waitIfNeeded();
      
      const url = `https://api.xero.com/projects.xro/2.0/projects?states=INPROGRESS&page=${page}&pageSize=${pageSize}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json',
        },
      });

      await trackXeroApiCall(response.headers, tenantId);
      SmartRateLimit.updateFromHeaders(response.headers);

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }

      const data = await response.json();

      if (data?.items?.length > 0) {
        allProjects.push(...data.items);
        if (data.items.length < pageSize) {
          hasMorePages = false;
        } else {
          page++;
        }
      } else {
        hasMorePages = false;
      }
    }

    return allProjects;
  }

  private static async batchFetchProjectTasks(
    projects: XeroProject[], 
    accessToken: string, 
    tenantId: string
  ): Promise<{ [projectId: string]: XeroTask[] }> {
    const projectTasks: { [projectId: string]: XeroTask[] } = {};
    
    // Process in batches to respect rate limits
    for (let i = 0; i < projects.length; i += this.BATCH_SIZE) {
      const batch = projects.slice(i, i + this.BATCH_SIZE);
      
      const batchPromises = batch.map(async (project) => {
        try {
          await SmartRateLimit.waitIfNeeded();
          
          const url = `https://api.xero.com/projects.xro/2.0/projects/${project.projectId}/Tasks`;
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Xero-Tenant-Id': tenantId,
              'Accept': 'application/json',
            },
          });

          await trackXeroApiCall(response.headers, tenantId);
          SmartRateLimit.updateFromHeaders(response.headers);

          if (response.ok) {
            const data = await response.json();
            projectTasks[project.projectId] = data.items || [];
          } else {
            console.error(`Failed to fetch tasks for project ${project.projectId}`);
            projectTasks[project.projectId] = [];
          }
        } catch (error) {
          console.error(`Error fetching tasks for project ${project.projectId}:`, error);
          projectTasks[project.projectId] = [];
        }
      });

      await Promise.all(batchPromises);
      
      // Brief pause between batches
      if (i + this.BATCH_SIZE < projects.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return projectTasks;
  }

  private static async batchFetchTimeEntries(
    projects: XeroProject[], 
    accessToken: string, 
    tenantId: string
  ): Promise<{ [projectId: string]: XeroTimeEntry[] }> {
    const timeEntries: { [projectId: string]: XeroTimeEntry[] } = {};
    
    // Only fetch time entries for a subset to avoid excessive API calls
    // Focus on recently active projects
    const recentProjects = projects.slice(0, 20); // Limit to 20 most recent
    
    for (let i = 0; i < recentProjects.length; i += this.BATCH_SIZE) {
      const batch = recentProjects.slice(i, i + this.BATCH_SIZE);
      
      const batchPromises = batch.map(async (project) => {
        try {
          await SmartRateLimit.waitIfNeeded();
          
          const url = `https://api.xero.com/projects.xro/2.0/Projects/${project.projectId}/Time`;
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Xero-Tenant-Id': tenantId,
              'Accept': 'application/json',
            },
          });

          await trackXeroApiCall(response.headers, tenantId);
          SmartRateLimit.updateFromHeaders(response.headers);

          if (response.ok) {
            const data = await response.json();
            timeEntries[project.projectId] = data.items || [];
          } else if (response.status !== 404) {
            console.error(`Failed to fetch time entries for project ${project.projectId}`);
          }
          timeEntries[project.projectId] = timeEntries[project.projectId] || [];
        } catch (error) {
          console.error(`Error fetching time entries for project ${project.projectId}:`, error);
          timeEntries[project.projectId] = [];
        }
      });

      await Promise.all(batchPromises);
      
      if (i + this.BATCH_SIZE < recentProjects.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return timeEntries;
  }

  private static buildProjectCodeMapping(
    projects: XeroProject[],
    projectTasks: { [projectId: string]: XeroTask[] },
    timeEntries: { [projectId: string]: XeroTimeEntry[] }
  ): { [code: string]: ProjectCodeData } {
    const mapping: { [code: string]: ProjectCodeData } = {};

    projects.forEach(project => {
      const code = project.projectCode || this.extractProjectCode(project.name);
      
      if (!mapping[code]) {
        mapping[code] = {
          projects: [],
          tasks: {},
          timeEntries: {}
        };
      }

      mapping[code].projects.push(project);

      // Add tasks
      const tasks = projectTasks[project.projectId] || [];
      tasks.forEach(task => {
        if (task.name && task.taskId) {
          mapping[code].tasks[task.name] = {
            taskId: task.taskId,
            projectId: project.projectId,
            projectName: project.name
          };
        }
      });

      // Add time entries grouped by task
      const entries = timeEntries[project.projectId] || [];
      entries.forEach(entry => {
        const taskName = this.getTaskNameFromEntry(entry, tasks);
        if (taskName) {
          if (!mapping[code].timeEntries[taskName]) {
            mapping[code].timeEntries[taskName] = [];
          }
          mapping[code].timeEntries[taskName].push({
            ...entry,
            taskName
          });
        }
      });
    });

    return mapping;
  }

  private static getTaskNameFromEntry(entry: XeroTimeEntry, tasks: XeroTask[]): string | null {
    const task = tasks.find(t => t.taskId === entry.taskId);
    return task ? task.name : null;
  }

  // Helper method to get project by code
  static async getProjectByCode(projectCode: string): Promise<ProjectCodeData | null> {
    const data = await this.getProjectData();
    return data.projectCodes[projectCode] || null;
  }

  // Helper method to check if projects have required tasks
  static async getProjectsNeedingTasks(requiredTasks: string[]): Promise<{
    projectId: string;
    projectName: string;
    projectCode: string;
    missingTasks: string[];
  }[]> {
    const data = await this.getProjectData();
    const projectsNeedingTasks: any[] = [];

    Object.entries(data.projectCodes).forEach(([code, codeData]) => {
      codeData.projects.forEach(project => {
        const projectTaskNames = (data.projectTasks[project.projectId] || []).map(t => t.name);
        const missingTasks = requiredTasks.filter(task => !projectTaskNames.includes(task));
        
        if (missingTasks.length > 0) {
          projectsNeedingTasks.push({
            projectId: project.projectId,
            projectName: project.name,
            projectCode: code,
            missingTasks
          });
        }
      });
    });

    return projectsNeedingTasks;
  }
} 