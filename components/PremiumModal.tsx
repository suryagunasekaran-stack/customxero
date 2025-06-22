'use client';

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { ReactNode } from 'react';

export interface ModalAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  autoFocus?: boolean;
}

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  iconBgColor?: string;
  actions?: ModalAction[];
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function PremiumModal({
  isOpen,
  onClose,
  title,
  children,
  icon,
  iconBgColor = 'bg-gray-100',
  actions = [],
  maxWidth = 'lg'
}: PremiumModalProps) {
  const maxWidthClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl'
  };

  const getButtonClasses = (variant: ModalAction['variant'] = 'secondary') => {
    const baseClasses = 'inline-flex w-full justify-center rounded-md px-3 py-2 text-sm font-semibold shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2';
    
    switch (variant) {
      case 'primary':
        return `${baseClasses} bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600`;
      case 'danger':
        return `${baseClasses} bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600`;
      case 'secondary':
      default:
        return `${baseClasses} bg-white text-gray-900 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 focus-visible:outline-gray-600`;
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className={`relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full ${maxWidthClasses[maxWidth]} sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95`}
          >
            <div>
              {icon && (
                <div className={`mx-auto flex size-12 items-center justify-center rounded-full ${iconBgColor}`}>
                  {icon}
                </div>
              )}
              <div className={`${icon ? 'mt-3' : ''} text-center sm:mt-5`}>
                <DialogTitle as="h3" className="text-base font-semibold text-gray-900">
                  {title}
                </DialogTitle>
                <div className="mt-2">
                  {children}
                </div>
              </div>
            </div>
            
            {actions.length > 0 && (
              <div className={`${actions.length === 1 ? 'mt-5 sm:mt-6' : 'mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3'}`}>
                {actions.map((action, index) => {
                  const isFirstAction = index === 0;
                  const isSecondAction = index === 1;
                  
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      autoFocus={action.autoFocus}
                      className={`${getButtonClasses(action.variant)} ${
                        actions.length === 2 ? (
                          isFirstAction ? 'sm:col-start-2' : 'mt-3 sm:col-start-1 sm:mt-0'
                        ) : ''
                      }`}
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            )}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
} 