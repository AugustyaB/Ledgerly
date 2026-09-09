"""
Ledgerly ML Training Pipeline — Expanded Dataset Synthesizer & Ingestion Engine
Version: 0.5.1
Author: Ledgerly AI Architecture Team

Expands receipt and invoice training corpus with realistic multi-format receipts:
- SROIE retail & grocery slips
- CORD restaurant & dining bills with line items
- Indian GST Tax Invoices (GSTIN, CGST/SGST/IGST, HSN codes)
- Digital UPI Payment slips (Google Pay, PhonePe, Paytm)
- Negative Control samples (non-transactional documents, articles, code, notes)
"""

import os
import json
import random
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

from dataset_builder import ReceiptSchema, DataNormalizer, DatasetManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("SourceDatasets")

# Seed random for deterministic generation
random.seed(42)

MERCHANTS_BY_CATEGORY = {
    "Food & Dining": [
        ("Blue Tokai Coffee Roasters", "INR", [("Cold Brew Bottle", 220), ("Almond Croissant", 180), ("Espresso Roast", 450), ("Avocado Toast", 290)]),
        ("Third Wave Coffee", "INR", [("Classic Latte", 240), ("Banana Bread", 160), ("Filter Coffee Frappe", 280), ("Paneer Wrap", 210)]),
        ("Haldiram's Sweets & Restaurant", "INR", [("Chole Bhature", 195), ("Raj Kachori", 140), ("Kaju Katli 250g", 320), ("Gulab Jamun (2 pcs)", 80)]),
        ("Dominos Pizza India", "INR", [("Farmhouse Medium Pizza", 459), ("Garlic Breadsticks", 109), ("Choco Lava Cake", 109), ("Pepsi 500ml", 60)]),
        ("Barbeque Nation", "INR", [("Non-Veg Buffet", 949), ("Mocktail Pitcher", 350), ("Kulfi Platter", 150)]),
        ("Starbucks Coffee", "USD", [("Caffe Latte Grande", 5.45), ("Caramel Macchiato", 5.95), ("Blueberry Muffin", 3.75)]),
        ("Shake Shack", "USD", [("ShackBurger Double", 9.89), ("Crinkle Cut Fries", 4.19), ("Vanilla Custard Shake", 6.29)]),
        ("Wagamama Noodle Bar", "GBP", [("Chicken Katsu Curry", 14.50), ("Yaki Soba", 12.80), ("Steamed Edamame", 4.95), ("Green Tea", 2.50)]),
    ],
    "Groceries": [
        ("Blinkit Express Delivery", "INR", [("Amul Taaza Milk 1L", 56), ("Aashirvaad Atta 5kg", 245), ("Tata Salt 1kg", 28), ("Fortune Oil 1L", 155), ("Surf Excel 1kg", 140)]),
        ("Zepto 10-Min Grocery", "INR", [("Brown Eggs 6s", 85), ("Mother Dairy Dahi 400g", 40), ("Fresh Bananas 1kg", 60), ("Lay's Classic 50g", 20)]),
        ("Nature's Basket", "INR", [("Extra Virgin Olive Oil 500ml", 650), ("Organic Quinoa 500g", 290), ("Imported Cheddar 200g", 380)]),
        ("Tesco Superstore", "GBP", [("Semi Skimmed Milk 4 Pints", 1.65), ("Wholemeal Bread 800g", 1.20), ("Free Range Eggs 12s", 3.10), ("Apples 6pk", 2.00)]),
        ("Trader Joe's", "USD", [("Organic Bananas", 1.99), ("Mandarin Orange Chicken", 4.99), ("Everything Bagel Seasoning", 1.99), ("Cold Brew 32oz", 5.99)]),
    ],
    "Fuel & Transportation": [
        ("Indian Oil Petrol Pump", "INR", [("XP95 Petrol", 1500.00)]),
        ("Bharat Petroleum Fuel Station", "INR", [("Speed Petrol", 2000.00)]),
        ("Shell India Markets", "INR", [("V-Power Unleaded", 1200.00), ("Engine Oil 1L", 420.00)]),
        ("Uber India Systems", "INR", [("Uber Premier Trip", 485.50)]),
        ("Ola Cabs Fleet", "INR", [("Ola Prime Sedan", 370.00)]),
    ],
    "Healthcare": [
        ("Apollo Pharmacy Ltd", "INR", [("Dolo 650 Tablet 15s", 34.00), ("Becosules Z Capsules", 48.00), ("Digital Thermometer", 240.00)]),
        ("MedPlus Health Services", "INR", [("Cetirizine 10s", 25.00), ("Volini Pain Gel 50g", 160.00), ("N95 Face Masks (5pk)", 150.00)]),
        ("Boots Pharmacy", "GBP", [("Paracetamol 500mg 16s", 0.79), ("Vitamin C 1000mg Effervescent", 4.50), ("Hydrating Eye Drops", 6.20)]),
    ],
    "Shopping & Retail": [
        ("Uniqlo India Retail", "INR", [("AIRism Cotton Crew Neck T-Shirt", 990.00), ("Ultra Light Down Jacket", 4990.00)]),
        ("Decathlon Sports India", "INR", [("Quechua Hiking Backpack 20L", 799.00), ("Running Socks 3-Pack", 299.00), ("Steel Water Bottle 750ml", 499.00)]),
        ("Croma Electronics", "INR", [("USB-C Fast Charger 30W", 1299.00), ("Braided Type-C Cable 1.5m", 499.00)]),
        ("ZARA Retail", "EUR", [("Slim Fit Chino Trousers", 49.95), ("Linen Long Sleeve Shirt", 39.95)]),
    ],
    "Utilities & Subscriptions": [
        ("Airtel Broadband Services", "INR", [("Airtel Xstream Fiber 200Mbps Monthly", 999.00)]),
        ("Bescom Electricity Bill", "INR", [("Domestic Energy Charges 210 Units", 1450.00)]),
        ("Netflix India Services", "INR", [("Premium Ultra HD Plan", 649.00)]),
        ("Spotify India Premium", "INR", [("Individual Monthly Plan", 119.00)]),
    ],
}

