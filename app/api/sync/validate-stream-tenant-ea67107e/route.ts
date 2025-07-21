import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { validateTenantEA67107EV3, TenantValidationConfig, ValidationProgress } from '../pipedrive/tenant-ea67107e/validation-handler-v3';

export async function GET() {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendProgress = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };
        
        // Get tenant information
        const { effective_tenant_id, access_token } = await ensureValidToken();
        
        sendProgress({ type: 'log', message: `Starting validation for tenant: ${effective_tenant_id}` });
        
        // Check tenant
        if (effective_tenant_id !== 'ea67107e-c352-40a9-a8b8-24d81ae3fc85') {
          sendProgress({ 
            type: 'error', 
            message: 'This endpoint is only for tenant ea67107e-c352-40a9-a8b8-24d81ae3fc85',
            tenantId: effective_tenant_id 
          });
          controller.close();
          return;
        }
        
        const config: TenantValidationConfig = {
          tenantId: 'ea67107e-c352-40a9-a8b8-24d81ae3fc85',
          tenantName: 'Tenant EA67107E',
          pipedriveApiKey: process.env.PIPEDRIVE_KEY_2 || '',
          pipedriveCompanyDomain: 'api', // Using standard API domain
          quoteIdFieldKey: '1f21104ccb95f5a4773ef52cd0c2cc1c78203f69',
          quoteNumberFieldKey: 'a52165a056d57cabba309ec5e53d7a6cd47ea766'
        };
        
        if (!config.pipedriveApiKey) {
          sendProgress({ 
            type: 'error',
            message: 'Pipedrive API key not configured (PIPEDRIVE_KEY_2)'
          });
          controller.close();
          return;
        }
        
        // Run validation with streaming progress
        await validateTenantEA67107EV3(config, (progress: ValidationProgress) => {
          sendProgress(progress);
        });
        
        controller.close();
      } catch (error) {
        console.error('Error in validation stream:', error);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          message: (error as Error).message 
        })}\n\n`));
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}