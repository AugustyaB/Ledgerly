'use strict';

import './styles/mobile.css';
import { hydrateMobileIcons } from './icons.js';
import { MobileRouter } from './router.js';
import { CaptureView } from './views/CaptureView.js';
import { QueueView } from './views/QueueView.js';
import { QuickAddView } from './views/QuickAddView.js';
import { SyncView } from './views/SyncView.js';

/**
 * @fileoverview Ledgerly Mobile — Application Bootstrap
 */
document.addEventListener('DOMContentLoaded', () => {
  // Hydrate all static [data-icon] in HTML
  hydrateMobileIcons();

  const viewportEl = document.getElementById('tab-viewport');
  const dockEl = document.getElementById('mobile-dock');

  if (viewportEl && dockEl) {
    const views = {
      capture: new CaptureView(),
      queue: new QueueView(),
      'quick-add': new QuickAddView(),
      sync: new SyncView()
    };

    const router = new MobileRouter({
      viewportEl,
      dockEl,
      views
    });

    window.__ledgerlyMobileRouter = router;
  }
});
