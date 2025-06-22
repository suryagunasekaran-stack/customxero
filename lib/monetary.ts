import Decimal from 'decimal.js';

// Configure Decimal.js for monetary calculations
Decimal.config({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
  modulo: Decimal.ROUND_DOWN
});

/**
 * Utility class for monetary calculations and formatting
 */
export class MonetaryUtils {
  /**
   * Convert string to Decimal for calculations
   */
  static toDecimal(value: string) {
    return new Decimal(value);
  }

  /**
   * Convert Decimal back to string with specified decimal places
   */
  static toString(decimal: any, decimalPlaces: number = 2): string {
    return decimal.toFixed(decimalPlaces);
  }

  /**
   * Add two monetary values
   */
  static add(a: string, b: string): string {
    return this.toDecimal(a).plus(this.toDecimal(b)).toFixed(2);
  }

  /**
   * Subtract two monetary values
   */
  static subtract(a: string, b: string): string {
    return this.toDecimal(a).minus(this.toDecimal(b)).toFixed(2);
  }

  /**
   * Multiply two monetary values
   */
  static multiply(a: string, b: string): string {
    return this.toDecimal(a).times(this.toDecimal(b)).toFixed(2);
  }

  /**
   * Divide two monetary values
   */
  static divide(a: string, b: string): string {
    return this.toDecimal(a).div(this.toDecimal(b)).toFixed(2);
  }

  /**
   * Calculate cost per hour
   */
  static calculateCostPerHour(cost: string, hours: string): string {
    if (this.toDecimal(hours).isZero()) {
      return "0.00";
    }
    return this.divide(cost, hours);
  }

  /**
   * Calculate total cost
   */
  static calculateTotalCost(hours: string, costPerHour: string): string {
    return this.multiply(hours, costPerHour);
  }

  /**
   * Format currency for display
   */
  static formatCurrency(value: string, currency: string = 'SGD', locale: string = 'en-SG'): string {
    const numericValue = parseFloat(value);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(numericValue);
  }

  /**
   * Convert cents to dollars (for backward compatibility)
   */
  static centsToString(cents: number): string {
    return this.toDecimal(cents.toString()).div(100).toFixed(2);
  }

  /**
   * Convert dollars string to cents (for API calls that expect cents)
   */
  static stringToCents(dollars: string): number {
    return this.toDecimal(dollars).times(100).toNumber();
  }

  /**
   * Compare two monetary values
   */
  static compare(a: string, b: string): number {
    return this.toDecimal(a).comparedTo(this.toDecimal(b));
  }

  /**
   * Check if values are equal
   */
  static isEqual(a: string, b: string): boolean {
    return this.compare(a, b) === 0;
  }

  /**
   * Get absolute value
   */
  static abs(value: string): string {
    return this.toDecimal(value).abs().toFixed(2);
  }

  /**
   * Round to specified decimal places
   */
  static round(value: string, decimalPlaces: number = 2): string {
    return this.toDecimal(value).toFixed(decimalPlaces);
  }

  /**
   * Sum an array of monetary values
   */
  static sum(values: string[]): string {
    return values.reduce((sum, value) => this.add(sum, value), "0.00");
  }

  /**
   * Check if value is zero
   */
  static isZero(value: string): boolean {
    return this.toDecimal(value).isZero();
  }

  /**
   * Check if value is positive
   */
  static isPositive(value: string): boolean {
    return this.toDecimal(value).greaterThan(0);
  }

  /**
   * Check if value is negative
   */
  static isNegative(value: string): boolean {
    return this.toDecimal(value).lessThan(0);
  }
} 