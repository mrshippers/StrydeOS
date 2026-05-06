"""StrydeOS MCP server — pricing matrix and pilot metrics.

Single source of truth for any agent drafting marketing or sales copy.
Pricing values mirror dashboard/src/lib/billing.ts and reference_pricing.md.

Run via:
    uv run --with fastmcp python scripts/strydeOS_mcp.py
or register with Claude Code:
    claude mcp add strydeOS --scope user -- \
      uv run --with fastmcp python /absolute/path/to/scripts/strydeOS_mcp.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from fastmcp import FastMCP

mcp = FastMCP("strydeOS")

# Anchored to this file so the server works regardless of cwd at launch.
ROOT = Path(__file__).resolve().parent.parent
PILOTS_DIR = (ROOT / "pilots").resolve()
PMS_MATRIX_PATH = (ROOT / "docs" / "pms-matrix.json").resolve()

# Whitelist for clinic_id to prevent path traversal.
CLINIC_ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")


@mcp.tool()
def get_pricing_tiers() -> dict:
    """Returns the full StrydeOS pricing matrix.

    Use whenever drafting marketing, sales, or partner copy. Includes per-tier
    monthly prices for every module, the flat setup fee, bundle savings, and
    annual-billing policy. Mirrors dashboard/src/lib/billing.ts.
    """
    return {
        "currency": "GBP",
        "tiers": {
            "solo": {
                "label": "Solo",
                "size": "1 clinician",
                "monthly": {
                    "intelligence": 69,
                    "ava": 99,
                    "pulse": 79,
                    "fullstack": 199,
                },
                "fullstack_saving_per_month": 48,
            },
            "studio": {
                "label": "Studio",
                "size": "2-5 clinicians",
                "monthly": {
                    "intelligence": 99,
                    "ava": 149,
                    "pulse": 99,
                    "fullstack": 299,
                },
                "fullstack_saving_per_month": 48,
                "is_icp": True,
            },
            "clinic": {
                "label": "Clinic",
                "size": "6+ clinicians",
                "monthly": {
                    "intelligence": 149,
                    "ava": 199,
                    "pulse": 149,
                    "fullstack": 399,
                },
                "fullstack_saving_per_month": 98,
            },
        },
        "setup_fees": {
            "ava_standalone": 195,
            "fullstack": 195,
            "intelligence_standalone": 0,
            "pulse_standalone": 0,
            "note": "Single £195 flat fee covers Ava phone provisioning. Charged once whether Ava is bought alone or as part of Full Stack.",
        },
        "annual_billing": {
            "discount_pct": 20,
            "applies_to": "annual prepay only",
            "monthly_customers": "pay full price (no discount)",
            "formula": "annual_price = monthly * 12 * 0.8",
        },
        "receptionist_comparator": {
            "annual_floor_gbp": 24000,
            "annual_ceiling_gbp": 28000,
            "use_for_savings_claims": 24000,
            "studio_fs_annual_gbp": 3588,
            "conservative_savings_gbp": 20400,
        },
    }


@mcp.tool()
def get_pilot_metrics(clinic_id: str) -> dict:
    """Live pilot metrics for a clinic. clinic_id 'spires' is the live one.

    Reads from pilots/{clinic_id}.json. clinic_id is validated against
    [a-z0-9_-]{1,64} and the resolved path must stay inside the pilots dir.
    """
    if not CLINIC_ID_RE.fullmatch(clinic_id):
        raise ValueError(
            f"Invalid clinic_id: {clinic_id!r}. Must match [a-z0-9_-]{{1,64}}."
        )

    target = (PILOTS_DIR / f"{clinic_id}.json").resolve()
    try:
        target.relative_to(PILOTS_DIR)
    except ValueError as exc:
        raise ValueError("clinic_id resolves outside pilots directory") from exc

    if not target.is_file():
        raise FileNotFoundError(f"No pilot data for clinic_id={clinic_id!r}")

    data = json.loads(target.read_text(encoding="utf-8"))
    return {
        "dna_rate": data["dna_rate"],
        "drop_off": data["drop_off"],
        "weekly_sessions": data["weekly_sessions"],
        "avg_fee": data["avg_fee"],
    }


@mcp.tool()
def get_pms_capability(pms_name: str) -> str:
    """Returns capability tier for a PMS: live_booking, smart_capture, intelligent_triage, or unknown."""
    if not PMS_MATRIX_PATH.is_file():
        return "unknown"
    matrix = json.loads(PMS_MATRIX_PATH.read_text(encoding="utf-8"))
    return matrix.get(pms_name.lower(), "unknown")


if __name__ == "__main__":
    mcp.run()
