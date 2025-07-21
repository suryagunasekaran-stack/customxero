import { PipedriveServiceV2 } from './pipedrive-service-v2';
import { ComprehensiveValidationService } from './comprehensive-validation-service';
import { ensureValidToken } from '@/lib/ensureXeroToken';

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
  type: 'log' | 'progress' | 'error' | 'complete' | 'pipeline_progress' | 'validation_progress';
  step?: string;
  status?: 'running' | 'completed' | 'error';
  message?: string;
  detail?: string;
  data?: any;
  pipelineId?: number;
  pipelineName?: string;
  current?: number;
  total?: number;
}

export async function validateTenantEA67107EV3(
  config: TenantValidationConfig,
  onProgress: (progress: ValidationProgress) => void
) {
  try {
    // Get Xero access token for quote validation
    let xeroAccessToken = '';
    let xeroTenantId = '';
    
    try {
      const xeroAuth = await ensureValidToken();
      xeroAccessToken = xeroAuth.access_token;
      xeroTenantId = xeroAuth.effective_tenant_id;
    } catch (error) {
      onProgress({
        type: 'log',
        message: 'Warning: Could not get Xero access token. Quote details will not be fetched.'
      });
    }

    // Initialize services
    const pipedriveService = new PipedriveServiceV2(config.pipedriveApiKey, config.pipedriveCompanyDomain);
    const validationService = new ComprehensiveValidationService(
      config.quoteIdFieldKey,
      config.quoteNumberFieldKey,
      xeroAccessToken,
      xeroTenantId
    );

    onProgress({
      type: 'log',
      message: 'Starting Comprehensive Project Sync Validation for tenant EA67107E'
    });

    const pipelineNames = pipedriveService.getPipelineNames();
    const pipelineIds = pipedriveService.getWIPPipelineIds();
    
    onProgress({
      type: 'log',
      message: `Will process ${pipelineIds.length} WIP pipelines: ${pipelineIds.map(id => pipelineNames[id]).join(', ')}`
    });

    // Process each pipeline and collect all deals
    const allDealsWithPipeline: Array<{deal: any, pipelineName: string}> = [];
    
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

          // Add deals to collection for validation
          deals.forEach(deal => {
            allDealsWithPipeline.push({ deal, pipelineName });
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

    // Now perform comprehensive validation on all deals
    onProgress({
      type: 'progress',
      step: 'validate',
      status: 'running',
      detail: `Validating ${allDealsWithPipeline.length} deals comprehensively...`
    });

    const validationSummary = await validationService.validateDealsComprehensively(
      allDealsWithPipeline,
      (current, total) => {
        if (current % 10 === 0 || current === total) {
          onProgress({
            type: 'validation_progress',
            current,
            total,
            detail: `Validated ${current} of ${total} deals...`
          });
        }
      }
    );

    onProgress({
      type: 'progress',
      step: 'validate',
      status: 'completed',
      detail: 'Comprehensive validation completed'
    });

    // Generate report
    const report = validationService.generateComprehensiveReport(validationSummary);

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
export async function runValidationV3() {
  const config: TenantValidationConfig = {
    tenantId: 'ea67107e-c352-40a9-a8b8-24d81ae3fc85',
    tenantName: 'Tenant EA67107E',
    pipedriveApiKey: process.env.PIPEDRIVE_KEY_2 || '',
    pipedriveCompanyDomain: 'api',
    quoteIdFieldKey: QUOTE_ID_FIELD_KEY,
    quoteNumberFieldKey: QUOTE_NUMBER_FIELD_KEY
  };

  if (!config.pipedriveApiKey) {
    throw new Error('PIPEDRIVE_KEY_2 environment variable is not set');
  }

  // For standalone execution, log to console
  await validateTenantEA67107EV3(config, (progress) => {
    if (progress.type === 'log') {
      console.log(progress.message);
    } else if (progress.type === 'progress') {
      console.log(`[${progress.step}] ${progress.status}: ${progress.detail}`);
    } else if (progress.type === 'pipeline_progress') {
      console.log(`[Pipeline ${progress.pipelineId}] ${progress.status}: ${progress.detail}`);
    } else if (progress.type === 'validation_progress') {
      console.log(`[Validation] ${progress.detail}`);
    } else if (progress.type === 'error') {
      console.error('ERROR:', progress.message);
    } else if (progress.type === 'complete') {
      console.log('Validation complete:', JSON.stringify(progress.data, null, 2));
    }
  });
}