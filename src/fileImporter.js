const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { VALIDATION_LIMITS } = require('./constants');

class FileImporter {
  constructor() {
    // Defined aliases based on specifications
    this.aliases = {
      date: ['date', 'transaction date', 'posted date', 'trans date', 'posting date'],
      amount: ['amount', 'debit', 'credit', 'sum', 'total', 'value'],
      title: ['title', 'name', 'payee', 'merchant', 'vendor', 'description'],
      category: ['category', 'type', 'group', 'class'],
      description: ['description', 'memo', 'notes', 'details', 'narrative', 'reference'],
      payment: ['payment method', 'payment type', 'method', 'payment']
    };
  }

  parseFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return this._errorResponse('File does not exist.', 'unknown');
      }

      const stats = fs.statSync(filePath);
      const maxFileSize = VALIDATION_LIMITS?.MAX_IMPORT_FILE_SIZE || (50 * 1024 * 1024);
      if (stats.size > maxFileSize) {
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        return this._errorResponse(`File size (${sizeMB}MB) exceeds the maximum allowed import limit of 50MB.`, 'unknown');
      }

      const ext = path.extname(filePath).toLowerCase();

      switch (ext) {
        case '.csv':
          return this._parseCSV(filePath);
        case '.xls':
        case '.xlsx':
          return this._parseExcel(filePath);
        case '.ofx':
        case '.qfx':
          return this._parseOFX(filePath);
        case '.json':
          return this._parseJSON(filePath);
        case '.pdf':
          return this._parsePDF(filePath);
        default:
          return this._errorResponse('Unsupported file extension. Supported formats: CSV, XLS, XLSX, OFX, QFX, JSON, PDF', 'unknown');
      }
    } catch (error) {
      return this._errorResponse(`Error reading file: ${error.message}`, 'unknown');
    }
  }

  _errorResponse(message, format, warnings = []) {
    return {
      success: false,
      expenses: [],
      errors: [message],
      warnings: warnings,
      format: format
    };
  }

  _mapHeaders(headers) {
    const mapping = {
      dateCol: -1,
      amountCol: -1,
      titleCol: -1,
      categoryCol: -1,
      descriptionCol: -1,
      paymentCol: -1
    };

    const headerKeys = Object.keys(this.aliases);

    headers.forEach((header, index) => {
      const cleanHeader = (header || '').toString().toLowerCase().trim();
      
      // Match aliases
      for (const key of headerKeys) {
        if (this.aliases[key].includes(cleanHeader)) {
          // If we haven't mapped this property yet, or if it's title/description overlap
          if (mapping[`${key}Col`] === -1) {
            mapping[`${key}Col`] = index;
            break; // Stop looking for this header's meaning
          }
        }
      }
    });

    // Resolve overlap between title and description if both mapped to the same index
    // Wait, the break above prevents mapping same header to multiple keys, but wait
    // If 'description' matches 'title' first, it maps to titleCol.
    // That's fine as per the requirements.

    return mapping;
  }

  // --- CSV Parser ---
  _parseCSV(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.trim()) return this._errorResponse('File is empty', 'csv');

      // Detect delimiter
      const firstLine = content.split(/\r?\n/)[0];
      let delimiter = ',';
      if (firstLine.includes('\t')) delimiter = '\t';
      else if (firstLine.includes(';')) delimiter = ';';
      else if (firstLine.includes(',')) delimiter = ',';

      // Parse rows
      const rows = [];
      let currentRow = [];
      let currentCell = '';
      let insideQuotes = false;

      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];

        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            currentCell += '"';
            i++; // skip next quote
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === delimiter && !insideQuotes) {
          currentRow.push(currentCell);
          currentCell = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
          if (char === '\r' && nextChar === '\n') i++; // skip \n
          currentRow.push(currentCell);
          
          if (currentRow.some(cell => cell.trim() !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      
      if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        if (currentRow.some(cell => cell.trim() !== '')) {
          rows.push(currentRow);
        }
      }

      if (rows.length === 0) return this._errorResponse('No valid rows found', 'csv');

      // Find header row
      let headerRowIndex = 0;
      let maxMatches = 0;
      let bestMapping = null;

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const mapping = this._mapHeaders(rows[i]);
        let matches = 0;
        Object.values(mapping).forEach(val => { if (val !== -1) matches++; });
        if (matches > maxMatches) {
          maxMatches = matches;
          headerRowIndex = i;
          bestMapping = mapping;
        }
      }

      if (!bestMapping || maxMatches === 0) {
        return this._errorResponse('Could not detect valid headers', 'csv');
      }

      const expenses = [];
      const warnings = [];

      const maxRows = VALIDATION_LIMITS?.MAX_IMPORT_ROWS || 25000;
      const totalDataRows = rows.length - (headerRowIndex + 1);
      if (totalDataRows > maxRows) {
        warnings.push(`File contains ${totalDataRows} data rows; truncated to first ${maxRows} transactions to prevent memory exhaustion.`);
      }
      const rowsToProcess = Math.min(rows.length, headerRowIndex + 1 + maxRows);

      for (let i = headerRowIndex + 1; i < rowsToProcess; i++) {
        const row = rows[i];
        if (row.every(cell => cell.trim() === '')) continue; // Skip empty rows

        const getVal = (col) => col !== -1 && col < row.length ? row[col].trim() : '';
        
        // Strip currency symbols, country strings, accounting parentheses, and formatting commas without stripping decimal points (BUG-001)
        const rawVal = getVal(bestMapping.amountCol);
        const amountStr = String(rawVal)
          .replace(/(?:INR|USD|EUR|Rs\.?|[₹$€£,()])/gi, '')
          .trim();
        let amount = parseFloat(amountStr);
        if (isNaN(amount)) continue; // skip invalid amounts
        
        // Treat negative amounts as expenses, rounded to 2 decimal places
        amount = Math.abs(parseFloat(amount.toFixed(2)));

        const dateStr = getVal(bestMapping.dateCol);
        const title = getVal(bestMapping.titleCol);
        const description = getVal(bestMapping.descriptionCol);

        expenses.push({
          date: dateStr,
          amount: amount,
          title: title || description || 'Unknown',
          description: description !== title ? description : '',
          category: getVal(bestMapping.categoryCol) || 'Imported',
          paymentMethod: getVal(bestMapping.paymentCol),
          tags: []
        });
      }

      return {
        success: true,
        expenses,
        errors: [],
        warnings,
        format: 'csv'
      };
    } catch (e) {
      return this._errorResponse(e.message, 'csv');
    }
  }

  // --- XLS/XLSX Parser ---
  _parseExcel(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      if (workbook.SheetNames.length === 0) return this._errorResponse('Excel file has no sheets', 'excel');
      
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

      if (rows.length === 0) return this._errorResponse('No valid rows found', 'excel');

      // Find header row
      let headerRowIndex = 0;
      let maxMatches = 0;
      let bestMapping = null;

      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const mapping = this._mapHeaders(rows[i]);
        let matches = 0;
        Object.values(mapping).forEach(val => { if (val !== -1) matches++; });
        if (matches > maxMatches) {
          maxMatches = matches;
          headerRowIndex = i;
          bestMapping = mapping;
        }
      }

      if (!bestMapping || maxMatches === 0) {
        return this._errorResponse('Could not detect valid headers', 'excel');
      }

      const expenses = [];
      const warnings = [];

      const maxRows = VALIDATION_LIMITS?.MAX_IMPORT_ROWS || 25000;
      const totalDataRows = rows.length - (headerRowIndex + 1);
      if (totalDataRows > maxRows) {
        warnings.push(`File contains ${totalDataRows} data rows; truncated to first ${maxRows} transactions to prevent memory exhaustion.`);
      }
      const rowsToProcess = Math.min(rows.length, headerRowIndex + 1 + maxRows);

      for (let i = headerRowIndex + 1; i < rowsToProcess; i++) {
        const row = rows[i];
        if (row.length === 0) continue;

        const getVal = (col) => col !== -1 && col < row.length && row[col] ? row[col].toString().trim() : '';

        // Strip currency symbols, country strings, accounting parentheses, and formatting commas without stripping decimal points (BUG-001)
        const rawVal = getVal(bestMapping.amountCol);
        const amountStr = String(rawVal)
          .replace(/(?:INR|USD|EUR|Rs\.?|[₹$€£,()])/gi, '')
          .trim();
        let amount = parseFloat(amountStr);
        if (isNaN(amount)) continue;

        // Treat negative amounts as expenses, rounded to 2 decimal places
        amount = Math.abs(parseFloat(amount.toFixed(2)));

        const dateVal = getVal(bestMapping.dateCol);
        let dateStr = dateVal;

        expenses.push({
          date: dateStr,
          amount: amount,
          title: getVal(bestMapping.titleCol) || 'Unknown',
          description: getVal(bestMapping.descriptionCol),
          category: getVal(bestMapping.categoryCol) || 'Imported',
          paymentMethod: getVal(bestMapping.paymentCol),
          tags: []
        });
      }

      return { success: true, expenses, errors: [], warnings, format: 'excel' };
    } catch (e) {
      return this._errorResponse(e.message, 'excel');
    }
  }

  // --- OFX/QFX Parser ---
  _parseOFX(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const expenses = [];
      const warnings = [];
      
      const stmttrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
      let match;

      while ((match = stmttrnRegex.exec(content)) !== null) {
        const block = match[1];
        
        const getTagValue = (tag) => {
          const reg = new RegExp(`<${tag}>([^<\r\n]+)`);
          const m = block.match(reg);
          return m ? m[1].trim() : '';
        };

        const trnType = getTagValue('TRNTYPE');
        const dtPosted = getTagValue('DTPOSTED');
        const trnAmt = getTagValue('TRNAMT');
        const name = getTagValue('NAME');
        const memo = getTagValue('MEMO');

        let amount = parseFloat(trnAmt);
        if (isNaN(amount) || amount >= 0) {
          // Only import DEBIT transactions (negative amounts) as expenses
          continue; 
        }
        amount = Math.abs(amount);

        // Date: YYYYMMDD or YYYYMMDDHHMMSS -> YYYY-MM-DD
        let dateStr = dtPosted.substring(0, 8);
        if (dateStr.length === 8) {
          dateStr = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
        }

        expenses.push({
          date: dateStr,
          amount: amount,
          title: name || 'Unknown',
          description: memo,
          category: 'Imported',
          paymentMethod: '',
          tags: trnType ? [trnType] : []
        });
      }

      if (expenses.length === 0) {
        return this._errorResponse('No valid debit transactions found in OFX/QFX', 'ofx');
      }

      return { success: true, expenses, errors: [], warnings, format: 'ofx' };
    } catch (e) {
      return this._errorResponse(e.message, 'ofx');
    }
  }

  // --- JSON Parser ---
  _parseJSON(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      let data = Array.isArray(parsed) ? parsed : (parsed.expenses || []);
      
      if (!Array.isArray(data)) {
        return this._errorResponse('JSON must be an array or contain an expenses array', 'json');
      }

      const expenses = [];
      const warnings = [];

      for (const item of data) {
        const amount = parseFloat(item.amount);
        if (isNaN(amount)) {
          warnings.push(`Skipping item without valid amount: ${JSON.stringify(item)}`);
          continue;
        }

        const title = item.title || item.name || item.payee;
        const description = item.description || item.memo;

        if (!title && !description) {
          warnings.push(`Skipping item without title or description: ${JSON.stringify(item)}`);
          continue;
        }

        expenses.push({
          date: item.date || '',
          amount: Math.abs(amount),
          title: title || description,
          description: description !== title ? description : '',
          category: item.category || 'Imported',
          paymentMethod: item.paymentMethod || '',
          tags: Array.isArray(item.tags) ? item.tags : []
        });
      }

      if (expenses.length === 0) return this._errorResponse('No valid expenses found in JSON', 'json');

      return { success: true, expenses, errors: [], warnings, format: 'json' };
    } catch (e) {
      return this._errorResponse(e.message, 'json');
    }
  }

  // --- PDF Parser ---
  _parsePDF(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'binary');
      
      // Basic text extraction - works for non-compressed simple text in PDF
      // Not suitable for heavily formatted or FlateDecode streams in real world, but matches specs
      const expenses = [];
      const warnings = ['PDF parsing is experimental and relies on basic text extraction. Results may be inaccurate.'];

      // Extract raw strings from PDF that might be text
      const textBlocks = content.match(/[\x20-\x7E]{5,}/g) || [];
      const fullText = textBlocks.join(' ');

      // A simple heuristic: search for Date followed by Description followed by Amount in chunks of text
      const transactionRegex = /([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})\s+(.*?)\s+(?:[₹$]|Rs\.?)?\s*\b(\d+[,.]\d{2})\b/gi;
      let match;

      while ((match = transactionRegex.exec(fullText)) !== null) {
        let date = match[1];
        let title = match[2].trim();
        let amount = parseFloat(match[3].replace(',', ''));

        if (!isNaN(amount) && amount > 0) {
          expenses.push({
            date: date,
            amount: amount,
            title: title || 'Unknown',
            description: '',
            category: 'Imported',
            paymentMethod: '',
            tags: []
          });
        }
      }

      if (expenses.length === 0) {
        return {
          success: false,
          expenses: [],
          errors: ['No valid transactions found in PDF.'],
          warnings,
          format: 'pdf'
        };
      }

      return { success: true, expenses, errors: [], warnings, format: 'pdf' };
    } catch (e) {
      return this._errorResponse(e.message, 'pdf');
    }
  }
}

module.exports = FileImporter;
