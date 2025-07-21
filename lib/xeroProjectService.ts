import { ensureValidToken } from './ensureXeroToken';
import { trackXeroApiCall } from './xeroApiTracker';
import { waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from './xeroApiTracker';
import { createLogger, logApiRequest } from './logger';

export interface XeroProject {
  projectId: string;
  name: string;
  projectCode?: string;
  status: string;
  estimate?: {
    currency: string;
    value: string;  // was: number
  };
  totalTaskAmount?: {
    currency: string;
    value: string;  // was: number
  };
  totalExpenseAmount?: {
    currency: string;
    value: string;  // was: number
  };
  totalInvoiced?: {
    currency: string;
    value: string;  // was: number
  };
  totalToBeInvoiced?: {
    currency: string;
    value: string;  // was: number
  };
  minutesLogged?: number;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  projectCode?: string;
  status: string;
}

export interface ProjectData {
  projects: XeroProject[];
  projectCodes: { [code: string]: XeroProject[] }; // Projects grouped by extracted code
  tenantId: string;
  tenantName: string;
}

export class XeroProjectService {
  private static logger = createLogger('XeroProjectService');
  /**
   * Gets project data directly from Xero API (no caching)
   * @param {string} [status] - Optional status filter (INPROGRESS, CLOSED)
   * @returns {Promise<ProjectData>} Complete project data
   */
  static async getProjectData(status?: string): Promise<ProjectData> {
    const { effective_tenant_id, available_tenants } = await ensureValidToken();
    
    // Find tenant name from available tenants
    const currentTenant = available_tenants.find((t: any) => t.tenantId === effective_tenant_id);
    const tenant_name = currentTenant ? currentTenant.tenantName : 'Unknown Tenant';

    const data = await this.fetchAllProjectData(effective_tenant_id, tenant_name, status);
    
    return {
      ...data,
      tenantId: effective_tenant_id,
      tenantName: tenant_name
    };
  }

  /**
   * Gets project summaries directly from Xero API (no caching)
   * @param {string} tenantId - Tenant ID to fetch projects for
   * @returns {Promise<ProjectSummary[]>} Array of project summaries
   */
  static async getProjectSummaries(tenantId: string): Promise<ProjectSummary[]> {
    const fullData = await this.getProjectData();
    return fullData.projects.map(p => ({
      projectId: p.projectId,
      name: p.name,
      projectCode: p.projectCode,
      status: p.status
    }));
  }

  private static async fetchAllProjectData(
    tenantId: string, 
    tenantName: string,
    status?: string
  ): Promise<Omit<ProjectData, 'tenantId' | 'tenantName'>> {
    const { access_token } = await ensureValidToken();
    
    // Fetch all projects using the proper Xero Projects API
    const projects = await this.fetchAllProjects(access_token, tenantId, status);
    
    // Extract project codes from names (e.g., "ED25002 - Titanic" -> "ED25002")
    projects.forEach(project => {
      project.projectCode = this.extractProjectCode(project.name);
    });
    
    // Build project code mapping (group projects by their extracted codes)
    const projectCodes = this.buildProjectCodeMapping(projects);
    
    return { projects, projectCodes };
  }

  /**
   * Fetches all projects from Xero API with pagination support
   * @param {string} accessToken - Xero access token
   * @param {string} tenantId - Xero tenant ID
   * @param {string} [status] - Optional status filter (INPROGRESS, CLOSED)
   * @returns {Promise<XeroProject[]>} Array of all projects
   */
  private static async fetchAllProjects(accessToken: string, tenantId: string, status?: string): Promise<XeroProject[]> {
    const startTime = Date.now();
    const allProjects: XeroProject[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMorePages = true;

    this.logger.info({ status: status || 'all' }, 'Starting to fetch projects');

    while (hasMorePages) {
      try {
        await waitForXeroRateLimit(tenantId);
        
        let url = `https://api.xero.com/projects.xro/2.0/Projects?page=${page}&pageSize=${pageSize}`;
        if (status) {
          url += `&status=${status}`;
        }
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json'
          }
        });

        await trackXeroApiCall(tenantId);
        await updateXeroRateLimitFromHeaders(response.headers, tenantId);

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error({ 
            page, 
            status: response.status, 
            error: errorText 
          }, 'Error fetching projects page');
          throw new Error(`Failed to fetch projects page ${page}: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const projects = data.items || [];
        
        this.logger.debug({ 
          page, 
          projectCount: projects.length 
        }, 'Fetched projects from page');
        
        allProjects.push(...projects);

        // Check if there are more pages
        hasMorePages = projects.length === pageSize;
        page++;

        // Safety check to prevent infinite loops
        if (page > 50) {
          this.logger.warn({ page }, 'Reached maximum page limit (50), stopping pagination');
          break;
        }

      } catch (error) {
        this.logger.error({ 
          page, 
          error: (error as Error).message 
        }, 'Error fetching projects page');
        throw error;
      }
    }

    this.logger.info({ 
      projectCount: allProjects.length, 
      status: status || 'all' 
    }, 'Successfully fetched all projects');
    
    logApiRequest('GET', '/projects', 200, Date.now() - startTime);
    return allProjects;
  }

  /**
   * Extracts project code from project name
   * @param {string} projectName - Full project name
   * @returns {string} Extracted project code
   */
  private static extractProjectCode(projectName: string | undefined | null): string {
    // Handle undefined or null project names
    if (!projectName || typeof projectName !== 'string') {
      return '';
    }
    
    // Common patterns for project codes:
    // 1. "NY250388 - USS SAVANNAH (LCS 28)" -> "NY250388"
    // 2. "ED25002 - Titanic" -> "ED25002"
    // 3. "ABC123: Description" -> "ABC123"
    
    const patterns = [
      /^([A-Z]{2}\d{3,6})/, // NY250388 (8 chars), ED25002 (7 chars), etc.
      /^([A-Z]{3}\d{3})/,   // ABC123, etc.
      /^([A-Z]+\d+)/,       // Any letters followed by numbers
    ];

    for (const pattern of patterns) {
      const match = projectName.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // If no pattern matches, return the first word (before any separator)
    const firstWord = projectName.split(/[\s\-_:]/)[0];
    return firstWord || projectName;
  }

  /**
   * Builds a mapping of project codes to arrays of projects
   * @param {XeroProject[]} projects - Array of projects
   * @returns {{ [code: string]: XeroProject[] }} Project code mapping
   */
  private static buildProjectCodeMapping(projects: XeroProject[]): { [code: string]: XeroProject[] } {
    const mapping: { [code: string]: XeroProject[] } = {};
    
    projects.forEach(project => {
      if (project.projectCode) {
        if (!mapping[project.projectCode]) {
          mapping[project.projectCode] = [];
        }
        mapping[project.projectCode].push(project);
      }
    });
    
    return mapping;
  }
} 