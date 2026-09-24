/**
 * ============================================================================
 * Ledgerly — Benchmark Sample Generator (Real PDFs & Raster PNG Images)
 * ============================================================================
 * 
 * Generates photorealistic sample receipts and negative controls across all
 * 6 benchmark categories using Playwright Headless Chromium & Vector PDF streams.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { chromium } = require('playwright');

const SAMPLES_DIR = path.join(__dirname, 'samples');

if (!fs.existsSync(SAMPLES_DIR)) {
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });
}

// ============================================================================
// 1. Vector PDF Generator
// ============================================================================

function createVectorPdf(lines) {
  let streamText = 'BT\n/F1 14 Tf\n50 720 Td\n';
  lines.forEach(line => {
    // Escape parentheses for PDF text string
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    streamText += `(${escaped}) Tj\nT*\n`;
  });
  streamText += 'ET';

  const deflated = zlib.deflateSync(Buffer.from(streamText));

  const objects = [];
  objects.push('1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n');
  objects.push('2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n');
  objects.push('3 0 obj\n<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>/Contents 4 0 R>>\nendobj\n');
  objects.push(`4 0 obj\n<</Filter/FlateDecode/Length ${deflated.length}>>\nstream\r\n${deflated.toString('binary')}\r\nendstream\nendobj\n`);

  let pdf = '%PDF-1.4\n' + objects.join('');
  pdf += 'xref\n0 5\n0000000000 65535 f \n';
  pdf += 'trailer\n<</Size 5/Root 1 0 R>>\nstartxref\n' + pdf.length + '\n%%EOF';

  return Buffer.from(pdf, 'binary');
}

// ============================================================================
// 2. Main Generation Execution
// ============================================================================

async function main() {
  console.log('--- Generating Ground-Truth Benchmark Samples ---');

  // --- Category 1: Digital Vector PDFs ---
  console.log('1. Generating Vector PDFs...');
  
  // Sample 01: Uber Trip
  const uberPdf = createVectorPdf([
    'Uber Technologies, Inc.',
    'TRIP RECEIPT',
    'Date: 2026-08-12 21:45',
    'Trip fare: $21.30',
    'Booking fee: $1.90',
    'Tolls & Surcharges: $1.30',
    'Subtotal: $21.30',
    'Total Paid: $24.50',
    'Payment Method: Visa ending in 4123',
    'Rider: rahul@home'
  ]);
  fs.writeFileSync(path.join(SAMPLES_DIR, 'sample_01_uber_trip.pdf'), uberPdf);

  // Sample 02: Amazon Invoice
  const amazonPdf = createVectorPdf([
    'Amazon.com Services LLC',
    'FINAL DETAILS FOR ORDER # 114-8293019-2819283',
    'Order Date: 2026-08-15',
    'Items Ordered: Mechanical Keyboard $139.99',
    'Shipping & Handling: $0.00',
    'Item Subtotal: $139.99',
    'Sales Tax: $10.00',
    'Grand Total: $149.99',
    'Payment: Credit Card (MasterCard *9012)'
  ]);
  fs.writeFileSync(path.join(SAMPLES_DIR, 'sample_02_amazon_invoice.pdf'), amazonPdf);

  // Sample 03: Swiggy Food
  const swiggyPdf = createVectorPdf([
    'Swiggy / Bundl Technologies Pvt Ltd',
    'TAX INVOICE - ORDER # SW-9821731',
    'Date: 2026-08-18',
    'Restaurant: Meghana Foods, Koramangala',
    'Items: Chicken Biryani (Family Pack) x 1 - Rs 450.00',
    'Item Total: Rs 450.00',
    'GST & Restaurant Charges: Rs 22.50',
    'Delivery Fee: Rs 7.50',
    'Subtotal: Rs 450.00',
    'Total Amount: Rs 480.00',
    'Paid via: UPI / PhonePe'
  ]);
  fs.writeFileSync(path.join(SAMPLES_DIR, 'sample_03_swiggy_food.pdf'), swiggyPdf);

  console.log('   ✓ Generated 3 Vector PDFs.');

  // --- Categories 2-6: Raster PNGs via Playwright ---
  console.log('2. Launching Playwright to render photorealistic raster PNG receipts...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });

  const renderSnippet = async (html, filename) => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            padding: 30px;
            background: #ffffff;
            font-family: 'Courier New', Courier, monospace;
            color: #111111;
          }
          .receipt {
            background: #fdfdfd;
            border: 1px dashed #cccccc;
            padding: 24px;
            max-width: 420px;
            margin: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            line-height: 1.4;
            font-size: 15px;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #777; margin: 12px 0; }
          .row { display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `);
    const receiptEl = await page.locator('.receipt');
    await receiptEl.screenshot({ path: path.join(SAMPLES_DIR, filename) });
  };

  // Sample 04: Trader Joe's Retail
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold" style="font-size: 18px;">TRADER JOE'S</div>
      <div class="center">STORE # 412 - LOS ANGELES CA</div>
      <div class="center">DATE: 2026-07-23  14:22</div>
      <div class="divider"></div>
      <div class="row"><span>ORGANIC BANANAS</span><span>$1.99</span></div>
      <div class="row"><span>ALMOND MILK 64OZ</span><span>$3.49</span></div>
      <div class="row"><span>SOURDOUGH BREAD</span><span>$4.49</span></div>
      <div class="row"><span>AVOCADOS BAG</span><span>$0.99</span></div>
      <div class="divider"></div>
      <div class="row"><span>SUBTOTAL</span><span>$10.96</span></div>
      <div class="row"><span>SALES TAX</span><span>$1.10</span></div>
      <div class="row bold" style="font-size: 17px;"><span>TOTAL</span><span>$12.06</span></div>
      <div class="divider"></div>
      <div class="center">THANK YOU FOR SHOPPING AT TRADER JOE'S!</div>
    </div>
  `, 'sample_04_trader_joes.png');

  // Sample 05: Target Store
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold" style="font-size: 20px;">TARGET</div>
      <div class="center">Store 1402 - Irvine, CA</div>
      <div class="center">Date: 2026-08-04  16:10</div>
      <div class="divider"></div>
      <div class="row"><span>DESK ORGANIZER</span><span>$18.00</span></div>
      <div class="row"><span>NOTEBOOK 3-PACK</span><span>$12.00</span></div>
      <div class="row"><span>BALLPOINT PENS</span><span>$12.00</span></div>
      <div class="divider"></div>
      <div class="row"><span>SUBTOTAL</span><span>$42.00</span></div>
      <div class="row"><span>TAX</span><span>$3.82</span></div>
      <div class="row bold" style="font-size: 18px;"><span>TOTAL</span><span>$45.82</span></div>
      <div class="divider"></div>
      <div class="center">0804 2910 4920 1820</div>
    </div>
  `, 'sample_05_target_store.png');

  // Sample 06: Faded Thermal POS
  await renderSnippet(`
    <div class="receipt" style="opacity: 0.55; color: #444; filter: contrast(0.85);">
      <div class="center bold">SHELL OIL # 9214</div>
      <div class="center">Date: 2026-08-01 08:30</div>
      <div class="divider"></div>
      <div class="row"><span>REGULAR UNLEADED</span><span>$14.50</span></div>
      <div class="row"><span>SUBTOTAL</span><span>$14.50</span></div>
      <div class="row"><span>TAX</span><span>$1.49</span></div>
      <div class="row bold"><span>TOTAL AMOUNT:</span><span>$15.99</span></div>
    </div>
  `, 'sample_06_faded_thermal.png');

  // Sample 07: Crumpled Creased Paper
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold">BEST BUY STORE # 819</div>
      <div class="center">Date: 2026-07-19</div>
      <div class="divider"></div>
      <div class="row"><span>USB-C CABLE 6FT</span><span>$15.00</span></div>
      <div class="row"><span>WALL ADAPTER 30W</span><span>$15.00</span></div>
      <div class="row"><span>SUBTOTAL</span><span>$30.00</span></div>
      <div class="row"><span>TAX 15%</span><span>$4.50</span></div>
      <div class="row bold" style="letter-spacing: 2px;"><span>T O T A L</span><span>$ 3 4 . 5 0</span></div>
    </div>
  `, 'sample_07_crumpled_paper.png');

  // Sample 08: Stamped Paid
  await renderSnippet(`
    <div class="receipt" style="position: relative;">
      <div style="position: absolute; top: 35%; left: 20%; transform: rotate(-18deg); border: 4px solid #cc0000; color: #cc0000; font-size: 32px; font-weight: bold; padding: 6px 18px; opacity: 0.75; letter-spacing: 4px;">PAID</div>
      <div class="center bold">OFFICE DEPOT</div>
      <div class="center">Invoice # OD-98124</div>
      <div class="center">Date: 2026-08-08</div>
      <div class="divider"></div>
      <div class="row"><span>PRINTER PAPER 5 REAMS</span><span>$50.00</span></div>
      <div class="row"><span>INK CARTRIDGE BLACK</span><span>$35.00</span></div>
      <div class="divider"></div>
      <div class="row bold" style="font-size: 18px;"><span>TOTAL</span><span>$85.00</span></div>
      <div class="center">PAYMENT RECEIVED IN FULL</div>
    </div>
  `, 'sample_08_stamped_paid.png');

  // Sample 09: Dining with Tip
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold">BLUE TOKAI COFFEE ROASTERS</div>
      <div class="center">Table: 14  Guests: 2</div>
      <div class="center">Date: 2026-08-14 13:30</div>
      <div class="divider"></div>
      <div class="row"><span>2x Caffe Latte</span><span>$24.00</span></div>
      <div class="row"><span>1x Avocado Toast</span><span>$18.00</span></div>
      <div class="row"><span>1x Truffle Fries</span><span>$23.00</span></div>
      <div class="divider"></div>
      <div class="row"><span>FOOD SUBTOTAL</span><span>$65.00</span></div>
      <div class="row"><span>SALES TAX 8%</span><span>$5.20</span></div>
      <div class="row"><span>TIP / GRATUITY 20%</span><span>$13.00</span></div>
      <div class="divider"></div>
      <div class="row bold" style="font-size: 18px;"><span>GRAND TOTAL</span><span>$83.20</span></div>
    </div>
  `, 'sample_09_dining_tip.png');

  // Sample 10: Tender vs Change Trap
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold">WHOLE FOODS MARKET</div>
      <div class="center">Date: 2026-08-09</div>
      <div class="divider"></div>
      <div class="row"><span>ORGANIC BERRIES</span><span>$14.00</span></div>
      <div class="row"><span>GREEK YOGURT</span><span>$10.00</span></div>
      <div class="divider"></div>
      <div class="row bold" style="font-size: 18px;"><span>TOTAL DUE</span><span>$24.00</span></div>
      <div class="row"><span>CASH TENDERED</span><span>$100.00</span></div>
      <div class="row bold"><span>CHANGE DUE</span><span>$76.00</span></div>
    </div>
  `, 'sample_10_tender_trap.png');

  // Sample 11: Promotional "You Saved" Trap
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold">KROGER SUPERMARKET</div>
      <div class="center">Date: 2026-08-11</div>
      <div class="divider"></div>
      <div class="row"><span>GROCERY ITEMS</span><span>$52.30</span></div>
      <div class="divider"></div>
      <div class="row bold" style="font-size: 18px;"><span>TOTAL</span><span>$52.30</span></div>
      <div class="divider"></div>
      <div class="center bold" style="font-size: 16px; margin: 10px 0;">*** YOU SAVED $14.20 TODAY! ***</div>
      <div class="center">BALANCE DUE: $0.00</div>
    </div>
  `, 'sample_11_saved_trap.png');

  // Sample 12: India GSTIN Invoice
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold">CROMA ELECTRONICS</div>
      <div class="center">INFINITI RETAIL LIMITED</div>
      <div class="center">GSTIN: 27AABCC1234D1Z8</div>
      <div class="center">Date: 2026-08-20</div>
      <div class="divider"></div>
      <div class="row"><span>WIRELESS EARBUDS</span><span>₹1299.00</span></div>
      <div class="row"><span>CGST 9%</span><span>₹116.91</span></div>
      <div class="row"><span>SGST 9%</span><span>₹116.91</span></div>
      <div class="divider"></div>
      <div class="row bold" style="font-size: 18px;"><span>TOTAL PAYABLE</span><span>₹1532.82</span></div>
    </div>
  `, 'sample_12_india_gstin.png');

  // Sample 13: India UPI Payment
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold" style="font-size: 18px;">CHAI POINT</div>
      <div class="center">Payment Successful</div>
      <div class="center bold" style="font-size: 26px; margin: 12px 0;">₹350.00</div>
      <div class="divider"></div>
      <div class="row"><span>To:</span><span>Chai Point Koramangala</span></div>
      <div class="row"><span>UPI Ref ID / UTR:</span><span>423456789012</span></div>
      <div class="row"><span>Date:</span><span>25 Aug 2026, 05:30 PM</span></div>
      <div class="row"><span>Paid via:</span><span>Google Pay UPI</span></div>
    </div>
  `, 'sample_13_upi_payment.png');

  // Sample 14: Europe VAT Comma Decimal
  await renderSnippet(`
    <div class="receipt">
      <div class="center bold">MEDIAMARKT BERLIN</div>
      <div class="center">Datum: 15.08.2026</div>
      <div class="divider"></div>
      <div class="row"><span>HDMI KABEL 2M</span><span>25,00 €</span></div>
      <div class="row"><span>NETTO</span><span>25,00 €</span></div>
      <div class="row"><span>19% MWST</span><span>4,75 €</span></div>
      <div class="divider"></div>
      <div class="row bold" style="font-size: 18px;"><span>GESAMT</span><span>29,75 €</span></div>
    </div>
  `, 'sample_14_europe_vat.png');

  // Sample 15: Source Code
  await renderSnippet(`
    <div class="receipt" style="font-family: monospace; font-size: 13px; background: #222; color: #4ade80;">
      <div>// Utility algorithm</div>
      <div>function calculateHash(str) {</div>
      <div>  let hash = 0;</div>
      <div>  for (let i = 0; i &lt; str.length; i++) {</div>
      <div>    hash = (hash &lt;&lt; 5) - hash + str.charCodeAt(i);</div>
      <div>  }</div>
      <div>  return hash;</div>
      <div>}</div>
    </div>
  `, 'sample_15_source_code.png');

  // Sample 16: Novel Book Page
  await renderSnippet(`
    <div class="receipt" style="font-family: Georgia, serif; font-size: 14px; line-height: 1.6;">
      <div>CHAPTER IV</div>
      <div style="margin-top: 10px;">The afternoon light filtered through the dusty windows of the library. Julian paused, turning the yellowed parchment over in his hands. There was no sound save for the occasional ticking of the grandfather clock in the far corridor. He wondered how many generations had walked these quiet halls before him.</div>
    </div>
  `, 'sample_16_novel_page.png');

  // Sample 17: Blurry Photo
  await renderSnippet(`
    <div class="receipt" style="filter: blur(14px);">
      <div class="center bold">UNFOCUSED STORE</div>
      <div class="row"><span>Item</span><span>$99.00</span></div>
      <div class="row"><span>Total</span><span>$99.00</span></div>
    </div>
  `, 'sample_17_blurry_photo.png');

  await browser.close();
  console.log('   ✓ Rendered 14 photorealistic raster PNG samples.');
  console.log('All 17 benchmark samples generated successfully in samples/!\n');
}

main().catch(err => {
  console.error('Error generating benchmark samples:', err);
  process.exit(1);
});
