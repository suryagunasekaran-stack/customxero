'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    // If already authenticated, redirect to main app
    if (status === 'authenticated' && session) {
      router.push('/organisation/xero');
    }
  }, [session, status, router]);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await signIn('xero', { 
        callbackUrl: '/organisation/xero',
        redirect: true 
      });
    } catch (error) {
      console.error('Sign in error:', error);
      setIsSigningIn(false);
    }
  };

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div className="text-center">
          <div className="animate-spin h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 mx-auto" />
          <p className="mt-4 text-sm text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If authenticated, show loading while redirecting
  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div className="text-center">
          <div className="animate-spin h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 mx-auto" />
          <p className="mt-4 text-sm text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col justify-center min-h-screen">
          <div className="mx-auto w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Brightsun
              </h1>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
              <div className="p-6">
                <button
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  style={{
                    backgroundColor: isSigningIn ? 'oklch(21.6% 0.006 56.043)' : 'oklch(27.4% 0.006 286.033)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSigningIn) e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSigningIn) e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                  }}
                >
                  {isSigningIn ? (
                    <>
                      <ArrowPathIcon className="animate-spin h-5 w-5 mr-2" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 5.773-5.774 1.97-1.97-5.773 5.773-1.97h.001l1.94 5.77v.003z"/>
                      </svg>
                      Sign in with Xero
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}