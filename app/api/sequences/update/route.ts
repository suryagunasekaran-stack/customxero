import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { departmentCode, year, newSequence } = body;

    if (!departmentCode || year === undefined || newSequence === undefined) {
      return NextResponse.json(
        { message: 'Missing required fields: departmentCode, year, newSequence' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('shared');
    
    const sequencesCollection = db.collection('project_sequences');
    const mappingsCollection = db.collection('deal_project_mappings');
    
    // Validate the update is safe
    const highestProject = await mappingsCollection.findOne({
      departmentCode,
      year
    }, { 
      sort: { sequence: -1 }
    });
    
    const validation = {
      isValid: true,
      warnings: [] as string[],
      errors: [] as string[]
    };
    
    if (highestProject && newSequence < highestProject.sequence) {
      validation.isValid = false;
      validation.errors.push(
        `Cannot set sequence to ${newSequence}. Highest existing project sequence is ${highestProject.sequence} (${highestProject.projectNumber})`
      );
      return NextResponse.json(
        { message: 'Validation failed', validation },
        { status: 400 }
      );
    }
    
    if (highestProject && newSequence > highestProject.sequence + 100) {
      validation.warnings.push(
        `Large gap detected. Setting sequence to ${newSequence} will skip ${newSequence - highestProject.sequence - 1} numbers.`
      );
    }
    
    // Update the sequence
    const result = await sequencesCollection.findOneAndUpdate(
      { departmentCode, year },
      { 
        $set: { 
          lastSequenceNumber: newSequence,
          updatedAt: new Date()
        },
        $setOnInsert: { 
          departmentCode, 
          year,
          createdAt: new Date()
        } 
      },
      { 
        upsert: true,
        returnDocument: 'after'
      }
    );
    
    return NextResponse.json({ 
      success: true, 
      sequence: result,
      validation,
      message: `Successfully updated ${departmentCode}${year.toString().padStart(2, '0')} sequence to ${newSequence}`
    });
    
  } catch (error) {
    console.error('Error updating sequence:', error);
    return NextResponse.json(
      { message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 