import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Xero Projects",
  description: "Project management with Xero integration",
};

const user = {
  name: 'Admin User',
  email: 'admin@example.com',
  imageUrl: 'https://avatar.iran.liara.run/public/46',
};

const navigation = [
  { name: 'Manhour Details', href: '/', current: true },
  { name: 'Projects', href: '/organisation', current: false },
];

const userNavigation = [
  { name: 'Your Profile', href: '#' },
  { name: 'Settings', href: '#' },
  { name: 'Sign out', href: '#' },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full bg-gray-100">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
      >
        <div className="min-h-full">
          <div className="bg-gray-800 pb-32">
            <nav className="bg-gray-800">
              <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
                <div className="border-b border-gray-700">
                  <div className="flex h-16 items-center justify-between px-4 sm:px-0">
                    <div className="flex items-center">
                      <div className="shrink-0">
                        <Image
                          alt="Xero Projects"
                          src="/logo512-removebg-preview_edited_non_transparent-removebg-preview.png"
                          className="size-8"
                          width={32}
                          height={32}
                          unoptimized
                        />
                      </div>
                      <div className="hidden md:block">
                        <div className="ml-10 flex items-baseline space-x-4">
                          {navigation.map((item) => (
                            <Link
                              key={item.name}
                              href={item.href}
                              aria-current={item.current ? 'page' : undefined}
                              className={classNames(
                                item.current
                                  ? 'bg-gray-900 text-white'
                                  : 'text-gray-300 hover:bg-gray-700 hover:text-white',
                                'rounded-md px-3 py-2 text-sm font-medium',
                              )}
                            >
                              {item.name}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <div className="ml-4 flex items-center md:ml-6">
                        <button
                          type="button"
                          className="relative rounded-full bg-gray-800 p-1 text-gray-400 hover:text-white focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800 focus:outline-none"
                        >
                          <span className="absolute -inset-1.5" />
                          <span className="sr-only">View notifications</span>
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                          </svg>
                        </button>

                        {/* Profile dropdown - simplified for now */}
                        <div className="relative ml-3">
                          <div>
                            <button className="relative flex max-w-xs items-center rounded-full bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                              <span className="absolute -inset-1.5" />
                              <span className="sr-only">Open user menu</span>
                              <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="-mr-2 flex md:hidden">
                      {/* Mobile menu button - simplified for now */}
                      <button type="button" className="relative inline-flex items-center justify-center rounded-md bg-gray-800 p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-800">
                        <span className="absolute -inset-0.5" />
                        <span className="sr-only">Open main menu</span>
                        <svg className="block h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </nav>
            
            <header className="py-10">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <h1 className="text-3xl font-bold tracking-tight text-white">Xero Project Management</h1>
              </div>
            </header>
          </div>

          <main className="-mt-32">
            <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
              <div className="rounded-lg bg-white px-5 py-6 shadow-sm sm:px-6">
                {children}
              </div>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
