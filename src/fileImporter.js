const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { VALIDATION_LIMITS } = require('./constants');
const DocumentNormalizer = require('./services/DocumentNormalizer');

class FileImporter {
  constructor(options = {}) {
    this._normalizer = options.normalizer || new DocumentNormalizer();
    this._tier1Engine = options.tier1Engine || null;
    // Defined aliases based on specifications (including European/DACH region bank formats)
    this.aliases = {
      date: ['date', 'transaction date', 'posted date', 'trans date', 'posting date', 'datum', 'buchungstag', 'valuta'],
      amount: ['amount', 'debit', 'credit', 'sum', 'total', 'value', 'betrag', 'umsatz', 'wert'],
      title: [
        'title',
        'name',
        'payee',
        'merchant',
        'vendor',
        'description',
        'empfänger',
        'empfaenger',
        'begünstigter',
        'auftraggeber',
        'zahlungsbeteiligte'
      ],
      category: ['category', 'type', 'group', 'class', 'kategorie', 'rubrik'],
      description: [
        'description',
        'memo',
        'notes',
        'details',
        'narrative',
        'reference',
        'verwendungszweck',
        'buchungstext',
        'verwendung'
      ],
      payment: ['payment method', 'payment type', 'method', 'payment', 'zahlungsart']
    };
  }

  parseFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return this._errorResponse('File does not exist.', 'unknown');
      }

      const stats = fs.statSync(filePath);
      const maxFileSize = VALIDATION_LIMITS?.MAX_IMPORT_FILE_SIZE || 50 * 1024 * 1024;
      if (stats.size > maxFileSize) {
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        return this._errorResponse(
          `File size (${sizeMB}MB) exceeds the maximum allowed import limit of 50MB.`,
          'unknown'
        );
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
        case '.jpg':
        case '.jpeg':
        case '.png':
        case '.webp':
        case '.bmp':
          return this._parseReceiptImage(filePath);
        default:
          return this._errorResponse(
            'Unsupported file extension. Supported formats: CSV, XLS, XLSX, OFX, QFX, JSON, PDF, JPG, PNG, WEBP, BMP',
            'unknown'
          );
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

  /**
   * Sniffs delimiter for CSV files across common candidates (; , \t |).
   * Evaluates consistent unquoted occurrence frequency across header and sample rows.
   * @param {string} content - Raw CSV text content.
   * @returns {string} - Detected delimiter (default: ',').
   */
  _detectCSVDelimiter(content) {
    const lines = content
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .slice(0, 10);
    if (lines.length === 0) return ',';

    const candidates = [';', '\t', '|', ','];
    const scores = { ';': 0, '\t': 0, '|': 0, ',': 0 };

    for (const cand of candidates) {
      const counts = [];
      for (const line of lines) {
        let insideQuotes = false;
        let count = 0;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if (char === cand && !insideQuotes) {
            count++;
          }
        }
        counts.push(count);
      }

      if (counts.length > 0 && counts[0] > 0) {
        const allSame = counts.every(c => c === counts[0]);
        // Delimiters with uniform occurrences across all rows receive highest priority
        if (allSame) {
          scores[cand] = counts[0] * 10;
        } else {
          scores[cand] = counts.reduce((a, b) => a + b, 0);
        }
      }
    }

    let bestDelim = ',';
    let maxScore = 0;
    for (const cand of candidates) {
      if (scores[cand] > maxScore) {
        maxScore = scores[cand];
        bestDelim = cand;
      }
    }

    return bestDelim;
  }

  /**
   * Normalizes raw monetary amounts across US/UK, Indian, and Continental European formats.
   * Handles comma decimals (e.g. "29,75", "1.250,50"), thousands separators, and currency symbols.
   * @param {string|number} rawVal - Raw value from statement cell or line.
   * @returns {number|null} - Clean positive float or null if invalid.
   */
  _normalizeAmount(rawVal) {
    if (typeof rawVal === 'number') {
      return isNaN(rawVal) ? null : Math.abs(parseFloat(rawVal.toFixed(2)));
    }
    if (!rawVal) return null;

    let clean = String(rawVal).trim();
    // Strip currency symbols, country strings, accounting parentheses, and whitespace
    clean = clean.replace(/(?:INR|USD|EUR|GBP|Rs\.?|[₹$€£()])/gi, '').trim();
    if (!clean) return null;

    const lastDot = clean.lastIndexOf('.');
    const lastComma = clean.lastIndexOf(',');

    if (lastDot !== -1 && lastComma !== -1) {
      if (lastComma > lastDot) {
        // European format: 1.250,50 -> 1250.50
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        // Standard US/UK/Indian format: 1,250.50 -> 1250.50
        clean = clean.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      const parts = clean.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // European decimal comma: 29,75 -> 29.75
        clean = clean.replace(',', '.');
      } else {
        // Thousands separator: 1,000 -> 1000
        clean = clean.replace(/,/g, '');
      }
    }

    const val = parseFloat(clean);
    if (isNaN(val)) return null;

    // Treat negative amounts as expenses, rounded to 2 decimal places
    return Math.abs(parseFloat(val.toFixed(2)));
  }

  // --- CSV Parser ---
  _parseCSV(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.trim()) return this._errorResponse('File is empty', 'csv');

      // Sniff delimiter across candidates (;, \t, |, ,)
      const delimiter = this._detectCSVDelimiter(content);

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
        Object.values(mapping).forEach(val => {
          if (val !== -1) matches++;
        });
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
        warnings.push(
          `File contains ${totalDataRows} data rows; truncated to first ${maxRows} transactions to prevent memory exhaustion.`
        );
      }
      const rowsToProcess = Math.min(rows.length, headerRowIndex + 1 + maxRows);

      for (let i = headerRowIndex + 1; i < rowsToProcess; i++) {
        const row = rows[i];
        if (row.every(cell => cell.trim() === '')) continue; // Skip empty rows

        const getVal = col => (col !== -1 && col < row.length ? row[col].trim() : '');

        // Normalize monetary amount across international formats and decimals (BUG-001 / v0.7.2)
        const rawVal = getVal(bestMapping.amountCol);
        const amount = this._normalizeAmount(rawVal);
        if (amount === null || isNaN(amount)) continue; // skip invalid amounts

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
        Object.values(mapping).forEach(val => {
          if (val !== -1) matches++;
        });
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
        warnings.push(
          `File contains ${totalDataRows} data rows; truncated to first ${maxRows} transactions to prevent memory exhaustion.`
        );
      }
      const rowsToProcess = Math.min(rows.length, headerRowIndex + 1 + maxRows);

      for (let i = headerRowIndex + 1; i < rowsToProcess; i++) {
        const row = rows[i];
        if (row.length === 0) continue;

        const getVal = col => (col !== -1 && col < row.length && row[col] ? row[col].toString().trim() : '');

        // Normalize monetary amount across international formats and decimals (BUG-001 / v0.7.2)
        const rawVal = getVal(bestMapping.amountCol);
        const amount = this._normalizeAmount(rawVal);
        if (amount === null || isNaN(amount)) continue;

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

        const getTagValue = tag => {
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
          dateStr = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
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
      let data = Array.isArray(parsed) ? parsed : parsed.expenses || [];

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
      const expenses = [];
      const warnings = [];

      const normResult = this._normalizer.normalizeDocumentSync(filePath, { page: 'all' });
      if (!normResult.success) {
        if (normResult.code === 'ERR_PDF_ENCRYPTED') {
          return this._errorResponse(
            'Password-protected or encrypted PDF documents cannot be processed automatically.',
            'pdf'
          );
        }
        return this._errorResponse(normResult.error || 'Failed to normalize PDF document.', 'pdf');
      }

      let text = normResult.data && normResult.data.fastPathText ? normResult.data.fastPathText : '';

      // Fallback to raw string extraction if fast-path text is empty
      if (!text) {
        const content = fs.readFileSync(filePath, 'binary');
        const textBlocks = content.match(/[\x20-\x7E]{5,}/g) || [];
        text = textBlocks.join(' ');
      }

      // Financial transaction regex matching Date (ISO YYYY-MM-DD or DD/MM/YYYY) + Payee/Description + Amount
      const transactionRegex =
        /(?:(\d{4}[/-]\d{1,2}[/-]\d{1,2})|(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}))\s+(.*?)\s+(?:[₹$€£]|Rs\.?)?\s*\b(\d+[,.]\d{2})\b/gi;
      let match;

      while ((match = transactionRegex.exec(text)) !== null) {
        const date = match[1] || match[2];
        const title = match[3].trim();
        const amount = this._normalizeAmount(match[4]);

        if (amount !== null && !isNaN(amount) && amount > 0) {
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
          warnings:
            normResult.data?.pageCount > 1
              ? [`Scanned ${normResult.data.pageCount} pages, but no matching transaction patterns were found.`]
              : ['Digital vector text extracted, but no matching transaction patterns were found.'],
          format: 'pdf'
        };
      }

      if (normResult.data?.pageCount > 1) {
        warnings.push(`Successfully aggregated transactions across ${normResult.data.pageCount} PDF pages.`);
      }

      return { success: true, expenses, errors: [], warnings, format: 'pdf' };
    } catch (e) {
      return this._errorResponse(e.message, 'pdf');
    }
  }

  async _parseReceiptImage(filePath) {
    try {
      if (!this._tier1Engine) {
        const ReceiptTier1Engine = require('./services/ReceiptTier1Engine');
        this._tier1Engine = new ReceiptTier1Engine({ normalizer: this._normalizer });
      }

      const scanResult = await this._tier1Engine.processDocument(filePath);
      if (!scanResult.success || !scanResult.data) {
        return this._errorResponse(scanResult.error || 'Failed to scan receipt image.', 'receipt_image');
      }

      const data = scanResult.data;
      if (!data.isTransaction || data.total === null) {
        return this._errorResponse(
          data.message || 'No financial transactions detected in this receipt image.',
          'receipt_image'
        );
      }

      const expense = {
        title: data.merchant || 'Receipt Expense',
        amount: data.total,
        date: data.date || new Date().toISOString().split('T')[0],
        category: data.category || 'Miscellaneous',
        paymentMethod: data.paymentMethod || 'UPI / GPay',
        description: `Tier 1 Scan: ${data.merchant} (${data.gstin ? 'GSTIN ' + data.gstin : 'Attached Receipt'})`,
        tags: ['receipt-scan', 'tier1-fast-lite']
      };

      return {
        success: true,
        expenses: [expense],
        errors: [],
        warnings: [`Scanned via Tier 1 Fast-Lite Engine (${Math.round(data.confidence * 100)}% confidence)`],
        format: 'receipt_image'
      };
    } catch (err) {
      return this._errorResponse(`Receipt image parse error: ${err.message}`, 'receipt_image');
    }
  }
}

module.exports = FileImporter;
