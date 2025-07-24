/**
 * Data loading service
 * Follows Single Responsibility Principle (SRP)
 */
export class DataLoader {
  constructor(dataUrl = 'cv-data.json') {
    this.dataUrl = dataUrl;
  }

  /**
   * Load CV data from JSON file
   * @returns {Promise<Object>} CV data object
   * @throws {Error} If data loading fails
   */
  async loadCVData() {
    try {
      const response = await fetch(this.dataUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!this.validateCVData(data)) {
        throw new Error('Invalid CV data structure');
      }
      
      return data;
    } catch (error) {
      throw new Error(`Failed to load CV data: ${error.message}`);
    }
  }

  /**
   * Validate CV data structure
   * @param {Object} data - CV data to validate
   * @returns {boolean} True if data is valid
   */
  validateCVData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Basic structure validation
    const requiredFields = ['name', 'title'];
    return requiredFields.some(field => data[field]);
  }
}