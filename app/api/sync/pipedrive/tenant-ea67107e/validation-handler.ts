import { PipedriveService } from './pipedrive-service';
import { QuoteValidationService } from './quote-validation-service';

// Custom field keys for this tenant
const QUOTE_ID_FIELD_KEY = '1f21104ccb95f5a4773ef52cd0c2cc1c78203f69';
const QUOTE_NUMBER_FIELD_KEY = 'a52165a056d57cabba309ec5e53d7a6cd47ea766';

export interface TenantValidationConfig {
  tenantId: string;
  tenantName: string;
  pipedriveApiKey: string;
  quoteIdFieldKey: string;
  quoteNumberFieldKey: string;
}

export interface ValidationProgress {
  type: 'log' | 'progress' | 'error' | 'complete';
  step?: string;
  status?: 'running' | 'completed' | 'error';
  message?: string;
  detail?: string;
  data?: any;
}

export async function validateTenantEA67107E(
  config: TenantValidationConfig,
  onProgress: (progress: ValidationProgress) => void
) {
  try {
    // Initialize services
    const pipedriveService = new PipedriveService(config.pipedriveApiKey);
    const quoteValidationService = new QuoteValidationService(
      config.quoteIdFieldKey,
      config.quoteNumberFieldKey
    );

    // Step 1: Fetch WIP pipelines
    onProgress({
      type: 'progress',
      step: 'fetch_pipelines',
      status: 'running',
      detail: 'Fetching WIP pipelines from Pipedrive'
    });

    const wipPipelines = await pipedriveService.getWIPPipelines();
    const pipelineMap = new Map(wipPipelines.map(p => [p.id, p.name]));

    onProgress({
      type: 'progress',
      step: 'fetch_pipelines',
      status: 'completed',
      detail: `Found ${wipPipelines.length} WIP pipelines: ${wipPipelines.map(p => p.name).join(', ')}`
    });

    onProgress({
      type: 'log',
      message: `WIP Pipeline IDs: ${wipPipelines.map(p => `${p.name} (ID: ${p.id})`).join(', ')}`
    });

    // Step 2: Fetch won deals from WIP pipelines
    onProgress({
      type: 'progress',
      step: 'fetch_deals',
      status: 'running',
      detail: 'Fetching won deals from WIP pipelines'
    });

    const wonDeals = await pipedriveService.getWonDealsFromWIPPipelines();

    // Count deals per pipeline
    const dealsByPipeline = new Map<number, number>();
    wonDeals.forEach(deal => {
      const count = dealsByPipeline.get(deal.pipeline_id) || 0;
      dealsByPipeline.set(deal.pipeline_id, count + 1);
    });

    const pipelineStats = Array.from(dealsByPipeline.entries())
      .map(([pipelineId, count]) => `${pipelineMap.get(pipelineId) || 'Unknown'}: ${count}`)
      .join(', ');

    onProgress({
      type: 'progress',
      step: 'fetch_deals',
      status: 'completed',
      detail: `Found ${wonDeals.length} won deals across all WIP pipelines`
    });

    onProgress({
      type: 'log',
      message: `Deals per pipeline: ${pipelineStats}`
    });

    if (wonDeals.length === 0) {
      onProgress({
        type: 'complete',
        data: {
          success: true,
          tenantId: config.tenantId,
          tenantName: config.tenantName,
          message: 'No won deals found in WIP pipelines',
          summary: {
            totalWonDeals: 0,
            dealsWithQuoteId: 0,
            dealsWithoutQuoteId: 0,
            totalValue: 0,
            currency: 'USD',
            pipelineBreakdown: {},
            issues: [],
            results: []
          }
        }
      });
      return;
    }

    // Step 3: Fetch deal details with custom fields
    onProgress({
      type: 'progress',
      step: 'fetch_details',
      status: 'running',
      detail: 'Fetching deal details with custom fields'
    });

    const dealIds = wonDeals.map(d => d.id);
    const dealDetailsMap = await pipedriveService.batchGetDealDetails(dealIds);

    // Prepare deals with pipeline names
    const dealsWithDetails = wonDeals.map(deal => {
      const details = dealDetailsMap.get(deal.id) || deal;
      const pipelineName = pipelineMap.get(deal.pipeline_id) || 'Unknown Pipeline';
      return { deal: details, pipelineName };
    });

    onProgress({
      type: 'progress',
      step: 'fetch_details',
      status: 'completed',
      detail: `Fetched details for ${dealDetailsMap.size} deals`
    });

    // Step 4: Validate deals
    onProgress({
      type: 'progress',
      step: 'validate',
      status: 'running',
      detail: 'Validating deals for quote ID presence'
    });

    const validationSummary = quoteValidationService.validateDeals(dealsWithDetails);

    onProgress({
      type: 'progress',
      step: 'validate',
      status: 'completed',
      detail: `Validation complete: ${validationSummary.dealsWithQuoteId} deals have quote IDs, ${validationSummary.dealsWithoutQuoteId} are missing`
    });

    // Step 5: Generate report
    onProgress({
      type: 'progress',
      step: 'report',
      status: 'running',
      detail: 'Generating validation report'
    });

    const report = quoteValidationService.generateReport(validationSummary);

    onProgress({
      type: 'log',
      message: report
    });

    onProgress({
      type: 'progress',
      step: 'report',
      status: 'completed',
      detail: 'Report generated successfully'
    });

    // Send final result
    onProgress({
      type: 'complete',
      data: {
        success: true,
        tenantId: config.tenantId,
        tenantName: config.tenantName,
        summary: validationSummary,
        report: report
      }
    });

  } catch (error) {
    onProgress({
      type: 'error',
      message: `Validation failed: ${(error as Error).message}`,
      data: { error: (error as Error).stack }
    });
    throw error;
  }
}

// Main entry point for the validation
export async function runValidation() {
  const config: TenantValidationConfig = {
    tenantId: 'ea67107e-c352-40a9-a8b8-24d81ae3fc85',
    tenantName: 'Tenant EA67107E',
    pipedriveApiKey: process.env.PIPEDRIVE_KEY_2 || '',
    quoteIdFieldKey: QUOTE_ID_FIELD_KEY,
    quoteNumberFieldKey: QUOTE_NUMBER_FIELD_KEY
  };

  if (!config.pipedriveApiKey) {
    throw new Error('PIPEDRIVE_KEY_2 environment variable is not set');
  }

  // For standalone execution, log to console
  await validateTenantEA67107E(config, (progress) => {
    if (progress.type === 'log') {
      console.log(progress.message);
    } else if (progress.type === 'progress') {
      console.log(`[${progress.step}] ${progress.status}: ${progress.detail}`);
    } else if (progress.type === 'error') {
      console.error('ERROR:', progress.message);
    } else if (progress.type === 'complete') {
      console.log('Validation complete:', JSON.stringify(progress.data, null, 2));
    }
  });
}