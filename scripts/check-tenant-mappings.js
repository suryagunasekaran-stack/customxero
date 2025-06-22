const fetch = require('node-fetch');

// Known tenant IDs from the logs
const TENANTS = {
  'ab4b2a02-e700-4fe8-a32d-5419d4195e1b': 'Unknown (Redis tenant)',
  '6dd39ea4-e6a6-4993-a37a-21482ccf8d22': 'BS E&I SERVICE (Token tenant)',
  '017d3bc6-65b9-4588-9746-acb7167a59f1': 'Demo Company (Hardcoded)'
};

async function checkTenantMappings() {
  console.log('🔍 CHECKING TENANT MAPPINGS');
  console.log('==========================================');
  
  // You'll need to provide a valid access token
  const accessToken = process.env.XERO_ACCESS_TOKEN;
  
  if (!accessToken) {
    console.log('❌ No access token provided. Set XERO_ACCESS_TOKEN environment variable.');
    console.log('Get a current token from the app logs or browser dev tools.');
    return;
  }
  
  for (const [tenantId, description] of Object.entries(TENANTS)) {
    console.log(`\n📋 Checking tenant: ${tenantId}`);
    console.log(`    Description: ${description}`);
    
    try {
      // Check organization name
      const orgResponse = await fetch('https://api.xero.com/api.xro/2.0/Organisation', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Xero-Tenant-Id': tenantId,
          'Accept': 'application/json'
        }
      });
      
      if (orgResponse.ok) {
        const orgData = await orgResponse.json();
        const orgName = orgData.Organisations?.[0]?.Name || 'Unknown';
        console.log(`    ✅ Organization: ${orgName}`);
        
        // Check for NY projects (Demo Company indicator)
        const projectsResponse = await fetch('https://api.xero.com/projects.xro/2.0/Projects?status=INPROGRESS', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json'
          }
        });
        
        if (projectsResponse.ok) {
          const projectsData = await projectsResponse.json();
          const projects = projectsData.items || [];
          const nyProjects = projects.filter(p => p.name?.startsWith('NY'));
          console.log(`    📊 Total projects: ${projects.length}`);
          console.log(`    🎯 NY projects: ${nyProjects.length}`);
          
          if (nyProjects.length > 0) {
            console.log(`    🚨 THIS IS LIKELY DEMO COMPANY (has NY projects)`);
            console.log(`    Sample NY projects: ${nyProjects.slice(0, 3).map(p => p.name).join(', ')}`);
          }
        } else {
          console.log(`    ❌ Projects API failed: ${projectsResponse.status}`);
        }
      } else {
        console.log(`    ❌ Organization API failed: ${orgResponse.status}`);
      }
      
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n==========================================');
  console.log('🎯 TENANT IDENTIFICATION COMPLETE');
}

checkTenantMappings().catch(console.error); 