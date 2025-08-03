# STYLE.md - CustomXero UI/UX Style Guide

This document provides comprehensive documentation of the visual design system, UI/UX patterns, and styling guidelines used in the CustomXero application, specifically focusing on the `/organisation/xero` page and its components.

## Table of Contents
1. [Color System](#color-system)
2. [Typography](#typography)
3. [Layout Structure](#layout-structure)
4. [Component Patterns](#component-patterns)
5. [Interactive Elements](#interactive-elements)
6. [Visual Hierarchy](#visual-hierarchy)
7. [Responsive Design](#responsive-design)
8. [Animation & Transitions](#animation--transitions)
9. [Component Library](#component-library)

## Color System

### Primary Brand Colors
The application uses OKLCH color space for precise color control with better perceptual uniformity:

```css
/* Primary Dark Purple - Header/Navigation */
background-color: oklch(21.6% 0.006 56.043)

/* Primary Action Purple - Buttons */
background-color: oklch(27.4% 0.006 286.033)
```

### Semantic Color Palette

#### Status Colors
- **Success**: Green shades (`green-50` to `green-900`)
  - Background: `bg-green-50`
  - Border: `border-green-200`
  - Text: `text-green-600`, `text-green-800`, `text-green-900`
  - Icons: `text-green-500` (CheckCircleIcon)

- **Error/Danger**: Red shades (`red-50` to `red-900`)
  - Background: `bg-red-50`
  - Border: `border-red-200`
  - Text: `text-red-600`, `text-red-700`, `text-red-800`
  - Icons: `text-red-500` (XCircleIcon)

- **Warning**: Amber/Yellow shades
  - Background: `bg-amber-50`, `bg-yellow-50`
  - Border: `border-amber-200`, `border-yellow-200`
  - Text: `text-amber-700`, `text-yellow-800`
  - Icons: `text-amber-500` (ExclamationCircleIcon)

- **Info**: Blue shades (`blue-50` to `blue-900`)
  - Background: `bg-blue-50`
  - Border: `border-blue-200`
  - Text: `text-blue-700`, `text-blue-900`
  - Icons: `text-blue-500`

- **Secondary Info**: 
  - Teal: `bg-teal-50`, `border-teal-200`, `text-teal-900`
  - Purple: `bg-purple-50`, `border-purple-200`, `text-purple-900`
  - Indigo: `bg-indigo-50`, `border-indigo-200`, `text-indigo-900`

#### Neutral Colors
- **Backgrounds**: 
  - Page: `bg-gray-50`
  - Cards: `bg-white`
  - Overlays: `bg-gray-500 bg-opacity-75`
  - Hover states: `bg-gray-100`

- **Text**:
  - Primary: `text-gray-900`
  - Secondary: `text-gray-600`, `text-gray-700`
  - Muted: `text-gray-500`
  - Disabled: `text-gray-400`

- **Borders**: 
  - Light: `border-gray-100`
  - Medium: `border-gray-200`, `border-gray-300`

## Typography

### Font Stack
```css
font-family: Arial, Helvetica, sans-serif;
```

### Text Sizes & Weights
- **Page Title**: `text-3xl font-bold text-gray-900`
- **Section Headers**: `text-xl font-semibold text-gray-800`
- **Card Headers**: `text-xl font-semibold text-gray-900`
- **Subsection Headers**: `text-sm font-semibold`
- **Body Text**: `text-sm text-gray-600`
- **Small Text**: `text-xs text-gray-500`
- **Micro Text**: `text-xs text-gray-400`

### Text Styling Patterns
- **Emphasis**: `font-medium`, `font-semibold`, `font-bold`
- **Muted**: Lower opacity colors (500-600 range)
- **Interactive**: Underline on hover, color changes
- **Truncation**: `truncate` class for overflow text

## Layout Structure

### Page Architecture
```
<div className="min-h-screen bg-gray-50">
  <OrganisationHeader />
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Page Content -->
  </main>
</div>
```

### Container System
- **Max Width**: `max-w-7xl` (1280px)
- **Padding**: 
  - Mobile: `px-4`
  - Tablet: `sm:px-6`
  - Desktop: `lg:px-8`
- **Vertical Spacing**: `py-8`

### Grid Systems
- **Two Column**: `grid gap-6 md:grid-cols-2`
- **Three Column**: `grid grid-cols-3 gap-3`
- **Responsive Grid**: Stacks on mobile, columns on desktop

### Spacing Scale
- **Component Spacing**: `space-y-8` (major sections)
- **Element Spacing**: `space-y-4` (within sections)
- **Item Spacing**: `space-y-2` (list items)
- **Micro Spacing**: `space-y-1` (tight groupings)
- **Margins**: `mb-8`, `mb-4`, `mb-3`, `mb-2`, `mt-1`
- **Padding**: `p-6`, `p-4`, `p-3`, `p-2`

## Component Patterns

### Card Component Structure
```jsx
<div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-200">
  <div className="p-6">
    {/* Card Header */}
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Title</h2>
        <p className="text-sm text-gray-500 mt-1">Description</p>
      </div>
      <div className="p-2 bg-gray-100 rounded-lg">
        <Icon className="h-6 w-6 text-gray-600" />
      </div>
    </div>
    
    {/* Card Content */}
    <div className="space-y-4">
      {/* Content sections */}
    </div>
  </div>
</div>
```

### Alert/Message Patterns
```jsx
{/* Success Alert */}
<div className="bg-green-50 border border-green-200 rounded-lg p-3">
  <div className="flex items-center">
    <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
    <span className="text-sm text-green-700">Message</span>
  </div>
</div>

{/* Error Alert */}
<div className="bg-red-50 border border-red-200 rounded-lg p-3">
  <div className="flex items-center">
    <XCircleIcon className="h-5 w-5 text-red-600 mr-2" />
    <span className="text-sm text-red-700">Error message</span>
  </div>
</div>
```

### Progress Indicator Pattern
```jsx
<div className="flex items-start">
  <div className="flex-shrink-0 mt-0.5">
    {/* Status Icon */}
    {status === 'completed' && <CheckCircleIconSolid className="h-5 w-5 text-green-500" />}
    {status === 'running' && <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin" />}
    {status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-gray-300" />}
  </div>
  <div className="ml-3 flex-1">
    <p className="text-sm">Step description</p>
  </div>
</div>
```

### Stat Card Pattern
```jsx
<div className="bg-white rounded-lg p-3">
  <div className="text-2xl font-bold text-gray-900">123</div>
  <div className="text-xs text-gray-600">Label</div>
</div>
```

## Interactive Elements

### Button Styles

#### Primary Action Button
```jsx
<button
  className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
  style={{
    backgroundColor: disabled ? 'oklch(21.6% 0.006 56.043)' : 'oklch(27.4% 0.006 286.033)'
  }}
  onMouseEnter={(e) => {
    if (!disabled) e.currentTarget.style.backgroundColor = 'oklch(21.6% 0.006 56.043)';
  }}
  onMouseLeave={(e) => {
    if (!disabled) e.currentTarget.style.backgroundColor = 'oklch(27.4% 0.006 286.033)';
  }}
>
  <Icon className="h-5 w-5 mr-2" />
  Button Text
</button>
```

#### Secondary Button
```jsx
<button className="w-full inline-flex items-center justify-center px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-200">
  <Icon className="h-4 w-4 mr-2" />
  Secondary Action
</button>
```

#### Small Action Button
```jsx
<button className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
  <Icon className="h-3 w-3 mr-1" />
  Action
</button>
```

### Link Styles
```jsx
<button className="text-xs text-green-700 hover:text-green-800 underline">
  Link Text
</button>
```

### Disabled States
- Opacity: `disabled:opacity-50`
- Cursor: `disabled:cursor-not-allowed`
- Prevent hover effects when disabled

## Visual Hierarchy

### Z-Index Layers
- Base content: `z-0`
- Popover/Dialog backdrop: `z-10`, `z-20`
- Modal content: `z-30`

### Shadow System
- Cards: `shadow-sm` (default), `hover:shadow-md` (hover)
- Modals: `shadow-xl`
- Floating elements: `shadow-lg`

### Border Radius
- Cards: `rounded-xl`
- Buttons: `rounded-lg`
- Small elements: `rounded-md`
- Pills/Tags: `rounded-full`

## Responsive Design

### Breakpoints
- Mobile: Default (< 640px)
- Tablet: `sm:` (640px+)
- Desktop: `md:` (768px+), `lg:` (1024px+)

### Responsive Patterns
```jsx
{/* Hide on mobile, show on desktop */}
<div className="hidden lg:block">

{/* Stack on mobile, grid on desktop */}
<div className="grid gap-6 md:grid-cols-2">

{/* Responsive padding */}
<div className="px-4 sm:px-6 lg:px-8">
```

## Animation & Transitions

### Standard Transitions
- Duration: `duration-200` (quick), `duration-300` (normal)
- Easing: `ease-out` (enter), `ease-in` (leave)
- Properties: 
  - Shadows: `transition-shadow`
  - Colors: `transition-colors`
  - All: `transition-all`

### Loading States
```jsx
{/* Spinning loader */}
<div className="animate-spin h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-500" />

{/* Pulsing skeleton */}
<div className="animate-pulse bg-gray-200 rounded h-4 w-full" />
```

### Hover Effects
- Cards: Shadow increase on hover
- Buttons: Color darkening on hover
- Links: Underline or color change

## Component Library

### Core Components Used

#### Icons (Heroicons)
- **Outline Icons** (24px):
  - `ArrowPathIcon` - Loading/refresh
  - `CheckCircleIcon` - Success
  - `XCircleIcon` - Error/close
  - `ExclamationCircleIcon` - Warning
  - `DocumentMagnifyingGlassIcon` - Search/analyze
  - `DocumentArrowDownIcon` - Download
  - `WrenchScrewdriverIcon` - Fix/repair
  
- **Solid Icons** (24px):
  - `CheckCircleIcon as CheckCircleIconSolid` - Completed state

#### Headless UI Components
- `Dialog` - Modal dialogs
- `Transition` - Animation wrappers
- `Popover` - Dropdown menus

### Phase-Based Color Coding
The application uses different colors for different operational phases:

- **Phase 1 (Deal Validation)**: Blue theme
- **Phase 2 (Invoice Validation)**: Teal theme  
- **Phase 3 (Quote Comparison)**: Purple theme
- **Phase 4 (Project Validation)**: Indigo theme

### Collapsible Details Pattern
```jsx
<details className="group">
  <summary className="cursor-pointer text-xs text-black hover:text-gray-800">
    View details
  </summary>
  <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
    {/* Content */}
  </div>
</details>
```

## Best Practices

1. **Consistency**: Use predefined color and spacing scales
2. **Accessibility**: Maintain proper contrast ratios and focus states
3. **Performance**: Use Tailwind's purge to minimize CSS bundle
4. **Responsiveness**: Test all breakpoints and ensure mobile-first approach
5. **Animation**: Keep animations subtle and purposeful
6. **Hover States**: Provide clear visual feedback for interactive elements
7. **Loading States**: Always show loading indicators for async operations
8. **Error Handling**: Display clear, actionable error messages
9. **Progressive Disclosure**: Use collapsible sections for detailed information
10. **Visual Hierarchy**: Use size, color, and spacing to guide user attention

## Component Naming Conventions

- **Page Components**: PascalCase with descriptive names (e.g., `XeroPageV2Example`)
- **Feature Cards**: `[Feature]Card` pattern (e.g., `ProjectSyncCard`, `TimesheetProcessingCard`)
- **Modals**: `[Purpose]Modal` pattern (e.g., `TenantConfirmationModal`)
- **Utility Components**: Descriptive names (e.g., `ProcessingStepsDisplay`, `XeroUpdatePreview`)

## State Management Visual Cues

- **Idle**: Default styling
- **Loading**: Spinner animations, disabled interactions
- **Success**: Green colors, checkmark icons
- **Error**: Red colors, X icons
- **Warning**: Amber/yellow colors, exclamation icons
- **Processing**: Blue colors, animated spinners
- **Disabled**: Reduced opacity, no-cursor pointer

This style guide ensures consistent, professional, and user-friendly interfaces across the CustomXero application. Please keep all the visual minimum. Do not need a lot of description, text, explaination. Any thing should be extremeley minimal looking and good. 