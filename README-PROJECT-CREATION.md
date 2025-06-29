# Project Creation with Automatic Tasks

## Overview
The project creation feature automatically creates projects in Xero and sets up 5 standard tasks for each project.

## Standard Tasks Created
For every project created, the following tasks are automatically added:
1. **Manhour** - Fixed rate, SGD 0.01
2. **Overtime** - Fixed rate, SGD 0.01  
3. **Internal Manpower** - Fixed rate, SGD 0.01
4. **External Manpower** - Fixed rate, SGD 0.01
5. **Transport** - Fixed rate, SGD 0.01

## JSON Format
```json
[
  {
    "contactId": "contact-uuid-here",
    "name": "Project Name",
    "estimateAmount": 1000.00,
    "deadlineUtc": "2025-12-31T23:59:59.000Z"
  }
]
```

### Required Fields
- `contactId`: Valid Xero contact UUID
- `name`: Project name (must be unique)

### Optional Fields  
- `estimateAmount`: Estimated project value (number)
- `deadlineUtc`: Project deadline in ISO format

## Features
- ✅ **Batch Creation**: Upload multiple projects at once
- ✅ **Automatic Tasks**: 5 standard tasks created per project
- ✅ **Idempotency**: Duplicate prevention with unique keys
- ✅ **Error Handling**: Partial success support
- ✅ **Detailed Reporting**: Shows project and task creation status

## Usage
1. Navigate to **Xero Page** → **Project Management**
2. Click **Create Projects** card
3. Upload JSON file or drag & drop
4. Review parsed projects
5. Click **Create Projects**
6. Monitor results with task creation details

## API Details
- **Endpoint**: `POST /api/xero/projects/create`
- **Rate Limited**: Smart rate limiting between calls
- **Audit Logged**: Full audit trail of operations
- **Error Recovery**: Continues processing if individual projects fail

## Example Results
```
✅ Kitchen Renovation Project (ID: abc-123)
  Tasks:
  ✓ Manhour
  ✓ Overtime  
  ✓ Internal Manpower
  ✓ External Manpower
  ✓ Transport
``` 