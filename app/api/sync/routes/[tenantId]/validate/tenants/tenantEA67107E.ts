import { NextRequest } from 'next/server';
import { validateTenantEA67107EV2, TenantValidationConfig } from '../../../../pipedrive/tenant-ea67107e/validation-handler-v2';

export async function tenantEA67107EValidation(req: NextRequest) {
  try {
    const config: TenantValidationConfig = {
      tenantId: 'ea67107e-c352-40a9-a8b8-24d81ae3fc85',
      tenantName: 'Tenant EA67107E',
      pipedriveApiKey: process.env.PIPEDRIVE_KEY_2 || '',
      pipedriveCompanyDomain: 'api', // Using standard API domain
      quoteIdFieldKey: '1f21104ccb95f5a4773ef52cd0c2cc1c78203f69',
      quoteNumberFieldKey: 'a52165a056d57cabba309ec5e53d7a6cd47ea766'
    };

    if (!config.pipedriveApiKey) {
      return {
        success: false,
        error: 'PIPEDRIVE_KEY_2 environment variable is not configured'
      };
    }

    // Collect validation results
    const progressEvents: any[] = [];
    let finalResult: any = null;

    await validateTenantEA67107EV2(config, (progress) => {
      progressEvents.push(progress);
      if (progress.type === 'complete') {
        finalResult = progress.data;
      }
    });

    if (finalResult) {
      return finalResult;
    }

    // If no final result, return progress events
    return {
      success: true,
      progressEvents
    };

  } catch (error) {
    console.error('Tenant EA67107E validation error:', error);
    return {
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack
    };
  }
}