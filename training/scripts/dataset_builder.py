"""
Ledgerly ML Training Pipeline — Unified Dataset Builder & Schema Standardizer
Version: 0.5.1
Author: Ledgerly AI Architecture Team

Normalizes diverse receipt datasets (SROIE, CORD, Indian GST & UPI, Negative Controls)
into a unified, schema-validated JSON format for training and evaluation.
"""

import os
import re
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("DatasetBuilder")


class ReceiptSchema:
    """Canonical Ledgerly ML Ground-Truth Schema."""

    @staticmethod
    def create_transaction_entry(
        sample_id: str,
        source: str,
        image_path: str,
        is_transaction: bool,
        merchant_name: Optional[str] = None,
        date: Optional[str] = None,
        total_amount: Optional[float] = None,
        tax_amount: Optional[float] = None,
        currency: str = "INR",
        category_hint: Optional[str] = None,
        line_items: Optional[List[Dict[str, Any]]] = None,
        raw_text: Optional[str] = None,
        bounding_boxes: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Creates a schema-compliant record for ML training/testing."""
        if not is_transaction:
            return {
                "id": sample_id,
                "source": source,
                "image_path": image_path,
                "is_transaction": False,
                "transaction": None,
                "metadata": {
                    "reason": "negative_sample_non_financial",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            }

        return {
            "id": sample_id,
            "source": source,
            "image_path": image_path,
            "is_transaction": True,
            "transaction": {
                "merchant_name": merchant_name.strip() if merchant_name else "Unknown Merchant",
                "date": date,
                "total_amount": round(float(total_amount), 2) if total_amount is not None else 0.0,
                "tax_amount": round(float(tax_amount), 2) if tax_amount is not None else None,
                "currency": currency,
                "category_hint": category_hint or "Uncategorized",
                "line_items": line_items or [],
                "raw_text": raw_text or "",
                "bounding_boxes": bounding_boxes or [],
            },
            "metadata": {
                "normalized": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        }


class DataNormalizer:
    """Helper methods for cleaning and standardizing dates, amounts, and text."""

    DATE_PATTERNS = [
        (r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b", "%Y-%m-%d"),
        (r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b", "%d-%m-%Y"),
        (r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b", "%d-%m-%y"),
        (r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b", "%d %b %Y"),
    ]

    @classmethod
    def clean_amount(cls, value: Any) -> Optional[float]:
        """Extracts and cleans numeric float from currency string (e.g. '$14.50', '₹ 1,250.00', '14,50')."""
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)

        text = str(value).strip()
        cleaned = re.sub(r"[^\d.,]", "", text)
        if not cleaned:
            return None

        # Handle European decimal formatting (1.250,50 -> 1250.50)
        if "," in cleaned and "." in cleaned:
            if cleaned.rfind(",") > cleaned.rfind("."):
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned and "." not in cleaned:
            parts = cleaned.split(",")
            if len(parts) == 2 and len(parts[1]) == 2:
                cleaned = parts[0] + "." + parts[1]
            else:
                cleaned = cleaned.replace(",", "")

        try:
            return float(cleaned)
        except ValueError:
            return None

    @classmethod
    def clean_date(cls, value: Any) -> Optional[str]:
        """Normalizes various date formats into ISO-8601 (YYYY-MM-DD)."""
        if not value:
            return None
        text = str(value).strip()

        for pattern, fmt in cls.DATE_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                raw_match = match.group(0).replace("/", "-").replace(".", "-")
                try:
                    dt = datetime.strptime(raw_match, fmt)
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    continue
        return None

    @classmethod
    def infer_category(cls, merchant: str, text: str = "") -> str:
        """Heuristic categorizer for receipts based on merchant name and line items."""
        combined = f"{merchant} {text}".lower()

        keywords = {
            "Food & Dining": ["restaurant", "cafe", "coffee", "bistro", "bakery", "kitchen", "bar", "pizza", "burger", "starbucks", "swiggy", "zomato", "diner"],
            "Groceries": ["supermarket", "mart", "grocery", "grocer", "foods", "spices", "blinkit", "zepto", "instamart", "bigbasket", "vegetables", "provisions"],
            "Fuel & Transportation": ["petrol", "fuel", "gas", "shell", "hpcl", "bpcl", "ioc", "uber", "ola", "transport", "station"],
            "Healthcare": ["pharmacy", "chemist", "hospital", "clinic", "meds", "medical", "druggist", "apollo"],
            "Shopping & Retail": ["apparel", "clothing", "fashion", "electronics", "store", "mall", "retail", "amazon", "flipkart"],
            "Utilities & Bills": ["electric", "water", "broadband", "telecom", "airtel", "jio", "gas utility"],
        }

        for category, terms in keywords.items():
            if any(term in combined for term in terms):
                return category

        return "General & Miscellaneous"


class DatasetManager:
    """Manages creation, aggregation, and splitting of training datasets."""

    def __init__(self, output_dir: str = "training/datasets"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        self.samples: List[Dict[str, Any]] = []

    def add_sample(self, sample: Dict[str, Any]):
        """Adds a verified schema entry."""
        self.samples.append(sample)

    def generate_seed_datasets(self) -> Dict[str, int]:
        """
        Creates calibrated seed datasets covering:
        1. SROIE-style store receipts
        2. CORD-style detailed restaurant line items
        3. Indian GST Invoices & UPI payment slips (Tier 3 priority)
        4. Negative Control samples (non-transactional images)
        """
        logger.info("Generating canonical training and validation seed datasets...")

        # 1. SROIE-Style Store Receipts
        sroie_samples = [
            {
                "id": "sroie_seed_001",
                "source": "sroie",
                "image_path": "datasets/images/sroie_001.jpg",
                "is_transaction": True,
                "merchant_name": "RESTORAN HAFEZ SDN BHD",
                "date": "2018-03-12",
                "total_amount": 14.50,
                "tax_amount": 0.82,
                "currency": "MYR",
                "category_hint": "Food & Dining",
                "line_items": [
                    {"description": "ROTI CANAI", "amount": 2.50, "quantity": 2},
                    {"description": "TEH TARIK", "amount": 3.00, "quantity": 2},
                    {"description": "MEE GORENG", "amount": 6.50, "quantity": 1},
                ],
                "raw_text": "RESTORAN HAFEZ SDN BHD\nDATE: 12/03/2018\nROTI CANAI 2.50\nTEH TARIK 3.00\nMEE GORENG 6.50\nTAX 0.82\nTOTAL 14.50",
            },
            {
                "id": "sroie_seed_002",
                "source": "sroie",
                "image_path": "datasets/images/sroie_002.jpg",
                "is_transaction": True,
                "merchant_name": "PETRONAS DAGANGAN BHD",
                "date": "2018-05-24",
                "total_amount": 50.00,
                "tax_amount": 2.83,
                "currency": "MYR",
                "category_hint": "Fuel & Transportation",
                "line_items": [
                    {"description": "PRIMAX 95", "amount": 50.00, "quantity": 1},
                ],
                "raw_text": "PETRONAS DAGANGAN BHD\nPUMP 04\nDATE: 2018-05-24 14:22\nPRIMAX 95 RM50.00\nGST 6% RM2.83\nTOTAL AMOUNT: RM 50.00",
            },
            {
                "id": "sroie_seed_003",
                "source": "sroie",
                "image_path": "datasets/images/sroie_003.jpg",
                "is_transaction": True,
                "merchant_name": "AEON CO. (M) BHD",
                "date": "2018-11-03",
                "total_amount": 89.20,
                "tax_amount": 0.00,
                "currency": "MYR",
                "category_hint": "Groceries",
                "line_items": [
                    {"description": "DUTCH LADY MILK 1L", "amount": 13.90, "quantity": 2},
                    {"description": "SUNFLOWER OIL 5KG", "amount": 28.50, "quantity": 1},
                    {"description": "ORGANIC EGGS 10S", "amount": 8.90, "quantity": 1},
                    {"description": "JASMINE RICE 10KG", "amount": 37.90, "quantity": 1},
                ],
                "raw_text": "AEON SUPERMARKET\n03/11/2018\nMILK 13.90\nOIL 28.50\nEGGS 8.90\nRICE 37.90\nROUNDING: 0.00\nTOTAL: 89.20",
            },
        ]

        # 2. CORD-Style Restaurant Line-Item Receipts
        cord_samples = [
            {
                "id": "cord_seed_001",
                "source": "cord",
                "image_path": "datasets/images/cord_001.jpg",
                "is_transaction": True,
                "merchant_name": "THE COFFEE ACADEMICS",
                "date": "2019-07-15",
                "total_amount": 168.00,
                "tax_amount": 15.27,
                "currency": "USD",
                "category_hint": "Food & Dining",
                "line_items": [
                    {"description": "AVOCADO SOURDOUGH TOAST", "amount": 98.00, "quantity": 1},
                    {"description": "FLAT WHITE (OAT MILK)", "amount": 55.00, "quantity": 1},
                    {"description": "SERVICE CHARGE 10%", "amount": 15.00, "quantity": 1},
                ],
                "raw_text": "THE COFFEE ACADEMICS\nTABLE 12 - 2 GUESTS\n15 JUL 2019\n1 AVOCADO TOAST 98.00\n1 FLAT WHITE 55.00\nSVC CHG 15.00\nTOTAL DUE: $168.00",
            },
            {
                "id": "cord_seed_002",
                "source": "cord",
                "image_path": "datasets/images/cord_002.jpg",
                "is_transaction": True,
                "merchant_name": "SUSHI TEI RESTAURANT",
                "date": "2019-09-20",
                "total_amount": 342.50,
                "tax_amount": 31.14,
                "currency": "USD",
                "category_hint": "Food & Dining",
                "line_items": [
                    {"description": "SALMON SASHIMI", "amount": 120.00, "quantity": 2},
                    {"description": "CHICKEN TERIYAKI ROLL", "amount": 85.00, "quantity": 1},
                    {"description": "GREEN TEA (HOT)", "amount": 15.00, "quantity": 2},
                    {"description": "MISO SOUP", "amount": 25.00, "quantity": 2},
                ],
                "raw_text": "SUSHI TEI\nCHECK #8912\nDATE: 20-09-2019\nSUBTOTAL: 290.00\nTAX 10%: 29.00\nSERVICE 8%: 23.50\nTOTAL BILL: $342.50",
            },
        ]

        # 3. Indian GST Invoices & UPI Slips (Tier 3 Regional Priority)
        india_samples = [
            {
                "id": "in_seed_001",
                "source": "india_gst_upi",
                "image_path": "datasets/images/in_gst_001.jpg",
                "is_transaction": True,
                "merchant_name": "BLUE TOKAI COFFEE ROASTERS",
                "date": "2026-08-14",
                "total_amount": 472.50,
                "tax_amount": 22.50,
                "currency": "INR",
                "category_hint": "Food & Dining",
                "line_items": [
                    {"description": "POUR OVER - ATTIBIKAN", "amount": 240.00, "quantity": 1},
                    {"description": "ALMOND CROISSANT", "amount": 210.00, "quantity": 1},
                ],
                "raw_text": "BLUE TOKAI COFFEE ROASTERS\nGSTIN: 07AAACB2189K1ZK\nDATE: 14/08/2026\nITEM: POUR OVER 240.00\nITEM: CROISSANT 210.00\nSUBTOTAL: 450.00\nCGST 2.5%: 11.25\nSGST 2.5%: 11.25\nTOTAL PAYABLE: Rs. 472.50",
            },
            {
                "id": "in_seed_002",
                "source": "india_gst_upi",
                "image_path": "datasets/images/in_upi_002.jpg",
                "is_transaction": True,
                "merchant_name": "SWIGGY INSTAMART",
                "date": "2026-09-02",
                "total_amount": 834.00,
                "tax_amount": 39.71,
                "currency": "INR",
                "category_hint": "Groceries",
                "line_items": [
                    {"description": "NANDINI MILK 500ML", "amount": 24.00, "quantity": 2},
                    {"description": "SOURDOUGH BREAD", "amount": 95.00, "quantity": 1},
                    {"description": "FORTUNE SUNFLOWER 1L", "amount": 165.00, "quantity": 1},
                    {"description": "ORGANIC APPLES 1KG", "amount": 220.00, "quantity": 1},
                    {"description": "ORGANIC EGGS 6 PACK", "amount": 75.00, "quantity": 2},
                    {"description": "DELIVERY & HANDLING", "amount": 49.00, "quantity": 1},
                ],
                "raw_text": "SWIGGY INSTAMART\nORDER ID: #SWG-891023\nDATE: 02-Sep-2026 19:42\nPAID VIA: GOOGLE PAY (UPI)\nUPI REF ID: 424198712903\nTOTAL PAID: ₹834.00",
            },
            {
                "id": "in_seed_003",
                "source": "india_gst_upi",
                "image_path": "datasets/images/in_gst_003.jpg",
                "is_transaction": True,
                "merchant_name": "APOLLO PHARMACY",
                "date": "2026-09-05",
                "total_amount": 1240.00,
                "tax_amount": 132.85,
                "currency": "INR",
                "category_hint": "Healthcare",
                "line_items": [
                    {"description": "PARACETAMOL 650MG", "amount": 40.00, "quantity": 2},
                    {"description": "MULTIVITAMIN CAPSULES", "amount": 650.00, "quantity": 1},
                    {"description": "BP MONITOR CUFF", "amount": 550.00, "quantity": 1},
                ],
                "raw_text": "APOLLO PHARMACY - INDIRANAGAR\nTAX INVOICE / CASH BILL\nGSTIN: 29AABCA1293F1Z5\nDATE: 05/09/2026\nTOTAL ITEMS: 3\nNET AMOUNT: ₹ 1,240.00\nPAID BY: PHONEPE UPI",
            },
        ]

        # 4. Negative Control Samples (Non-Transactional Images)
        negative_samples = [
            {
                "id": "neg_seed_001",
                "source": "negative_control",
                "image_path": "datasets/images/neg_nature_001.jpg",
                "is_transaction": False,
                "raw_text": "A scenic landscape photograph of mountain ranges and blue sky.",
            },
            {
                "id": "neg_seed_002",
                "source": "negative_control",
                "image_path": "datasets/images/neg_book_002.jpg",
                "is_transaction": False,
                "raw_text": "Chapter 4: The Psychology of Modern Wealth. In this chapter, we discuss how spending habits form over generations.",
            },
            {
                "id": "neg_seed_003",
                "source": "negative_control",
                "image_path": "datasets/images/neg_memo_003.jpg",
                "is_transaction": False,
                "raw_text": "Meeting Agenda for Tuesday 10:00 AM:\n1. Project Status\n2. Design Review\n3. Next Steps",
            },
            {
                "id": "neg_seed_004",
                "source": "negative_control",
                "image_path": "datasets/images/neg_random_004.jpg",
                "is_transaction": False,
                "raw_text": "A photograph of a computer keyboard and coffee mug on a wooden desk.",
            },
        ]

        counts = {"sroie": 0, "cord": 0, "india_gst_upi": 0, "negative_control": 0}

        for item in sroie_samples:
            entry = ReceiptSchema.create_transaction_entry(
                sample_id=item["id"],
                source=item["source"],
                image_path=item["image_path"],
                is_transaction=True,
                merchant_name=item["merchant_name"],
                date=DataNormalizer.clean_date(item["date"]),
                total_amount=DataNormalizer.clean_amount(item["total_amount"]),
                tax_amount=DataNormalizer.clean_amount(item["tax_amount"]),
                currency=item["currency"],
                category_hint=item["category_hint"],
                line_items=item["line_items"],
                raw_text=item["raw_text"],
            )
            self.add_sample(entry)
            counts["sroie"] += 1

        for item in cord_samples:
            entry = ReceiptSchema.create_transaction_entry(
                sample_id=item["id"],
                source=item["source"],
                image_path=item["image_path"],
                is_transaction=True,
                merchant_name=item["merchant_name"],
                date=DataNormalizer.clean_date(item["date"]),
                total_amount=DataNormalizer.clean_amount(item["total_amount"]),
                tax_amount=DataNormalizer.clean_amount(item["tax_amount"]),
                currency=item["currency"],
                category_hint=item["category_hint"],
                line_items=item["line_items"],
                raw_text=item["raw_text"],
            )
            self.add_sample(entry)
            counts["cord"] += 1

        for item in india_samples:
            entry = ReceiptSchema.create_transaction_entry(
                sample_id=item["id"],
                source=item["source"],
                image_path=item["image_path"],
                is_transaction=True,
                merchant_name=item["merchant_name"],
                date=DataNormalizer.clean_date(item["date"]),
                total_amount=DataNormalizer.clean_amount(item["total_amount"]),
                tax_amount=DataNormalizer.clean_amount(item["tax_amount"]),
                currency=item["currency"],
                category_hint=item["category_hint"],
                line_items=item["line_items"],
                raw_text=item["raw_text"],
            )
            self.add_sample(entry)
            counts["india_gst_upi"] += 1

        for item in negative_samples:
            entry = ReceiptSchema.create_transaction_entry(
                sample_id=item["id"],
                source=item["source"],
                image_path=item["image_path"],
                is_transaction=False,
                raw_text=item["raw_text"],
            )
            self.add_sample(entry)
            counts["negative_control"] += 1

        logger.info(f"Total samples indexed: {len(self.samples)} (Counts: {counts})")
        return counts

    def save_split_datasets(self, train_ratio: float = 0.7, val_ratio: float = 0.15) -> Dict[str, str]:
        """Splits datasets into train/val/test with stratified sampling for negative controls."""
        positives = [s for s in self.samples if s["is_transaction"]]
        negatives = [s for s in self.samples if not s["is_transaction"]]

        def split_list(items, tr, vr):
            n = len(items)
            n_tr = int(n * tr)
            n_vr = int(n * vr)
            return items[:n_tr], items[n_tr:n_tr + n_vr], items[n_tr + n_vr:]

        tr_pos, val_pos, test_pos = split_list(positives, train_ratio, val_ratio)
        tr_neg, val_neg, test_neg = split_list(negatives, train_ratio, val_ratio)

        splits = {
            "train": tr_pos + tr_neg,
            "val": val_pos + val_neg,
            "test": test_pos + test_neg,
            "all": self.samples,
        }

        output_paths = {}
        for split_name, split_data in splits.items():
            path = os.path.join(self.output_dir, f"dataset_{split_name}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(split_data, f, indent=2, ensure_ascii=False)
            output_paths[split_name] = path
            logger.info(f"Saved {split_name} split ({len(split_data)} records) -> {path}")

        return output_paths


if __name__ == "__main__":
    builder = DatasetManager()
    counts = builder.generate_seed_datasets()
    paths = builder.save_split_datasets()
    print("\nDataset generation summary:")
    print(f"  Categories: {counts}")
    print(f"  Files saved: {list(paths.keys())}")
