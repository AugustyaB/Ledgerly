# 🎨 Usability & UX Scorecard

> **Module**: Quality Assurance — Human Factors & Heuristic Usability  
> **Document ID**: `EVAL-002`  
> **Standard**: Nielsen Norman Group 10 Usability Heuristics  
> **Status**: Completed & Verified  

---

## 1. Usability Heuristics Scorecard

| # | Nielsen Heuristic | Score | Findings & Evidence in Ledgerly |
|---|---|:---:|---|
| **1** | **Visibility of System Status** | **9 / 10** | **Excellent.** Instant action toasts (`showActionToast`) confirm logging; dynamic ring gauges visualize safe/moderate/over budget pace; Privacy Mode toggles lock badges. |
| **2** | **Match Between System and Real World** | **9 / 10** | **Natural.** Presets use familiar icons (`☕ Coffee`, `🍱 Lunch`, `⛽ Fuel`); pairwise settlements mimic natural conversation ("Rahul pays Priya ₹300"). |
| **3** | **User Control and Freedom** | **8 / 10** | **Strong.** Easy edit/delete modals for transactions, presets, and profiles; Esc closes dialogs. *Room for improvement: Add global Ctrl+Z Undo for accidental deletions.* |
| **4** | **Consistency and Standards** | **9.5 / 10** | **Superb.** Unified Theme 3 design language across all 8 views; consistent JetBrains Mono tabular amounts; consistent 28px/36px monogram avatars. |
| **5** | **Error Prevention** | **8 / 10** | **Good.** Last-profile deletion protection prevents locking yourself out; formula injection sanitization strips spreadsheet macros. *Needs duplicate import warnings.* |
| **6** | **Recognition Rather Than Recall** | **9 / 10** | **Excellent.** Command palette (`Ctrl+K`) exposes all actions; recent transactions and pending debts are always visible in dashboard sidebars. |
| **7** | **Flexibility and Efficiency of Use** | **10 / 10** | **World-Class.** Auto-focused express bar, 1-box NLP parsing, rapid batch spreadsheet mode with shorthands (`t`, `y`, `-3`), global floating widget (`Ctrl+Alt+L`). |
| **8** | **Aesthetic and Minimalist Design** | **9.5 / 10** | **High Polish.** Velvety warm graphite surfaces (`#1A1C23`), Spiced Chai Amber accents (`#D9822B`), zero visual clutter or ads. |
| **9** | **Help Users Recognize & Recover from Errors**| **7 / 10** | **Adequate.** Password mismatch and missing fields show clear banners. *Needs friendlier error reporting on corrupted bank statement imports.* |
| **10**| **Help and Documentation** | **7.5 / 10** | **Good.** In-app keyboard shortcuts cheat sheet in Settings; clean inline placeholders. |

### Overall Usability Score: **86.5 / 100 (Grade: A - Excellent)**

---

## 2. Key UX Wins in Ledgerly
1. **The 1-Box Magic Bar (`nlpParser.js`)**: Users don't have to fiddle with 5 dropdowns; typing `"Swiggy 350 lunch upi yesterday"` automatically tokenizes and maps amount, title, category, and date.
2. **Privacy Shield (`P`)**: A single keystroke instantly blurs all monetary values with a CSS glass filter, enabling screen sharing or public coffee shop work without exposing net worth.
3. **Spacious Information Architecture**: Clean two-column desktop layouts provide both high-level analytics and actionable settlement task lists without horizontal scroll fatigue.
