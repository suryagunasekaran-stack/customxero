/**
 * Safely parses Redis connection URLs and returns connection options
 * Handles various URL formats including those with authentication
 */
export function parseRedisUrl(url: string | undefined) {
  // Default local Redis
  if (!url) {
    return {
      host: '127.0.0.1',
      port: 6379,
    };
  }

  try {
    const parsed = new URL(url);
    
    const options: any = {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    };

    // Handle authentication
    if (parsed.username) {
      options.username = parsed.username;
    }
    if (parsed.password) {
      options.password = parsed.password;
    }

    // Handle SSL/TLS
    if (parsed.protocol === 'rediss:') {
      options.tls = {};
    }

    // Handle database selection from pathname
    if (parsed.pathname && parsed.pathname !== '/') {
      const db = parseInt(parsed.pathname.slice(1), 10);
      if (!isNaN(db)) {
        options.db = db;
      }
    }

    return options;
  } catch (error) {
    console.error('[Redis] Failed to parse Redis URL:', error);
    // Return default on parse error
    return {
      host: '127.0.0.1',
      port: 6379,
    };
  }
}