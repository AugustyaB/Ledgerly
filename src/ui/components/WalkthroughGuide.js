'use strict';

/**
 * @fileoverview Interactive Walkthrough Guide & Onboarding Tour (Layer L5A)
 *
 * Architecture Position: src/ui/components/WalkthroughGuide.js
 * Role: Modern Raycast/Linear-inspired modal tour carousel introducing new
 *       and returning users to Ledgerly's 7 core pillars:
 *         1. Express Bar & 5-Second Logging (Ctrl+N, Math, Presets)
 *         2. Safe-to-Spend & Predictive Pace (Daily allowance & Foresight)
 *         3. Universal Command Palette (Ctrl+K, Spotlight, Inline Math)
 *         4. Stealth Privacy Mode (P key, Cryptographic blur)
 *         5. Smart Receipts & Offline OCR (3-Tier OCR & Bank Reconciliation)
 *         6. Household Splits & Multi-Profiles (Solo/Household, Fair Settle-Up)
 *         7. Bank-Grade Vault Security (AES-256-GCM Zero-Knowledge Vault)
 *
 * Persistence: localStorage.getItem('ledgerly_walkthrough_completed')
 */

import { showToast } from '../helpers/toast.js';
import { escapeHTML } from '../helpers/dom.js';

/**
 * Safe icon helper using global icon registry or data-icon fallback.
 * @param {string} name
 * @param {number} [size=16]
 * @returns {string}
 */
function safeIcon(name, size = 16) {
  if (typeof icon === 'function') {
    return icon(name, size);
  }
  if (typeof window !== 'undefined' && typeof window.icon === 'function') {
    return window.icon(name, size);
  }
  return `<i data-icon="${escapeHTML(name)}" data-icon-size="${size}"></i>`;
}

/**
 * @typedef {Object} WalkthroughStep
 * @property {string} id
 * @property {string} icon
 * @property {string} accent
 * @property {string} badge
 * @property {string} title
 * @property {string} subtitle
 * @property {Array<{ icon: string, title: string, desc: string }>} points
 * @property {string} tip
 */

