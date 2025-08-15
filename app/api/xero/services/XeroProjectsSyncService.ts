/**
 * XeroProjectsSyncService - Handles Xero project synchronization
 */

import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall, waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';
import { logger } from '@/lib/logger';
import { MongoClient, Db, Collection } from 'mongodb';

interface XeroProject {
  projectId: string;
  name: string;
  projectCode?: string;
  status: string;
  estimate?: {
    currency: string;
    value: string;
  };
  totalTaskAmount?: {
    currency: string;
    value: string;
  };
  totalExpenseAmount?: {
    currency: string;
    value: string;
  };
  totalInvoiced?: {
    currency: string;
    value: string;
  };
  totalToBeInvoiced?: {
    currency: string;
    value: string;
  };
  minutesLogged?: number;
}

interface XeroTask {
  taskId: string;
  name: string;
  rate?: {
    currency: string;
    value: string;  // Xero returns as string
  };
  chargeType?: string;
  estimateMinutes?: number;
  status?: string;
}

interface StoredTask {
  taskId: string;
  name: string;
  rate: {
    currency: string;
    value: number;  // Store as decimal, not string
  };
  chargeType: string;
  estimateMinutes: number;
}

interface SyncResult {
  success: boolean;
  projectsSynced: number;
  projectsFailed: number;
  tasksSynced: number;
  syncDuration: number;
  message?: string;
  error?: string;
}

interface StoredProject {
  projectId: string;
  tenantId: string;
  projectCode: string;
  projectData: XeroProject;
  tasks: StoredTask[];  // Store actual tasks instead of just count
  totalProjectValue: number;
  lastSyncedAt: Date;
}


export class XeroProjectsSyncService {
  private static client: MongoClient | null = null;
  private static db: Db | null = null;
  private static projectsCollections: Map<string, Collection<StoredProject>> = new Map();


  /**
   * Initialize MongoDB connection and get tenant-specific collection
   */
  private static async initializeDb(tenantId: string): Promise<Collection<StoredProject>> {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    try {
      // Initialize client and db if not already done
      if (!this.client) {
        this.client = new MongoClient(mongoUri);
        await this.client.connect();
        logger.info('MongoDB connection initialized for XeroProjectsSyncService');
      }

      if (!this.db) {
        // Extract database name from URI or use default
        // The URI already includes the database, so we just use the default database
        this.db = this.client.db();
      }

      // Get or create tenant-specific collection
      let projectsCollection = this.projectsCollections.get(tenantId);

      if (!projectsCollection) {
        // Use tenant ID in collection name as per existing pattern
        const projectsCollectionName = `xeroProjects_${tenantId}`;
        projectsCollection = this.db.collection<StoredProject>(projectsCollectionName);
        this.projectsCollections.set(tenantId, projectsCollection);

        // Create indexes for projects collection
        await projectsCollection.createIndex({ projectId: 1 }, { unique: true });
        await projectsCollection.createIndex({ projectCode: 1 });
        await projectsCollection.createIndex({ lastSyncedAt: -1 });
        
        logger.info({ collectionName: projectsCollectionName }, 'Initialized projects collection');
      }

      return projectsCollection;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize MongoDB connection');
      throw error;
    }
  }

