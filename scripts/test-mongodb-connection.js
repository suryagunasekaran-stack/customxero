const { MongoClient } = require('mongodb');

// This is the connection string you provided
const uri = "mongodb+srv://suryagunasekaran:Shirako17!@cluster0.eyii5yh.mongodb.net/shared?retryWrites=true&w=majority&appName=Cluster0";

async function testConnection() {
  let client;
  
  try {
    console.log('🔗 Attempting to connect to MongoDB...');
    
    client = new MongoClient(uri);
    await client.connect();
    
    console.log('✅ Successfully connected to MongoDB!');
    
    const db = client.db('shared');
    
    // Test collections
    const collections = await db.listCollections().toArray();
    console.log('\n📚 Available collections:');
    collections.forEach(col => console.log(`  - ${col.name}`));
    
    // Check project_sequences collection
    const sequencesCollection = db.collection('project_sequences');
    const sequenceCount = await sequencesCollection.countDocuments();
    console.log(`\n📊 project_sequences: ${sequenceCount} documents`);
    
    // Check deal_project_mappings collection
    const mappingsCollection = db.collection('deal_project_mappings');
    const mappingCount = await mappingsCollection.countDocuments();
    console.log(`📊 deal_project_mappings: ${mappingCount} documents`);
    
    // Sample data from project_sequences
    const sampleSequence = await sequencesCollection.findOne();
    if (sampleSequence) {
      console.log('\n📝 Sample sequence document:');
      console.log(JSON.stringify(sampleSequence, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error.message);
  } finally {
    if (client) {
      await client.close();
      console.log('\n👋 Connection closed');
    }
  }
}

testConnection(); 