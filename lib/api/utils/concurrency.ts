/**
 * Utility functions for managing concurrent API calls
 */

/**
 * Process items in parallel with concurrency control
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param concurrency Maximum number of concurrent operations
 */
export async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const promise = processor(item).then(result => {
      results.push(result);
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      executing.splice(0, executing.findIndex(p => p === promise) + 1);
    }
  }
  
  await Promise.all(executing);
  return results;
}

/**
 * Process items in batches with parallel execution within each batch
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param batchSize Size of each batch
 * @param delayBetweenBatches Delay in ms between batches
 */
export async function processInBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5,
  delayBetweenBatches: number = 0
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    
    results.push(...batchResults);
    
    // Add delay between batches if specified
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  return results;
}

/**
 * Retry a promise-returning function with exponential backoff
 * @param fn Function that returns a promise
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in ms (doubles after each retry)
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (i < maxRetries) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError!;
}

/**
 * Create a debounced async function
 * @param fn Function to debounce
 * @param delay Delay in ms
 */
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  let pending: Promise<any> | null = null;
  
  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    return new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          pending = fn(...args);
          const result = await pending;
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          pending = null;
        }
      }, delay);
    });
  }) as T;
}