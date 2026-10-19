"""Inspect schema drift, or apply reviewed additive changes with --apply."""
import argparse
import asyncio
from sqlalchemy import inspect
from backend.database import engine
from backend.models.base import Base
import backend.models.domain_01
import backend.models.domain_02
import backend.models.domain_03
import backend.models.domain_04
import backend.models.domain_05
import backend.models.domain_06
import backend.models.dds_report_job


def drift(connection):
    known = set(inspect(connection).get_table_names())
    missing = []
    for table in Base.metadata.sorted_tables:
        columns = {c['name'] for c in inspect(connection).get_columns(table.name)} if table.name in known else set()
        missing.extend(f'{table.name}.{column.name}' for column in table.columns if column.name not in columns)
    return missing


async def main(apply):
    try:
        async with engine.begin() as connection:
            if apply:
                from backend.core.schema_migrations import migrate_schema
                changes = await connection.run_sync(migrate_schema)
                print('Applied columns:', ', '.join(changes) or 'none')
            missing = await connection.run_sync(drift)
            print('Missing schema fields:', ', '.join(missing) or 'none')
            return bool(missing)
    finally:
        await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply additive migrations after a verified backup')
    raise SystemExit(asyncio.run(main(parser.parse_args().apply)))
