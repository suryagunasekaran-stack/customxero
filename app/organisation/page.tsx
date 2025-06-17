import React from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function OrganisationPage() {
  const session = await auth();
  
  if (!session) {
    redirect('/');
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisation Dashboard</h1>
          <p className="mt-2 text-sm text-gray-700">
            Welcome back, {session.user?.email}! This is the main dashboard for the organisation.
          </p>
        </div>
      </div>
      <p className="text-sm text-gray-700">
        Select an integration from the navigation to view specific data.
      </p>
      {/* You can add more specific content for the /organisation path here */}
    </div>
  );
}
