/* global hydrateIcons */
'use strict';

let currentParsed = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof hydrateIcons === 'function') hydrateIcons();
  const inputEl = document.getElementById('pill-input');
  const amtEl = document.getElementById('token-amt');
  const catEl = document.getElementById('token-cat');
  const splitEl = document.getElementById('token-split');
  const submitBtn = document.getElementById('pill-submit-btn');

  const updatePreview = async () => {
    const text = inputEl.value.trim();
    if (!text) {
      amtEl.textContent = '₹0.00';
      catEl.textContent = 'Food & Dining';
      splitEl.textContent = 'Personal';
      currentParsed = null;
      return;
    }

    if (window.electronAPI && window.electronAPI.nlpParse) {
      currentParsed = await window.electronAPI.nlpParse(text);
      if (currentParsed) {
        amtEl.textContent = currentParsed.tokens.amountStr || '₹0.00';
        catEl.textContent = currentParsed.category || 'Food & Dining';
        splitEl.textContent = currentParsed.tokens.splitStr || 'Personal';
      }
    }
  };

  inputEl.addEventListener('input', updatePreview);

  const handleSubmit = async () => {
    if (!currentParsed || !currentParsed.success || !currentParsed.amount) {
      // If user typed without amount, try parsing or do nothing
      const text = inputEl.value.trim();
      if (!text) return;
      currentParsed = await window.electronAPI.nlpParse(text);
    }

    if (currentParsed && currentParsed.amount > 0) {
      const activeProfile = await window.electronAPI.getActiveProfile();
      const expenseData = {
        title: currentParsed.title || 'Quick Expense',
        amount: currentParsed.amount,
        date: currentParsed.date || new Date().toISOString().split('T')[0],
        category: currentParsed.category || 'Miscellaneous',
        paymentMethod: currentParsed.paymentMethod || 'UPI / GPay',
        description: `Logged via Quick Pill (${currentParsed.rawInput})`,
        paidBy: activeProfile ? activeProfile.name : 'Self',
        splitWith: currentParsed.splitWith || [],
        isHouseholdExpense: Boolean(currentParsed.isHouseholdExpense)
      };

      await window.electronAPI.submitQuickPillExpense(expenseData);
      inputEl.value = '';
      currentParsed = null;
    }
  };

  inputEl.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (window.electronAPI && window.electronAPI.hideQuickPill) {
        window.electronAPI.hideQuickPill();
      }
    }
  });

  submitBtn.addEventListener('click', handleSubmit);

  // Receipt Upload & Scan Integration (Phase 0.5.3)
  const receiptBtn = document.getElementById('pill-receipt-btn');
  const container = document.getElementById('quick-pill-container');

  const processReceiptPath = async (filePath) => {
    if (!filePath || !window.electronAPI?.scanReceiptDocument) return;

    inputEl.placeholder = 'Scanning receipt with Tier 1 Fast-Lite...';
    try {
      const scanRes = await window.electronAPI.scanReceiptDocument(filePath);
      if (scanRes?.success && scanRes.data?.isTransaction && scanRes.data.total !== null) {
        const d = scanRes.data;
        let savedFilename = null;
        if (window.electronAPI.saveReceipt) {
          const saveRes = await window.electronAPI.saveReceipt(filePath);
          if (saveRes?.success) savedFilename = saveRes.filename;
        }

        currentParsed = {
          success: true,
          amount: d.total,
          title: d.merchant || 'Receipt Expense',
          date: d.date || new Date().toISOString().split('T')[0],
          category: d.category || 'Miscellaneous',
          paymentMethod: d.paymentMethod || 'UPI / GPay',
          receiptFilename: savedFilename,
          rawInput: `Receipt: ${d.merchant} (₹${d.total})`,
          isHouseholdExpense: false,
          splitWith: [],
          tokens: {
            amountStr: `₹${d.total.toFixed(2)}`,
            splitStr: 'Personal'
          }
        };

        inputEl.value = `${d.merchant || 'Expense'} ₹${d.total}`;
        amtEl.textContent = `₹${d.total.toFixed(2)}`;
        catEl.textContent = d.category || 'Miscellaneous';
        splitEl.textContent = 'Personal';
        inputEl.focus();
      } else {
        inputEl.placeholder = 'No financial data detected in file.';
        setTimeout(() => {
          inputEl.placeholder = "Type: e.g. 'Coffee 20' or 'Swiggy 350 with Priya'...";
        }, 3000);
      }
    } catch (err) {
      console.warn('[QuickPill] Receipt scan error:', err);
      inputEl.placeholder = "Type: e.g. 'Coffee 20'...";
    }
  };

  if (receiptBtn) {
    receiptBtn.addEventListener('click', async () => {
      if (!window.electronAPI?.selectReceiptFile) return;
      const res = await window.electronAPI.selectReceiptFile();
      if (res?.success && res.filePath) {
        await processReceiptPath(res.filePath);
      }
    });
  }

  if (container) {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.style.borderColor = '#E5943C';
    });
    container.addEventListener('dragleave', () => {
      container.style.borderColor = '#D9822B';
    });
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      container.style.borderColor = '#D9822B';
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.path) {
          await processReceiptPath(file.path);
        }
      }
    });
  }
});
