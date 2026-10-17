#!/usr/bin/env bash
set -e

echo "=================================================="
echo "🔍 1. Running Backend Acceptance & Unit Test Suite"
echo "=================================================="
pytest tests/test_47_student_stats.py \
       tests/test_49_profile_enhancements.py \
       tests/test_dds_cycle_acceptance.py \
       tests/test_dds_report_data_acceptance.py \
       tests/test_dds_report_data_unit.py -q --tb=short

echo ""
echo "=================================================="
echo "🏗️ 2. Verifying Next.js Production Build"
echo "=================================================="
(cd frontend_react && npm run build)

echo ""
echo "=================================================="
echo "✅ All integrity checks passed successfully!"
echo "=================================================="
