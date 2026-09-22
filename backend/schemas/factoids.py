from typing import Optional, Dict, Any, List
from pydantic import BaseModel


class Factoid(BaseModel):
    marker: str
    text: str


class FactoidsResponse(BaseModel):
    factoids: List[Factoid]


class FactoidGenerationRequest(BaseModel):
    plot: Optional[str] = ""
    extra_plot: Optional[str] = ""
    okrug: Optional[str] = ""
    rayon: Optional[str] = ""
    street: Optional[str] = ""
    house: Optional[str] = ""
    corpus: Optional[str] = ""
    stroenie: Optional[str] = ""
    flat: Optional[str] = ""
    podiezd: Optional[str] = ""
    floor: Optional[str] = ""
    domofon: Optional[str] = ""
    fio: Optional[str] = ""
    phone: Optional[str] = ""
    ground_truth: Optional[Dict[str, Any]] = None
