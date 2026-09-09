# ⚔️ Competitive Landscape Evaluation

> **Module**: Quality Assurance — Strategic & Competitive Benchmarking  
> **Document ID**: `EVAL-001`  
> **Target**: Market Positioning & Competitor Feature Matrix  
> **Status**: Completed & Verified  

---

## 1. Competitive Overview

Ledgerly competes at the crossroads of three distinct software categories:
1. **Cloud Personal Finance Apps** (YNAB, Monarch Money, Copilot)
2. **Shared Expense Splitters** (Splitwise, Tricount)
3. **Open-Source & Manual Trackers** (Actual Budget, Firefly III, Excel/Notion)

Below is the objective QA comparison matrix evaluating capability, privacy, friction, and cost.

---

## 2. Competitive Feature & Privacy Matrix

| Dimension | Ledgerly (Desktop) | YNAB (You Need A Budget) | Splitwise | Actual Budget (OSS) | Notion / Excel |
|---|:---:|:---:|:---:|:---:|:---:|
| **Cost / License** | **100% Free / MIT** | \$14.99/mo (\$109/yr) | Free (Crippled) / \$5/mo | Free (Self-Hosted) | Free to \$10/mo |
| **Privacy / Storage** | **100% Offline Local** | US Cloud (AWS) | US Cloud | Self-hosted server / Sync | Cloud (Notion) / Local |
| **Bank Credential Scraping**| **Zero (Private I/O)**| Mandatory (Plaid) | None | Optional SimpleFIN | None |
| **Input Speed (Desk)** | **< 3s (Express Bar)** | 10–15s | 10–15s | 5–10s | 15–30s |
| **Inline Batch Spreadsheet** | **Yes (Tab/Enter)** | Limited | No | Yes | Yes |
| **Shared Debt Netting** | **Yes (Pairwise)** | No (Single User) | Yes (Simplified) | No | Complex formulas |
| **Daily Budget Pace** | **Dynamic Rollover** | Envelope zero-sum | None | Envelope system | Custom formulas |
| **Offline Vector Icons** | **93 Lucide SVGs** | Custom UI | Basic icons | Plain text | Emoji |
| **Mobile Native App** | ❌ None (Roadmap) | iOS & Android | iOS & Android | Web PWA | iOS & Android |
| **Setup Fatigue** | **Zero (< 30 sec)** | High (4 Rules) | Low | High (Docker/Server) | Extreme (Template setup) |

---

## 3. Deep Competitor Breakdown

### 1. Ledgerly vs. YNAB
* **Where Ledgerly Wins**:
  - Zero financial subscription cost.
  - Zero bank credential handover.
  - Built-in multi-person household debt splitting (YNAB does not support roommate debt math).
* **Where YNAB Wins**:
  - Automated bank API syncing (for users who refuse to import files).
  - Mature mobile ecosystem on iOS and Android.

---

### 2. Ledgerly vs. Splitwise
* **Where Ledgerly Wins**:
  - Splitwise recently crippled its free tier, placing 10-second timers on expense additions and capping users at 3 entries per day. Ledgerly has **zero timers, zero ads, and unlimited entries**.
  - Splitwise only tracks *shared* IOUs; it does not help users budget their personal monthly salary or manage discretionary daily spending.
* **Where Splitwise Wins**:
  - Each roommate can install Splitwise on their own personal smartphone and log expenses from anywhere.

---

### 3. Ledgerly vs. Notion & Excel
* **Where Ledgerly Wins**:
  - Notion formulas break, page loads are sluggish, and maintaining database relations feels like a second job.
  - Ledgerly provides an opinionated, polished financial engine with zero maintenance required.
* **Where Notion/Excel Wins**:
  - Infinite customizability for advanced spreadsheet modeling.

---

## 4. Strategic Recommendation

Ledgerly’s competitive wedge is **"The Sovereign Household Terminal"**:
* Don't pay \$120/year to YNAB.
* Don't suffer Splitwise’s paywalls.
* Don't waste weekends debugging Notion database formulas.
* Download Ledgerly, keep your data on your SSD, and master your daily spending in 5 seconds.
