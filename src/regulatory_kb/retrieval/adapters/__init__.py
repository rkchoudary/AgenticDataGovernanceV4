"""Source adapters for regulatory document retrieval."""

from regulatory_kb.retrieval.adapters.federal_reserve import FederalReserveAdapter
from regulatory_kb.retrieval.adapters.occ import OCCAdapter
from regulatory_kb.retrieval.adapters.fdic import FDICAdapter
from regulatory_kb.retrieval.adapters.fincen import FinCENAdapter
from regulatory_kb.retrieval.adapters.ecfr import ECFRAdapter
from regulatory_kb.retrieval.adapters.federal_register import FederalRegisterAdapter
from regulatory_kb.retrieval.adapters.osfi import OSFIAdapter
from regulatory_kb.retrieval.adapters.fintrac import FINTRACAdapter

__all__ = [
    "FederalReserveAdapter",
    "OCCAdapter",
    "FDICAdapter",
    "FinCENAdapter",
    "ECFRAdapter",
    "FederalRegisterAdapter",
    "OSFIAdapter",
    "FINTRACAdapter",
]
