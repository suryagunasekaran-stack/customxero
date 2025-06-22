// ProcessingStepService.ts
// Service for managing processing steps and their states

import { ProcessingStep, PROCESSING_STEPS } from '../types';

export class ProcessingStepService {
  private steps: ProcessingStep[] = [];
  private currentStepIndex: number = -1;
  private onUpdate: (steps: ProcessingStep[]) => void;

  constructor(onUpdate: (steps: ProcessingStep[]) => void) {
    this.onUpdate = onUpdate;
  }

  initializeSteps(): ProcessingStep[] {
    this.steps = PROCESSING_STEPS.map(step => ({
      ...step,
      status: 'pending'
    }));
    this.currentStepIndex = -1;
    this.onUpdate(this.steps);
    return this.steps;
  }

  startStep(stepId: string, details?: string): void {
    const stepIndex = this.steps.findIndex(s => s.id === stepId);
    
    if (stepIndex === -1) {
      console.error(`Step with id ${stepId} not found`);
      return;
    }

    this.currentStepIndex = stepIndex;
    this.updateStep(stepId, {
      status: 'current',
      startTime: Date.now(),
      details
    });
  }

  completeStep(stepId: string, details?: string): void {
    this.updateStep(stepId, {
      status: 'completed',
      completedTime: Date.now(),
      details
    });
  }

  errorStep(stepId: string, error: string): void {
    this.updateStep(stepId, {
      status: 'error',
      completedTime: Date.now(),
      details: error
    });
  }

  errorCurrentStep(error: string): void {
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      const currentStep = this.steps[this.currentStepIndex];
      if (currentStep && currentStep.status === 'current') {
        this.errorStep(currentStep.id, error);
      }
    }
  }

  getCurrentStep(): ProcessingStep | null {
    return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null;
  }

  getSteps(): ProcessingStep[] {
    return [...this.steps];
  }

  reset(): void {
    this.steps = [];
    this.currentStepIndex = -1;
  }

  private updateStep(stepId: string, updates: Partial<ProcessingStep>): void {
    this.steps = this.steps.map(step => 
      step.id === stepId ? { ...step, ...updates } : step
    );
    this.onUpdate(this.steps);
  }
} 