/** @type {WalkthroughStep[]} */
export const WALKTHROUGH_STEPS = [
  {
    id: 'express-bar',
    icon: 'zap',
    accent: '#D9822B', // Amber
    badge: 'SPEED & SIMPLICITY',
    title: 'Express Bar & 5-Second Logging',
    subtitle: 'Capture daily expenses at the speed of thought without slowing down for complex forms.',
    points: [
      {
        icon: 'zap',
        title: 'Instant Math Expressions',
        desc: 'Type arithmetic directly like 120+45 or 500*2 into the amount box to auto-compute totals.'
      },
      {
        icon: 'star',
        title: '1-Click Preset Chips',
        desc: 'Frequent purchases (Petrol, Groceries, Coffee, Rent) can be logged instantly in a single click.'
      },
      {
        icon: 'tag',
        title: 'Smart Auto-Categorizer',
        desc: 'Heuristic keyword parsing automatically assigns the right category in real time.'
      }
    ],
    tip: 'Press <kbd>Ctrl</kbd> + <kbd>N</kbd> or click the Express Bar on the dashboard anytime.'
  },
  {
    id: 'safe-to-spend',
    icon: 'bar-chart-2',
    accent: '#10B981', // Emerald
    badge: 'FINANCIAL INTELLIGENCE',
    title: 'Safe-to-Spend & Predictive Pacing',
    subtitle: 'Always know your safe daily spending allowance and avoid surprises before payday.',
    points: [
      {
        icon: 'target',
        title: 'Dynamic Daily Buffer',
        desc: 'Calculates your safe daily spending allowance based on your salary, fixed bills, and cycle days.'
      },
      {
        icon: 'activity',
        title: 'Burn Rate & Pace Alerts',
        desc: 'Real-time velocity indicators alert you before you overspend your monthly target.'
      },
      {
        icon: 'trending-up',
        title: 'End-of-Month Foresight',
        desc: 'Statistical projections forecast your ending month savings based on spending trends.'
      }
    ],
    tip: 'Glance at the Dashboard header anytime for real-time burn-rate pace.'
  },
  {
    id: 'command-palette',
    icon: 'search',
    accent: '#3B82F6', // Blue
    badge: 'POWER TOOLS',
    title: 'Universal Command Palette',
    subtitle: 'Instant spotlight search, quick workspace navigation, and inline calculator.',
    points: [
      {
        icon: 'search',
        title: 'Instant Universal Search',
        desc: 'Find transactions, notes, categories, and household members in sub-millisecond time.'
      },
      {
        icon: 'sliders',
        title: 'Embedded Math Evaluation',
        desc: 'Type math queries like (250*4)+150 directly in search to evaluate without a calculator.'
      },
      {
        icon: 'compass',
        title: 'Fast Workspace Jumping',
        desc: 'Jump seamlessly between Dashboard, Expenses, Household Hub, Batch, and Settings.'
      }
    ],
    tip: 'Press <kbd>Ctrl</kbd> + <kbd>K</kbd> anywhere in the app to summon the spotlight.'
  },
  {
    id: 'stealth-privacy',
    icon: 'eye-off',
    accent: '#8B5CF6', // Purple
    badge: 'DISCRETION & PRIVACY',
    title: 'Stealth Privacy Mode',
    subtitle: 'Conceal sensitive financial figures instantly in public or shared spaces.',
    points: [
      {
        icon: 'eye-off',
        title: 'Cryptographic Blur Filter',
        desc: 'Applies deep backdrop blur across account balances, transactions, and salary figures.'
      },
      {
        icon: 'shield',
        title: 'Shoulder-Surfer Proof',
        desc: 'Work comfortably in coffee shops, offices, or screen-sharing sessions without leaking numbers.'
      },
      {
        icon: 'zap',
        title: 'Single-Key Toggle',
        desc: 'Press a single key to immediately mask or reveal all monetary figures on demand.'
      }
    ],
    tip: 'Tap <kbd>P</kbd> or click the Eye icon in the titlebar anytime.'
  },
  {
    id: 'smart-receipts',
    icon: 'receipt-text',
    accent: '#EC4899', // Pink
    badge: 'AUTOMATION & OCR',
    title: 'Smart Receipts & Offline OCR',
    subtitle: 'Capture paper bills and reconcile bank statements without cloud uploads.',
    points: [
      {
        icon: 'camera',
        title: '3-Tier Offline OCR Engine',
        desc: 'Local image filtering and ML models extract merchant names, dates, and amounts 100% offline.'
      },
      {
        icon: 'file-text',
        title: 'Fuzzy Statement Matching',
        desc: 'Reconcile CSV/Excel bank statements with existing logged receipts automatically.'
      },
      {
        icon: 'hard-drive',
        title: 'Archival Vault Storage',
        desc: 'High-efficiency local compression stores receipt copies linked to transactions.'
      }
    ],
    tip: 'Drag & drop image files into Receipts or press <kbd>Ctrl</kbd> + <kbd>I</kbd>.'
  },
  {
    id: 'household-splits',
    icon: 'users',
    accent: '#F59E0B', // Amber/Gold
    badge: 'COLLABORATION',
    title: 'Household Splits & Multi-Profiles',
    subtitle: 'Manage individual budgets or collaborative household expenses effortlessly.',
    points: [
      {
        icon: 'user',
        title: 'Solo vs Shared Workspaces',
        desc: 'Toggle between strict personal isolation and collaborative household group budgets.'
      },
      {
        icon: 'split',
        title: 'Fair Debt Settle-Up',
        desc: 'Automatically calculates the minimum cash transfers required to balance shared bills.'
      },
      {
        icon: 'wifi',
        title: 'Zero-Cloud LAN Sync',
        desc: 'Pair your companion phone over local Wi-Fi with end-to-end cryptographic beacons.'
      }
    ],
    tip: 'Switch profiles via profile avatar or in Household Hub.'
  },
  {
    id: 'vault-security',
    icon: 'shield-check',
    accent: '#14B8A6', // Teal
    badge: 'BANK-GRADE SECURITY',
    title: 'AES-256-GCM Vault & Recovery Kit',
    subtitle: '100% offline zero-knowledge encryption protecting your financial sovereignty.',
    points: [
      {
        icon: 'lock',
        title: 'Zero-Knowledge Envelope',
        desc: 'Your database is encrypted at rest using AES-256-GCM with PBKDF2/Argon2 key derivation.'
      },
      {
        icon: 'key',
        title: 'Emergency Recovery Kit',
        desc: 'A 2-slot recovery key (LEDG-XXXX-XXXX-XXXX-XXXX) ensures you never get permanently locked out.'
      },
      {
        icon: 'shield-alert',
        title: 'Brute-Force Lockout Defense',
        desc: 'Progressive cooldown gates defend against automated credential attacks offline.'
      }
    ],
    tip: 'Manage security and view recovery status in Settings ➔ Security & Vault.'
  }
];

