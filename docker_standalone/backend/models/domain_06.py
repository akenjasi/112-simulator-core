"""Domain 06: Classifier catalog models (EKP)."""

from typing import List, Optional
from sqlalchemy import Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from backend.models.base import Base


class ClassifierRecord(Base):
    __tablename__ = "classifier_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String, index=True, nullable=False)
    group: Mapped[str] = mapped_column(String, index=True, nullable=False)
    feature1: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    feature2: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    feature3: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    final_type: Mapped[str] = mapped_column(String, nullable=False)
    base_services: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    def __repr__(self) -> str:
        return f"<ClassifierRecord(id={self.id}, final_type='{self.final_type}')>"
