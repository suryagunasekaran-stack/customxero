export class SmartRateLimit {
  private static remainingCalls = 60;
  private static windowResetTime = Date.now() + 60000;
  private static lastCallTime = 0;
  private static readonly MIN_DELAY_MS = 50; // Minimum delay between calls
  
  static async waitIfNeeded() {
    const now = Date.now();
    
    // Reset window if needed
    if (now >= this.windowResetTime) {
      this.remainingCalls = 60;
      this.windowResetTime = now + 60000;
      console.log('[SmartRateLimit] Rate limit window reset');
    }
    
    // If we're running low on calls, wait for window reset
    if (this.remainingCalls <= 5) {
      const waitTime = Math.max(0, this.windowResetTime - now);
      if (waitTime > 0) {
        console.log(`[SmartRateLimit] Low on API calls (${this.remainingCalls} remaining), waiting ${waitTime}ms for window reset`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.remainingCalls = 60;
        this.windowResetTime = Date.now() + 60000;
      }
    }
    
    // Ensure minimum delay between calls
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.MIN_DELAY_MS) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY_MS - timeSinceLastCall));
    }
    
    this.remainingCalls--;
    this.lastCallTime = Date.now();
  }
  
  static updateFromHeaders(headers: Headers) {
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    const limit = headers.get('x-ratelimit-limit');
    
    if (remaining !== null) {
      this.remainingCalls = parseInt(remaining);
      console.log(`[SmartRateLimit] Remaining calls updated from headers: ${this.remainingCalls}`);
    }
    
    if (reset !== null) {
      this.windowResetTime = parseInt(reset) * 1000;
      const timeUntilReset = Math.max(0, this.windowResetTime - Date.now());
      console.log(`[SmartRateLimit] Window reset time updated: ${new Date(this.windowResetTime).toISOString()} (${Math.round(timeUntilReset / 1000)}s from now)`);
    }
    
    if (limit !== null) {
      console.log(`[SmartRateLimit] Rate limit: ${limit} calls per window`);
    }
  }
  
  static getRemainingCalls(): number {
    return this.remainingCalls;
  }
  
  static getTimeUntilReset(): number {
    return Math.max(0, this.windowResetTime - Date.now());
  }
  
  static reset() {
    this.remainingCalls = 60;
    this.windowResetTime = Date.now() + 60000;
    this.lastCallTime = 0;
    console.log('[SmartRateLimit] Manual reset performed');
  }
} 