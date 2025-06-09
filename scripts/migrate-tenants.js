const Redis = require('ioredis');
const fs = require('fs');

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

async function migrateTenants() {
  console.log('Starting tenant migration...');
  
  try {
    // Try to get existing token from Redis
    let token = null;
    const tokenString = await redis.get('xero_token');
    
    if (tokenString) {
      token = JSON.parse(tokenString);
      console.log('Found existing token in Redis');
    } else {
      // Fallback to .xero-token.json file
      try {
        const fileData = fs.readFileSync('.xero-token.json', 'utf8');
        const fileToken = JSON.parse(fileData);
        console.log('Found token in .xero-token.json file');
        
        // Convert file format to our format if needed
        token = {
          access_token: fileToken.access_token,
          refresh_token: fileToken.refresh_token,
          expires_at: fileToken.expires_at,
          tenant_id: fileToken.tenant_id,
          scope: '',
          token_type: 'Bearer'
        };
      } catch (fileError) {
        console.error('No token file found:', fileError.message);
      }
    }

    if (!token || !token.access_token) {
      console.error('No valid token found. Please re-authenticate with Xero.');
      return;
    }

    console.log('Fetching tenants from Xero API...');
    
    // Fetch tenants from Xero API
    const response = await fetch('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch tenants from Xero:', response.status, response.statusText);
      console.log('You may need to re-authenticate. The token might be expired.');
      return;
    }

    const tenants = await response.json();
    console.log('Received tenants from Xero:', tenants);

    if (!Array.isArray(tenants) || tenants.length === 0) {
      console.error('No tenants found or invalid response');
      return;
    }

    // Transform tenants to our format
    const availableTenants = tenants.map(tenant => ({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName || 'Unknown Organisation',
      tenantType: tenant.tenantType || 'ORGANISATION',
      createdDateUtc: tenant.createdDateUtc || '',
      updatedDateUtc: tenant.updatedDateUtc || ''
    }));

    console.log('Transformed tenants:', availableTenants);

    // Save tenants to Redis
    await redis.set('xero_tenants', JSON.stringify(availableTenants));
    console.log('✅ Saved available tenants to Redis');

    // Set the current tenant as selected (use the one from existing token or first available)
    const selectedTenantId = token.tenant_id || availableTenants[0]?.tenantId;
    if (selectedTenantId) {
      await redis.set('xero_selected_tenant', selectedTenantId);
      console.log('✅ Set selected tenant:', selectedTenantId);
    }

    // Update the token in Redis with available tenants
    const updatedToken = {
      ...token,
      available_tenants: availableTenants
    };
    
    // Calculate TTL for the token
    const now = Date.now();
    const secondsUntilExpiry = Math.max(0, Math.floor((token.expires_at - now) / 1000));
    
    if (secondsUntilExpiry > 0) {
      await redis.set('xero_token', JSON.stringify(updatedToken), 'EX', secondsUntilExpiry);
      console.log('✅ Updated token in Redis with tenant data');
    } else {
      console.warn('⚠️  Token appears to be expired. Please re-authenticate.');
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log(`Found ${availableTenants.length} tenant(s):`);
    availableTenants.forEach(tenant => {
      const selected = tenant.tenantId === selectedTenantId ? ' (SELECTED)' : '';
      console.log(`  - ${tenant.tenantName} (${tenant.tenantType})${selected}`);
    });

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    redis.disconnect();
  }
}

// Run the migration
migrateTenants(); 