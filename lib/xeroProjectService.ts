import { ensureValidToken } from './ensureXeroToken';
import { trackXeroApiCall } from './xeroApiTracker';
import { SmartRateLimit } from './smartRateLimit';

export interface XeroProject {
  projectId: string;
  name: string;
  projectCode?: string;
  status: string;
  estimate?: {
    currency: string;
    value: number;
  };
  totalTaskAmount?: {
    currency: string;
    value: number;
  };
  totalExpenseAmount?: {
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
  /**
   * Gets project data directly from Xero API (no caching)
   * @returns {Promise<ProjectData>} Complete project data
   */
  static async getProjectData(): Promise<ProjectData> {
    const { effective_tenant_id, available_tenants } = await ensureValidToken();
    
    // Find tenant name from available tenants
    const currentTenant = available_tenants.find((t: any) => t.tenantId === effective_tenant_id);
    const tenant_name = currentTenant ? currentTenant.tenantName : 'Unknown Tenant';

    const data = await this.fetchAllProjectData(effective_tenant_id, tenant_name);
    
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
    tenantName: string
  ): Promise<Omit<ProjectData, 'tenantId' | 'tenantName'>> {
    const { access_token } = await ensureValidToken();
    
    // Fetch all projects using the proper Xero Projects API
    const projects = await this.fetchAllProjects(access_token, tenantId);
    
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
   * @returns {Promise<XeroProject[]>} Array of all projects
   */
  private static async fetchAllProjects(accessToken: string, tenantId: string): Promise<XeroProject[]> {
    const allProjects: XeroProject[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMorePages = true;

    console.log('[XeroProjectService] Starting to fetch all projects...');

    while (hasMorePages) {
      try {
        await SmartRateLimit.waitIfNeeded();
        
        const url = `https://api.xero.com/projects.xro/2.0/Projects?page=${page}&pageSize=${pageSize}`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json'
          }
        });

        await trackXeroApiCall(response.headers, tenantId);
        SmartRateLimit.updateFromHeaders(response.headers);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[XeroProjectService] Error fetching projects page ${page}:`, response.status, errorText);
          throw new Error(`Failed to fetch projects page ${page}: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const projects = data.items || [];
        
        console.log(`[XeroProjectService] Fetched ${projects.length} projects from page ${page}`);
        
        allProjects.push(...projects);

        // Check if there are more pages
        hasMorePages = projects.length === pageSize;
        page++;

        // Safety check to prevent infinite loops
        if (page > 50) {
          console.warn('[XeroProjectService] Reached maximum page limit (50), stopping pagination');
          break;
        }

      } catch (error) {
        console.error(`[XeroProjectService] Error fetching projects page ${page}:`, error);
        throw error;
      }
    }

    console.log(`[XeroProjectService] Successfully fetched ${allProjects.length} total projects`);
    return allProjects;
  }

  /**
   * Extracts project code from project name
   * @param {string} projectName - Full project name
   * @returns {string} Extracted project code
   */
  private static extractProjectCode(projectName: string): string {
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