export class WalkthroughGuide {
  /** @type {import('../AppState.js').AppState|null} */
  #state = null;

  /** @type {HTMLElement|null} */
  #modalEl = null;

  /** @type {number} */
  #currentStep = 0;

  /** @type {boolean} */
  #isOpen = false;

  /** @type {Array<() => void>} */
  #cleanups = [];

  /** @type {(() => void)|null} */
  #onComplete = null;

  /**
   * @param {Object} [options={}]
   * @param {import('../AppState.js').AppState} [options.state]
   * @param {() => void} [options.onComplete]
   */
  constructor(options = {}) {
    this.#state = options.state || null;
    this.#onComplete = options.onComplete || null;
  }

  // ==========================================================================
  // LIFECYCLE & MOUNTING
  // ==========================================================================

  /**
   * Mount DOM bindings for Walkthrough Guide modal.
   */
  mount() {
    if (typeof document === 'undefined') return;

    this.#modalEl = document.getElementById('walkthrough-guide-modal');
    if (!this.#modalEl) return;

    // Backdrop click dismisses and persists
    const backdropHandler = e => {
      if (e.target === this.#modalEl) {
        e.preventDefault();
        this.skip();
      }
    };
    this.#modalEl.addEventListener('click', backdropHandler);
    this.#cleanups.push(() => this.#modalEl?.removeEventListener('click', backdropHandler));

    // Close button
    const closeBtn = document.getElementById('btn-walkthrough-close');
    if (closeBtn) {
      const h = e => {
        e.preventDefault();
        this.skip();
      };
      closeBtn.addEventListener('click', h);
      this.#cleanups.push(() => closeBtn.removeEventListener('click', h));
    }

    // Skip button
    const skipBtn = document.getElementById('btn-walkthrough-skip');
    if (skipBtn) {
      const h = e => {
        e.preventDefault();
        this.skip();
      };
      skipBtn.addEventListener('click', h);
      this.#cleanups.push(() => skipBtn.removeEventListener('click', h));
    }

    // Prev button
    const prevBtn = document.getElementById('btn-walkthrough-prev');
    if (prevBtn) {
      const h = e => {
        e.preventDefault();
        this.prev();
      };
      prevBtn.addEventListener('click', h);
      this.#cleanups.push(() => prevBtn.removeEventListener('click', h));
    }

    // Next button
    const nextBtn = document.getElementById('btn-walkthrough-next');
    if (nextBtn) {
      const h = e => {
        e.preventDefault();
        this.next();
      };
      nextBtn.addEventListener('click', h);
      this.#cleanups.push(() => nextBtn.removeEventListener('click', h));
    }

    // Keyboard listener for ArrowLeft, ArrowRight, Enter, Escape
    const keyHandler = e => {
      if (!this.#isOpen) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.skip();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.next();
      }
    };
    window.addEventListener('keydown', keyHandler);
    this.#cleanups.push(() => window.removeEventListener('keydown', keyHandler));
  }

  /**
   * Clean up all attached DOM event listeners.
   */
  destroy() {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
  }

  // ==========================================================================
  // NAVIGATION & CONTROLS
  // ==========================================================================

  /**
   * Check whether the walkthrough should auto-launch on first-time app load.
   * @returns {boolean}
   */
  shouldAutoLaunch() {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('ledgerly_walkthrough_completed') !== 'true';
  }

  /**
   * Open the walkthrough guide modal, optionally starting at a given step.
   * @param {number} [stepIndex=0]
   */
  open(stepIndex = 0) {
    if (typeof document === 'undefined') return;

    if (!this.#modalEl) {
      this.#modalEl = document.getElementById('walkthrough-guide-modal');
    }
    if (!this.#modalEl) return;

    this.#currentStep = Math.max(0, Math.min(stepIndex, WALKTHROUGH_STEPS.length - 1));
    this.#isOpen = true;
    this.render();
    this.#modalEl.classList.add('active');

    // Focus next button for natural keyboard flow
    setTimeout(() => {
      document.getElementById('btn-walkthrough-next')?.focus();
    }, 80);
  }

  /**
   * Close the walkthrough guide modal.
   */
  close() {
    if (typeof document === 'undefined') return;
    this.#isOpen = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ledgerly_walkthrough_completed', 'true');
    }
    if (this.#state) {
      this.#state.set('walkthroughCompleted', true);
    }
    if (this.#modalEl) {
      this.#modalEl.classList.remove('active');
    }
  }

  /**
   * Mark the walkthrough as completed and close.
   */
  complete() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ledgerly_walkthrough_completed', 'true');
    }
    if (this.#state) {
      this.#state.set('walkthroughCompleted', true);
    }
    this.close();

