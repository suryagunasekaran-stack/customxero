import { ensureValidToken } from './ensureXeroToken';
import { trackXeroApiCall } from './xeroApiTracker';
import { SmartRateLimit } from './smartRateLimit';

export interface XeroProject {
  projectId: string;
  contactId?: string;
  name: string;
  currencyCode?: string;
  minutesLogged?: number;
  totalTaskAmount?: {
    currency: string;
    value: number;
  };
  totalExpenseAmount?: {
    currency: string;
    value: number;
  };
  minutesToBeInvoiced?: number;
  taskAmountToBeInvoiced?: {
    currency: string;
    value: number;
  };
  taskAmountInvoiced?: {
    currency: string;
    value: number;
  };
  expenseAmountToBeInvoiced?: {
    currency: string;
    value: number;
  };
  expenseAmountInvoiced?: {
    currency: string;
    value: number;
  };
  projectAmountInvoiced?: {
    currency: string;
    value: number;
  };
  deposit?: {
    currency: string;
    value: number;
  };
  depositApplied?: {
    currency: string;
    value: number;
  };
  creditNoteAmount?: {
    currency: string;
    value: number;
  };
  totalInvoiced?: {
    currency: string;
    value: number;
  };
  totalToBeInvoiced?: {
    currency: string;
    value: number;
  };
  estimate?: {
    currency: string;
    value: number;
  };
  status: string;
  projectCode?: string; // Extracted from name
}

export interface XeroProjectsResponse {
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    itemCount: number;
  };
  items: XeroProject[];
}

export interface ProjectDataCache {
  projects: XeroProject[];
  projectCodes: { [code: string]: XeroProject[] }; // Projects grouped by extracted code
  lastUpdated: Date;
  expiresAt: Date;
  tenantId: string;
  tenantName: string;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  projectCode?: string;
  status: string;
}

export class XeroProjectService {
  private static cache: Map<string, ProjectDataCache> = new Map();
  private static readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  static async getProjectData(forceRefresh = false): Promise<ProjectDataCache> {
    const { effective_tenant_id, available_tenants } = await ensureValidToken();
    console.log('[XeroProjectService] Getting data for tenant:', effective_tenant_id, 'forceRefresh:', forceRefresh);
    
    const cachedData = this.cache.get(effective_tenant_id);
    if (!forceRefresh && cachedData && new Date() < cachedData.expiresAt) {
      console.log('[XeroProjectService] Returning cached data with', cachedData.projects.length, 'projects');
      return cachedData;
    }

    // Find tenant name from available tenants
    const currentTenant = available_tenants.find((t: any) => t.tenantId === effective_tenant_id);
    const tenant_name = currentTenant ? currentTenant.tenantName : 'Unknown Tenant';

    console.log('[XeroProjectService] Fetching fresh project data for', tenant_name);
    const data = await this.fetchAllProjectData(effective_tenant_id, tenant_name);
    
    const cacheEntry: ProjectDataCache = {
      ...data,
      lastUpdated: new Date(),
      expiresAt: new Date(Date.now() + this.CACHE_DURATION),
      tenantId: effective_tenant_id,
      tenantName: tenant_name
    };
    
    console.log('[XeroProjectService] Caching', cacheEntry.projects.length, 'projects for tenant:', effective_tenant_id);
    this.cache.set(effective_tenant_id, cacheEntry);
    console.log('[XeroProjectService] Cache set. New cache size:', this.cache.size);
    
    return cacheEntry;
  }

  static clearCache(tenantId?: string) {
    if (tenantId) {
      console.log('[XeroProjectService] Clearing cache for tenant:', tenantId);
      this.cache.delete(tenantId);
    } else {
      console.log('[XeroProjectService] Clearing all cache');
      this.cache.clear();
    }
    console.log('[XeroProjectService] Cache size after clear:', this.cache.size);
  }

  static getCacheStatus(tenantId: string): ProjectDataCache | null {
    return this.cache.get(tenantId) || null;
  }

