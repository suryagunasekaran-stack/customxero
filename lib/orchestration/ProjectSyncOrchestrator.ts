import {
  SyncSession,
  SyncStep,
  SyncSummary,
  PipedriveWonDeal,
  XeroProject,
  ProjectMatch,
  SyncProgressCallback,
  OrchestrationConfig,
  DEFAULT_ORCHESTRATION_CONFIG,
  ValueDiscrepancy,
} from './types';
import { createLogger, logSyncOperation } from '../logger';

export class ProjectSyncOrchestrator {
  private session: SyncSession | null = null;
  private progressCallback: SyncProgressCallback | null = null;
  private config: OrchestrationConfig;
  private logger = createLogger('ProjectSyncOrchestrator');

  constructor(config: Partial<OrchestrationConfig> = {}) {
    this.config = { ...DEFAULT_ORCHESTRATION_CONFIG, ...config };
  }

  /**
   * Set the progress callback for real-time updates
   */
  setProgressCallback(callback: SyncProgressCallback) {
    this.progressCallback = callback;
  }

  /**
   * Initialize a new sync session
   */
  initializeSession(tenantId: string, tenantName: string): SyncSession {
    this.session = {
      id: `sync_${Date.now()}`,
      tenantId,
      tenantName,
      startTime: new Date(),
      status: 'initializing',
      steps: this.createSyncSteps(),
    };
    
    this.logger.info({ 
      sessionId: this.session.id, 
      tenantId, 
      tenantName 
    }, 'Sync session initialized');
    
    logSyncOperation('initialize', 'session_start', { 
      sessionId: this.session.id, 
      tenantId, 
      tenantName 
    });
    
    return this.session;
  }

  /**
   * Create the sync steps for the workflow
   */
  private createSyncSteps(): SyncStep[] {
    return [
      {
        id: 'fetch_pipedrive',
        name: 'Fetch Pipedrive Won Deals',
        description: 'Retrieving won deals from work in progress pipeline',
        status: 'pending',
      },
      {
        id: 'fetch_xero',
        name: 'Fetch Xero Projects',
        description: 'Retrieving in-progress projects from Xero',
        status: 'pending',
      },
      {
        id: 'normalize_data',
        name: 'Normalize Data',
        description: 'Standardizing project data for comparison',
        status: 'pending',
      },
      {
        id: 'match_projects',
        name: 'Match Projects',
        description: 'Identifying matching projects between systems',
        status: 'pending',
      },
      {
        id: 'compare_values',
        name: 'Compare Project Values',
        description: 'Analyzing financial discrepancies',
        status: 'pending',
      },
      {
        id: 'generate_summary',
        name: 'Generate Summary',
        description: 'Creating comprehensive analysis report',
        status: 'pending',
      },
    ];
  }

