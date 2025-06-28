import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db('shared');
    
    // Get all sequences with metadata
    const sequencesCollection = db.collection('project_sequences');
    const mappingsCollection = db.collection('deal_project_mappings');
    
    const sequences = await sequencesCollection.find({}).sort({ 
      departmentCode: 1, 
      year: -1 
    }).toArray();
    
    // Enhance sequences with project counts and metadata
    const enhancedSequences = await Promise.all(
      sequences.map(async (sequence) => {
        const projectCount = await mappingsCollection.countDocuments({
          departmentCode: sequence.departmentCode,
          year: sequence.year
        });
        
        const lastProject = await mappingsCollection.findOne({
          departmentCode: sequence.departmentCode,
          year: sequence.year
        }, { sort: { createdAt: -1 } });
        
        const sampleProjects = await mappingsCollection.find({
          departmentCode: sequence.departmentCode,
          year: sequence.year
        }).limit(3).sort({ createdAt: -1 }).toArray();
        
        return {
          ...sequence,
          departmentCode: sequence.departmentCode,
          projectCount,
          lastProjectCreated: lastProject?.createdAt || null,
          lastProjectNumber: lastProject?.projectNumber || null,
          sampleProjects: sampleProjects.map(p => ({
            projectNumber: p.projectNumber,
            dealIds: p.pipedriveDealIds,
            createdAt: p.createdAt
          }))
        };
      })
    );
    
    // Get department full names mapping
    const departmentNames: Record<string, string> = {
      'NY': 'Navy',
      'EL': 'Electrical', 
      'MC': 'Machining',
      'AF': 'Afloat',
      'ED': 'Engine Recon',
      'LC': 'Laser Cladding'
    };
    
    const result = enhancedSequences.map(seq => ({
      ...seq,
      departmentName: departmentNames[seq.departmentCode] || seq.departmentCode
    }));
    
    return NextResponse.json({ sequences: result });
  } catch (error) {
    console.error('Error fetching sequences:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 