NEGATIVE_CORPUS = [
    "Meeting minutes for Product Sync on 14th August. Discussion regarding quarterly objectives, sprint velocity, and resource reallocation across teams.",
    "Chapter 3: The Architecture of Distributed Systems. When building microservices, idempotency guarantees are essential for reliable message processing.",
    "A scenic photograph capturing a sunset over snowcapped mountain peaks with evergreen pine forests in the foreground.",
    "Recipe for Homemade Sourdough: Mix 500g bread flour with 350g water and 100g active sourdough starter. Autolyse for 45 minutes before adding salt.",
    "Git commit history: chore(deps): upgrade electron to v33.2.0 and refactor IPC channel bindings for contextIsolation compliance.",
    "Conference schedule: Registration opens at 08:30. Keynote speech on Machine Learning in Production starting promptly at 09:30 in Hall B.",
    "Notes from literature review on Vision Transformers: Self-attention scales quadratically with sequence length unless linear approximations are applied.",
    "User Manual: To reset the device to factory defaults, press and hold the power button for 10 seconds until the LED pulses amber.",
    "Employee onboarding checklist: 1. Set up laptop 2. Configure 2FA keys 3. Join engineering Slack channels 4. Complete security training module.",
    "Medical research abstract: A randomized controlled trial evaluating the efficacy of daily mindfulness meditation on resting blood pressure in adults.",
    "Travel itinerary: Flight departing from Mumbai (BOM) to New Delhi (DEL) on terminal 2 at 14:15. Seat assignment 12A window.",
    "Photography gallery caption: Urban reflection series captured with 35mm prime lens on 400 ISO monochrome film at f/2.8.",
]


