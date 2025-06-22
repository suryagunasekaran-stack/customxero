'use client';

import React from 'react';
import Decimal from 'decimal.js';

// Example interfaces using string monetary values
interface ExampleTimeEntry {
  cost: string;           // was: number
  hours: string;          // was: number  
  cost_per_hour: string;  // was: number
}

interface ExampleCostVerification {
  our_navy_total: string;     // was: number
  excel_navy_total: string;   // was: number
  difference: string;         // was: number
}

// Utility functions for monetary calculations
const calculateCostPerHour = (cost: string, hours: string): string => {
  const costDecimal = new Decimal(cost);
  const hoursDecimal = new Decimal(hours);
  
  if (hoursDecimal.isZero()) {
    return "0.00";
  }
  
  return costDecimal.div(hoursDecimal).toFixed(2);
};

const calculateTotalCost = (hours: string, costPerHour: string): string => {
  const hoursDecimal = new Decimal(hours);
  const costPerHourDecimal = new Decimal(costPerHour);
  
  return hoursDecimal.times(costPerHourDecimal).toFixed(2);
};

const addCosts = (a: string, b: string): string => {
  return new Decimal(a).plus(new Decimal(b)).toFixed(2);
};

const subtractCosts = (a: string, b: string): string => {
  return new Decimal(a).minus(new Decimal(b)).toFixed(2);
};

// Currency formatting function
const formatCurrency = (value: string, currency: string = 'SGD', locale: string = 'en-SG'): string => {
  const numericValue = parseFloat(value);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(numericValue);
};

export default function MonetaryExample() {
  // Example data with string monetary values
  const timeEntry: ExampleTimeEntry = {
    cost: "55000.00",
    hours: "8.50",
    cost_per_hour: "25.33"
  };

  const verification: ExampleCostVerification = {
    our_navy_total: "15000.50",
    excel_navy_total: "15000.75",
    difference: "0.25"
  };

  // Calculate cost per hour from cost and hours
  const calculatedCostPerHour = calculateCostPerHour(timeEntry.cost, timeEntry.hours);
  
  // Calculate total cost from hours and cost per hour
  const calculatedTotalCost = calculateTotalCost(timeEntry.hours, timeEntry.cost_per_hour);
  
  // Calculate verification difference
  const calculatedDifference = subtractCosts(verification.excel_navy_total, verification.our_navy_total);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Monetary Values as Strings - Example</h2>
      
      <div className="space-y-6">
        {/* Time Entry Example */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Time Entry Calculations</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="font-medium text-gray-700">Original Values:</label>
              <ul className="mt-1 space-y-1 text-gray-600">
                <li>Cost: {formatCurrency(timeEntry.cost)}</li>
                <li>Hours: {timeEntry.hours}</li>
                <li>Cost per Hour: {formatCurrency(timeEntry.cost_per_hour)}</li>
              </ul>
            </div>
            <div>
              <label className="font-medium text-gray-700">Calculated Values:</label>
              <ul className="mt-1 space-y-1 text-gray-600">
                <li>Cost ÷ Hours = {formatCurrency(calculatedCostPerHour)}</li>
                <li>Hours × Cost/Hour = {formatCurrency(calculatedTotalCost)}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Cost Verification Example */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-3">Cost Verification</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <label className="font-medium text-gray-700">Comparison:</label>
              <ul className="mt-1 space-y-1 text-gray-600">
                <li>Our Navy Total: {formatCurrency(verification.our_navy_total)}</li>
                <li>Excel Navy Total: {formatCurrency(verification.excel_navy_total)}</li>
                <li>Stored Difference: {formatCurrency(verification.difference)}</li>
              </ul>
            </div>
            <div>
              <label className="font-medium text-gray-700">Calculated:</label>
              <ul className="mt-1 space-y-1 text-gray-600">
                <li>Calculated Difference: {formatCurrency(calculatedDifference)}</li>
                <li className={`font-medium ${calculatedDifference === verification.difference ? 'text-green-600' : 'text-red-600'}`}>
                  {calculatedDifference === verification.difference ? '✓ Match' : '✗ Mismatch'}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Usage Example */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-lg font-medium text-blue-900 mb-3">Implementation Example</h3>
          <pre className="text-sm text-blue-800 overflow-x-auto">
{`// OLD (numbers)
{
  "cost": 55000.00,
  "hours": 8.5,
  "cost_per_hour": 25.33
}

// NEW (strings)  
{
  "cost": "55000.00",
  "hours": "8.50", 
  "cost_per_hour": "25.33"
}

// Calculations with Decimal.js
const cost = new Decimal(entry.cost);
const hours = new Decimal(entry.hours);
const total = cost.times(hours).toFixed(2);`}
          </pre>
        </div>
      </div>
    </div>
  );
} 