'use strict';

/**
 * @fileoverview Smart Document Analyzer (3-Way Classification Engine)
 *
 * Architecture Position: src/services/SmartDocumentAnalyzer.js
 * Role: Analyzes multi-page document structure, textual continuity, pagination markers,
 *       and financial ledger footprints to classify documents into:
 *         1. 'invoice'        — Single continuous multi-page invoice/bill.
 *         2. 'multiple-bills' — Batch scan of distinct standalone receipts.
 *         3. 'statement'      — Bank or credit card account statement.
 *
 * Performance: In-memory string matching & early-exit heuristic regexes (<1ms execution).
 */

class SmartDocumentAnalyzer {
  /**
   * Classifies a document or set of pages into 'invoice', 'multiple-bills', or 'statement'.
   *
   * @param {Array<{ pageNumber: number, text: string }>} pages - Array of extracted page objects
   * @param {string} [filename=''] - Source file name for auxiliary hints
   * @returns {{
   *   type: 'invoice' | 'multiple-bills' | 'statement',
   *   confidence: number,
   *   rationale: string,
   *   pageCount: number,
   *   suggestedAction: string
   * }}
   */
  classify(pages, filename = '') {
    const pageList = Array.isArray(pages) ? pages : [];
    const pageCount = pageList.length;

    if (pageCount === 0) {
      return {
        type: 'invoice',
        confidence: 0.5,
        rationale: 'Empty or single unpaged document.',
        pageCount: 0,
        suggestedAction: 'Process as single receipt.'
      };
    }

    if (pageCount === 1) {
      // Single page check for bank statement ledger patterns
      const pText = (pageList[0].text || '').toLowerCase();
      const hasBankKeywords =
        /\b(?:account statement|bank statement|statement of account|passbook|opening balance|closing balance)\b/i.test(
          pText
        );
      const hasLedgerColumns =
        /\b(?:debit|withdrawal|dr)\b/i.test(pText) &&
        /\b(?:credit|deposit|cr)\b/i.test(pText) &&
        /\b(?:balance)\b/i.test(pText);

      if (hasBankKeywords && hasLedgerColumns) {
        return {
          type: 'statement',
          confidence: 0.92,
          rationale: 'Detected bank statement headers and running ledger balance columns.',
          pageCount: 1,
          suggestedAction: 'Extract account statement transactions into staging table.'
        };
      }

      return {
        type: 'invoice',
        confidence: 0.95,
        rationale: 'Single page receipt or invoice.',
        pageCount: 1,
        suggestedAction: 'Process as single receipt.'
      };
    }

    // ========================================================================
    //  Multi-Page Analysis (pages >= 2)
    // ========================================================================

    let invoiceScore = 0;
    let multipleBillsScore = 0;
    let statementScore = 0;
    const rationales = [];

    const allText = pageList.map(p => p.text || '').join('\n');
    const firstPageText = pageList[0].text || '';
    const lastPageText = pageList[pageCount - 1].text || '';

    // ------------------------------------------------------------------------
    //  1. Bank Statement Ledger Checks
    // ------------------------------------------------------------------------
    const hasStatementHeader =
      /\b(?:account statement|statement of account|bank statement|credit card statement|savings account|current account|a\/c no|account number)\b/i.test(
        allText
      );
    const hasOpeningClosing = /\b(?:opening balance|closing balance|available balance|clear balance)\b/i.test(allText);
    const hasLedgerCols =
      /\b(?:debit|withdrawal|withdrawals|dr\.?)\b/i.test(allText) &&
      /\b(?:credit|deposit|deposits|cr\.?)\b/i.test(allText) &&
      /\b(?:balance|running balance)\b/i.test(allText);

    // Count transaction-like date rows across pages
    const datePattern = /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g;
    const totalDateMatches = (allText.match(datePattern) || []).length;

    if (hasStatementHeader) statementScore += 35;
    if (hasOpeningClosing) statementScore += 30;
    if (hasLedgerCols) statementScore += 40;
    if (totalDateMatches >= 8) statementScore += 25;

    // Early exit for unambiguous bank statements
    if (statementScore >= 95) {
      return {
        type: 'statement',
        confidence: 0.96,
        rationale: 'Identified bank statement headers, running balance columns, and recurring transaction rows.',
        pageCount,
        suggestedAction: 'Extract transactions into bank statement import table.'
      };
    }

    // ------------------------------------------------------------------------
    //  2. Multi-Page Invoice Sequence & Continuation Anchors
    // ------------------------------------------------------------------------
    // Check for Page 1 of N or Page 1 / N
    const pageSeqMatch = firstPageText.match(/\bpage\s+1\s*(?:of|\/)\s*(\d+)\b/i);
    if (pageSeqMatch) {
      const declaredPages = parseInt(pageSeqMatch[1], 10);
      if (declaredPages === pageCount) {
        invoiceScore += 45;
        rationales.push(`Pagination explicitly matches document length ("Page 1 of ${declaredPages}")`);
      } else if (declaredPages > 1) {
        invoiceScore += 30;
        rationales.push(`Multi-page pagination sequence detected ("Page 1 of ${declaredPages}")`);
      }
    }

    // Check for continuation tokens
    if (
      /\b(?:continued on next page|carried forward|c\/f|brought forward|b\/f|sub-?total carried over|cont\.\.\.)\b/i.test(
        firstPageText
      )
    ) {
      invoiceScore += 35;
      rationales.push('Found table continuation marker (Continued / Carried Forward)');
    }

    // Check for matching Invoice / Order Number across pages
    const invNumRegex = /\b(?:inv(?:oice)?|bill|order|ref|receipt)[\s#.:\-_]+([A-Z0-9-]{4,20})\b/gi;
    const firstPageInvoices = new Set();
    let match;
    while ((match = invNumRegex.exec(firstPageText)) !== null) {
      if (match[1] && match[1].length >= 4) {
        firstPageInvoices.add(match[1].toUpperCase());
      }
    }

    if (firstPageInvoices.size > 0) {
      let repeatedInvFound = false;
      for (let i = 1; i < pageCount; i++) {
        const otherText = (pageList[i].text || '').toUpperCase();
        for (const invId of firstPageInvoices) {
          if (otherText.includes(invId)) {
            repeatedInvFound = true;
            break;
          }
        }
        if (repeatedInvFound) break;
      }

      if (repeatedInvFound) {
        invoiceScore += 40;
        rationales.push('Matching Invoice / Reference ID found across consecutive pages');
      }
    }

    // Check for matching GSTIN across pages
    const gstinRegex = /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/g;
    const gstinPage1 = (firstPageText.match(gstinRegex) || [])[0];
    if (gstinPage1) {
      let gstinMatchesAll = true;
      for (let i = 1; i < pageCount; i++) {
        const pGstin = ((pageList[i].text || '').match(gstinRegex) || [])[0];
        if (pGstin && pGstin !== gstinPage1) {
          gstinMatchesAll = false;
          multipleBillsScore += 35;
          rationales.push('Different vendor GSTINs detected across pages');
          break;
        }
      }
      if (gstinMatchesAll && (pageList[1].text || '').includes(gstinPage1)) {
        invoiceScore += 25;
        rationales.push('Same vendor GSTIN verified on subsequent pages');
      }
    }

    // Check terminal grand total: only last page has terminal payment summary
    const hasFinalTotalKeywords =
      /\b(?:grand total|total amount due|amount payable|net payable|authorized signatory|for [a-z\s]+ ltd)\b/i;
    if (!hasFinalTotalKeywords.test(firstPageText) && hasFinalTotalKeywords.test(lastPageText)) {
      invoiceScore += 25;
      rationales.push('Terminal Grand Total and signature block found only on the final page');
    }

    // ------------------------------------------------------------------------
    //  3. Multiple Separate Receipts Checks
    // ------------------------------------------------------------------------
    // Check if each page has its own standalone Total or payment slip
    let pagesWithOwnTotal = 0;
    let pagesWithPaymentReceipt = 0;

    for (const page of pageList) {
      const txt = page.text || '';
      if (/\b(?:total|amount paid|net amount)[\s:]*[₹$€£]?\s*[\d,]+\.\d{2}\b/i.test(txt)) {
        pagesWithOwnTotal++;
      }
      if (/\b(?:upi|gpay|phonepe|paytm|cashier|card ending|pos receipt|tax invoice|welcome to)\b/i.test(txt)) {
        pagesWithPaymentReceipt++;
      }
    }

    if (pagesWithOwnTotal === pageCount && pagesWithPaymentReceipt >= 2) {
      multipleBillsScore += 45;
      rationales.push('Each page contains independent totals and standalone receipt headers');
    }

    // Check date variance across pages
    const pageDates = pageList
      .map(p => {
        const d = (p.text || '').match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/);
        return d ? d[0] : null;
      })
      .filter(Boolean);

    const uniqueDates = new Set(pageDates);
    if (uniqueDates.size > 1 && uniqueDates.size === pageDates.length) {
      multipleBillsScore += 30;
      rationales.push('Pages bear distinct transaction dates');
    } else if (uniqueDates.size === 1 && pageDates.length >= 2) {
      invoiceScore += 15;
      rationales.push('Pages share a uniform transaction date');
    }

    // Auxiliary filename hint (low weight, non-blocking)
    if (filename) {
      if (/\b(?:statement|stmt|passbook)\b/i.test(filename)) statementScore += 10;
      if (/\b(?:invoice|tax_invoice|bill)\b/i.test(filename)) invoiceScore += 10;
      if (/\b(?:receipts|slips|batch)\b/i.test(filename)) multipleBillsScore += 10;
    }

    // ========================================================================
    //  4. Decision Resolution
    // ========================================================================

    if (statementScore > invoiceScore && statementScore > multipleBillsScore) {
      const conf = Math.min(0.98, Math.max(0.7, statementScore / 110));
      return {
        type: 'statement',
        confidence: parseFloat(conf.toFixed(2)),
        rationale:
          rationales.length > 0 ? rationales.join('; ') : 'Detected account ledger columns and running balance.',
        pageCount,
        suggestedAction: 'Extract transactions into bank statement import table.'
      };
    }

    if (invoiceScore >= multipleBillsScore) {
      const conf = Math.min(0.98, Math.max(0.75, invoiceScore / 100));
      return {
        type: 'invoice',
        confidence: parseFloat(conf.toFixed(2)),
        rationale: rationales.length > 0 ? rationales.join('; ') : 'Single continuous invoice spanning multiple pages.',
        pageCount,
        suggestedAction: 'Consolidate pages into 1 unified expense record.'
      };
    }

    const conf = Math.min(0.98, Math.max(0.75, multipleBillsScore / 100));
    return {
      type: 'multiple-bills',
      confidence: parseFloat(conf.toFixed(2)),
      rationale: rationales.length > 0 ? rationales.join('; ') : 'Separate standalone receipts found on each page.',
      pageCount,
      suggestedAction: 'Unpack each page into a separate receipt card in queue.'
    };
  }
}

module.exports = new SmartDocumentAnalyzer();