def generate_synthetic_receipt(sample_index: int, category: str, merchant_data: tuple, base_date: datetime) -> Dict[str, Any]:
    """Generates a realistic transaction receipt with calculated totals, taxes, and raw text layout."""
    merchant_name, currency, possible_items = merchant_data

    # Sample 1 to 4 line items
    num_items = random.randint(1, min(4, len(possible_items)))
    selected_items = random.sample(possible_items, num_items)

    line_items = []
    subtotal = 0.0
    for desc, unit_price in selected_items:
        qty = random.choice([1, 1, 1, 2])
        amt = round(unit_price * qty, 2)
        line_items.append({"description": desc, "amount": amt, "quantity": qty})
        subtotal += amt

    # Calculate tax
    is_india = currency == "INR"
    if is_india:
        # Standard Indian GST (5%, 12%, or 18%)
        gst_rate = random.choice([0.05, 0.12, 0.18])
        tax_amount = round(subtotal * gst_rate, 2)
        total_amount = round(subtotal + tax_amount, 2)
    else:
        tax_rate = random.choice([0.08, 0.10, 0.20])
        tax_amount = round(subtotal * tax_rate, 2)
        total_amount = round(subtotal + tax_amount, 2)

    # Date generation
    days_back = random.randint(0, 90)
    tx_date = (base_date - timedelta(days=days_back)).strftime("%Y-%m-%d")

    # Generate realistic receipt text layout
    is_upi = is_india and random.random() < 0.4
    raw_lines = [merchant_name.upper()]

    if is_india:
        state_code = random.choice(["07", "29", "27", "33", "09"])
        pan_sample = "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=5))
        gstin = f"{state_code}{pan_sample}{random.randint(1000, 9999)}A1Z{random.choice('123456789')}"
        raw_lines.append(f"GSTIN: {gstin}")

    raw_lines.append(f"DATE: {tx_date}")
    raw_lines.append("--------------------------------")

    for item in line_items:
        qty_str = f"{item['quantity']}x " if item['quantity'] > 1 else ""
        raw_lines.append(f"{qty_str}{item['description']}  {currency} {item['amount']:.2f}")

    raw_lines.append("--------------------------------")
    raw_lines.append(f"SUBTOTAL: {currency} {subtotal:.2f}")

    if is_india:
        half_tax = round(tax_amount / 2, 2)
        raw_lines.append(f"CGST: {currency} {half_tax:.2f}")
        raw_lines.append(f"SGST: {currency} {half_tax:.2f}")
    else:
        raw_lines.append(f"TAX / VAT: {currency} {tax_amount:.2f}")

    raw_lines.append(f"GRAND TOTAL: {currency} {total_amount:.2f}")

    if is_upi:
        upi_ref = f"{random.randint(400000000000, 499999999999)}"
        upi_app = random.choice(["Google Pay", "PhonePe", "Paytm UPI", "BHIM"])
        raw_lines.append(f"PAID VIA: {upi_app}")
        raw_lines.append(f"UPI REF ID: {upi_ref}")

    raw_text = "\n".join(raw_lines)
    source_tag = "india_gst_upi" if is_india else "sroie_cord_multi"

    return ReceiptSchema.create_transaction_entry(
        sample_id=f"syn_rcpt_{sample_index:04d}",
        source=source_tag,
        image_path=f"datasets/images/synthetic_{sample_index:04d}.png",
        is_transaction=True,
        merchant_name=merchant_name,
        date=tx_date,
        total_amount=total_amount,
        tax_amount=tax_amount,
        currency=currency,
        category_hint=category,
        line_items=line_items,
        raw_text=raw_text,
    )


def generate_negative_sample(sample_index: int, text: str) -> Dict[str, Any]:
    """Generates a certified non-transactional control record."""
    return ReceiptSchema.create_transaction_entry(
        sample_id=f"neg_ctrl_{sample_index:04d}",
        source="negative_control",
        image_path=f"datasets/images/negative_{sample_index:04d}.jpg",
        is_transaction=False,
        raw_text=text,
    )


def build_full_training_corpus(num_receipts: int = 150, num_negatives: int = 50) -> Dict[str, Any]:
    """Builds a balanced corpus of multi-format receipts and negative controls."""
    manager = DatasetManager(output_dir="training/datasets")
    base_date = datetime.now(timezone.utc)

    # Ingest seed baseline
    manager.generate_seed_datasets()

    logger.info(f"Synthesizing {num_receipts} diverse receipts and {num_negatives} negative controls...")

    categories = list(MERCHANTS_BY_CATEGORY.keys())
    for i in range(1, num_receipts + 1):
        cat = random.choice(categories)
        merchant = random.choice(MERCHANTS_BY_CATEGORY[cat])
        receipt_entry = generate_synthetic_receipt(i, cat, merchant, base_date)
        manager.add_sample(receipt_entry)

    for j in range(1, num_negatives + 1):
        neg_text = random.choice(NEGATIVE_CORPUS)
        if random.random() < 0.3:
            neg_text += f"\nNote ID: #{random.randint(1000, 9999)} - Logged at {datetime.now(timezone.utc).strftime('%H:%M:%S')}"
        neg_entry = generate_negative_sample(j, neg_text)
        manager.add_sample(neg_entry)

    paths = manager.save_split_datasets(train_ratio=0.70, val_ratio=0.15)
    
    total = len(manager.samples)
    positives = sum(1 for s in manager.samples if s["is_transaction"])
    negatives = sum(1 for s in manager.samples if not s["is_transaction"])

    logger.info("==================================================================")
    logger.info(f"🎉 CORPUS SYNTHESIS COMPLETE: {total} total records generated.")
    logger.info(f"   • Positive Transaction Receipts: {positives} ({(positives/total)*100:.1f}%)")
    logger.info(f"   • Negative Control Non-Receipts: {negatives} ({(negatives/total)*100:.1f}%)")
    logger.info(f"   • Files written: {list(paths.values())}")
    logger.info("==================================================================")

    return {
        "total": total,
        "positives": positives,
        "negatives": negatives,
        "paths": paths,
    }


if __name__ == "__main__":
    build_full_training_corpus(num_receipts=160, num_negatives=50)
