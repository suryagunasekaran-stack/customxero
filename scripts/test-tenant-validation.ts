#!/usr/bin/env node
import 'dotenv/config';
import { runValidation } from '../app/api/sync/pipedrive/tenant-ea67107e/validation-handler';

async function main() {
  console.log('Testing Project Sync Validation for tenant ea67107e-c352-40a9-a8b8-24d81ae3fc85');
  console.log('='.repeat(80));
  
  try {
    await runValidation();
  } catch (error) {
    console.error('Validation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}