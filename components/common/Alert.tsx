import React from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  type: AlertType;
  message: string;
  onClose?: () => void;
  className?: string;
}

const alertStyles: Record<AlertType, { 
  container: string; 
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; 
  iconColor: string;
  textColor: string;
}> = {
  success: {
    container: 'bg-green-50 border-green-200',
    icon: CheckCircleIcon,
    iconColor: 'text-green-500',
    textColor: 'text-green-800'
  },
  error: {
    container: 'bg-red-50 border-red-200',
    icon: XCircleIcon,
    iconColor: 'text-red-500',
    textColor: 'text-red-800'
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200',
    icon: ExclamationCircleIcon,
    iconColor: 'text-yellow-500',
    textColor: 'text-yellow-800'
  },
  info: {
    container: 'bg-blue-50 border-blue-200',
    icon: InformationCircleIcon,
    iconColor: 'text-blue-500',
    textColor: 'text-blue-800'
  }
};

export const Alert: React.FC<AlertProps> = ({ type, message, onClose, className = '' }) => {
  const styles = alertStyles[type];
  const Icon = styles.icon;

  return (
    <div className={`mb-4 p-3 border rounded-lg ${styles.container} ${className}`}>
      <div className="flex items-start">
        <Icon className={`h-5 w-5 ${styles.iconColor} mr-2 flex-shrink-0 mt-0.5`} />
        <p className={`text-sm ${styles.textColor} flex-1`}>{message}</p>
        {onClose && (
          <button
            onClick={onClose}
            className={`ml-2 ${styles.iconColor} hover:opacity-70 transition-opacity`}
            aria-label="Close alert"
          >
            <XCircleIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// Convenience components for specific alert types
export const SuccessAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => (
  <Alert type="success" {...props} />
);

export const ErrorAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => (
  <Alert type="error" {...props} />
);

export const WarningAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => (
  <Alert type="warning" {...props} />
);

export const InfoAlert: React.FC<Omit<AlertProps, 'type'>> = (props) => (
  <Alert type="info" {...props} />
);

export default Alert;