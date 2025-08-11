/**
 * Service for Pipedrive API operations related to fixing issues.
 * 
 * This service provides methods for interacting with the Pipedrive API
 * specifically for fix operations. It includes built-in rate limiting
 * to prevent API throttling and follows the project's error handling patterns.
 * 
 * @fileoverview Pipedrive Fix Service - API operations for fix handlers
 * @since 2024
 */

import { 
  PipedriveDeal, 
  buildPipedriveApiUrl,
  PipedriveApiResponse 
} from '@/lib/utils/pipedriveHelpers';
import { logger } from '@/lib/logger';

/**
 * Service class for Pipedrive API operations in the fix system.
 * 
 * Provides rate-limited API operations for deal retrieval and updates.
 * Implements progressive delays and error handling following project patterns.
 * 
 * @class PipedriveFixService
 * @since 2024
 */
export class PipedriveFixService {
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 100; // Minimum 100ms between requests

  /**
   * Applies rate limiting between API calls to prevent throttling.
   * 
   * Implements minimum intervals between requests and progressive delays
   * based on request volume to stay within API rate limits.
   * 
   * @private
   * @returns {Promise<void>} Promise that resolves after appropriate delay
   * @since 2024
   */
  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
    
    // Add progressive delays based on request count
    if (this.requestCount > 50) {
      await new Promise(resolve => setTimeout(resolve, 500));
    } else if (this.requestCount > 30) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  /**
   * Retrieves a single deal from Pipedrive by its ID.
   * 
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API requests
   * @param {number} dealId - Unique identifier for the deal
   * @returns {Promise<PipedriveDeal | null>} Promise resolving to deal data or null if not found
   * @since 2024
   */
  async getDeal(
    apiKey: string,
    companyDomain: string,
    dealId: number
  ): Promise<PipedriveDeal | null> {
    try {
      await this.applyRateLimit();
      
      const url = buildPipedriveApiUrl(
        companyDomain,
        `deals/${dealId}`,
        { api_token: apiKey },
        'v2'
      );

      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          logger.warn({ dealId }, 'Deal not found');
          return null;
        }
        
        logger.error({ 
          dealId, 
          status: response.status,
          statusText: response.statusText 
        }, 'Failed to fetch deal');
        return null;
      }

      const data: PipedriveApiResponse<PipedriveDeal> = await response.json();
      
      if (!data.success || !data.data) {
        logger.error({ dealId, error: data.error }, 'API returned error');
        return null;
      }

      // Normalize title field (API returns 'name' in v2)
      if (data.data.name && !data.data.title) {
        data.data.title = data.data.name;
      }

      return data.data;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        dealId 
      }, 'Error fetching deal');
      return null;
    }
  }

  /**
   * Updates a deal's title in Pipedrive.
   * 
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API requests
   * @param {number} dealId - Unique identifier for the deal
   * @param {string} newTitle - New title to set for the deal
   * @returns {Promise<boolean>} Promise resolving to true if update succeeded
   * @since 2024
   */
  async updateDealTitle(
    apiKey: string,
    companyDomain: string,
    dealId: number,
    newTitle: string
  ): Promise<boolean> {
    try {
      await this.applyRateLimit();
      
      const url = buildPipedriveApiUrl(
        companyDomain,
        `deals/${dealId}`,
        { api_token: apiKey },
        'v1' // Use v1 for updates as it's more stable
      );

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle
        })
      });

      if (!response.ok) {
        logger.error({ 
          dealId, 
          status: response.status,
          statusText: response.statusText,
          newTitle 
        }, 'Failed to update deal title');
        return false;
      }

      const data: PipedriveApiResponse<PipedriveDeal> = await response.json();
      
      if (!data.success) {
        logger.error({ 
          dealId, 
          error: data.error,
          newTitle 
        }, 'API returned error when updating deal');
        return false;
      }

      logger.info({ 
        dealId, 
        oldTitle: data.data?.title,
        newTitle 
      }, 'Deal title updated successfully');

      return true;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        dealId,
        newTitle 
      }, 'Error updating deal title');
      return false;
    }
  }

  /**
   * Updates multiple fields on a Pipedrive deal.
   * 
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API requests
   * @param {number} dealId - Unique identifier for the deal
   * @param {Partial<PipedriveDeal>} updates - Object containing fields to update
   * @returns {Promise<PipedriveDeal | null>} Promise resolving to updated deal or null if failed
   * @since 2024
   */
  async updateDeal(
    apiKey: string,
    companyDomain: string,
    dealId: number,
    updates: Partial<PipedriveDeal>
  ): Promise<PipedriveDeal | null> {
    try {
      await this.applyRateLimit();
      
      const url = buildPipedriveApiUrl(
        companyDomain,
        `deals/${dealId}`,
        { api_token: apiKey },
        'v1'
      );

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        logger.error({ 
          dealId, 
          status: response.status,
          statusText: response.statusText,
          updates 
        }, 'Failed to update deal');
        return null;
      }

      const data: PipedriveApiResponse<PipedriveDeal> = await response.json();
      
      if (!data.success || !data.data) {
        logger.error({ 
          dealId, 
          error: data.error,
          updates 
        }, 'API returned error when updating deal');
        return null;
      }

      logger.info({ 
        dealId,
        updatedFields: Object.keys(updates)
      }, 'Deal updated successfully');

      return data.data;
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : error,
        dealId,
        updates 
      }, 'Error updating deal');
      return null;
    }
  }

  /**
   * Performs batch updates on multiple deals.
   * 
   * @param {string} apiKey - Pipedrive API key for authentication
   * @param {string} companyDomain - Company domain for API requests
   * @param {Array<{dealId: number; updates: Partial<PipedriveDeal>}>} updates - Array of deal updates
   * @returns {Promise<Map<number, boolean>>} Promise resolving to map of deal IDs to success status
   * @since 2024
   */
  async batchUpdateDeals(
    apiKey: string,
    companyDomain: string,
    updates: Array<{ dealId: number; updates: Partial<PipedriveDeal> }>
  ): Promise<Map<number, boolean>> {
    const results = new Map<number, boolean>();
    
    for (const update of updates) {
      const success = await this.updateDeal(
        apiKey,
        companyDomain,
        update.dealId,
        update.updates
      ) !== null;
      
      results.set(update.dealId, success);
      
      // Add a small delay between batch operations
      if (updates.indexOf(update) < updates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }

  /**
   * Resets rate limiting counters to initial state.
   * 
   * Useful for testing or when starting a fresh batch of operations
   * after a long pause. Should be used carefully in production.
   * 
   * @returns {void}
   * @since 2024
   */
  resetRateLimiting(): void {
    this.requestCount = 0;
    this.lastRequestTime = 0;
  }

  /**
   * Returns current rate limiting status for monitoring and debugging.
   * 
   * Provides insight into request volume and timing for performance
   * analysis and rate limit management.
   * 
   * @returns {{requestCount: number; lastRequestTime: number}} Current rate limit status
   * @since 2024
   */
  getRateLimitStatus(): { requestCount: number; lastRequestTime: number } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime
    };
  }
}