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
});
