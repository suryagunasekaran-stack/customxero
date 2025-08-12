/**
 * Service for fetching and managing Xero quotes
 */

import { ensureValidToken } from '@/lib/ensureXeroToken';
import { logger } from '@/lib/logger';

export interface XeroQuote {
  QuoteID: string;
  QuoteNumber: string;
  Reference?: string;
  Contact?: {
    ContactID: string;
    Name: string;
    EmailAddress?: string;
  };
  LineItems?: Array<{
    LineItemID: string;
    Description?: string;
    Quantity?: number;
    UnitAmount?: number;
    LineAmount?: number;
    AccountCode?: string;
    TaxType?: string;
    TaxAmount?: number;
    DiscountRate?: number;
    ItemCode?: string;
    Tracking?: Array<{
      TrackingCategoryID: string;
      TrackingOptionID: string;
      Name?: string;
      Option?: string;
    }>;
  }>;
  Date?: string;
  DateString?: string;
  ExpiryDate?: string;
  ExpiryDateString?: string;
  Status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'DELETED' | 'INVOICED';
  CurrencyCode?: string;
  SubTotal?: number;
  TotalTax?: number;
  Total?: number;
  Title?: string;
  Summary?: string;
}

export interface XeroQuotesResponse {
  Quotes: XeroQuote[];
  Status?: string;
}

export class XeroQuoteService {
  /**
   * Fetches all quotes from Xero with pagination support
   * 
   * @param tenantId - The Xero tenant ID
   * @param status - Optional status filter
   * @returns Array of all quotes
   */
  static async fetchAllQuotes(
    tenantId: string,
    status?: string
  ): Promise<XeroQuote[]> {
    try {
      const { access_token } = await ensureValidToken();
      const allQuotes: XeroQuote[] = [];
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const url = new URL('https://api.xero.com/api.xro/2.0/Quotes');
        url.searchParams.append('page', page.toString());
        
        if (status) {
          url.searchParams.append('Status', status);
        }
        
        logger.info({ 
          tenantId, 
          page, 
          status 
        }, 'Fetching Xero quotes page');
        
        const response = await fetch(url.toString(), {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${access_token}`,
            'xero-tenant-id': tenantId
          }
        });
        
        if (!response.ok) {
          logger.error({ 
            status: response.status, 
            statusText: response.statusText 
          }, 'Failed to fetch Xero quotes');
          
          // If unauthorized, try to refresh token
          if (response.status === 401) {
            logger.warn('Token expired, quotes will be empty');
            return [];
          }
          
          throw new Error(`Failed to fetch quotes: ${response.status} ${response.statusText}`);
        }
        
        const data: XeroQuotesResponse = await response.json();
        
        if (data.Quotes && data.Quotes.length > 0) {
          allQuotes.push(...data.Quotes);
          
          // Xero returns max 100 items per page
          if (data.Quotes.length === 100) {
            page++;
          } else {
            hasMorePages = false;
          }
        } else {
          hasMorePages = false;
        }
        
        logger.debug({ 
          fetched: data.Quotes?.length || 0, 
          total: allQuotes.length 
        }, 'Fetched quotes page');
      }
      
      logger.info({ 
        totalQuotes: allQuotes.length,
        tenantId 
      }, 'Completed fetching all Xero quotes');
      
      return allQuotes;
      
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        tenantId 
      }, 'Error fetching Xero quotes');
      return [];
    }
  }
  
  /**
   * Fetches a single quote by ID
   * 
   * @param tenantId - The Xero tenant ID
   * @param quoteId - The quote ID
   * @returns The quote or null if not found
   */
  static async fetchQuoteById(
    tenantId: string,
    quoteId: string
  ): Promise<XeroQuote | null> {
    try {
      const { access_token } = await ensureValidToken();
      
      const url = `https://api.xero.com/api.xro/2.0/Quotes/${quoteId}`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${access_token}`,
          'xero-tenant-id': tenantId
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch quote: ${response.status}`);
      }
      
      const data: XeroQuotesResponse = await response.json();
      return data.Quotes?.[0] || null;
      
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        quoteId,
        tenantId 
      }, 'Error fetching quote by ID');
      return null;
    }
  }
}