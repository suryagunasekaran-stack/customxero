'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  
  const error = searchParams.get('error');
  
  const getErrorMessage = () => {
    switch (error) {
      case 'Configuration':
        return {
          title: 'Configuration Error',
          message: 'There is a problem with the server configuration. Please contact support.',
          canRetry: false
        };
      case 'AccessDenied':
        return {
          title: 'Access Denied',
          message: 'You do not have permission to sign in. Please ensure you have the correct Xero account permissions.',
          canRetry: true
        };
      case 'Verification':
        return {
          title: 'Verification Failed',
          message: 'The sign in link is no longer valid. It may have been used already or expired.',
          canRetry: true
        };
      case 'OAuthSignin':
        return {
          title: 'Sign In Failed',
          message: 'Error occurred while connecting to Xero. Please try again.',
          canRetry: true
        };
      case 'OAuthCallback':
        return {
          title: 'Authentication Error',
          message: 'Error in handling the response from Xero. Please try again.',
          canRetry: true
        };
      case 'OAuthCreateAccount':
        return {
          title: 'Account Creation Failed',
          message: 'Could not create user account. Please contact support.',
          canRetry: false
        };
      case 'EmailCreateAccount':
        return {
          title: 'Account Creation Failed',
          message: 'Could not create user account. Please contact support.',
          canRetry: false
        };
      case 'Callback':
        return {
          title: 'Callback Error',
          message: 'Error occurred during the authentication callback. Please try again.',
          canRetry: true
        };
      case 'Default':
      default:
        return {
          title: 'Authentication Error',
          message: 'An unexpected error occurred during sign in. Please try again.',
          canRetry: true
        };
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
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">
            {errorInfo.title}
          </h1>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl rounded-lg sm:px-10">
          <div className="space-y-6">
            <div>
              <p className="text-sm text-gray-600 text-center">
                {errorInfo.message}
              </p>
              {error && (
                <p className="mt-2 text-xs text-gray-500 text-center">
                  Error code: {error}
                </p>
              )}
            </div>

            <div className="space-y-3">
              {errorInfo.canRetry && (
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="w-full flex justify-center items-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#13B5EA] hover:bg-[#0FA5D9] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#13B5EA] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isRetrying ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Retrying...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Try Again
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleBackToHome}
                className="w-full flex justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                Back to Home
              </button>
            </div>

            <div className="mt-6 border-t border-gray-200 pt-6">
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-2">Need help?</p>
                <ul className="space-y-1 text-xs">
                  <li>• Ensure you have the correct Xero account permissions</li>
                  <li>• Check that your Xero subscription is active</li>
                  <li>• Clear your browser cache and cookies</li>
                  <li>• Try using a different browser</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-600">
          If the problem persists, please contact your system administrator
        </p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading error details...</p>
        </div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}