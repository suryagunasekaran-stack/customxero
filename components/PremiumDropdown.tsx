'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

export interface DropdownOption {
  value: string;
  label: string;
  action?: () => void;
}

interface PremiumDropdownProps {
  options: DropdownOption[];
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  renderSelectedValue?: (selectedOption: DropdownOption | undefined) => React.ReactNode;
  renderOption?: (option: DropdownOption, isSelected: boolean) => React.ReactNode;
}

export default function PremiumDropdown({
  options,
  value,
  placeholder = "Select option",
  onChange,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  renderSelectedValue,
  renderOption
}: PremiumDropdownProps) {
  const selectedOption = options.find(option => option.value === value);

  const handleSelect = (option: DropdownOption) => {
    if (option.action) {
      option.action();
    } else if (onChange) {
      onChange(option.value);
    }
  };

  const renderButtonContent = () => {
    if (renderSelectedValue) {
      return renderSelectedValue(selectedOption);
    }
    return selectedOption?.label || placeholder;
  };

  const renderMenuItem = (option: DropdownOption) => {
    const isSelected = option.value === value;
    
    if (renderOption) {
      return renderOption(option, isSelected);
    }
    
    return (
      <span className="block px-4 py-2 text-sm text-gray-700 data-focus:bg-gray-100 data-focus:text-gray-900 data-focus:outline-hidden">
        {option.label}
      </span>
    );
  };

  return (
    <Menu as="div" className={`relative inline-block text-left ${className}`}>
      <div>
        <MenuButton className={`inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 ${buttonClassName}`}>
          {renderButtonContent()}
          <ChevronDownIcon aria-hidden="true" className="-mr-1 size-5 text-gray-400" />
        </MenuButton>
      </div>

      <MenuItems
        transition
        className={`absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 transition focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in ${menuClassName}`}
      >
        <div className="py-1">
          {options.map((option) => (
            <MenuItem key={option.value}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => handleSelect(option)}
              >
                {renderMenuItem(option)}
              </button>
            </MenuItem>
          ))}
        </div>
      </MenuItems>
    </Menu>
  );
} 