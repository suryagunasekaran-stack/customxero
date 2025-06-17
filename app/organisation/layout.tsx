import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { LogProvider } from '../../contexts/LogContext';
import { XeroApiUsageProvider } from '../../contexts/XeroApiUsageContext';
import ConsoleLog from '../../components/ConsoleLog';
import XeroApiUsageBar from '../../components/XeroApiUsageBar';
import TestApiCallButton from '../../components/xero/TestApiCallButton';
import OrganisationHeader from '../../components/OrganisationHeader';

export default async function OrganisationLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    
    if (!session) {
        redirect('/');
    }
    return (
        <LogProvider>
            <XeroApiUsageProvider>
            <>
                <div className="min-h-screen flex flex-col bg-white-100">
                    <OrganisationHeader />
                    <main className=" bg-gray-100  -mt-24 pb-8 min-h-[100vh]">
                        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:max-w-7xl lg:px-8 pt-8">
                            <h1 className="sr-only">Page title</h1>
                            {/* Main 3 column grid */}
                            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-8">
                                {/* Left column */}
                                <div className="grid grid-cols-1 gap-4 lg:col-span-2 min-h-[100vh]">
                                    <section aria-labelledby="section-1-title">
                                        <h2 id="section-1-title" className="sr-only">
                                            Section title
                                        </h2>
                                        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
                                            <div className="p-6 text-black">{children}</div>
                                        </div>
                                    </section>
                                </div>

                                {/* Right column */}
                                <div className="grid grid-cols-1 gap-4">
                                    {/* Test API Call Button */}
                                    <section aria-labelledby="test-api-title">
                                        <h2 id="test-api-title" className="sr-only">
                                            Test API Call
                                        </h2>
                                        <TestApiCallButton />
                                    </section>
                                    
                                    {/* Xero API Usage */}
                                    <section aria-labelledby="api-usage-title">
                                        <h2 id="api-usage-title" className="sr-only">
                                            API Usage
                                        </h2>
                                        <XeroApiUsageBar />
                                    </section>
                                    
                                    {/* Console */}
                                    <section aria-labelledby="section-2-title">
                                        <h2 id="section-2-title" className="sr-only">
                                            Console
                                        </h2>
                                        <div className="overflow-hidden rounded-lg bg-white shadow-sm h-full">
                                            <div className="p-6 h-full">
                                                <ConsoleLog />
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    </main>
                    <footer>
                        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:max-w-7xl lg:px-8">
                            <div className="border-t border-gray-200 py-8 text-center text-sm text-gray-500 sm:text-left">
                                <span className="block sm:inline">&copy; 2021 Your Company, Inc.</span>{' '}
                                <span className="block sm:inline">All rights reserved.</span>
                            </div>
                        </div>
                    </footer>
                </div>
            </>
            </XeroApiUsageProvider>
        </LogProvider>
    )
}
