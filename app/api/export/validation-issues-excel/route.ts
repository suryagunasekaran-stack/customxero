/**
 * @fileoverview Excel Export API for Validation Issues
 * 
 * This module provides a REST API endpoint for exporting Pipedrive validation issues
 * to Excel format. It creates comprehensive multi-sheet workbooks with categorized
 * issue reports, summary statistics, and formatted data suitable for business review.
 * 
 * The Excel export functionality supports up to 5,000 validation issues and generates
 * multiple worksheets including:
 * - Executive Summary with key metrics and validation overview
 * - Issues by Severity with color-coded categorization
 * - Pipeline Issues with deal placement validation errors
 * - Title Format Issues with formatting compliance problems
 * - Quote Issues including orphaned and invalid format problems
 * - Required Field Issues for missing mandatory data
 * - Raw Data sheet with complete unfiltered issue list
 * 
 * @author CustomXero Team
 * @since 1.0.0
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { ValidationIssue } from '@/lib/types/validation';

/**
 * Request payload structure for Excel export operations
 * 
 * @interface ExportRequest
 * @description Defines the structure of data required for generating Excel exports
 * of validation issues. Contains validation results and metadata for report generation.
 * 
 * @example
 * ```typescript
 * const exportRequest: ExportRequest = {
 *   issues: [
 *     {
 *       code: 'WON_DEAL_IN_UNQUALIFIED_PIPELINE',
 *       severity: 'error',
 *       message: 'Won deal found in unqualified pipeline',
 *       dealId: 12345,
 *       dealTitle: 'Project ABC',
 *       suggestedFix: 'Move deal to qualified pipeline'
 *     }
 *   ],
 *   tenantName: 'Acme Corporation',
 *   timestamp: '2024-01-15T10:30:00Z'
 * };
 * ```
 * 
 * @since 1.0.0
 */
interface ExportRequest {
  /** Array of validation issues to export - limited to 5000 items maximum */
  issues: ValidationIssue[];
  /** Optional tenant/organization name for report header identification */
  tenantName?: string;
  /** Optional ISO 8601 timestamp indicating when validation was performed */
  timestamp?: string;
}

/**
 * Returns hex color code for Excel cell formatting based on validation issue severity
 * 
 * @description Provides consistent color coding for validation issues in Excel exports.
 * Uses standard color conventions: red for errors, amber for warnings, blue for
 * informational items, and black for unknown severity levels.
 * 
 * @param {string} severity - The severity level of the validation issue
 * @returns {string} Hex color code without '#' prefix (e.g., 'FF0000' for red)
 * 
 * @example
 * ```typescript
 * const errorColor = getSeverityColor('error');     // Returns 'FF0000'
 * const warningColor = getSeverityColor('warning'); // Returns 'FFA500'
 * const infoColor = getSeverityColor('info');       // Returns '0000FF'
 * const unknownColor = getSeverityColor('unknown'); // Returns '000000'
 * ```
 * 
 * @since 1.0.0
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'error':
      return 'FF0000'; // Red - Critical issues requiring immediate attention
    case 'warning':
      return 'FFA500'; // Amber - Issues that should be reviewed but not critical
    case 'info':
      return '0000FF'; // Blue - Informational items for awareness
    default:
      return '000000'; // Black - Unknown or unclassified severity
  }
}

/**
 * Formats monetary values with currency prefix and locale-specific number formatting
 * 
 * @description Converts numeric values to human-readable currency strings with proper
 * locale formatting including thousands separators and fixed decimal places. Handles
 * null/undefined values gracefully by returning a dash placeholder.
 * 
 * @param {number | undefined} value - The numeric value to format (can be null/undefined)
 * @param {string} [currency='SGD'] - Currency code to prefix (defaults to Singapore Dollar)
 * @returns {string} Formatted currency string or '-' for null/undefined values
 * 
 * @example
 * ```typescript
 * formatCurrency(1234.56, 'USD');     // Returns 'USD 1,234.56'
 * formatCurrency(1000000);            // Returns 'SGD 1,000,000.00'
 * formatCurrency(undefined, 'EUR');   // Returns '-'
 * formatCurrency(null);               // Returns '-'
 * formatCurrency(42.1, 'GBP');       // Returns 'GBP 42.10'
 * ```
 * 
 * @since 1.0.0
 */
