/**
 * Stub implementation for project validation rules
 */

export interface XeroProject {
  ProjectID: string;
  Name: string;
  [key: string]: any;
}

export function validateProjectsAgainstQuotes(projects: XeroProject[], quotes: any[], deals?: any[]) {
  return {
    projects: [],
    issues: []
  };
}