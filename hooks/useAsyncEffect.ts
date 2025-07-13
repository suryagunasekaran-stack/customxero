import { useEffect, useRef, useCallback, useState, DependencyList } from 'react';

/**
 * Custom hook for handling async operations in useEffect with proper cleanup
 * Prevents state updates on unmounted components
 */
export function useAsyncEffect(
  asyncFunction: () => Promise<void>,
  deps: DependencyList
): void {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // Create a wrapped version that checks if component is still mounted
    const wrappedAsyncFunction = async () => {
      try {
        await asyncFunction();
      } catch (error) {
        // Only log errors if component is still mounted
        if (isMountedRef.current) {
          console.error('useAsyncEffect error:', error);
        }
      }
    };

    wrappedAsyncFunction();

    return () => {
      isMountedRef.current = false;
    };
  }, deps);
}

/**
 * Hook that provides a function to check if component is mounted
 * Useful for preventing state updates after unmount
 */
export function useIsMounted(): () => boolean {
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => isMountedRef.current, []);
}

/**
 * Hook for cancellable async operations
 * Returns a function that only executes if component is still mounted
 */
export function useSafeAsync<T extends (...args: any[]) => Promise<any>>(
  callback: T
): T {
  const isMounted = useIsMounted();

  return useCallback(
    async (...args: Parameters<T>) => {
      const result = await callback(...args);
      if (!isMounted()) {
        throw new Error('Component unmounted');
      }
      return result;
    },
    [callback, isMounted]
  ) as T;
}

/**
 * Hook for async operations with loading and error states
 */
interface AsyncState<T> {
  loading: boolean;
  error: Error | null;
  data: T | null;
}

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  immediate = true
): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({
    loading: immediate,
    error: null,
    data: null,
  });

  const isMounted = useIsMounted();

  const execute = useCallback(async () => {
    setState({ loading: true, error: null, data: null });

    try {
      const data = await asyncFunction();
      if (isMounted()) {
        setState({ loading: false, error: null, data });
      }
    } catch (error) {
      if (isMounted()) {
        setState({ loading: false, error: error as Error, data: null });
      }
    }
  }, [asyncFunction, isMounted]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return [state, execute];
}