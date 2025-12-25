"""Regulator data models."""

from enum import Enum
from pydantic import BaseModel, Field


class Country(str, Enum):
    """Supported countries for regulatory documents."""

    US = "US"
    CA = "CA"


class RegulatorType(str, Enum):
    """Types of regulatory bodies."""

    PRUDENTIAL = "prudential"
    AML = "aml"
    SECURITIES = "securities"
    CONSUMER = "consumer"


class Regulator(BaseModel):
    """Represents a regulatory body that issues guidance documents."""

    model_config = {"frozen": True}

    id: str = Field(..., description="Unique identifier for the regulator")
    name: str = Field(..., description="Full name of the regulatory body")
    abbreviation: str = Field(..., description="Common abbreviation (e.g., FRB, OCC)")
    country: Country = Field(..., description="Country of jurisdiction")
    regulator_type: RegulatorType = Field(..., description="Type of regulatory body")
    website: str = Field(..., description="Official website URL")


# Pre-defined regulators
US_REGULATORS = {
    "frb": Regulator(
        id="us_frb",
        name="Federal Reserve Board",
        abbreviation="FRB",
        country=Country.US,
        regulator_type=RegulatorType.PRUDENTIAL,
        website="https://www.federalreserve.gov",
    ),
    "occ": Regulator(
        id="us_occ",
        name="Office of the Comptroller of the Currency",
        abbreviation="OCC",
        country=Country.US,
        regulator_type=RegulatorType.PRUDENTIAL,
        website="https://www.occ.treas.gov",
    ),
    "fdic": Regulator(
        id="us_fdic",
        name="Federal Deposit Insurance Corporation",
        abbreviation="FDIC",
        country=Country.US,
        regulator_type=RegulatorType.PRUDENTIAL,
        website="https://www.fdic.gov",
    ),
    "fincen": Regulator(
        id="us_fincen",
        name="Financial Crimes Enforcement Network",
        abbreviation="FinCEN",
        country=Country.US,
        regulator_type=RegulatorType.AML,
        website="https://www.fincen.gov",
    ),
}

CA_REGULATORS = {
    "osfi": Regulator(
        id="ca_osfi",
        name="Office of the Superintendent of Financial Institutions",
        abbreviation="OSFI",
        country=Country.CA,
        regulator_type=RegulatorType.PRUDENTIAL,
        website="https://www.osfi-bsif.gc.ca",
    ),
    "fintrac": Regulator(
        id="ca_fintrac",
        name="Financial Transactions and Reports Analysis Centre of Canada",
        abbreviation="FINTRAC",
        country=Country.CA,
        regulator_type=RegulatorType.AML,
        website="https://www.fintrac-canafe.canada.ca",
    ),
}

ALL_REGULATORS = {**US_REGULATORS, **CA_REGULATORS}
