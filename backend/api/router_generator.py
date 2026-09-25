from fastapi import APIRouter
from backend.core.faker import FakeDataGenerator
from backend.schemas.faker import GeneratedAddress

router = APIRouter(prefix="/api/generator", tags=["Generator Tools"])

@router.get("/address", response_model=GeneratedAddress)
async def get_random_address():
    faker = FakeDataGenerator(seed=None)
    return faker.generate_address()
