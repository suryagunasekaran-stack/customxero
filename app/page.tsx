'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuthStatusAndRedirect() {
      try {
        // This endpoint should ideally just check token validity without fetching all projects
        // For now, it serves to check if the token is valid by attempting a protected API call.
        const response = await fetch('/api/projects-inprogress'); // Or a dedicated /api/auth-status endpoint

        if (response.ok) {
          // User is authenticated and token is valid
          router.push('/organisation');
        } else {
          // Token is invalid or not present, user needs to authenticate
          // Redirect to Xero connection which acts as login
          router.push('/api/connect');
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        // Fallback: if API call fails for other reasons, redirect to connect
        router.push('/api/connect');
      }
    }

    checkAuthStatusAndRedirect();
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white shadow-xl rounded-lg text-center">
        <svg className="w-20 h-20 text-blue-600 mx-auto mb-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Redirecting...</h1>
        <p className="text-gray-600">Please wait while we check your authentication status.</p>
        <div className="mt-6 animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    </main>
  );
}
