# Comprehensive Validation Rules Documentation

## Overview
This document lists all validation rules currently implemented in the Pipedrive-Xero integration system.

---

## 1. DEAL TITLE VALIDATION (`validateDealTitle`)

### Purpose
Ensures Pipedrive deal titles follow the correct format: `PROJECTCODE-VESSELNAME`

### Rules Applied:
1. **Empty Title Check**
   - Error if deal has no title
   - Code: `EMPTY_TITLE`

2. **Quote Number Prefix Check** ✅ NEW
   - Error if title starts with `QU` (e.g., `QU0362-...`)
   - Code: `INVALID_TITLE_QUOTE_PREFIX`
   - Example: "QU0362- 8203249816 - 6200035482 -Zone B..." ❌

3. **Invalid Number Sequence Check** ✅ NEW
   - Error if title contains multiple long numbers
   - Code: `INVALID_TITLE_NUMBER_SEQUENCE`
   - Catches patterns like: "QU0362- 8203249816 - 6200035482"

4. **Duplicate Deal Check** ✅ NEW
   - Warning if title contains "(copy)"
   - Code: `DUPLICATE_DEAL_TITLE`

5. **Project Code Validation**
   - Error if no valid project code found
   - Valid patterns: `ED12345`, `NY2594`, `MES2024001`
   - Invalid: Starting with `QU`
   - Code: `INVALID_FORMAT`

6. **Vessel Name Validation**
   - Warning if vessel name is missing
   - Error if vessel name is just numbers ✅ NEW
   - Code: `MISSING_VESSEL` or `INVALID_VESSEL_NAME`

### Valid Examples:
- ✅ `ED12345-VesselName`
- ✅ `NY2594-ShipABC`
- ✅ `MES2024001-Tanker123`

### Invalid Examples:
- ❌ `QU0362-8203249816-6200035482` (starts with QU)
- ❌ `ED12345-123456` (vessel is just numbers)
- ❌ `SomeTitle (copy)` (duplicate indicator)

---

## 2. QUOTE-DEAL CROSS-REFERENCE VALIDATION (`crossReferenceQuotes`)

### Purpose
Validates linkage between Pipedrive deals and Xero quotes

### Rules Applied:
1. **Missing Quote Link**
   - Info if deal has no Xero Quote ID
   - Code: `NO_QUOTE_LINKED`

2. **Quote Existence Check**
   - Error if referenced quote doesn't exist in Xero
   - Code: `QUOTE_NOT_FOUND`

3. **Deal-Quote Organization Match**
   - Warning if deal organization doesn't match quote contact
   - Code: `ORGANIZATION_MISMATCH`

4. **Value Matching**
   - Warning if deal value differs from quote total by >10%
   - Code: `VALUE_MISMATCH`

5. **Products vs Line Items**
   - Warning if deal product count doesn't match quote line items
   - Code: `PRODUCT_COUNT_MISMATCH`

---

## 3. INVOICE STAGE VALIDATION (`validateInvoiceStageDeals`)

### Purpose
Ensures deals in Invoice stage have quotes with INVOICED status

### Rules Applied:
1. **Invoice Stage Quote Requirement**
   - Error if deal in Invoice stage has no quote
   - Code: `INVOICE_STAGE_NO_QUOTE`

2. **Quote Status Check**
   - Error if quote is not in INVOICED status
   - Code: `INVOICE_STAGE_WRONG_STATUS`
   - Invalid statuses: DRAFT, SENT, ACCEPTED

---

## 4. ORPHANED ACCEPTED QUOTES VALIDATION (`validateOrphanedAcceptedQuotes`)

### Purpose
Identifies accepted quotes not properly linked to deals

### Rules Applied:
1. **Orphaned Quote Check**
   - Warning if accepted quote has no linked deal
   - Code: `ORPHANED_ACCEPTED_QUOTE`

