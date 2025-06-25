# Project Sequences Management

## Overview

The Project Sequences Management system allows you to manage department project numbering sequences. Each department has its own sequence counter that tracks the last used project number for a given year.

## Features

- **View All Sequences**: See all department sequences with current counts and metadata
- **Edit Sequence Numbers**: Safely update sequence numbers with validation
- **Real-time Statistics**: View project counts and recent activity
- **Testing Range Support**: Automatically detects and suggests testing ranges (900-999)
- **Validation**: Prevents setting sequences lower than existing projects
- **Warning System**: Alerts when creating large gaps in sequences

## Setup

1. **Environment Variables**

   Add the MongoDB connection string to your `.env.local` file:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/shared?retryWrites=true&w=majority
   ```

2. **Test Connection**

   Run the test script to verify MongoDB connectivity:
   ```bash
   node scripts/test-mongodb-connection.js
   ```

3. **Access the Feature**

   Navigate to `/sequences` in your application to access the management interface.

## Usage

### Viewing Sequences

The main page displays:
- Department cards showing current sequence numbers
- Project counts for each department
- Recent project activity
- Overall statistics

### Editing Sequences

1. Click the pencil icon on any department card
2. Enter the new sequence number
3. Click the check mark to save
4. The system will validate and warn about any issues

### Testing Range

- Sequences 900-999 are reserved for testing
- The system automatically detects if testing range is available
- Click "Set to Testing Range" to jump to sequence 900

## Database Schema

### project_sequences Collection
```javascript
{
  _id: ObjectId,
  departmentCode: String,      // e.g., "NY", "EL", "MC"
  year: Number,                // e.g., 25 for 2025
  lastSequenceNumber: Number,  // e.g., 45
  createdAt: Date,
  updatedAt: Date
}
```

### deal_project_mappings Collection
```javascript
{
  _id: ObjectId,
  projectNumber: String,       // e.g., "NY25045"
  departmentCode: String,
  year: Number,
  sequence: Number,
  pipedriveDealIds: [String],
  createdAt: Date
}
```

## Department Codes

- **NY**: Navy
- **EL**: Electrical
- **MC**: Machining
- **AF**: Afloat
- **ED**: Engine Recon
- **LC**: Laser Cladding

## API Endpoints

### GET /api/sequences
Returns all sequences with enhanced metadata including project counts and sample projects.

### POST /api/sequences/update
Updates a sequence number with validation.

**Request Body:**
```json
{
  "departmentCode": "NY",
  "year": 25,
  "newSequence": 50
}
```

### GET /api/sequences/stats
Returns comprehensive statistics about sequences and projects.

## Safety Features

1. **Validation**: Cannot set sequence lower than highest existing project
2. **Warnings**: Alerts when creating gaps larger than 100 numbers
3. **Atomic Updates**: Database operations are atomic to prevent conflicts
4. **Error Handling**: Comprehensive error messages for troubleshooting

## Troubleshooting

### Connection Issues
- Verify MongoDB URI in environment variables
- Check network connectivity to MongoDB Atlas
- Run test script to diagnose issues

### Update Failures
- Check validation errors in the response
- Ensure sequence number is higher than existing projects
- Verify user has write permissions to database 