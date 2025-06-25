import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db('shared');
    
    const sequencesCollection = db.collection('project_sequences');
    const mappingsCollection = db.collection('deal_project_mappings');
    
    // Get comprehensive statistics
    const totalSequences = await sequencesCollection.countDocuments();
    const totalProjectMappings = await mappingsCollection.countDocuments();
    
    // Get sequences by department
    const sequencesByDepartment = await sequencesCollection.aggregate([
      {
        $group: {
          _id: '$departmentCode',
          count: { $sum: 1 },
          totalProjects: { $sum: '$lastSequenceNumber' },
          maxSequence: { $max: '$lastSequenceNumber' },
          minSequence: { $min: '$lastSequenceNumber' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    // Get project counts by department
    const projectsByDepartment = await mappingsCollection.aggregate([
      {
        $group: {
          _id: '$departmentCode',
          projectCount: { $sum: 1 },
          dealCount: { $sum: { $size: '$pipedriveDealIds' } },
          latestProject: { $max: '$createdAt' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    // Get recent project activity
    const recentProjects = await mappingsCollection.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();
    
    const currentYear = new Date().getFullYear() % 100;
    
    return NextResponse.json({
      overview: {
        totalSequences,
        totalProjectMappings,
        currentYear
      },
      sequencesByDepartment,
      projectsByDepartment,
      recentProjects: recentProjects.map(p => ({
        projectNumber: p.projectNumber,
        department: p.department,
        dealCount: p.pipedriveDealIds?.length || 0,
        createdAt: p.createdAt
      }))
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 