import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LogProvider } from '../../contexts/LogContext';
import { XeroApiUsageProvider } from '../../contexts/XeroApiUsageContext';
import OrganisationHeader from '../../components/OrganisationHeader';

/**
 * Organisation layout component that wraps all organisation pages
 * Provides authentication, tenant validation, and context providers
 * Includes header navigation and main content area with proper styling
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render
 * @returns {Promise<JSX.Element>} The organisation layout with providers and header
 */
export default async function OrganisationLayout({ children }: { children: React.ReactNode }) {
    try {
        const session = await auth();
        
        if (!session) {
            redirect('/');
        }

        // Basic tenant check - just use session data to avoid edge runtime issues
        const availableTenants = session.tenants || [];
        
        if (!availableTenants || availableTenants.length === 0) {
            // No tenants available, need to re-authenticate
            redirect('/api/connect');
        }
        
        return (
            <LogProvider>
                <XeroApiUsageProvider>
                    <div className="min-h-screen bg-gray-50">
                        <OrganisationHeader />
                        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                            {children}
                        </main>
                    </div>
                </XeroApiUsageProvider>
            </LogProvider>
        )
    } catch (error) {
        console.error('[Organisation Layout] Error:', error);
        redirect('/auth/error');
    }
}