  /**
   * Execute the complete sync workflow
   */
  async executeSyncWorkflow(
    fetchPipedriveProjects: () => Promise<any[]>,
    fetchXeroProjects: () => Promise<any[]>
  ): Promise<SyncSession> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    try {
      this.session.status = 'running';
      this.logger.info({ sessionId: this.session.id }, 'Starting sync workflow execution');

      // Step 1: Fetch Pipedrive Won Deals
      const pipedriveDeals = await this.executeStep(
        'fetch_pipedrive',
        async () => {
          try {
            const deals = await fetchPipedriveProjects();
            // Deals are already filtered for won status in the component
            return this.transformPipedriveDeals(deals);
          } catch (error) {
            // Check if Pipedrive is disabled
            if ((error as Error).message.includes('PIPEDRIVE_DISABLED')) {
              this.updateStep('fetch_pipedrive', {
                status: 'skipped',
                result: [],
                error: 'Pipedrive integration is disabled for this organization',
              });
              return [];
            }
            throw error;
          }
        }
      );

      // Step 2: Fetch Xero Projects
      const xeroProjects = await this.executeStep(
        'fetch_xero',
        async () => {
          const projects = await fetchXeroProjects();
          return this.transformXeroProjects(projects);
        }
      );

      // Step 3: Normalize Data
      await this.executeStep('normalize_data', async () => {
        // Data is already normalized in transform functions
        return { pipedriveCount: pipedriveDeals.length, xeroCount: xeroProjects.length };
      });

      // Step 4: Match Projects
      const matches = await this.executeStep(
        'match_projects',
        async () => this.matchProjects(pipedriveDeals, xeroProjects)
      );

      // Step 5: Compare Values
      const valueDiscrepancies = await this.executeStep(
        'compare_values',
        async () => this.compareProjectValues(matches)
      );

      // Step 6: Generate Summary
      const summary = await this.executeStep(
        'generate_summary',
        async () => this.generateSummary(pipedriveDeals, xeroProjects, matches, valueDiscrepancies)
      );

      // Complete session
      this.session.endTime = new Date();
      this.session.status = 'completed';
      this.session.summary = summary;

      this.logger.info({ 
        sessionId: this.session.id,
        duration: this.session.endTime.getTime() - this.session.startTime.getTime(),
        summary: {
          matched: summary.matchedCount,
          unmatchedPipedrive: summary.unmatchedPipedriveCount,
          unmatchedXero: summary.unmatchedXeroCount,
          valueDiscrepancies: summary.valueDiscrepancies.length
        }
      }, 'Sync workflow completed successfully');

      logSyncOperation('complete', 'session_end', { 
        sessionId: this.session.id,
        status: 'success',
        summary
      });

      return this.session;
    } catch (error) {
      if (this.session) {
        this.session.status = 'failed';
        this.session.error = (error as Error).message;
        this.session.endTime = new Date();
      }
      
      this.logger.error({ 
        sessionId: this.session?.id,
        error: (error as Error).message 
      }, 'Sync workflow failed');
      
      logSyncOperation('error', 'session_failed', { 
        sessionId: this.session?.id,
        error: (error as Error).message
      }, error as Error);
      
      throw error;
    }
  }

  /**
   * Execute a single step with progress tracking
   */
  private async executeStep<T>(stepId: string, executor: () => Promise<T>): Promise<T> {
    const step = this.session?.steps.find(s => s.id === stepId);
    if (!step) throw new Error(`Step ${stepId} not found`);

    try {
      this.updateStep(stepId, { status: 'running', startTime: new Date() });
      this.logger.debug({ stepId, stepName: step.name }, 'Executing sync step');
      
      const result = await executor();
      
      const endTime = new Date();
      const duration = step.startTime ? endTime.getTime() - new Date(step.startTime).getTime() : 0;
      
      this.updateStep(stepId, {
        status: 'completed',
        endTime,
        result,
        progress: 100,
      });
      
      this.logger.debug({ 
        stepId, 
        stepName: step.name, 
        duration 
      }, 'Sync step completed');

      return result;
    } catch (error) {
      this.updateStep(stepId, {
        status: 'error',
        error: (error as Error).message,
        endTime: new Date(),
      });
      
      this.logger.error({ 
        stepId, 
        stepName: step.name, 
        error: (error as Error).message 
      }, 'Sync step failed');
      
      throw error;
    }
  }

  /**
   * Update a step and notify progress callback
   */
  private updateStep(stepId: string, updates: Partial<SyncStep>) {
    if (!this.session) return;

    const stepIndex = this.session.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return;

    this.session.steps[stepIndex] = {
      ...this.session.steps[stepIndex],
      ...updates,
    };

    if (this.progressCallback) {
      this.progressCallback(this.session.steps[stepIndex]);
    }
  }

  /**
   * Transform Pipedrive deals to standard format
   */
  private transformPipedriveDeals(deals: any[]): PipedriveWonDeal[] {
    console.log('Raw Pipedrive deals to transform:', deals.slice(0, 2));
    
    const transformed = deals
      .filter(deal => deal && deal.id) // Filter out invalid deals
      .map(deal => {
        const result = {
          id: String(deal.id),
          title: deal.name || deal.title || '', // API returns 'name' field
          value: parseFloat(deal.value) || 0,
          currency: deal.currency || 'USD',
          won_time: deal.won_time || deal.add_time || '',
          status: deal.status || 'won',
          pipeline_id: deal.pipeline_id || 0,
          pipeline_name: deal.pipeline_name || '',
          org_name: deal.org_name || '',
          person_name: deal.person_name || '',
          custom_fields: deal.custom_fields || {},
          stage_name: deal.stage_name || '',
        };
        
        if (!result.title) {
          console.warn('Deal missing title:', deal);
        }
        
        return result;
      });
      
    console.log('Transformed Pipedrive deals:', transformed.slice(0, 2));
    return transformed;
  }

  /**
   * Transform Xero projects to standard format
   */
  private transformXeroProjects(projects: any[]): XeroProject[] {
    return projects
      .filter(project => project && project.projectId) // Filter out invalid projects
      .map(project => ({
        projectId: project.projectId || '',
        name: project.name || '',
        contactId: project.contactId || '',
        contactName: project.contactName || '',
        startDate: project.startDate || '',
        deadlineDate: project.deadlineDate,
        status: project.status || 'INPROGRESS',
        totalTaskAmount: project.totalTaskAmount,
        totalExpenseAmount: project.totalExpenseAmount,
        totalAmount: project.totalAmount || {
          value: (project.totalTaskAmount?.value || 0) + (project.totalExpenseAmount?.value || 0),
          currency: project.totalTaskAmount?.currency || 'USD',
        },
        estimate: project.estimate,
      }));
  }

  /**
   * Match projects between Pipedrive and Xero
   */
  private matchProjects(
    pipedriveDeals: PipedriveWonDeal[],
    xeroProjects: XeroProject[]
  ): ProjectMatch[] {
    const matches: ProjectMatch[] = [];
    const matchedXeroIds = new Set<string>();

    // Create a map of Xero projects by normalized keys for faster lookup
    const xeroProjectMap = new Map<string, XeroProject[]>();
    for (const xeroProject of xeroProjects) {
      if (!xeroProject.name) {
        this.logger.warn({ projectId: xeroProject.projectId }, 'Skipping Xero project with no name');
        continue;
      }
      
      const xeroKey = this.generateProjectKey(xeroProject.name);
      if (!xeroKey) continue;
      
      if (!xeroProjectMap.has(xeroKey)) {
        xeroProjectMap.set(xeroKey, []);
      }
      xeroProjectMap.get(xeroKey)!.push(xeroProject);
    }

    // Try to match each Pipedrive deal
    for (const pipedriveDeal of pipedriveDeals) {
      // Skip if deal has no title
      if (!pipedriveDeal.title) {
        this.logger.warn({ dealId: pipedriveDeal.id }, 'Skipping Pipedrive deal with no title');
        continue;
      }
      
      const pipedriveKey = this.generateProjectKey(pipedriveDeal.title);
      if (!pipedriveKey) continue;
      
      // Look for exact key match only
      const matchingXeroProjects = xeroProjectMap.get(pipedriveKey) || [];
      
      // Take the first unmatched Xero project with the same key
      for (const xeroProject of matchingXeroProjects) {
        if (!matchedXeroIds.has(xeroProject.projectId)) {
          matchedXeroIds.add(xeroProject.projectId);
          
          const valueMatch = this.checkValueMatch(
            pipedriveDeal.value,
            xeroProject.totalAmount?.value || 0
          );

          matches.push({
            pipedriveProject: pipedriveDeal,
            xeroProject: xeroProject,
            matchKey: pipedriveKey,
            valueMatch,
            valueDifference: Math.abs(pipedriveDeal.value - (xeroProject.totalAmount?.value || 0)),
            valueDifferencePercentage: this.calculateDifferencePercentage(
              pipedriveDeal.value,
              xeroProject.totalAmount?.value || 0
            ),
          });
          break; // Found a match, move to next Pipedrive deal
        }
      }
    }

    // Log sample keys for debugging
    const samplePipedriveKeys = pipedriveDeals.slice(0, 5).map(d => ({
      title: d.title,
      key: this.generateProjectKey(d.title)
    }));
    const sampleXeroKeys = xeroProjects.slice(0, 5).map(p => ({
      name: p.name,
      key: this.generateProjectKey(p.name)
    }));
    
    console.log('Sample Pipedrive keys:', samplePipedriveKeys);
    console.log('Sample Xero keys:', sampleXeroKeys);
    
    this.logger.info({ 
      totalPipedrive: pipedriveDeals.length,
      totalXero: xeroProjects.length,
      matched: matches.length,
      samplePipedriveKeys,
      sampleXeroKeys
    }, 'Project matching completed');

    return matches;
  }


  /**
   * Generate a normalized key for project matching
   * Made public so it can be used for reporting
   */
  public generateProjectKey(name: string | undefined | null): string {
    // Handle undefined or null names
    if (!name || typeof name !== 'string') {
      this.logger.warn({ name }, 'Invalid project name provided for key generation');
      return '';
    }
    
    // Remove (2) or any number in parentheses at the end
    const cleanName = name.replace(/\s*\(\d+\)\s*$/, '').trim();
    
    // Try multiple matching strategies
    
    // Strategy 1: Look for pattern like "MES241058 - London Voyager" or "ED255007-vessel"
    // Match prefix (letters) followed by numbers, then extract the rest
    const projectCodeMatch = cleanName.match(/^([A-Z]+\d+)\s*[-\s]+\s*(.+)$/i);
    if (projectCodeMatch) {
      const code = projectCodeMatch[1].toLowerCase(); // e.g., "mes241058"
      const projectName = projectCodeMatch[2]
        .trim()
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+/g, ''); // e.g., "londonvoyager"
      return `${code}-${projectName}`;
    }
    
    // Strategy 1b: Handle patterns without separator (e.g., "ED255007vessel")
    const compactMatch = cleanName.match(/^([A-Z]+\d+)([A-Za-z].*)$/);
    if (compactMatch) {
      const code = compactMatch[1].toLowerCase();
      const projectName = compactMatch[2]
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+/g, '');
      return `${code}-${projectName}`;
    }
    
    // Strategy 2: Try to match common patterns (e.g., project numbers, client names)
    // Look for patterns like "Project-123" or "CLIENT-ProjectName"
    const projectNumberMatch = cleanName.match(/(?:project|job|client)?[\s-]*(\d{3,})/i);
    if (projectNumberMatch) {
      const number = projectNumberMatch[1];
      const remainingName = cleanName
        .replace(projectNumberMatch[0], '')
        .replace(/[-\s]+/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
      return `${number}-${remainingName}`;
    }
    
    // Strategy 3: Normalize entire name for fuzzy matching
    return cleanName
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, '') // Remove all non-alphanumeric
      .trim();
  }

  /**
   * Check if values match within tolerance
   */
  private checkValueMatch(value1: number, value2: number): boolean {
    if (value1 === value2) return true;
    
    const difference = Math.abs(value1 - value2);
    const average = (value1 + value2) / 2;
    const percentageDiff = (difference / average) * 100;
    
    return percentageDiff <= this.config.valueTolerancePercentage;
  }

  /**
   * Calculate percentage difference between values
   */
  private calculateDifferencePercentage(value1: number, value2: number): number {
    if (value1 === 0 && value2 === 0) return 0;
    const average = (value1 + value2) / 2;
    if (average === 0) return 100;
    return (Math.abs(value1 - value2) / average) * 100;
  }

  /**
   * Compare project values and identify discrepancies
   */
  private compareProjectValues(matches: ProjectMatch[]): ValueDiscrepancy[] {
    const discrepancies: ValueDiscrepancy[] = [];

    for (const match of matches) {
      if (!match.valueMatch && this.config.enableValueComparison) {
        discrepancies.push({
          projectName: match.xeroProject.name,
          projectKey: match.matchKey,
          pipedriveValue: match.pipedriveProject.value,
          xeroValue: match.xeroProject.totalAmount?.value || 0,
          difference: match.valueDifference || 0,
          differencePercentage: match.valueDifferencePercentage || 0,
        });
      }
    }

    return discrepancies;
  }

  /**
   * Generate comprehensive summary
   */
  private generateSummary(
    pipedriveDeals: PipedriveWonDeal[],
    xeroProjects: XeroProject[],
    matches: ProjectMatch[],
    valueDiscrepancies: ValueDiscrepancy[]
  ): SyncSummary {
    const matchedProjectIds = new Set(matches.map(m => m.xeroProject.projectId));
    const matchedDealIds = new Set(matches.map(m => m.pipedriveProject.id));

    const unmatchedPipedriveDeals = pipedriveDeals.filter(d => !matchedDealIds.has(d.id));
    const unmatchedXeroProjects = xeroProjects.filter(p => !matchedProjectIds.has(p.projectId));
    
    // Add normalized keys to unmatched items for reporting
    const unmatchedPipedriveWithKeys = unmatchedPipedriveDeals.map(deal => ({
      ...deal,
      _normalizedKey: this.generateProjectKey(deal.title)
    }));
    
    const unmatchedXeroWithKeys = unmatchedXeroProjects.map(project => ({
      ...project,
      _normalizedKey: this.generateProjectKey(project.name)
    }));

    const recommendations: string[] = [];

    if (unmatchedPipedriveDeals.length > 0) {
      recommendations.push(`${unmatchedPipedriveDeals.length} won deals in Pipedrive need to be created as projects in Xero`);
    }

    if (unmatchedXeroProjects.length > 0) {
      recommendations.push(`${unmatchedXeroProjects.length} projects in Xero may need to be reviewed or linked to Pipedrive deals`);
    }

    if (valueDiscrepancies.length > 0) {
      recommendations.push(`${valueDiscrepancies.length} projects have value discrepancies that need reconciliation`);
    }

    if (matches.length === 0 && pipedriveDeals.length > 0 && xeroProjects.length > 0) {
      recommendations.push('No matches found - review project naming conventions in both systems');
      recommendations.push('Consider standardizing project names or using common identifiers');
    }

    if (recommendations.length === 0) {
      recommendations.push('All projects are perfectly synchronized!');
    }

    return {
      pipedriveDealsCount: pipedriveDeals.length,
      xeroProjectsCount: xeroProjects.length,
      matchedCount: matches.length,
      unmatchedPipedriveCount: unmatchedPipedriveDeals.length,
      unmatchedXeroCount: unmatchedXeroProjects.length,
      valueDiscrepancies,
      recommendations,
      rawPipedriveDeals: pipedriveDeals,
      rawXeroProjects: xeroProjects,
      matchedProjects: matches,
      unmatchedPipedriveDeals: unmatchedPipedriveWithKeys as any,
      unmatchedXeroProjects: unmatchedXeroWithKeys as any,
    };
  }

  /**
   * Get the current session
   */
  getSession(): SyncSession | null {
    return this.session;
  }

  /**
   * Cancel the current sync session
   */
  cancelSession() {
    if (this.session && this.session.status === 'running') {
      this.session.status = 'cancelled';
      this.session.endTime = new Date();
    }
  }
}