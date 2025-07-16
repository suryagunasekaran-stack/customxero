import { NextResponse } from 'next/server';
import { withRedis, withRedisFallback } from '@/lib/redis/redisClient';

export async function GET() {
  try {
    // Test basic Redis connectivity
    const pingResult = await withRedisFallback(async (redis) => {
      const pong = await redis.ping();
      return { success: true, ping: pong };
    }, { success: false, ping: 'failed' });

    // Test setting and getting a value
    const testKey = 'test:connection';
    const testValue = `test-${Date.now()}`;
    
    const setResult = await withRedisFallback(async (redis) => {
      await redis.set(testKey, testValue, 'EX', 60);
      const getValue = await redis.get(testKey);
      return { set: true, value: getValue };
    }, { set: false, value: null });

    return NextResponse.json({
      status: 'ok',
      redisUrl: process.env.REDIS_URL ? 'configured' : 'using default',
      ping: pingResult,
      test: setResult,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Test Redis] Error:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      redisUrl: process.env.REDIS_URL ? 'configured' : 'using default',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}