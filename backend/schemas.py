"""Request bodies. Responses are plain dicts mirroring frontend/src/lib/types.ts."""
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from .cases import LIMITS


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExampleCaseRequest(Strict):
    example_id: str = Field(max_length=64)
    title: Optional[str] = Field(default=None, max_length=LIMITS["title"])


class CasePatch(Strict):
    title: Optional[str] = Field(default=None, min_length=1, max_length=LIMITS["title"])
    description: Optional[str] = Field(default=None, max_length=LIMITS["description"])
    notes: Optional[str] = Field(default=None, max_length=LIMITS["notes"])


class AnalysisRequest(Strict):
    technique_id: str = Field(max_length=64)
    parameters: dict[str, Any] = Field(default_factory=dict)
    force: bool = False


class ResultNote(Strict):
    analyst_note: str = Field(max_length=LIMITS["result_note"])


class LedgerAdd(Strict):
    case_id: str = Field(max_length=32)
    note: str = Field(default="", max_length=1000)


class RegionCreate(Strict):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)
    label: str = Field(default="", max_length=LIMITS["region_label"])


class ProvenanceExample(Strict):
    example_id: str = Field(max_length=64)
