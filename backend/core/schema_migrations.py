"""Checked, additive upgrades for the schema generations retained in this repo.

Never drop/rewrite rows or guess how to backfill an unknown required column.
Run on a backup first. The caller owns the transaction.
"""
import json
from sqlalchemy import inspect, literal, text
from backend.models.base import Base

# These fields have a documented backwards-compatible meaning/default.
ADDITIONS = {
    "users": {"student_id", "full_name", "specialization", "group_ids", "last_login", "failed_login_attempts", "locked_until", "password_changed_at", "totp_secret", "is_2fa_enabled", "created_by_id"},
    "student_groups": {"department", "teacher_id", "cadet_ids", "is_active"},
    "scenario_tickets": {"title", "category", "complexity", "content", "workflow_state", "settings", "ground_truth", "ai_content", "reference_material_ids", "version_history", "is_deleted"},
    "generated_tickets": {"status", "is_deleted", "sequence_number"},
    "assignments": {"scenario_id", "card_pool_ids", "card_pool_source", "target_role", "mode", "status", "group_id", "cadet_id", "is_active", "categories", "complexity", "error_limit", "time_limit_seconds", "teacher_notes", "started_at", "completed_at"},
    "exam_sessions": {"ticket_id", "browser_call", "dynamic_state", "dialogue_log", "offline_buffer", "categories", "complexity", "error_limit", "time_limit_seconds"},
    "ticket_results": {"score_total", "status", "is_appealed", "teacher_comment", "updated_at"},
    "user_action_log": {"endpoint"},
}


def migrate_schema(connection):
    """Create fresh tables and apply only known column additions, idempotently."""
    existing_tables = set(inspect(connection).get_table_names())
    unsupported = []
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        present = {column["name"] for column in inspect(connection).get_columns(table.name)}
        for column in table.columns:
            if column.name not in present and column.name not in ADDITIONS.get(table.name, set()):
                unsupported.append(f"{table.name}.{column.name}")
    if unsupported:
        raise RuntimeError("Unsupported database schema; prepare a reviewed migration for: " + ", ".join(unsupported))
    Base.metadata.create_all(connection)
    quote = connection.dialect.identifier_preparer.quote
    changes = []
    missing = []
    for table in Base.metadata.sorted_tables:
        present = {column["name"] for column in inspect(connection).get_columns(table.name)}
        for column in table.columns:
            if column.name in present:
                continue
            if column.name not in ADDITIONS.get(table.name, set()):
                missing.append(f"{table.name}.{column.name}")
                continue
            default = None
            if column.default is not None:
                default = column.default.arg
                if callable(default):
                    default = default(None)
            if default is None and not column.nullable:
                missing.append(f"{table.name}.{column.name} (backfill required)")
                continue
            suffix = ""
            if default is not None:
                if isinstance(default, (dict, list)):
                    default = json.dumps(default)
                value = str(literal(default).compile(dialect=connection.dialect, compile_kwargs={"literal_binds": True}))
                suffix += f" DEFAULT {value}"
            if not column.nullable:
                suffix += " NOT NULL"
            ddl = f"ALTER TABLE {quote(table.name)} ADD COLUMN {quote(column.name)} {column.type.compile(connection.dialect)}{suffix}"
            connection.execute(text(ddl))
            changes.append(f"{table.name}.{column.name}")
        for index in table.indexes:
            # Includes indexes for newly added columns; checkfirst retains existing ones.
            if all(c.name in {x["name"] for x in inspect(connection).get_columns(table.name)} for c in index.columns):
                index.create(connection, checkfirst=True)
    if missing:
        raise RuntimeError("Unsupported database schema; restore/prepare a reviewed migration for: " + ", ".join(missing))
    connection.execute(text("INSERT INTO sys_sequences (name, last_val) VALUES ('generated_tickets', 0) ON CONFLICT (name) DO NOTHING"))
    return changes