2. **Pipeline Validation**
   - Warning if quote linked to deal not in WIP pipeline
   - Code: `ACCEPTED_QUOTE_WRONG_PIPELINE`

3. **Deal Status Check**
   - Error if accepted quote linked to won/lost deal
   - Code: `ACCEPTED_QUOTE_DEAL_CLOSED`

4. **Value Mismatch Validation** ✅ NEW
   - Warning if quote total differs from deal value by >10%
   - Code: `VALUE_MISMATCH`
   - Validates quotes that reference deals via Reference field
   - Example: Quote $3,200 vs Deal SGD5,400

---

## 5. ACCEPTED QUOTE NUMBER FORMAT VALIDATION (`validateAcceptedQuoteNumberFormat`)

### Purpose
Ensures accepted quotes follow naming convention: `PROJECTNUMBER-QUNUMBER-VERSION`

### Rules Applied:
1. **Format Pattern Check**
   - Error if quote number doesn't match pattern
   - Valid: `NY2594-QU22554-1`, `NY2450-QU19757-1-v2`
   - Invalid: `QU0349-v2` (missing project)
   - Code: `ACCEPTED_QUOTE_INVALID_FORMAT`

2. **Specific Issue Detection**
   - Missing project prefix
   - Missing QU prefix
   - Old format
   - Incorrect version format

---

## 6. REQUIRED FIELDS VALIDATION (`validateRequiredFields`)

### Purpose
Ensures critical custom fields are populated

### Rules Applied:
1. **Vessel Name Field**
   - Warning if vessel name custom field is empty
   - Field: `vesselName`

2. **Other Custom Fields**
   - Checks for IPC, Location, Department, etc.
   - Based on tenant configuration

---

## 7. PROJECT VALIDATION

### Purpose
Validates Xero projects against deals

### Rules Applied:
1. **Project Status**
   - Only fetches INPROGRESS projects
   - Filters out completed/cancelled projects

2. **Project-Deal Matching**
   - Matches based on normalized project keys
   - Uses ED format normalization

---

## VALIDATION FLOW

1. **Deal Title Validation** → Checks format and patterns
2. **Required Fields Validation** → Checks custom fields
3. **Quote Cross-Reference** → Links deals to quotes
4. **Invoice Stage Validation** → Checks invoice stage rules
5. **Orphaned Quote Validation** → Finds unlinked quotes
6. **Quote Format Validation** → Checks quote numbering

## SUMMARY STATISTICS TRACKED

- Total Deals, Quotes, Projects
- Deals/Quotes/Projects with issues
- Error, Warning, Info counts
- Matched/Unmatched counts
- Quotes by status (DRAFT, SENT, ACCEPTED, etc.)
- Total values (Quote in Progress, Pipedrive WIP)
- Orphaned accepted quotes count and value
- Accepted quotes with invalid format count

---

## RECENT FIXES

1. **Fixed QU Prefix Detection**: Titles starting with `QU` are now properly flagged as invalid
2. **Added Number Sequence Validation**: Catches titles with multiple long numbers
3. **Added Vessel Name Number Check**: Vessel names that are just numbers are rejected
4. **Improved Pattern Matching**: More specific project code patterns (NY, MES, ED, etc.)
5. **Added Duplicate Detection**: Flags deals with "(copy)" in title

---

## TESTING THE VALIDATION

To test if a deal title will be flagged:

1. **"QU0362- 8203249816 - 6200035482 -Zone B..."**
   - ❌ Starts with QU (INVALID_TITLE_QUOTE_PREFIX)
   - ❌ Contains number sequences (INVALID_TITLE_NUMBER_SEQUENCE)
   - ❌ No valid project code (INVALID_FORMAT)
   - ❌ Contains "(copy)" (DUPLICATE_DEAL_TITLE)

2. **"ED12345-VesselABC"**
   - ✅ Valid project code
   - ✅ Valid vessel name
   - ✅ Correct format

This validation system ensures data quality and consistency between Pipedrive and Xero.