  /**
   * Syncs all projects for a specific tenant
   */
  static async syncProjectsForTenant(tenantId: string): Promise<SyncResult> {
    const startTime = Date.now();
    let projectsSynced = 0;
    let projectsFailed = 0;
    let tasksSynced = 0;

    try {
      // Initialize MongoDB connection and get tenant-specific collection
      const projectsCollection = await this.initializeDb(tenantId);

      const { access_token } = await ensureValidToken();
      
      // Fetch all projects from Xero
      const projects = await this.fetchAllProjects(access_token, tenantId);
      
      logger.info({ 
        tenantId, 
        projectCount: projects.length 
      }, 'Fetched projects from Xero');

      // Store projects in MongoDB
      for (const project of projects) {
        try {
          // Extract project code from name
          const projectCode = this.extractProjectCode(project.name);
          
          // Calculate total project value
          const totalProjectValue = this.calculateTotalProjectValue(project);
          
          // Fetch tasks for this project
          const xeroTasks = await this.fetchProjectTasks(access_token, tenantId, project.projectId);
          tasksSynced += xeroTasks.length;

          // Transform Xero tasks to our stored format
          const storedTasks: StoredTask[] = xeroTasks.map(task => ({
            taskId: task.taskId,
            name: task.name,
            rate: {
              currency: task.rate?.currency || project.currencyCode || 'SGD',
              value: task.rate?.value ? parseFloat(task.rate.value) : 0  // Convert string to number
            },
            chargeType: task.chargeType || 'TIME',
            estimateMinutes: task.estimateMinutes || 0
          }));

          // Store project with tasks in MongoDB
          const projectDoc: StoredProject = {
            projectId: project.projectId,
            tenantId: tenantId,
            projectCode: projectCode,
            projectData: project,
            tasks: storedTasks,  // Store actual tasks
            totalProjectValue: totalProjectValue,
            lastSyncedAt: new Date()
          };

          await projectsCollection.replaceOne(
            { projectId: project.projectId },
            projectDoc,
            { upsert: true }
          );

          projectsSynced++;

        } catch (error) {
          logger.error({ 
            projectId: project.projectId, 
            error 
          }, 'Failed to process project');
          projectsFailed++;
        }
      }

      const syncDuration = Date.now() - startTime;

      logger.info({ 
        tenantId,
        projectsSynced,
        projectsFailed,
        tasksSynced,
        syncDuration 
      }, 'Projects sync completed');

      return {
        success: true,
        projectsSynced,
        projectsFailed,
        tasksSynced,
        syncDuration,
        message: `Successfully synced ${projectsSynced} projects and ${tasksSynced} tasks`
      };

    } catch (error) {
      const syncDuration = Date.now() - startTime;
      logger.error({ 
        tenantId, 
        error 
      }, 'Failed to sync projects');

      return {
        success: false,
        projectsSynced,
        projectsFailed,
        tasksSynced,
        syncDuration,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Fetches all projects from Xero API with pagination
   */
  private static async fetchAllProjects(accessToken: string, tenantId: string): Promise<XeroProject[]> {
    const allProjects: XeroProject[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMorePages = true;

    while (hasMorePages) {
      try {
        await waitForXeroRateLimit(tenantId);
        
        const url = `https://api.xero.com/projects.xro/2.0/Projects?page=${page}&pageSize=${pageSize}`;
        
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
          throw new Error(`Failed to fetch projects: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const projects = data.items || [];
        
        allProjects.push(...projects);

        // Check if there are more pages
        hasMorePages = projects.length === pageSize;
        page++;

        // Safety check to prevent infinite loops
        if (page > 50) {
          logger.warn({ page }, 'Reached maximum page limit, stopping pagination');
          break;
        }

      } catch (error) {
        logger.error({ 
          page, 
          error 
        }, 'Error fetching projects page');
        throw error;
      }
    }

    return allProjects;
  }

  /**
   * Fetches tasks for a specific project
   */
  private static async fetchProjectTasks(
    accessToken: string, 
    tenantId: string, 
    projectId: string
  ): Promise<XeroTask[]> {
    try {
      await waitForXeroRateLimit(tenantId);
      
      const url = `https://api.xero.com/projects.xro/2.0/Projects/${projectId}/Tasks`;
      
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
        // Some projects may not have tasks, which is okay
        if (response.status === 404) {
          return [];
        }
        logger.warn({ 
          projectId, 
          status: response.status 
        }, 'Failed to fetch tasks for project');
        return [];
      }

      const data = await response.json();
      return data.items || [];

    } catch (error) {
      logger.error({ 
        projectId, 
        error 
      }, 'Error fetching project tasks');
      return [];
    }
  }

  /**
   * Extracts project code from project name
   */
  private static extractProjectCode(projectName: string | undefined | null): string {
    if (!projectName || typeof projectName !== 'string') {
      return '';
    }
    
    const patterns = [
      /^([A-Z]{2}\d{3,6})/,
      /^([A-Z]{3}\d{3})/,
      /^([A-Z]+\d+)/,
    ];

    for (const pattern of patterns) {
      const match = projectName.match(pattern);
      if (match) {
        return match[1];
      }
    }

    const firstWord = projectName.split(/[\s\-_:]/)[0];
    return firstWord || '';
  }

  /**
   * Calculates total project value
   */
  private static calculateTotalProjectValue(project: XeroProject): number {
    let total = 0;
    
    if (project.estimate?.value) {
      total += parseFloat(project.estimate.value);
    }
    
    if (project.totalInvoiced?.value) {
      total += parseFloat(project.totalInvoiced.value);
    }
    
    if (project.totalToBeInvoiced?.value) {
      total += parseFloat(project.totalToBeInvoiced.value);
    }
    
    return total;
  }

  /**
   * Gets last sync information for a tenant
   */
  static async getLastSyncInfo(tenantId: string): Promise<{
    lastSyncedAt: string | null;
    projectCount: number;
  }> {
    try {
      const projectsCollection = await this.initializeDb(tenantId);

      const lastProject = await projectsCollection
        .findOne(
          {},
          { sort: { lastSyncedAt: -1 } }
        );

      const projectCount = await projectsCollection.countDocuments({});

      return {
        lastSyncedAt: lastProject ? lastProject.lastSyncedAt.toISOString() : null,
        projectCount: projectCount
      };

    } catch (error) {
      logger.error({ tenantId, error }, 'Error getting last sync info');
      return { lastSyncedAt: null, projectCount: 0 };
    }
  }

  /**
   * Gets stored projects for a tenant
   */
  static async getStoredProjects(tenantId: string): Promise<StoredProject[]> {
    try {
      const projectsCollection = await this.initializeDb(tenantId);

      const projects = await projectsCollection
        .find({})
        .sort({ projectCode: 1 })
        .toArray();

      return projects;

    } catch (error) {
      logger.error({ tenantId, error }, 'Error getting stored projects');
      return [];
    }
  }
}