function formatCurrency(value: number | undefined, currency: string = 'SGD'): string {
  if (value === undefined || value === null) return '-';
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Handles POST requests to export validation issues to Excel format
 * 
 * @description This API endpoint processes validation issue data and generates a comprehensive
 * Excel workbook with multiple worksheets for different issue categories. The generated Excel
 * file includes executive summary, detailed issue breakdowns, and formatted data suitable for
 * business review and remediation planning.
 * 
 * The endpoint performs the following operations:
 * 1. Authenticates the requesting user
 * 2. Validates and limits input data (max 5,000 issues)
 * 3. Creates multi-sheet Excel workbook with categorized data
 * 4. Applies formatting and color coding based on issue severity
 * 5. Returns Excel file as downloadable attachment
 * 
 * @async
 * @function POST
 * @param {NextRequest} request - Next.js request object containing JSON payload
 * @returns {Promise<NextResponse>} Excel file download or error response
 * 
 * @throws {401} Unauthorized - User is not authenticated
 * @throws {400} Bad Request - Invalid issues data or exceeds 5,000 issue limit
 * @throws {500} Internal Server Error - Excel generation or processing failure
 * 
 * @example
 * ```typescript
 * // Client-side usage
 * const response = await fetch('/api/export/validation-issues-excel', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     issues: validationResults,
 *     tenantName: 'Acme Corp',
 *     timestamp: new Date().toISOString()
 *   })
 * });
 * 
 * if (response.ok) {
 *   const blob = await response.blob();
 *   // Create download link...
 * }
 * ```
 * 
 * @example
 * ```json
 * // Request body format
 * {
 *   "issues": [
 *     {
 *       "code": "WON_DEAL_IN_UNQUALIFIED_PIPELINE",
 *       "severity": "error",
 *       "message": "Won deal found in unqualified pipeline",
 *       "dealId": 12345,
 *       "dealTitle": "Project ABC - Vessel XYZ",
 *       "metadata": {
 *         "pipelineId": 1,
 *         "dealValue": 50000,
 *         "currency": "SGD"
 *       },
 *       "suggestedFix": "Move deal to qualified pipeline"
 *     }
 *   ],
 *   "tenantName": "Acme Corporation",
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 * ```
 * 
 * @since 1.0.0
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ExportRequest = await request.json();
    const { issues, tenantName, timestamp } = body;

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json({ error: 'Invalid issues data' }, { status: 400 });
    }

    // Limit to 5000 issues maximum
    if (issues.length > 5000) {
      return NextResponse.json({ error: 'Too many issues. Maximum 5000 issues allowed.' }, { status: 400 });
    }

    // Initialize Excel workbook for multi-sheet export
    const wb = XLSX.utils.book_new();

    // Categorize issues by severity for summary statistics and color coding
    const errorIssues = issues.filter(i => i.severity === 'error');
    const warningIssues = issues.filter(i => i.severity === 'warning');
    const infoIssues = issues.filter(i => i.severity === 'info');

    // Group issues by business category for specialized worksheets
    // Pipeline issues relate to deal placement in incorrect workflows
    const pipelineIssues = issues.filter(i => 
      i.code === 'WON_DEAL_IN_UNQUALIFIED_PIPELINE' || 
      i.code === 'OPEN_DEAL_IN_WRONG_PIPELINE'
    );
    
    // Title format issues involve deal naming convention violations
    const titleFormatIssues = issues.filter(i => i.code === 'INVALID_TITLE_FORMAT');
    
    // Quote-related issues including orphaned, invalid format, and reference problems
    const quoteIssues = issues.filter(i => 
      i.code === 'ORPHANED_ACCEPTED_QUOTE' || 
      i.code === 'ACCEPTED_QUOTE_INVALID_FORMAT' ||
      i.code === 'QUOTE_REFERENCES_MISSING_DEAL'
    );

    // Missing required field issues detected through code patterns or message content
    const requiredFieldIssues = issues.filter(i => 
      i.code === 'MISSING_REQUIRED_FIELD' ||
      i.message.toLowerCase().includes('missing') ||
      i.message.toLowerCase().includes('required')
    );

    // Sheet 1: Executive Summary - High-level overview and key metrics
    // Provides business stakeholders with quick insights and validation statistics
    const summaryData = [
      ['VALIDATION ISSUES REPORT'],
      [`Generated on: ${new Date().toLocaleDateString()}`],
      [`Tenant: ${tenantName || 'Unknown'}`],
      [`Validation Time: ${timestamp || new Date().toISOString()}`],
      [],
      ['ISSUE SUMMARY'],
      ['', ''],
      ['Total Issues', issues.length],
      ['Critical Errors', errorIssues.length],
      ['Warnings', warningIssues.length],
      ['Information', infoIssues.length],
      [],
      ['ISSUE CATEGORIES'],
      ['', ''],
      ['Pipeline Issues', pipelineIssues.length],
      ['Title Format Issues', titleFormatIssues.length],
      ['Quote Issues', quoteIssues.length],
      ['Required Field Issues', requiredFieldIssues.length],
      ['Other Issues', issues.length - pipelineIssues.length - titleFormatIssues.length - quoteIssues.length - requiredFieldIssues.length],
    ];

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Configure column widths for optimal readability
    summaryWs['!cols'] = [{ wch: 30 }, { wch: 20 }];
    
    // Apply hierarchical text styling for visual organization
    if (summaryWs['A1']) summaryWs['A1'].s = { font: { bold: true, sz: 16 } }; // Main title
    if (summaryWs['A6']) summaryWs['A6'].s = { font: { bold: true, sz: 14 } }; // Section headers
    if (summaryWs['A13']) summaryWs['A13'].s = { font: { bold: true, sz: 14 } };
    
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    // Sheet 2: Issues by Severity - Organized by error level for prioritization
    // Groups all issues by severity level to help prioritize remediation efforts
    if (errorIssues.length > 0 || warningIssues.length > 0 || infoIssues.length > 0) {
      const severityData = [
        ['ISSUES BY SEVERITY'],
        [],
      ];

      // Add errors section
      if (errorIssues.length > 0) {
        severityData.push(
          ['CRITICAL ERRORS', '', '', '', '', ''],
          ['Code', 'Message', 'Deal ID', 'Deal Title', 'Pipeline', 'Suggested Fix']
        );
        errorIssues.forEach(issue => {
          severityData.push([
            issue.code || '-',
            issue.message || '-',
            issue.dealId?.toString() || '-',
            issue.dealTitle || issue.metadata?.dealTitle || '-',
            issue.metadata?.pipelineId?.toString() || '-',
            issue.suggestedFix || '-'
          ]);
        });
        severityData.push([]);
      }

      // Add warnings section
      if (warningIssues.length > 0) {
        severityData.push(
          ['WARNINGS', '', '', '', '', ''],
          ['Code', 'Message', 'Deal ID', 'Deal Title', 'Pipeline', 'Suggested Fix']
        );
        warningIssues.forEach(issue => {
          severityData.push([
            issue.code || '-',
            issue.message || '-',
            issue.dealId?.toString() || '-',
            issue.dealTitle || issue.metadata?.dealTitle || '-',
            issue.metadata?.pipelineId?.toString() || '-',
            issue.suggestedFix || '-'
          ]);
        });
        severityData.push([]);
      }

      // Add info section
      if (infoIssues.length > 0) {
        severityData.push(
          ['INFORMATION', '', '', '', '', ''],
          ['Code', 'Message', 'Deal ID', 'Deal Title', 'Pipeline', 'Suggested Fix']
        );
        infoIssues.forEach(issue => {
          severityData.push([
            issue.code || '-',
            issue.message || '-',
            issue.dealId?.toString() || '-',
            issue.dealTitle || issue.metadata?.dealTitle || '-',
            issue.metadata?.pipelineId?.toString() || '-',
            issue.suggestedFix || '-'
          ]);
        });
      }

      const severityWs = XLSX.utils.aoa_to_sheet(severityData);
      
      // Optimize column widths for detailed issue information display
      severityWs['!cols'] = [
        { wch: 30 }, // Code - Issue classification identifier
        { wch: 50 }, // Message - Detailed problem description
        { wch: 12 }, // Deal ID - Unique identifier for affected deal
        { wch: 40 }, // Deal Title - Human-readable deal name
        { wch: 12 }, // Pipeline - Workflow context information
        { wch: 50 }, // Suggested Fix - Remediation guidance
      ];

      XLSX.utils.book_append_sheet(wb, severityWs, 'Issues by Severity');
    }

    // Sheet 3: Pipeline Issues - Deal workflow placement problems
    // Focuses on deals that are in incorrect pipelines or workflow states
    if (pipelineIssues.length > 0) {
      const pipelineData = [
        ['PIPELINE VALIDATION ISSUES'],
        [],
        ['Issue Type', 'Deal ID', 'Deal Title', 'Current Pipeline', 'Deal Status', 'Deal Value', 'Suggested Action'],
        ...pipelineIssues.map(issue => [
          issue.code === 'WON_DEAL_IN_UNQUALIFIED_PIPELINE' ? 'Won Deal in Unqualified' : 'Open Deal in Wrong Pipeline',
          issue.dealId?.toString() || issue.metadata?.dealId?.toString() || '-',
          issue.dealTitle || issue.metadata?.dealTitle || '-',
          issue.metadata?.pipelineId?.toString() || '-',
          issue.metadata?.status || '-',
          formatCurrency(issue.metadata?.dealValue, issue.metadata?.currency || 'SGD'),
          issue.suggestedFix || '-'
        ])
      ];

      const pipelineWs = XLSX.utils.aoa_to_sheet(pipelineData);
      pipelineWs['!cols'] = [
        { wch: 30 }, // Issue Type
        { wch: 12 }, // Deal ID
        { wch: 40 }, // Deal Title
        { wch: 15 }, // Current Pipeline
        { wch: 12 }, // Deal Status
        { wch: 20 }, // Deal Value
        { wch: 50 }, // Suggested Action
      ];

      XLSX.utils.book_append_sheet(wb, pipelineWs, 'Pipeline Issues');
    }

    // Sheet 4: Title Format Issues - Deal naming convention violations
    // Tracks deals that don't follow required title formatting standards
    if (titleFormatIssues.length > 0) {
      const titleData = [
        ['TITLE FORMAT ISSUES'],
        [],
        ['Deal ID', 'Current Title', 'Expected Title', 'Project Code', 'Vessel Name', 'Suggested Fix'],
        ...titleFormatIssues.map(issue => [
          issue.dealId?.toString() || issue.metadata?.dealId?.toString() || '-',
          issue.metadata?.dealTitle || issue.dealTitle || '-',
          issue.metadata?.expectedTitle || '-',
          issue.metadata?.projectCode || '-',
          issue.metadata?.vesselName || '-',
          issue.suggestedFix || '-'
        ])
      ];

      const titleWs = XLSX.utils.aoa_to_sheet(titleData);
      titleWs['!cols'] = [
        { wch: 12 }, // Deal ID
        { wch: 50 }, // Current Title
        { wch: 50 }, // Expected Title
        { wch: 15 }, // Project Code
        { wch: 25 }, // Vessel Name
        { wch: 40 }, // Suggested Fix
      ];

      XLSX.utils.book_append_sheet(wb, titleWs, 'Title Format Issues');
    }

    // Sheet 5: Quote Issues - Problems with accepted quotes and references
    // Covers orphaned quotes, format issues, and missing deal associations
    if (quoteIssues.length > 0) {
      const quoteData = [
        ['QUOTE VALIDATION ISSUES'],
        [],
        ['Issue Type', 'Quote Number', 'Contact Name', 'Quote Value', 'Referenced Deal ID', 'Issue Description', 'Suggested Fix'],
        ...quoteIssues.map(issue => [
          issue.code === 'ORPHANED_ACCEPTED_QUOTE' ? 'Orphaned Quote' : 
          issue.code === 'ACCEPTED_QUOTE_INVALID_FORMAT' ? 'Invalid Format' : 'Missing Deal Reference',
          issue.metadata?.quoteNumber || '-',
          issue.metadata?.contactName || '-',
          formatCurrency(issue.metadata?.quoteTotal),
          issue.metadata?.referencedDealId?.toString() || '-',
          issue.message || '-',
          issue.suggestedFix || '-'
        ])
      ];

      const quoteWs = XLSX.utils.aoa_to_sheet(quoteData);
      quoteWs['!cols'] = [
        { wch: 25 }, // Issue Type
        { wch: 15 }, // Quote Number
        { wch: 30 }, // Contact Name
        { wch: 20 }, // Quote Value
        { wch: 15 }, // Referenced Deal ID
        { wch: 50 }, // Issue Description
        { wch: 50 }, // Suggested Fix
      ];

      XLSX.utils.book_append_sheet(wb, quoteWs, 'Quote Issues');
    }

    // Sheet 6: Required Field Issues - Missing mandatory data validation
    // Identifies deals lacking required fields for complete business processing
    if (requiredFieldIssues.length > 0) {
      const requiredData = [
        ['REQUIRED FIELD ISSUES'],
        [],
        ['Deal ID', 'Deal Title', 'Missing Field', 'Issue Description', 'Suggested Fix'],
        ...requiredFieldIssues.map(issue => [
          issue.dealId?.toString() || issue.metadata?.dealId?.toString() || '-',
          issue.dealTitle || issue.metadata?.dealTitle || '-',
          issue.field || '-',
          issue.message || '-',
          issue.suggestedFix || '-'
        ])
      ];

      const requiredWs = XLSX.utils.aoa_to_sheet(requiredData);
      requiredWs['!cols'] = [
        { wch: 12 }, // Deal ID
        { wch: 40 }, // Deal Title
        { wch: 20 }, // Missing Field
        { wch: 50 }, // Issue Description
        { wch: 50 }, // Suggested Fix
      ];

      XLSX.utils.book_append_sheet(wb, requiredWs, 'Required Fields');
    }

    // Sheet 7: Raw Data - Complete unfiltered issue dataset
    // Comprehensive list of all validation issues for detailed analysis
    const rawData = [
      ['ALL VALIDATION ISSUES'],
      [],
      ['Severity', 'Code', 'Message', 'Deal ID', 'Deal Title', 'Pipeline', 'Field', 'Suggested Fix'],
      ...issues.map(issue => [
        issue.severity.toUpperCase(),
        issue.code || '-',
        issue.message || '-',
        issue.dealId?.toString() || issue.metadata?.dealId?.toString() || '-',
        issue.dealTitle || issue.metadata?.dealTitle || '-',
        issue.metadata?.pipelineId?.toString() || '-',
        issue.field || '-',
        issue.suggestedFix || '-'
      ])
    ];

    const rawWs = XLSX.utils.aoa_to_sheet(rawData);
    rawWs['!cols'] = [
      { wch: 10 }, // Severity
      { wch: 30 }, // Code
      { wch: 50 }, // Message
      { wch: 12 }, // Deal ID
      { wch: 40 }, // Deal Title
      { wch: 12 }, // Pipeline
      { wch: 20 }, // Field
      { wch: 50 }, // Suggested Fix
    ];

    // Apply conditional formatting to severity column based on issue criticality
    // Enhances visual scanning and helps identify high-priority issues quickly
    for (let i = 3; i < rawData.length; i++) {
      const cellRef = `A${i + 1}`;
      if (rawWs[cellRef]) {
        const severity = issues[i - 3].severity;
        rawWs[cellRef].s = {
          font: {
            color: { rgb: getSeverityColor(severity) }, // Color based on severity level
            bold: severity === 'error' // Bold text for critical errors
          }
        };
      }
    }

    XLSX.utils.book_append_sheet(wb, rawWs, 'Raw Data');

    // Convert workbook to binary buffer for HTTP response
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Return Excel file as downloadable attachment with date-stamped filename
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="validation-issues-${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error generating Excel:', error);
    return NextResponse.json(
      { error: 'Failed to generate Excel', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}