#!/usr/bin/env node

/**
 * Test script to trigger Xero validation and check tracking categories logging
 */

async function testXeroValidation() {
  try {
    console.log('🚀 Starting Xero validation test...\n');
    
    // Make request to the validation endpoint
    const response = await fetch('http://localhost:3001/api/xero/validate-quotes', {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        // Add any required authentication headers if needed
        'Cookie': 'next-auth.session-token=dummy-token' // Replace with actual session token if needed
      }
    });

    if (!response.ok) {
      console.error(`❌ HTTP error! status: ${response.status}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      console.error('❌ No response body');
      return;
    }

    console.log('📡 Connected to SSE stream, waiting for events...\n');
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim() === '') continue;
        
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            
            const data = JSON.parse(jsonStr);
            
            if (data.type === 'progress') {
              console.log(`⚙️  Progress: ${data.step.name} - ${data.step.status}`);
              if (data.step.description) {
                console.log(`   ${data.step.description}`);
              }
            } else if (data.type === 'error') {
              console.error(`❌ Error: ${data.message}`);
            } else if (data.type === 'complete') {
              console.log('\n✅ Validation completed!');
              console.log(`📊 Summary:`);
              console.log(`   - Total Quotes: ${data.data.summary.totalQuotes}`);
              console.log(`   - Issues Found: ${data.data.summary.issuesFound}`);
              console.log(`   - Warnings: ${data.data.summary.warningCount}`);
              console.log(`   - Errors: ${data.data.summary.errorCount}`);
              
              // Check console output on server for tracking categories
              console.log('\n🔍 Check the server console for tracking categories output!');
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', e);
          }
        }
      }
    }
    
    console.log('\n✨ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
console.log('='.repeat(80));
console.log('XERO VALIDATION TEST SCRIPT');
console.log('='.repeat(80));
console.log('This will trigger the Xero validation and the tracking categories');
console.log('should be logged in the server console where npm run dev is running.\n');

testXeroValidation();