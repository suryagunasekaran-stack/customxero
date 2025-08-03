'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import { XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  
  const error = searchParams.get('error');
  
  const getErrorMessage = () => {
    switch (error) {
      case 'Configuration':
        return { title: 'Configuration Error', canRetry: false };
      case 'AccessDenied':
        return { title: 'Access Denied', canRetry: true };
      case 'Verification':
        return { title: 'Verification Failed', canRetry: true };
      case 'OAuthSignin':
        return { title: 'Sign In Failed', canRetry: true };
      case 'OAuthCallback':
        return { title: 'Authentication Error', canRetry: true };
      case 'OAuthCreateAccount':
        return { title: 'Account Creation Failed', canRetry: false };
      case 'EmailCreateAccount':
        return { title: 'Account Creation Failed', canRetry: false };
      case 'Callback':
        return { title: 'Callback Error', canRetry: true };
      case 'Default':
      default:
        return { title: 'Authentication Error', canRetry: true };
    }
  };

  const errorInfo = getErrorMessage();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await signIn('xero', { 
        callbackUrl: '/organisation/xero',
        redirect: true 
      });
    } catch (error) {
      console.error('Retry sign in error:', error);
      setIsRetrying(false);
    }
  };

  const handleBackToHome = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center items-center min-h-[80vh]">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
              <div className="p-6">
                <div className="text-center mb-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-50 mb-3">
                    <XCircleIcon className="h-6 w-6 text-red-500" />
                  </div>
                  <h1 className="text-xl font-semibold text-gray-900">
                    {errorInfo.title}
                  </h1>
                </div>

                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center">
                      <XCircleIcon className="h-5 w-5 text-red-600 mr-2" />
                      <span className="text-sm text-red-700">Authentication failed</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {errorInfo.canRetry && (
                      <button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                        style={{
                          backgroundColor: isRetrying ? 'oklch(21.6% 0.006 56.043)' : 'oklch(27.4% 0.006 286.033)'
                        }}
                        onMouseEnter={(e) => {
                          if (!isRetrying) e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isRetrying) e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                        }}
                      >
                        {isRetrying ? (
                          <>
                            <div className="animate-spin h-5 w-5 rounded-full border-2 border-white border-t-transparent mr-2" />
                            Retrying...
                          </>
                        ) : (
                          <>
                            <ArrowPathIcon className="h-5 w-5 mr-2" />
                            Try Again
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={handleBackToHome}
                      className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200"
                    >
                      Back to Home
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-t-gray-500 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}