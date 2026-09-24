from typing import Optional
from pydantic import BaseModel, ConfigDict


class GeneratedPerson(BaseModel):
    model_config = ConfigDict(extra="ignore")

    first_name: str
    last_name: str
    middle_name: str
    gender: str = ""



class GeneratedAddress(BaseModel):
    model_config = ConfigDict(extra="ignore")

    city: str
    street: str
    house: str
    corpus: Optional[str] = None
    structure: Optional[str] = None
    full_address: str
    lat: float
    lon: float
