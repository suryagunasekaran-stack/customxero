'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

/**
 * Authentication error content component that displays specific error messages
 * Maps NextAuth error codes to user-friendly messages
 * @returns {JSX.Element} Error message display with action buttons
 */
function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const errorMessages: Record<string, string> = {
    Configuration: 'There is a problem with the server configuration.',
    AccessDenied: 'You do not have permission to sign in.',
    Verification: 'The sign in link is no longer valid.',
    OAuthSignin: 'Error constructing an authorization URL.',
    OAuthCallback: 'Error handling the response from OAuth provider.',
    OAuthCreateAccount: 'Could not create OAuth provider user in the database.',
    EmailCreateAccount: 'Could not create email provider user in the database.',
    Callback: 'Error in the OAuth callback handler route.',
    OAuthAccountNotLinked: 'This account is already linked with another user.',
    SessionRequired: 'Please sign in to access this page.',
    Default: 'Unable to sign in.',
  };

  const errorMessage = error ? errorMessages[error] || errorMessages.Default : errorMessages.Default;

  return (
    <div className="w-full max-w-md p-8 bg-white shadow-xl rounded-lg text-center">
      <div className="mb-6">
        <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Authentication Error
        </h1>
        <p className="text-gray-600">
          {errorMessage}
        </p>
        {error && (
          <p className="text-sm text-gray-500 mt-2">
            Error code: {error}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <Link
          href="/"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
        >
          Try Again
        </Link>
        
        <Link
          href="/"
          className="block w-full text-blue-600 hover:text-blue-700 font-medium py-2"
        >
          Back to Home
        </Link>
      </div>

      <p className="text-xs text-gray-500 mt-6">
        If this problem persists, please contact your administrator.
      </p>
    </div>
  );
}

/**
 * Authentication error page component with Suspense wrapper
 * Displays detailed error information for authentication failures
 * Provides fallback UI while loading error details
 * @returns {JSX.Element} Full page error display with loading fallback
 */
export default function AuthError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50">
      <Suspense fallback={
        <div className="w-full max-w-md p-8 bg-white shadow-xl rounded-lg text-center">
          <div className="animate-pulse">
            <div className="h-16 w-16 bg-gray-300 rounded-full mx-auto mb-4"></div>
            <div className="h-4 bg-gray-300 rounded w-3/4 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2 mx-auto"></div>
          </div>
        </div>
      }>
        <AuthErrorContent />
      </Suspense>
    </div>
  );
} 