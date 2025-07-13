import React from 'react';

interface BaseCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  iconBackgroundColor?: string;
  actions?: React.ReactNode;
}

export const BaseCard: React.FC<BaseCardProps> = ({ 
  title, 
  description, 
  icon, 
  children, 
  className = '',
  headerClassName = '',
  contentClassName = '',
  iconBackgroundColor = 'bg-gray-100',
  actions
}) => {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200 ${className}`}>
      <div className={`p-6 ${contentClassName}`}>
        {/* Header */}
        <div className={`flex items-center justify-between mb-4 ${headerClassName}`}>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            {description && (
              <p className="text-sm text-gray-500 mt-1">{description}</p>
            )}
          </div>
          {icon && (
            <div className={`p-2 rounded-lg ${iconBackgroundColor} ml-4`}>
              {icon}
            </div>
          )}
        </div>

        {/* Content */}
        {children}

        {/* Actions */}
        {actions && (
          <div className="mt-6">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

// Specialized card for functions/features
interface FunctionBaseCardProps extends BaseCardProps {
  disabled?: boolean;
}

export const FunctionBaseCard: React.FC<FunctionBaseCardProps> = ({ 
  disabled = false,
  className = '',
  ...props 
}) => {
  return (
    <BaseCard 
      className={`${className} ${disabled ? 'opacity-50' : ''}`}
      {...props}
    />
  );
};

export default BaseCard;