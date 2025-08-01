'use client';

import {
    Popover,
    PopoverBackdrop,
    PopoverButton,
    PopoverPanel,
} from '@headlessui/react'
import { Bars3Icon, BellIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { signOut, useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import TenantSwitcher from './TenantSwitcher'

/**
 * Utility function to combine CSS class names
 * Filters out falsy values and joins remaining classes with spaces
 * @param {...string} classes - Variable number of class name strings
 * @returns {string} Combined class names string
 */
function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ')
}

/**
 * Organisation header component with navigation and user menu
 * Provides responsive navigation bar with tenant switching, search, and user profile
 * Includes both desktop and mobile layouts with popover menu
 * @returns {JSX.Element} Complete header navigation component
 */
export default function OrganisationHeader() {
    const { data: session } = useSession()
    const pathname = usePathname()
    
    const navigation = [
        { name: 'Xero', href: '/organisation/xero', current: pathname === '/organisation/xero' },
    ]

    const user = {
        name: session?.user?.name || session?.user?.email || 'User',
        email: session?.user?.email || '',
        imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    }

    return (
        <Popover as="header" className="pb-8" style={{ backgroundColor: 'oklch(21.6% 0.006 56.043)' }}>
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:max-w-7xl lg:px-8">
                <div className="relative flex items-center justify-center py-3 lg:justify-between">
                    {/* Logo */}
                    <div className="absolute left-0 shrink-0 lg:static">
                        <a href="#">
                            <div className="flex items-center gap-2">

                                <img
                                    alt="Your Company"
                                    src="/logo512-removebg-preview_edited_non_transparent-removebg-preview.png"
                                    className="h-8 w-auto"
                                />
                                                                <span>Brightsun Marine</span>
                            </div>
                        </a>
                    </div>

                    {/* Right section on desktop */}
                    <div className="hidden lg:ml-4 lg:flex lg:items-center lg:pr-0.5 lg:gap-4">
                        {/* User info */}
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <div className="text-sm font-medium text-white">{user.name}</div>
                                <div className="text-xs text-indigo-200">{user.email}</div>
                            </div>
                        </div>
                        
                        {/* Sign out button */}
                        <button
                            onClick={() => signOut({ callbackUrl: '/' })}
                            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                            style={{
                                backgroundColor: 'oklch(27.4% 0.006 286.033)'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                            }}
                        >
                            Sign Out
                        </button>
                    </div>


                    {/* Menu button */}
                    <div className="absolute right-0 shrink-0 lg:hidden">
                        {/* Mobile menu button */}
                        <PopoverButton className="group relative inline-flex items-center justify-center rounded-md bg-transparent p-2 text-indigo-200 hover:bg-white/10 hover:text-white focus:ring-2 focus:ring-white focus:outline-hidden">
                            <span className="absolute -inset-0.5" />
                            <span className="sr-only">Open main menu</span>
                            <Bars3Icon aria-hidden="true" className="block size-6 group-data-open:hidden" />
                            <XMarkIcon aria-hidden="true" className="hidden size-6 group-data-open:block" />
                        </PopoverButton>
                    </div>
                </div>
                <div className="hidden border-t border-white/20 py-3 lg:block">
                    <div className="grid grid-cols-3 items-center gap-8">
                        <div className="col-span-2">
                            <nav className="flex space-x-4 items-center">
                                {navigation.map((item) => (
                                    <a
                                        key={item.name}
                                        href={item.href}
                                        aria-current={item.current ? 'page' : undefined}
                                        className={classNames(
                                            item.current ? 'text-white' : 'text-indigo-100',
                                            'rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10',
                                        )}
                                    >
                                        {item.name}
                                    </a>
                                ))}
                                <div className="ml-4">
                                    <TenantSwitcher />
                                </div>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>

            <div className="lg:hidden">
                <PopoverBackdrop
                    transition
                    className="fixed inset-0 z-20 bg-black/25 duration-150 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
                />

                <PopoverPanel
                    focus
                    transition
                    className="absolute inset-x-0 top-0 z-30 mx-auto w-full max-w-3xl origin-top transform p-2 transition duration-150 data-closed:scale-95 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
                >
                    <div className="divide-y divide-gray-200 rounded-lg bg-white shadow-lg ring-1 ring-black/5">
                        <div className="pt-3 pb-2">
                            <div className="flex items-center justify-between px-4">
                                <div>
                                    <img
                                        alt="Your Company"
                                        src="https://tailwindcss.com/plus-assets/img/logos/mark.svg?color=indigo&shade=600"
                                        className="h-8 w-auto"
                                    />
                                </div>
                                <div className="-mr-2">
                                    <PopoverButton className="relative inline-flex items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden focus:ring-inset">
                                        <span className="absolute -inset-0.5" />
                                        <span className="sr-only">Close menu</span>
                                        <XMarkIcon aria-hidden="true" className="size-6" />
                                    </PopoverButton>
                                </div>
                            </div>
                            <div className="mt-3 space-y-1 px-2">
                                {navigation.map((item) => (
                                    <a
                                        key={item.name}
                                        href={item.href}
                                        className="block rounded-md px-3 py-2 text-base font-medium text-gray-900 hover:bg-gray-100 hover:text-gray-800"
                                    >
                                        {item.name}
                                    </a>
                                ))}
                                <div className="px-3 py-2 w-full">
                                    <TenantSwitcher />
                                </div>
                            </div>
                        </div>
                        <div className="pt-4 pb-2">
                            <div className="flex items-center px-5">
                                <div className="shrink-0">
                                    <img alt="" src={user.imageUrl} className="size-10 rounded-full" />
                                </div>
                                <div className="ml-3 min-w-0 flex-1">
                                    <div className="truncate text-base font-medium text-gray-800">{user.name}</div>
                                    <div className="truncate text-sm font-medium text-gray-500">{user.email}</div>
                                </div>
                                <button
                                    type="button"
                                    className="relative ml-auto shrink-0 rounded-full bg-white p-1 text-gray-400 hover:text-gray-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-hidden"
                                >
                                    <span className="absolute -inset-1.5" />
                                    <span className="sr-only">View notifications</span>
                                </button>
                            </div>
                            <div className="mt-3 px-2">
                                <button
                                    onClick={() => signOut({ callbackUrl: '/' })}
                                    className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                                    style={{
                                        backgroundColor: 'oklch(27.4% 0.006 286.033)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
                                    }}
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </PopoverPanel>
            </div>
        </Popover>
    )
} 