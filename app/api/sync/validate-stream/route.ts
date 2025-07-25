import { NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { 
  validateDeal, 
  categorizeIssues, 
  generateValidationStats,
  ValidationContext 
} from '@/lib/validation/dealValidationRules';
import { 
  validateQuotesAgainstDeals, 
  findDuplicateQuotes,
  QuoteValidationContext 
} from '@/lib/validation/quoteValidationRules';
import {
  validateProjectsAgainstQuotes,
  XeroProject
} from '@/lib/validation/projectValidationRules';
import {
  validatePipeline3Invoices
} from '@/lib/validation/invoiceValidationRules';

// Tenant-specific Pipedrive configuration
const TENANT_PIPEDRIVE_CONFIG = {
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': {
    apiKey: process.env.PIPEDRIVE_KEY,
    enabled: true,
    description: 'BSENI'
  }
};

/**
 * Generate matching key from title
 */
function generateMatchingKey(title: string): string {
  if (!title) return '';
  
  const cleanTitle = title.replace(/\s*\(\d+\)\s*$/, '').trim();
  const match = cleanTitle.match(/^([A-Z]+\d+)\s*[-\s]+\s*(.+)$/i);
  
  if (match) {
    const jobCode = match[1].toLowerCase();
    const vesselName = match[2]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    
    return `${jobCode}-${vesselName}`;
  }
  
  return cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

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
        if (effective_tenant_id !== '6dd39ea4-e6a6-4993-a37a-21482ccf8d22') {
          sendProgress({ 
            type: 'error', 
            message: 'This endpoint is only for BSENI tenant',
            tenantId: effective_tenant_id 
          });
          controller.close();
          return;
        }
        
        const tenantConfig = TENANT_PIPEDRIVE_CONFIG[effective_tenant_id];
        const apiKey = tenantConfig.apiKey;
        
        if (!apiKey) {
          sendProgress({ 
            type: 'error',
            message: 'Pipedrive API key not configured'
          });
          controller.close();
          return;
        }
        
        // Step 1: Fetch deals
        sendProgress({ 
          type: 'progress', 
          step: 'fetch', 
          status: 'running',
          detail: 'Fetching won deals from Pipedrive'
        });
        
        const companyDomain = 'bseni';
        let allDeals: any[] = [];
        let moreItemsInCollection = true;
        let cursor: string | null = null;
        let pageCount = 0;
        
        while (moreItemsInCollection) {
          const url = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals`);
          url.searchParams.append('limit', '100');
          url.searchParams.append('status', 'won');
          url.searchParams.append('pipeline_id', '2');
          if (cursor) {
            url.searchParams.append('cursor', cursor);
          }
          
          pageCount++;
          sendProgress({ 
            type: 'progress', 
            step: 'fetch', 
            status: 'running',
            detail: `Fetching page ${pageCount}...`
          });
          
          const response = await fetch(url.toString(), {
            headers: {
              'Accept': 'application/json',
              'x-api-token': apiKey
            }
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            sendProgress({ 
              type: 'error',
              message: 'Pipedrive API authentication failed',
              error: errorText
            });
            controller.close();
            return;
          }
          
          const data = await response.json();
          const pageDeals = data.data || [];
          allDeals = allDeals.concat(pageDeals);
          
          if (data.additional_data?.pagination?.next_cursor) {
            cursor = data.additional_data.pagination.next_cursor;
          } else {
            moreItemsInCollection = false;
          }
        }
        
        const wonDeals = allDeals;
        
        sendProgress({ 
          type: 'progress', 
          step: 'fetch', 
          status: 'completed',
          detail: `Found ${wonDeals.length} won deals`
        });
        
        // Fetch organization names
        sendProgress({ 
          type: 'progress', 
          step: 'fetch', 
          status: 'running',
          detail: 'Fetching organization details'
        });
        
        // Create a map of org_id to org_name
        const orgMap = new Map<number, string>();
        const uniqueOrgIds = [...new Set(wonDeals.map(d => d.org_id).filter(id => id))];
        
        // Batch fetch organizations
        for (let i = 0; i < uniqueOrgIds.length; i += 10) {
          const batch = uniqueOrgIds.slice(i, i + 10);
          
          await Promise.all(batch.map(async (orgId) => {
            try {
              const orgUrl = new URL(`https://${companyDomain}.pipedrive.com/api/v2/organizations/${orgId}`);
              const orgResponse = await fetch(orgUrl.toString(), {
                headers: {
                  'Accept': 'application/json',
                  'x-api-token': apiKey
                }
              });
              
              if (orgResponse.ok) {
                const orgData = await orgResponse.json();
                if (orgData.data?.name) {
                  orgMap.set(orgId, orgData.data.name);
                }
              }
            } catch (error) {
              console.error(`Failed to fetch org ${orgId}:`, error);
            }
          }));
          
          if (i + 10 < uniqueOrgIds.length) {
            sendProgress({ 
              type: 'progress', 
              step: 'fetch', 
              status: 'running',
              detail: `Fetched ${Math.min(i + 10, uniqueOrgIds.length)} of ${uniqueOrgIds.length} organizations`
            });
          }
        }
        
        sendProgress({ 
          type: 'progress', 
          step: 'fetch', 
          status: 'completed',
          detail: `Fetched ${orgMap.size} organization names`
        });
        
        // Step 2: Validate each deal
        sendProgress({ 
          type: 'progress', 
          step: 'validate', 
          status: 'running',
          detail: 'Validating deals against business rules'
        });
        
        const validatedDeals = [];
        
        for (let i = 0; i < wonDeals.length; i++) {
          const deal = wonDeals[i];
          
          if (i % 5 === 0) {
            sendProgress({ 
              type: 'progress', 
              step: 'validate', 
              status: 'running',
              detail: `Validating deal ${i + 1} of ${wonDeals.length}...`
            });
          }
          
          let dealData: any = {
            id: deal.id,
            title: deal.title,
            matchingKey: generateMatchingKey(deal.title),
            value: deal.value,
            currency: deal.currency,
            org_id: deal.org_id,
            org_name: orgMap.get(deal.org_id) || 'Unknown',
            pipeline_id: deal.pipeline_id,
            stage_id: deal.stage_id,
            won_time: deal.won_time,
            xeroQuoteId: null,
            xeroQuoteNumber: null,
            xeroQuoteStatus: null,
            xeroQuoteTotal: null,
            xeroQuote: null,
            productsCount: 0,
            productsTotal: 0,
            dealProducts: [],
            validationIssues: [],
            isFullySynced: false
          };
          
          let xeroQuoteData = null;
          let dealProducts = [];
          
          try {
            // Get full deal details
            const dealDetailsUrl = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals/${deal.id}`);
            const dealDetailsResponse = await fetch(dealDetailsUrl.toString(), {
              headers: {
                'Accept': 'application/json',
                'x-api-token': apiKey
              }
            });
            
            if (dealDetailsResponse.ok) {
              const dealDetails = await dealDetailsResponse.json();
              const fullDeal = dealDetails.data;
              
              // Look for Xero quote ID
              const xeroQuoteFieldKey = '0e9dc89b14fb67546540fd3e11a7fe06653d708f';
              const xeroQuoteId = fullDeal.custom_fields?.[xeroQuoteFieldKey] || null;
              dealData.xeroQuoteId = xeroQuoteId;
              
              // Fetch Xero quote if ID exists
              if (xeroQuoteId) {
                try {
                  const xeroQuoteUrl = `https://api.xero.com/api.xro/2.0/Quotes/${xeroQuoteId}`;
                  const xeroResponse = await fetch(xeroQuoteUrl, {
                    headers: {
                      'Accept': 'application/json',
                      'Authorization': `Bearer ${access_token}`,
                      'Xero-tenant-id': effective_tenant_id
                    }
                  });
                  
                  if (xeroResponse.ok) {
                    const xeroData = await xeroResponse.json();
                    
                    if (xeroData.Status === 'OK' && xeroData.Quotes && xeroData.Quotes.length > 0) {
                      xeroQuoteData = xeroData.Quotes[0];
                      dealData.xeroQuote = xeroQuoteData;
                      dealData.xeroQuoteNumber = xeroQuoteData.QuoteNumber;
                      dealData.xeroQuoteStatus = xeroQuoteData.Status;
                      dealData.xeroQuoteTotal = xeroQuoteData.Total;
                    }
                  }
                } catch (xeroError) {
                  console.error('Error fetching Xero quote:', xeroError);
                }
              }
            }
            
            // Get deal products
            try {
              const productsUrl = `https://api.pipedrive.com/v1/deals/${deal.id}/products?api_token=${apiKey}`;
              const productsResponse = await fetch(productsUrl);
              
              if (productsResponse.ok) {
                const productsData = await productsResponse.json();
                dealProducts = productsData.data || [];
                dealData.dealProducts = dealProducts;
                dealData.productsCount = dealProducts.length;
                
                dealData.productsTotal = dealProducts.reduce((sum: number, product: any) => {
                  return sum + (product.quantity * product.item_price);
                }, 0);
              }
            } catch (productsError) {
              console.error('Error fetching products:', productsError);
            }
            
          } catch (error) {
            console.error(`Error processing deal ${deal.id}:`, error);
          }
          
          // Run comprehensive validation
          const validationContext: ValidationContext = {
            deal: dealData,
            xeroQuote: xeroQuoteData,
            dealProducts: dealProducts,
            tenantId: effective_tenant_id
          };
          
          const validationIssues = validateDeal(validationContext);
          dealData.validationIssues = validationIssues;
          
          // Categorize issues
          const categorized = categorizeIssues(validationIssues);
          dealData.isFullySynced = categorized.errors.length === 0 && categorized.warnings.length === 0;
          dealData.errorCount = categorized.errors.length;
          dealData.warningCount = categorized.warnings.length;
          dealData.fixableCount = categorized.fixable.length;
          
          validatedDeals.push(dealData);
        }
        
        sendProgress({ 
          type: 'progress', 
          step: 'validate', 
          status: 'completed',
          detail: `Validated ${validatedDeals.length} deals`
        });
        
        // Step 3: Analysis
        sendProgress({ 
          type: 'progress', 
          step: 'analyze', 
          status: 'running',
          detail: 'Analyzing validation results'
        });
        
        const baseValidationStats = generateValidationStats(validatedDeals);
        
        // Add Xero quote totals calculation
        const acceptedQuotesTotal = validatedDeals
          .filter(d => d.xeroQuoteStatus === 'ACCEPTED')
          .reduce((sum, d) => sum + (d.xeroQuoteTotal || 0), 0);
        
        const dealsTotal = validatedDeals.reduce((sum, d) => sum + d.value, 0);
        
        const validationStats = {
          ...baseValidationStats,
          acceptedQuotesTotal,
          dealsTotal,
          totalsMismatch: Math.abs(dealsTotal - acceptedQuotesTotal) > 0.01
        };
        
        const issuesCount = validationStats.withErrors;
        sendProgress({ 
          type: 'progress', 
          step: 'analyze', 
          status: 'completed',
          detail: issuesCount > 0 ? `Found ${issuesCount} deals with errors` : 'All deals validated successfully'
        });
        
        // Step 4: Report
        sendProgress({ 
          type: 'progress', 
          step: 'report', 
          status: 'running',
          detail: 'Generating validation report'
        });
        
        // Group by job code prefix
        const groupedByPrefix: { [key: string]: number } = {};
        validatedDeals.forEach((deal: any) => {
          const prefix = deal.matchingKey.match(/^([a-z]+)/)?.[1] || 'other';
          groupedByPrefix[prefix] = (groupedByPrefix[prefix] || 0) + 1;
        });
        
        sendProgress({ 
          type: 'progress', 
          step: 'report', 
          status: 'completed',
          detail: 'Validation report ready'
        });
        
        // Phase 2: Validate Pipeline 3 Deals Invoices
        sendProgress({ 
          type: 'progress', 
          step: 'phase2_fetch', 
          status: 'running',
          detail: 'Fetching Pipeline 3 deals for invoice validation'
        });
        
        let phase2InvoiceValidationResult = null;
        
        try {
          // Fetch Pipeline 3 deals
          let pipeline3Deals: any[] = [];
          let moreItemsInCollection = true;
          let cursor: string | null = null;
          
          while (moreItemsInCollection) {
            const url = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals`);
            url.searchParams.append('limit', '100');
            url.searchParams.append('status', 'won');
            url.searchParams.append('pipeline_id', '3'); // Pipeline 3
            if (cursor) {
              url.searchParams.append('cursor', cursor);
            }
            
            const response = await fetch(url.toString(), {
              headers: {
                'Accept': 'application/json',
                'x-api-token': apiKey
              }
            });
            
            if (!response.ok) {
              console.error('Failed to fetch Pipeline 3 deals');
              break;
            }
            
            const data = await response.json();
            const pageDeals = data.data || [];
            pipeline3Deals = pipeline3Deals.concat(pageDeals);
            
            if (data.additional_data?.pagination?.next_cursor) {
              cursor = data.additional_data.pagination.next_cursor;
            } else {
              moreItemsInCollection = false;
            }
          }
          
          sendProgress({ 
            type: 'progress', 
            step: 'phase2_fetch', 
            status: 'completed',
            detail: `Found ${pipeline3Deals.length} Pipeline 3 deals`
          });
          
          // Fetch deal details and validate invoices
          sendProgress({ 
            type: 'progress', 
            step: 'phase2_validate', 
            status: 'running',
            detail: 'Validating deals against Xero invoices'
          });
          
          // Get full deal details with custom fields
          const detailedDeals = [];
          for (const deal of pipeline3Deals) {
            try {
              const dealDetailsUrl = new URL(`https://${companyDomain}.pipedrive.com/api/v2/deals/${deal.id}`);
              const dealDetailsResponse = await fetch(dealDetailsUrl.toString(), {
                headers: {
                  'Accept': 'application/json',
                  'x-api-token': apiKey
                }
              });
              
              if (dealDetailsResponse.ok) {
                const dealDetails = await dealDetailsResponse.json();
                const fullDeal = dealDetails.data;
                
                // Add org name if available
                if (deal.org_id && orgMap.has(deal.org_id)) {
                  fullDeal.org_name = orgMap.get(deal.org_id);
                }
                
                detailedDeals.push(fullDeal);
              }
            } catch (error) {
              console.error(`Error fetching deal ${deal.id} details:`, error);
            }
          }
          
          // Validate invoices
          const invoiceFieldKey = 'c599cab3902b6c84c1f9e2689f308a4369fffe7d'; // Invoice ID field
          phase2InvoiceValidationResult = await validatePipeline3Invoices(
            detailedDeals,
            invoiceFieldKey,
            access_token,
            effective_tenant_id
          );
          
          sendProgress({ 
            type: 'progress', 
            step: 'phase2_validate', 
            status: 'completed',
            detail: `Validated ${phase2InvoiceValidationResult.deals.length} deals`
          });
          
        } catch (phase2Error) {
          console.error('Phase 2 invoice validation error:', phase2Error);
          sendProgress({ 
            type: 'progress', 
            step: 'phase2_validate', 
            status: 'error',
            detail: 'Error during Phase 2 invoice validation'
          });
        }
        
        // Phase 3: Validate Xero Quotes against Pipedrive Deals
        sendProgress({ 
          type: 'progress', 
          step: 'phase3_fetch', 
          status: 'running',
          detail: 'Fetching all accepted Xero quotes'
        });
        
        let allXeroQuotes = [];
        let phase3ValidationResult = null;
        let duplicateQuotes = null;
        
        try {
          // Fetch all accepted quotes from Xero
          const quotesUrl = 'https://api.xero.com/api.xro/2.0/Quotes?Status=ACCEPTED';
          const xeroQuotesResponse = await fetch(quotesUrl, {
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${access_token}`,
              'Xero-tenant-id': effective_tenant_id
            }
          });
          
          if (xeroQuotesResponse.ok) {
            const xeroQuotesData = await xeroQuotesResponse.json();
            if (xeroQuotesData.Status === 'OK' && xeroQuotesData.Quotes) {
              allXeroQuotes = xeroQuotesData.Quotes;
              
              sendProgress({ 
                type: 'progress', 
                step: 'phase2_fetch', 
                status: 'completed',
                detail: `Found ${allXeroQuotes.length} accepted quotes in Xero`
              });
              
              // Phase 2 validation
              sendProgress({ 
                type: 'progress', 
                step: 'phase2_validate', 
                status: 'running',
                detail: 'Comparing Xero quotes with Pipedrive deals'
              });
              
              const phase2Context: QuoteValidationContext = {
                xeroQuotes: allXeroQuotes,
                pipedriveDeals: validatedDeals, // Use validated deals from Phase 1 which includes all deal details
                tenantId: effective_tenant_id
              };
              
              phase3ValidationResult = validateQuotesAgainstDeals(phase2Context);
              duplicateQuotes = findDuplicateQuotes(phase3ValidationResult.quotes);
              
              sendProgress({ 
                type: 'progress', 
                step: 'phase2_validate', 
                status: 'completed',
                detail: `Validated ${phase3ValidationResult.quotes.length} quotes`
              });
            }
          } else {
            console.error('Failed to fetch Xero quotes:', await xeroQuotesResponse.text());
            sendProgress({ 
              type: 'progress', 
              step: 'phase2_fetch', 
              status: 'error',
              detail: 'Failed to fetch Xero quotes'
            });
          }
        } catch (phase2Error) {
          console.error('Phase 2 validation error:', phase2Error);
          sendProgress({ 
            type: 'progress', 
            step: 'phase2_validate', 
            status: 'error',
            detail: 'Error during Phase 2 validation'
          });
        }
        
        // Phase 4: Validate Xero Projects
        let phase4ValidationResult = null;
        
        if (phase3ValidationResult) {
          sendProgress({ 
            type: 'progress', 
            step: 'phase4_fetch', 
            status: 'running',
            detail: 'Fetching Xero projects'
          });
          
          try {
            // Fetch all INPROGRESS projects with pagination
            let allProjects: XeroProject[] = [];
            let page = 1;
            let hasMorePages = true;
            
            while (hasMorePages) {
              const projectsUrl = `https://api.xero.com/projects.xro/2.0/Projects?states=INPROGRESS&page=${page}&pageSize=100`;
              const projectsResponse = await fetch(projectsUrl, {
                headers: {
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${access_token}`,
                  'Xero-tenant-id': effective_tenant_id
                }
              });
              
              if (projectsResponse.ok) {
                const projectsData = await projectsResponse.json();
                if (projectsData.items) {
                  allProjects = allProjects.concat(projectsData.items);
                  
                  // Check if there are more pages
                  if (projectsData.pagination && 
                      projectsData.pagination.page < projectsData.pagination.pageCount) {
                    page++;
                    sendProgress({ 
                      type: 'progress', 
                      step: 'phase4_fetch', 
                      status: 'running',
                      detail: `Fetching projects page ${page}...`
                    });
                  } else {
                    hasMorePages = false;
                  }
                } else {
                  hasMorePages = false;
                }
              } else {
                console.error('Failed to fetch Xero projects:', await projectsResponse.text());
                hasMorePages = false;
              }
            }
            
            sendProgress({ 
              type: 'progress', 
              step: 'phase4_fetch', 
              status: 'completed',
              detail: `Found ${allProjects.length} in-progress projects`
            });
            
            // Phase 3 validation
            sendProgress({ 
              type: 'progress', 
              step: 'phase4_validate', 
              status: 'running',
              detail: 'Validating projects against quotes and deals'
            });
            
            phase4ValidationResult = validateProjectsAgainstQuotes(
              allProjects,
              phase3ValidationResult.quotes,
              validatedDeals
            );
            
            sendProgress({ 
              type: 'progress', 
              step: 'phase4_validate', 
              status: 'completed',
              detail: `Validated ${phase4ValidationResult.projects.length} projects`
            });
            
          } catch (phase4Error) {
            console.error('Phase 4 validation error:', phase4Error);
            sendProgress({ 
              type: 'progress', 
              step: 'phase4_validate', 
              status: 'error',
              detail: 'Error during Phase 4 validation'
            });
          }
        }
        
        // Send final result with all phases
        sendProgress({
          type: 'complete',
          data: {
            success: true,
            tenantId: effective_tenant_id,
            tenantName: 'BSENI',
            totalDeals: validatedDeals.length,
            validationStats,
            groupedByPrefix,
            deals: validatedDeals,
            // Phase 2 results
            phase2: phase2InvoiceValidationResult,
            phase3: phase3ValidationResult ? {
              quotes: phase3ValidationResult.quotes,
              stats: phase3ValidationResult.stats,
              duplicateQuotes: Array.from(duplicateQuotes?.entries() || []).map(([dealId, quotes]) => ({
                dealId,
                quotes: quotes.map(q => ({
                  quoteId: q.quoteId,
                  quoteNumber: q.quoteNumber,
                  total: q.total,
                  currency: q.currency
                }))
              }))
            } : null,
            // Phase 4 results
            phase4: phase4ValidationResult
          }
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