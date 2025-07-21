import { PipedriveServiceV2 } from './pipedrive-service-v2';
import { QuoteValidationService } from './quote-validation-service';

// Custom field keys for this tenant
const QUOTE_ID_FIELD_KEY = '1f21104ccb95f5a4773ef52cd0c2cc1c78203f69';
const QUOTE_NUMBER_FIELD_KEY = 'a52165a056d57cabba309ec5e53d7a6cd47ea766';

export interface TenantValidationConfig {
  tenantId: string;
  tenantName: string;
  pipedriveApiKey: string;
  pipedriveCompanyDomain: string;
  quoteIdFieldKey: string;
  quoteNumberFieldKey: string;
}

export interface ValidationProgress {
  type: 'log' | 'progress' | 'error' | 'complete' | 'pipeline_progress';
  step?: string;
  status?: 'running' | 'completed' | 'error';
  message?: string;
  detail?: string;
  data?: any;
  pipelineId?: number;
  pipelineName?: string;
}

export async function validateTenantEA67107EV2(
  config: TenantValidationConfig,
  onProgress: (progress: ValidationProgress) => void
) {
  try {
    // Initialize services
    const pipedriveService = new PipedriveServiceV2(config.pipedriveApiKey, config.pipedriveCompanyDomain);
    const quoteValidationService = new QuoteValidationService(
      config.quoteIdFieldKey,
      config.quoteNumberFieldKey
    );

    onProgress({
      type: 'log',
      message: 'Starting Project Sync Validation for tenant EA67107E'
    });

    const pipelineNames = pipedriveService.getPipelineNames();
    const pipelineIds = pipedriveService.getWIPPipelineIds();
    
    onProgress({
      type: 'log',
      message: `Will process ${pipelineIds.length} WIP pipelines: ${pipelineIds.map(id => pipelineNames[id]).join(', ')}`
    });

    // Process each pipeline one by one
    const allResults: any[] = [];
    const pipelineBreakdown: any = {};
    let totalDeals = 0;
    let totalDealsWithQuoteId = 0;
    let totalDealsWithoutQuoteId = 0;
    let totalValue = 0;

    const dealsByPipeline = await pipedriveService.processAllWIPPipelines(
      (pipelineId, pipelineName, status, deals) => {
        if (status === 'fetching') {
          onProgress({
            type: 'pipeline_progress',
            pipelineId,
            pipelineName,
            status: 'running',
            detail: `Fetching deals from ${pipelineName}...`
          });
        } else if (status === 'completed' && deals) {
          onProgress({
            type: 'pipeline_progress',
            pipelineId,
            pipelineName,
            status: 'completed',
            detail: `Found ${deals.length} won deals in ${pipelineName}`
          });

          // Validate deals for this pipeline
          const pipelineResults = deals.map(deal => 
            quoteValidationService.validateDeal(deal, pipelineName)
          );

          // Calculate stats for this pipeline
          const withQuoteId = pipelineResults.filter(r => r.hasQuoteId).length;
          const withoutQuoteId = pipelineResults.filter(r => !r.hasQuoteId).length;
          const pipelineValue = pipelineResults.reduce((sum, r) => sum + r.dealValue, 0);

          pipelineBreakdown[pipelineName] = {
            total: deals.length,
            withQuoteId,
            withoutQuoteId,
            totalValue: pipelineValue
          };

          // Update totals
          totalDeals += deals.length;
          totalDealsWithQuoteId += withQuoteId;
          totalDealsWithoutQuoteId += withoutQuoteId;
          totalValue += pipelineValue;

          // Add to all results
          allResults.push(...pipelineResults);

          onProgress({
            type: 'log',
            message: `${pipelineName}: ${deals.length} deals, ${withQuoteId} with quote ID, ${withoutQuoteId} without`
          });

        } else if (status === 'error') {
          onProgress({
            type: 'pipeline_progress',
            pipelineId,
            pipelineName,
            status: 'error',
            detail: `Failed to fetch deals from ${pipelineName}`
          });
        }
      }
    );

    // Generate final summary
    const allIssues = allResults.flatMap(r => r.validationIssues);
    
    const validationSummary = {
      totalWonDeals: totalDeals,
      dealsWithQuoteId: totalDealsWithQuoteId,
      dealsWithoutQuoteId: totalDealsWithoutQuoteId,
      totalValue,
      currency: 'SGD',
      pipelineBreakdown,
      issues: allIssues,
      results: allResults
    };

    // Generate report
    const report = quoteValidationService.generateReport(validationSummary);

    onProgress({
      type: 'log',
      message: report
    });

    onProgress({
      type: 'progress',
      step: 'complete',
      status: 'completed',
      detail: 'Validation completed successfully'
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
export async function runValidationV2() {
  const config: TenantValidationConfig = {
    tenantId: 'ea67107e-c352-40a9-a8b8-24d81ae3fc85',
    tenantName: 'Tenant EA67107E',
    pipedriveApiKey: process.env.PIPEDRIVE_KEY_2 || '',
    pipedriveCompanyDomain: 'api', // Using standard API domain
    quoteIdFieldKey: QUOTE_ID_FIELD_KEY,
    quoteNumberFieldKey: QUOTE_NUMBER_FIELD_KEY
  };

  if (!config.pipedriveApiKey) {
    throw new Error('PIPEDRIVE_KEY_2 environment variable is not set');
  }

  // For standalone execution, log to console
  await validateTenantEA67107EV2(config, (progress) => {
    if (progress.type === 'log') {
      console.log(progress.message);
    } else if (progress.type === 'progress') {
      console.log(`[${progress.step}] ${progress.status}: ${progress.detail}`);
    } else if (progress.type === 'pipeline_progress') {
      console.log(`[Pipeline ${progress.pipelineId}] ${progress.status}: ${progress.detail}`);
    } else if (progress.type === 'error') {
      console.error('ERROR:', progress.message);
    } else if (progress.type === 'complete') {
      console.log('Validation complete:', JSON.stringify(progress.data, null, 2));
    }
  });
}