  static async getProjectSummaries(tenantId: string, forceRefresh: boolean = false): Promise<ProjectSummary[]> {
    const cacheKey = tenantId;
    const now = new Date();

    if (!forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (cached.expiresAt > now) {
        console.log(`[XeroProjectService] Cache hit for summaries (${cached.projects.length} projects)`);
        return cached.projects.map(p => ({
          projectId: p.projectId,
          name: p.name,
          projectCode: p.projectCode,
          status: p.status
        }));
      }
    }

    // If we need to refresh or cache is empty, fetch full data and extract summaries
    const fullData = await this.getProjectData(forceRefresh);
    return fullData.projects.map(p => ({
      projectId: p.projectId,
      name: p.name,
      projectCode: p.projectCode,
      status: p.status
    }));
  }

  private static async fetchAllProjectData(
    tenantId: string, 
    tenantName: string
  ): Promise<Omit<ProjectDataCache, 'lastUpdated' | 'expiresAt' | 'tenantId' | 'tenantName'>> {
    const { access_token } = await ensureValidToken();
    
    // Fetch all projects using the proper Xero Projects API
    const projects = await this.fetchAllProjects(access_token, tenantId);
    console.log(`[XeroProjectService] Fetched ${projects.length} projects`);
    
    // Extract project codes from names (e.g., "ED25002 - Titanic" -> "ED25002")
    projects.forEach(project => {
      project.projectCode = this.extractProjectCode(project.name);
    });
    
    // Build project code mapping (group projects by their extracted codes)
    const projectCodes = this.buildProjectCodeMapping(projects);
    
    return { projects, projectCodes };
  }

  private static extractProjectCode(projectName: string): string {
    // Extract code from names like "ED25002 - Titanic" -> "ED25002"
    const match = projectName.match(/^([A-Z0-9]+)\s*-/);
    return match ? match[1] : projectName.split(' ')[0];
  }

  private static async fetchAllProjects(accessToken: string, tenantId: string): Promise<XeroProject[]> {
    const allProjects: XeroProject[] = [];
    let page = 1;
    let hasMorePages = true;

    console.log('[XeroProjectService] Starting to fetch projects with pagination...');

    while (hasMorePages) {
      await SmartRateLimit.waitIfNeeded();
      
      // Use the proper Xero Projects API endpoint
      const url = `https://api.xero.com/projects.xro/2.0/Projects?page=${page}`;
      
      console.log(`[XeroProjectService] Fetching page ${page}: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json',
        },
      });

      await trackXeroApiCall(response.headers, tenantId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[XeroProjectService] Error fetching projects page ${page}:`, response.status, errorText);
        throw new Error(`Failed to fetch projects: ${response.status} ${errorText}`);
      }

      const data: XeroProjectsResponse = await response.json();
      console.log(`[XeroProjectService] Page ${page}: Got ${data.items.length} projects (${data.pagination.itemCount} total)`);
      
      allProjects.push(...data.items);
      
      // Check if we have more pages
      hasMorePages = page < data.pagination.pageCount;
      page++;
    }

    console.log(`[XeroProjectService] Finished fetching all projects. Total: ${allProjects.length}`);
    return allProjects;
  }

  private static buildProjectCodeMapping(projects: XeroProject[]): { [code: string]: XeroProject[] } {
    const mapping: { [code: string]: XeroProject[] } = {};
    
    projects.forEach(project => {
      const code = project.projectCode || 'UNKNOWN';
      if (!mapping[code]) {
        mapping[code] = [];
      }
      mapping[code].push(project);
    });
    
    console.log(`[XeroProjectService] Built project code mapping for ${Object.keys(mapping).length} codes`);
    return mapping;
  }

  static async getProjectByCode(projectCode: string): Promise<XeroProject[] | null> {
    const data = await this.getProjectData();
    return data.projectCodes[projectCode] || null;
  }

  static async getProjectsNeedingTasks(requiredTasks: string[]): Promise<{
    projectId: string;
    projectName: string;
    projectCode: string;
    missingTasks: string[];
  }[]> {
    // Since we're not fetching tasks anymore, we'll assume all projects need all tasks
    const data = await this.getProjectData();
    
    return data.projects.map(project => ({
      projectId: project.projectId,
      projectName: project.name,
      projectCode: project.projectCode || 'UNKNOWN',
      missingTasks: [...requiredTasks] // All tasks are "missing" since we don't fetch existing ones
    }));
  }
} 