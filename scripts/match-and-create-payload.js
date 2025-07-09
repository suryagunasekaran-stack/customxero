#!/usr/bin/env node

/**
 * Script to match invoice update data with existing Xero invoices and create update payload
 * Usage: node scripts/match-and-create-payload.js
 */

const fs = require('fs');
const path = require('path');

// File paths
const updateDataFile = 'tableConvert.com_3nrwk5.json';
const xeroInvoicesFile = '/Users/suryagunasekaran/workApplications/customxero/xero-invoices-2025-07-09.json';
const outputFile = 'xero-update-payload.json';

try {
  // Read the update data
  console.log('📄 Reading update data...');
  const updateData = JSON.parse(fs.readFileSync(updateDataFile, 'utf8'));
  
  // Read the Xero invoices
  console.log('📄 Reading Xero invoices...');
  const xeroInvoicesData = JSON.parse(fs.readFileSync(xeroInvoicesFile, 'utf8'));
  const xeroInvoices = xeroInvoicesData.invoices || xeroInvoicesData.Invoices || [];
  
  console.log(`\n📊 Found ${updateData.length} updates to process`);
  console.log(`📊 Found ${xeroInvoices.length} invoices from Xero\n`);
  
  // Create a map of updates by invoice number
  const updateMap = {};
  updateData.forEach(item => {
    const invoiceNumber = item['*InvoiceNumber'];
    if (!updateMap[invoiceNumber]) {
      updateMap[invoiceNumber] = [];
    }
    updateMap[invoiceNumber].push(item);
  });
  
  // Process invoices and create update payload
  const invoicesToUpdate = [];
  let matchedCount = 0;
  let skippedCount = 0;
  
  xeroInvoices.forEach(invoice => {
    const updates = updateMap[invoice.InvoiceNumber];
    
    if (updates && invoice.Status === 'DRAFT') {
      matchedCount++;
      console.log(`✅ Matched DRAFT invoice: ${invoice.InvoiceNumber}`);
      
      // Create the invoice update structure
      const invoiceUpdate = {
        InvoiceID: invoice.InvoiceID,
        Type: invoice.Type,
        Contact: {
          ContactID: invoice.Contact.ContactID
        },
        InvoiceNumber: invoice.InvoiceNumber,
        Status: invoice.Status,
        LineAmountTypes: invoice.LineAmountTypes || 'Exclusive'
      };
      
      // Include date fields if they exist
      if (invoice.Date) {
        // Convert Microsoft JSON date format to ISO date
        const dateMatch = invoice.Date.match(/\/Date\((\d+)([\+\-]\d+)?\)\//);
        if (dateMatch) {
          const timestamp = parseInt(dateMatch[1]);
          const date = new Date(timestamp);
          invoiceUpdate.Date = date.toISOString().split('T')[0];
        } else {
          invoiceUpdate.Date = invoice.Date;
        }
      }
      
      if (invoice.DueDate) {
        // Convert Microsoft JSON date format to ISO date
        const dueDateMatch = invoice.DueDate.match(/\/Date\((\d+)([\+\-]\d+)?\)\//);
        if (dueDateMatch) {
          const timestamp = parseInt(dueDateMatch[1]);
          const date = new Date(timestamp);
          invoiceUpdate.DueDate = date.toISOString().split('T')[0];
        } else {
          invoiceUpdate.DueDate = invoice.DueDate;
        }
      }
      
      if (invoice.Reference) invoiceUpdate.Reference = invoice.Reference;
      if (invoice.CurrencyCode) invoiceUpdate.CurrencyCode = invoice.CurrencyCode;
      if (invoice.BrandingThemeID) invoiceUpdate.BrandingThemeID = invoice.BrandingThemeID;
      
      // Update line items
      if (invoice.LineItems && invoice.LineItems.length > 0) {
        invoiceUpdate.LineItems = invoice.LineItems.map((lineItem, index) => {
          // Get the update for this line item (assuming one update per invoice for now)
          const update = updates[0]; // You might need to match by line item description or other criteria
          
          // Map tax type to correct Singapore GST code
          const taxTypeMapping = {
            'Standard-Rated Supplies': 'OUTPUTY24',  // 9% GST for current year
            'Zero-Rated Supplies': 'ZERORATEDOUTPUT',
            'Exempt Supplies': 'ES33OUTPUT',
            'Out of Scope': 'OSOUTPUT2',
            'No Tax': 'NONE'  // 0.00% No Tax
          };
          
          const mappedTaxType = taxTypeMapping[update['*TaxType']] || update['*TaxType'];
          
          const updatedLineItem = {
            LineItemID: lineItem.LineItemID,
            Description: update['*Description'].trim(),
            AccountCode: update['*AccountCode'],
            TaxType: mappedTaxType,
            // Preserve existing quantity and unit amount
            Quantity: lineItem.Quantity || 1,
            UnitAmount: lineItem.UnitAmount || 0
          };
          
          // Add tracking if provided
          if (update.TrackingName1 && update.TrackingOption1) {
            updatedLineItem.Tracking = [
              {
                Name: update.TrackingName1,
                Option: update.TrackingOption1
              }
            ];
            
            // Add second tracking category if provided
            if (update.TrackingName2 && update.TrackingOption2) {
              updatedLineItem.Tracking.push({
                Name: update.TrackingName2,
                Option: update.TrackingOption2
              });
            }
          }
          
          return updatedLineItem;
        });
      }
      
      invoicesToUpdate.push(invoiceUpdate);
    } else if (updates && invoice.Status !== 'DRAFT') {
      skippedCount++;
      console.log(`⏭️  Skipped ${invoice.Status} invoice: ${invoice.InvoiceNumber}`);
    } else {
      skippedCount++;
    }
  });
  
  // Create the final payload
  const payload = {
    Invoices: invoicesToUpdate
  };
  
  // Write the output file
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  
  console.log(`\n✅ Successfully created Xero update payload`);
  console.log(`📁 Output saved to: ${outputFile}`);
  console.log(`\n📊 Summary:`);
  console.log(`   - Total invoices matched: ${matchedCount}`);
  console.log(`   - Total invoices skipped: ${skippedCount}`);
  console.log(`   - Total invoices in payload: ${invoicesToUpdate.length}`);
  
  // Show first invoice as example
  if (invoicesToUpdate.length > 0) {
    console.log('\n📋 Example of first invoice in payload:');
    console.log(JSON.stringify(invoicesToUpdate[0], null, 2));
  }
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
} 