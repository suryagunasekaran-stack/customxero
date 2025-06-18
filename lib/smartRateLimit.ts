export class SmartRateLimit {
  private static remainingMinuteCalls = 60;
  private static remainingDayCalls = 5000;
  private static minuteWindowResetTime = Date.now() + 60000;
  private static lastCallTime = 0;
  private static readonly MIN_DELAY_MS = 100; // Increased minimum delay
  private static readonly SAFETY_BUFFER = 10; // More conservative safety buffer
  
  static async waitIfNeeded() {
    const now = Date.now();
    
    // Reset minute window if needed
    if (now >= this.minuteWindowResetTime) {
      this.remainingMinuteCalls = 60;
      this.minuteWindowResetTime = now + 60000;
      console.log('[SmartRateLimit] Minute rate limit window reset');
    }
    
    // If we're running low on minute or daily calls, implement backoff
    if (this.remainingMinuteCalls <= this.SAFETY_BUFFER) {
      const waitTime = Math.max(0, this.minuteWindowResetTime - now);
      if (waitTime > 0) {
        console.log(`[SmartRateLimit] Low on minute API calls (${this.remainingMinuteCalls} remaining), waiting ${waitTime}ms for window reset`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.remainingMinuteCalls = 60;
        this.minuteWindowResetTime = Date.now() + 60000;
      }
    }
    
    // Check daily limit too
    if (this.remainingDayCalls <= 50) {
      console.warn(`[SmartRateLimit] Running low on daily API calls: ${this.remainingDayCalls} remaining`);
      // Increase delay when daily limit is low
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Progressive backoff based on remaining calls
    let delayMs = this.MIN_DELAY_MS;
    if (this.remainingMinuteCalls <= 20) {
      delayMs = 200; // Slow down when under 20 calls
    } else if (this.remainingMinuteCalls <= 30) {
      delayMs = 150; // Moderate slowdown
    }
    
    // Ensure minimum delay between calls
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < delayMs) {
      await new Promise(resolve => setTimeout(resolve, delayMs - timeSinceLastCall));
    }
    
    this.remainingMinuteCalls--;
    this.remainingDayCalls--;
    this.lastCallTime = Date.now();
    
    console.log(`[SmartRateLimit] API call made. Remaining: Minute ${this.remainingMinuteCalls}/60, Day ${this.remainingDayCalls}`);
  }
  
  static updateFromHeaders(headers: Headers) {
    // Check Xero-specific headers first
    const xeroMinRemaining = headers.get('x-minlimit-remaining');
    const xeroDayRemaining = headers.get('x-daylimit-remaining');
    
    if (xeroMinRemaining !== null) {
      const minuteRemaining = parseInt(xeroMinRemaining);
      this.remainingMinuteCalls = minuteRemaining;
      console.log(`[SmartRateLimit] Xero minute limit updated: ${this.remainingMinuteCalls} remaining`);
      
      // If we're getting close to limit, be more conservative
      if (minuteRemaining <= 10) {
        console.warn(`[SmartRateLimit] WARNING: Only ${minuteRemaining} minute calls remaining!`);
      }
    }
    
    if (xeroDayRemaining !== null) {
      const dayRemaining = parseInt(xeroDayRemaining);
      this.remainingDayCalls = dayRemaining;
      console.log(`[SmartRateLimit] Xero day limit updated: ${this.remainingDayCalls} remaining`);
      
      if (dayRemaining <= 100) {
        console.warn(`[SmartRateLimit] WARNING: Only ${dayRemaining} daily calls remaining!`);
      }
    }
    
    // Fallback to generic headers if Xero headers not found
    if (!xeroMinRemaining) {
      const remaining = headers.get('x-ratelimit-remaining');
      const reset = headers.get('x-ratelimit-reset');
      
      if (remaining !== null) {
        this.remainingMinuteCalls = parseInt(remaining);
        console.log(`[SmartRateLimit] Generic remaining calls updated: ${this.remainingMinuteCalls}`);
      }
      
      if (reset !== null) {
        this.minuteWindowResetTime = parseInt(reset) * 1000;
        const timeUntilReset = Math.max(0, this.minuteWindowResetTime - Date.now());
        console.log(`[SmartRateLimit] Window reset time updated: ${new Date(this.minuteWindowResetTime).toISOString()} (${Math.round(timeUntilReset / 1000)}s from now)`);
      }
    }
  }
  
  static getRemainingCalls(): number {
    return Math.min(this.remainingMinuteCalls, this.remainingDayCalls);
  }
  
  static getTimeUntilReset(): number {
    return Math.max(0, this.minuteWindowResetTime - Date.now());
  }
  
  static reset() {
    this.remainingMinuteCalls = 60;
    this.remainingDayCalls = 5000;
    this.minuteWindowResetTime = Date.now() + 60000;
    this.lastCallTime = 0;
    console.log('[SmartRateLimit] Manual reset performed');
  }
  
  static getStatus() {
    return {
      minuteRemaining: this.remainingMinuteCalls,
      dayRemaining: this.remainingDayCalls,
      timeUntilMinuteReset: this.getTimeUntilReset(),
      lastCallTime: this.lastCallTime
    };
  }
} 