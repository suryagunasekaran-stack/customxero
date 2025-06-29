async function testProjectCreation() {
  const testProject = {
    projects: [
      {
        contactId: "b729ba64-131d-40eb-8e0b-683763cb6020",
        name: "test",
        estimateAmount: 100
      }
    ]
  };

  console.log('Testing project creation with:', JSON.stringify(testProject, null, 2));

  try {
    const response = await fetch('http://localhost:3000/api/xero/projects/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testProject)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));

    if (data.success) {
      console.log('✅ SUCCESS: Project created successfully!');
    } else {
      console.log('❌ FAILED: Project creation failed');
    }

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

// Run the test
testProjectCreation(); 