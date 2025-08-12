/**
 * @fileoverview Xero Validation Excel Export API Route - Generates comprehensive Excel reports
 * 
 * This API route generates detailed Excel reports from Xero quote validation results.
 * It creates multi-sheet workbooks with comprehensive formatting, conditional styling,
 * and organized data presentation for business analysis and reporting purposes.
 * 
 * **Excel Workbook Structure:**
 * 1. **Summary Sheet**: High-level validation statistics and metadata
 * 2. **All Issues Sheet**: Complete listing of all validation issues with details
 * 3. **Format Issues Sheet**: Dedicated sheet for quote format problems (conditional)
 * 4. **Tracking Issues Sheet**: Dedicated sheet for line item tracking problems (conditional)
 * 
 * **Features:**
 * - Conditional formatting based on issue severity levels
 * - Color-coded severity indicators (red/yellow/blue)
 * - Comprehensive metadata including contact names and quote totals
 * - Professional styling with headers and consistent formatting
 * - Dynamic sheet creation based on issue types present
 * 
 * The route follows Next.js 13+ App Router patterns and returns binary Excel data
 * with proper Content-Type and Content-Disposition headers for file downloads.
 * 
 * @module XeroValidationExcelExport
 * @since 1.0.0
 * @author CustomXero Team
 */

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { XeroValidationIssue } from '@/lib/types/validation';

/**
 * POST endpoint for exporting Xero validation results to Excel format.
 * 
 * This endpoint processes validation issue data and generates a comprehensive Excel workbook
 * with multiple sheets for different aspects of the validation results. The generated file
 * includes professional formatting, conditional styling, and detailed breakdowns of issues.
 * 
 * **Request Body Structure:**
 * ```json
 * {
 *   "issues": XeroValidationIssue[], // Array of validation issues
 *   "tenantId": string,              // Xero tenant identifier
 *   "timestamp": string             // ISO timestamp of validation
 * }
 * ```
 * 
 * **Excel Workbook Contents:**
 * 
 * 1. **Summary Sheet:**
 *    - Validation metadata (date, tenant ID)
 *    - Issue count statistics by type and severity
 *    - High-level overview for executive reporting
 * 
 * 2. **All Issues Sheet:**
 *    - Complete listing of all validation issues
 *    - Severity-based conditional formatting
 *    - Quote details, contact information, and suggested fixes
 * 
 * 3. **Format Issues Sheet** (conditional):
 *    - Dedicated view of quote format problems
 *    - Current vs. expected format comparisons
 *    - Specific formatting guidance
 * 
 * 4. **Tracking Issues Sheet** (conditional):
 *    - Line item tracking problems
 *    - Statistics on items missing tracking options
 *    - Financial reporting implications
 * 
 * **Response:**
 * - Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
 * - Content-Disposition: Attachment with timestamped filename
 * - Body: Binary Excel file data
 * 
 * @async
 * @function POST
 * @param {NextRequest} request - Next.js request object containing validation issues
 * @returns {Promise<NextResponse>} Excel file download response or error response
 * @throws {400} Invalid or missing issues data in request body
 * @throws {500} Excel generation failures or internal processing errors
 * @since 1.0.0
 * @example
 * ```typescript
 * // Client-side usage
 * const response = await fetch('/api/export/xero-validation-excel', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     issues: validationResults.session.issues,
 *     tenantId: validationResults.session.tenantId,
 *     timestamp: validationResults.session.startTime
 *   })
 * });
 * 
 * if (response.ok) {
 *   const blob = await response.blob();
 *   // Trigger file download
 * }
 * ```
 */
