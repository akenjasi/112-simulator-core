def __getattr__(name: str):
    if name in ("router", "factoid_router"):
        from .factoid_generator import router, factoid_router
        return router if name == "router" else factoid_router
    if name == "V2ApplicantSession":
        from .runtime_router import V2ApplicantSession
        return V2ApplicantSession
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["router", "factoid_router", "V2ApplicantSession"]