    showToast('✨ Walkthrough complete! You can replay it anytime in Settings.');

    if (this.#onComplete) {
      this.#onComplete();
    }
  }

  /**
   * Skip remaining tour steps and persist completion flag.
   */
  skip() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ledgerly_walkthrough_completed', 'true');
    }
    if (this.#state) {
      this.#state.set('walkthroughCompleted', true);
    }
    this.close();
  }

  /**
   * Advance to next step, or complete if on the last step.
   */
  next() {
    if (this.#currentStep < WALKTHROUGH_STEPS.length - 1) {
      this.#currentStep++;
      this.render();
    } else {
      this.complete();
    }
  }

  /**
   * Return to previous step if available.
   */
  prev() {
    if (this.#currentStep > 0) {
      this.#currentStep--;
      this.render();
    }
  }

  /**
   * Jump directly to a given step index.
   * @param {number} index
   */
  goToStep(index) {
    if (index >= 0 && index < WALKTHROUGH_STEPS.length) {
      this.#currentStep = index;
      this.render();
    }
  }

  // ==========================================================================
  // RENDERING & TEMPLATING
  // ==========================================================================

  /**
   * Render current step content, indicators, and buttons into the modal DOM.
   */
  render() {
    if (typeof document === 'undefined') return;

    const step = WALKTHROUGH_STEPS[this.#currentStep];
    if (!step) return;

    const isFirst = this.#currentStep === 0;
    const isLast = this.#currentStep === WALKTHROUGH_STEPS.length - 1;

    // Step counter badge
    const counterEl = document.getElementById('walkthrough-step-counter');
    if (counterEl) {
      counterEl.textContent = `Step ${this.#currentStep + 1} of ${WALKTHROUGH_STEPS.length}`;
    }

    // Step category pill
    const categoryEl = document.getElementById('walkthrough-step-badge');
    if (categoryEl) {
      categoryEl.textContent = step.badge;
      categoryEl.style.borderColor = step.accent;
      categoryEl.style.color = step.accent;
    }

    // Progress dots
    const dotsContainer = document.getElementById('walkthrough-dots-container');
    if (dotsContainer) {
      dotsContainer.innerHTML = WALKTHROUGH_STEPS.map((s, idx) => {
        const isActive = idx === this.#currentStep;
        const isPast = idx < this.#currentStep;
        const cls = `walkthrough-dot ${isActive ? 'active' : ''} ${isPast ? 'completed' : ''}`.trim();
        return `<button type="button" class="${cls}" data-step-index="${idx}" title="Go to ${escapeHTML(s.title)}" aria-label="Step ${idx + 1}: ${escapeHTML(s.title)}"></button>`;
      }).join('');

      // Bind dot clicks
      dotsContainer.querySelectorAll('.walkthrough-dot').forEach(dot => {
        dot.addEventListener('click', e => {
          e.preventDefault();
          const targetIdx = parseInt(dot.getAttribute('data-step-index') || '0', 10);
          this.goToStep(targetIdx);
        });
      });
    }

    // Hero icon & styling
    const heroIconWrap = document.getElementById('walkthrough-hero-icon-wrap');
    if (heroIconWrap) {
      heroIconWrap.style.background = `radial-gradient(circle, ${step.accent}25 0%, transparent 70%)`;
      heroIconWrap.style.borderColor = `${step.accent}40`;
      heroIconWrap.innerHTML = `
        <div class="walkthrough-hero-icon" style="color: ${step.accent};">
          ${safeIcon(step.icon, 36)}
        </div>
      `;
    }

    // Title & subtitle
    const titleEl = document.getElementById('walkthrough-step-title');
    if (titleEl) titleEl.textContent = step.title;

    const subtitleEl = document.getElementById('walkthrough-step-subtitle');
    if (subtitleEl) subtitleEl.textContent = step.subtitle;

    // Feature bullet points
    const pointsListEl = document.getElementById('walkthrough-points-list');
    if (pointsListEl) {
      pointsListEl.innerHTML = step.points
        .map(
          pt => `
        <div class="walkthrough-point-row">
          <div class="walkthrough-point-icon" style="color: ${step.accent}; background: ${step.accent}15;">
            ${safeIcon(pt.icon, 16)}
          </div>
          <div class="walkthrough-point-text">
            <strong class="walkthrough-point-title">${escapeHTML(pt.title)}</strong>
            <span class="walkthrough-point-desc">${escapeHTML(pt.desc)}</span>
          </div>
        </div>
      `
        )
        .join('');
    }

    // Keyboard shortcut / Tip bar
    const tipEl = document.getElementById('walkthrough-tip-text');
    if (tipEl) {
      tipEl.innerHTML = step.tip;
    }

    // Prev button state
    const prevBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-walkthrough-prev'));
    if (prevBtn) {
      prevBtn.disabled = isFirst;
      prevBtn.style.opacity = isFirst ? '0.4' : '1';
      prevBtn.style.pointerEvents = isFirst ? 'none' : 'auto';
    }

    // Next button state and text
    const nextBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('btn-walkthrough-next'));
    if (nextBtn) {
      if (isLast) {
        nextBtn.innerHTML = `<span>Get Started</span> ${safeIcon('rocket', 14)}`;
        nextBtn.classList.add('btn-walkthrough-final');
      } else {
        nextBtn.innerHTML = `<span>Next</span> ${safeIcon('arrow-right', 14)}`;
        nextBtn.classList.remove('btn-walkthrough-final');
      }
    }

    if (typeof window !== 'undefined' && typeof window.hydrateIcons === 'function' && this.#modalEl) {
      window.hydrateIcons(this.#modalEl);
    }
  }
}