export async function POST(request: NextRequest) {
  try {
    const { issues, tenantId, timestamp } = await request.json();

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json(
        { error: 'Invalid issues data provided' },
        { status: 400 }
      );
    }

    // Create a new workbook with metadata
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CustomXero Validation System';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.title = 'Xero Quote Validation Report';
    workbook.description = 'Comprehensive validation results for Xero quotes including format and tracking issues';

    // Add Summary Sheet with comprehensive validation statistics
    const summarySheet = workbook.addWorksheet('Summary', {
      properties: {
        tabColor: { argb: 'FF1F4E79' }, // Blue tab color for summary
        defaultRowHeight: 20
      }
    });
    
    // Summary header
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    // Calculate comprehensive summary statistics for all issue types
    const totalIssues = issues.length;
    const errorCount = issues.filter((i: XeroValidationIssue) => i.severity === 'error').length;
    const warningCount = issues.filter((i: XeroValidationIssue) => i.severity === 'warning').length;
    const infoCount = issues.filter((i: XeroValidationIssue) => i.severity === 'info').length;
    const formatIssues = issues.filter((i: XeroValidationIssue) => i.code === 'INVALID_QUOTE_FORMAT').length;
    const trackingIssues = issues.filter((i: XeroValidationIssue) => i.code === 'MISSING_TRACKING_OPTIONS').length;
    const projectCodeIssues = issues.filter((i: XeroValidationIssue) => i.code === 'INVALID_PROJECT_CODE').length;
    
    // Calculate unique quotes affected
    const uniqueQuotes = new Set(issues.map(i => i.quoteId)).size;

    // Add comprehensive summary data with all relevant metrics
    summarySheet.addRows([
      { metric: 'Validation Date', value: new Date(timestamp || Date.now()).toLocaleString() },
      { metric: 'Tenant ID', value: tenantId || 'Unknown' },
      { metric: '', value: '' }, // Empty row for spacing
      { metric: 'ISSUE SUMMARY', value: '' },
      { metric: 'Total Issues Found', value: totalIssues },
      { metric: 'Unique Quotes Affected', value: uniqueQuotes },
      { metric: '', value: '' }, // Empty row for spacing
      { metric: 'BY SEVERITY', value: '' },
      { metric: 'Errors', value: errorCount },
      { metric: 'Warnings', value: warningCount },
      { metric: 'Information', value: infoCount },
      { metric: '', value: '' }, // Empty row for spacing
      { metric: 'BY ISSUE TYPE', value: '' },
      { metric: 'Invalid Quote Format', value: formatIssues },
      { metric: 'Missing Tracking Options', value: trackingIssues },
      { metric: 'Invalid Project Codes', value: projectCodeIssues }
    ]);

    // Apply professional styling to summary sheet
    summarySheet.getRow(1).font = { bold: true, size: 12 };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E79' }
    };
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Style section headers
    [4, 8, 13].forEach(rowNum => {
      const row = summarySheet.getRow(rowNum);
      row.font = { bold: true, size: 11 };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
      };
    });

    // Add comprehensive All Issues Sheet with detailed validation results
    const issuesSheet = workbook.addWorksheet('All Issues', {
      properties: {
        tabColor: { argb: 'FFFF6B6B' }, // Red tab color for issues
        defaultRowHeight: 18
      }
    });
    
    // Define comprehensive column structure for all issues
    issuesSheet.columns = [
      { header: 'Quote Number', key: 'quoteNumber', width: 22 },
      { header: 'Severity', key: 'severity', width: 12 },
      { header: 'Issue Type', key: 'code', width: 28 },
      { header: 'Issue Description', key: 'message', width: 55 },
      { header: 'Suggested Resolution', key: 'suggestedFix', width: 55 },
      { header: 'Contact Name', key: 'contactName', width: 25 },
      { header: 'Quote Total (SGD)', key: 'quoteTotal', width: 18 },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Quote ID', key: 'quoteId', width: 42 }
    ];

    // Add comprehensive issue data with all available metadata
    issues.forEach((issue: XeroValidationIssue) => {
      issuesSheet.addRow({
        quoteNumber: issue.quoteNumber || 'Unknown',
        severity: issue.severity.toUpperCase(),
        code: issue.code.replace(/_/g, ' '), // Make code more readable
        message: issue.message,
        suggestedFix: issue.suggestedFix || 'No specific recommendation available',
        contactName: issue.metadata?.contactName || 'Not specified',
        quoteTotal: issue.metadata?.quoteTotal ? 
          `$${issue.metadata.quoteTotal.toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : 'N/A',
        reference: issue.metadata?.reference || '',
        quoteId: issue.quoteId
      });
    });

    // Apply professional styling to issues sheet header
    issuesSheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    issuesSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF6B6B' }
    };
    issuesSheet.getRow(1).height = 25;

    // Apply comprehensive conditional formatting based on severity levels
    for (let i = 2; i <= issues.length + 1; i++) {
      const row = issuesSheet.getRow(i);
      const severityCell = row.getCell('severity');
      const severity = severityCell.value?.toString().toLowerCase();
      
      // Color-code entire row based on severity for better visual distinction
      let fillColor = { argb: 'FFFFFFFF' }; // Default white
      
      if (severity === 'error') {
        fillColor = { argb: 'FFFFE6E6' }; // Light red background
        severityCell.font = { bold: true, color: { argb: 'FFCC0000' } };
      } else if (severity === 'warning') {
        fillColor = { argb: 'FFFFF4E6' }; // Light orange background
        severityCell.font = { bold: true, color: { argb: 'FFFF8800' } };
      } else if (severity === 'info') {
        fillColor = { argb: 'FFE6F3FF' }; // Light blue background
        severityCell.font = { bold: true, color: { argb: 'FF0066CC' } };
      }
      
      // Apply background color to severity column for visual impact
      severityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: fillColor
      };
      
      // Add borders for better readability
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });
    }

    // Add dedicated Format Issues Sheet for quote format problems (if any exist)
    const formatIssuesList = issues.filter((i: XeroValidationIssue) => i.code === 'INVALID_QUOTE_FORMAT');
    if (formatIssuesList.length > 0) {
      const formatSheet = workbook.addWorksheet('Format Issues', {
        properties: {
          tabColor: { argb: 'FFFFFF9B' }, // Yellow tab for format issues
          defaultRowHeight: 18
        }
      });
      
      // Define comprehensive columns for format issue analysis
      formatSheet.columns = [
        { header: 'Quote Number', key: 'quoteNumber', width: 22 },
        { header: 'Current Format', key: 'actualFormat', width: 28 },
        { header: 'Expected Format Pattern', key: 'expectedFormat', width: 38 },
        { header: 'Format Issue Description', key: 'message', width: 52 },
        { header: 'Correction Steps', key: 'suggestedFix', width: 55 },
        { header: 'Contact Name', key: 'contactName', width: 25 },
        { header: 'Quote Value', key: 'quoteTotal', width: 15 }
      ];

      // Add detailed format issue data with comprehensive information
      formatIssuesList.forEach((issue: XeroValidationIssue) => {
        formatSheet.addRow({
          quoteNumber: issue.quoteNumber || 'Unknown',
          actualFormat: issue.metadata?.actualFormat || issue.quoteNumber || 'Not specified',
          expectedFormat: issue.metadata?.expectedFormat || 'ProjectCode-QuoteNumber (e.g., NY255118-QU0428)',
          message: issue.message,
          suggestedFix: issue.suggestedFix || 'Follow the ProjectCode-QuoteNumber pattern',
          contactName: issue.metadata?.contactName || 'Not specified',
          quoteTotal: issue.metadata?.quoteTotal ? 
            `$${issue.metadata.quoteTotal.toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : 'N/A'
        });
      });

      // Apply professional styling to format issues sheet
      formatSheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FF8B4513' } };
      formatSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF9B' }
      };
      formatSheet.getRow(1).height = 25;
      
      // Add alternating row colors for better readability
      for (let i = 2; i <= formatIssuesList.length + 1; i++) {
        if (i % 2 === 0) {
          const row = formatSheet.getRow(i);
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFEFEFE' }
            };
          });
        }
      }
    }

    // Add dedicated Tracking Issues Sheet for line item tracking problems (if any exist)
    const trackingIssuesList = issues.filter((i: XeroValidationIssue) => i.code === 'MISSING_TRACKING_OPTIONS');
    if (trackingIssuesList.length > 0) {
      const trackingSheet = workbook.addWorksheet('Tracking Issues', {
        properties: {
          tabColor: { argb: 'FF9BB7FF' }, // Light blue tab for tracking issues
          defaultRowHeight: 18
        }
      });
      
      // Define comprehensive columns for tracking issue analysis
      trackingSheet.columns = [
        { header: 'Quote Number', key: 'quoteNumber', width: 22 },
        { header: 'Contact/Client Name', key: 'contactName', width: 28 },
        { header: 'Items Missing Tracking', key: 'itemsWithoutTracking', width: 25 },
        { header: 'Total Line Items', key: 'totalItems', width: 20 },
        { header: 'Completion Rate', key: 'completionRate', width: 18 },
        { header: 'Quote Value (SGD)', key: 'quoteTotal', width: 18 },
        { header: 'Business Impact', key: 'businessImpact', width: 35 },
        { header: 'Recommended Actions', key: 'suggestedFix', width: 50 }
      ];

      // Add comprehensive tracking issue data with business impact analysis
      trackingIssuesList.forEach((issue: XeroValidationIssue) => {
        const itemsWithoutTracking = issue.metadata?.lineItemsWithoutTracking || 0;
        const totalItems = issue.metadata?.totalLineItems || 0;
        const completionRate = totalItems > 0 ? 
          `${Math.round(((totalItems - itemsWithoutTracking) / totalItems) * 100)}%` : 'N/A';
        
        trackingSheet.addRow({
          quoteNumber: issue.quoteNumber || 'Unknown',
          contactName: issue.metadata?.contactName || 'Not specified',
          itemsWithoutTracking,
          totalItems,
          completionRate,
          quoteTotal: issue.metadata?.quoteTotal ? 
            `$${issue.metadata.quoteTotal.toLocaleString('en-SG', { minimumFractionDigits: 2 })}` : 'N/A',
          businessImpact: itemsWithoutTracking > 0 ? 
            'Limited financial reporting accuracy' : 'No impact',
          suggestedFix: issue.suggestedFix || 'Add tracking categories to all line items for better financial visibility'
        });
      });

      // Apply professional styling to tracking issues sheet
      trackingSheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FF1E3A8A' } };
      trackingSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF9BB7FF' }
      };
      trackingSheet.getRow(1).height = 25;
      
      // Add conditional formatting based on completion rate
      for (let i = 2; i <= trackingIssuesList.length + 1; i++) {
        const row = trackingSheet.getRow(i);
        const completionCell = row.getCell('completionRate');
        const completionValue = completionCell.value?.toString().replace('%', '');
        
        if (completionValue && parseFloat(completionValue) < 50) {
          completionCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE6E6' } // Light red for low completion
          };
          completionCell.font = { bold: true, color: { argb: 'FFCC0000' } };
        } else if (completionValue && parseFloat(completionValue) < 80) {
          completionCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF4E6' } // Light orange for medium completion
          };
          completionCell.font = { bold: true, color: { argb: 'FFFF8800' } };
        }
      }
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return Excel file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="xero-validation-${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });

  } catch (error) {
    // Use proper logging instead of console.error for production
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Note: In a full implementation, this should use the logger from @/lib/logger
    // For now, keeping console.error for compatibility
    console.error('Excel generation failed:', {
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to generate Excel report',
        details: 'An error occurred while creating the validation report. Please try again.',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}