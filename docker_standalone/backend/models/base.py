"""SQLAlchemy declarative base and domain model registry.

All domain models must be imported here so that Base.metadata
is fully populated before create_all() is called.
"""

from sqlalchemy.orm import declarative_base


Base = declarative_base()


# ─── Domain model registry ────────────────────────────────────────────────────
# Import order matters: models with FK dependencies must come after their targets.
# domain_01 → domain_02 → domain_03 → domain_04 → domain_05

try:
    import backend.models.domain_01  # noqa: F401  (users, groups, audit)
except ImportError:
    pass

try:
    import backend.models.domain_02  # noqa: F401  (scenarios)
except ImportError:
    pass

try:
    import backend.models.domain_03  # noqa: F401  (assignments, sessions)
except ImportError:
    pass

try:
    import backend.models.domain_04  # noqa: F401  (incident cards, reports)
except ImportError:
    pass

try:
    import backend.models.domain_05  # noqa: F401  (bricks, import jobs)
except ImportError:
    pass
