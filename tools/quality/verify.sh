#!/usr/bin/env bash
set -umo pipefail

# 1. Determine repository root regardless of current working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# 2. Reject inherited external DATABASE_URL immediately
if [ -n "${DATABASE_URL:-}" ]; then
    echo "ERROR: Inherited external DATABASE_URL is not allowed. Runner must allocate its own isolated database." >&2
    exit 1
fi

# 3. Mode parsing
MODE="${1:-all}"
case "${MODE}" in
    backend-core|backend-all|frontend|all)
        ;;
    *)
        echo "ERROR: Unknown verification mode '${MODE}'. Allowed modes: backend-core, backend-all, frontend, all." >&2
        exit 1
        ;;
esac

# 4. Manifest validation BEFORE allocating resources or dispatching stages
BACKEND_CORE_MANIFEST="${REPO_ROOT}/tools/quality/checks/backend-core.txt"
FRONTEND_CORE_MANIFEST="${REPO_ROOT}/tools/quality/checks/frontend-core.txt"

BACKEND_FILES=()
if [ "${MODE}" = "backend-core" ] || [ "${MODE}" = "all" ]; then
    if [ ! -f "${BACKEND_CORE_MANIFEST}" ]; then
        echo "ERROR: Missing backend manifest: ${BACKEND_CORE_MANIFEST}" >&2
        exit 1
    fi
    while IFS= read -r line || [ -n "${line}" ]; do
        trimmed="$(echo "${line}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        if [ -z "${trimmed}" ] || [[ "${trimmed}" =~ ^# ]]; then
            continue
        fi
        filepath="${trimmed%%::*}"
        if [ ! -f "${REPO_ROOT}/${filepath}" ]; then
            echo "ERROR: Required test file in manifest not found: ${filepath}" >&2
            exit 1
        fi
        BACKEND_FILES+=("${trimmed}")
    done < "${BACKEND_CORE_MANIFEST}"
fi

FRONTEND_FILES=()
if [ "${MODE}" = "frontend" ] || [ "${MODE}" = "all" ]; then
    if [ ! -f "${FRONTEND_CORE_MANIFEST}" ]; then
        echo "ERROR: Missing frontend manifest: ${FRONTEND_CORE_MANIFEST}" >&2
        exit 1
    fi
    while IFS= read -r line || [ -n "${line}" ]; do
        trimmed="$(echo "${line}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        if [ -z "${trimmed}" ] || [[ "${trimmed}" =~ ^# ]]; then
            continue
        fi
        filepath="${trimmed%%::*}"
        if [ -d "${REPO_ROOT}/frontend/tests" ] && [ ! -f "${REPO_ROOT}/frontend/${filepath}" ]; then
            echo "ERROR: Required frontend test file in manifest not found: ${filepath}" >&2
            exit 1
        fi
        FRONTEND_FILES+=("${trimmed}")
    done < "${FRONTEND_CORE_MANIFEST}"
fi

# 5. Report Directory Setup
if [ -n "${IMBA_VERIFY_REPORT_DIR:-}" ]; then
    REPORT_DIR="${IMBA_VERIFY_REPORT_DIR}"
else
    RUN_ID="$(date +%Y%m%d_%H%M%S)_$(python3 -c 'import uuid; print(uuid.uuid4().hex[:8])')"
    REPORT_DIR="${REPO_ROOT}/data/checks/verification/${RUN_ID}"
fi
mkdir -p "${REPORT_DIR}"

# 6. Cleanup trap & private resource management
RUN_TEMP_DIR=""
CHILD_PID=""

stop_child_tree() {
    local root_pid="$1"
    if [ -z "${root_pid}" ]; then
        return 0
    fi

    # Helper to recursively get all descendants
    get_all_descendants() {
        local p="$1"
        local kids
        kids="$(pgrep -P "${p}" 2>/dev/null || true)"
        for k in ${kids}; do
            get_all_descendants "${k}"
            echo "${k}"
        done
    }

    local descendants
    descendants="$(get_all_descendants "${root_pid}")"

    # Send SIGTERM to process group, descendants, and root process
    kill -TERM -"${root_pid}" 2>/dev/null || true
    for p in ${descendants}; do
        kill -TERM "${p}" 2>/dev/null || true
    done
    kill -TERM "${root_pid}" 2>/dev/null || true

    # Wait up to 5 seconds for all processes to exit gracefully
    local start_time
    start_time=$(date +%s)
    local alive=1
    while [ $(( $(date +%s) - start_time )) -lt 5 ]; do
        alive=0
        if kill -0 "${root_pid}" 2>/dev/null; then
            alive=1
        fi
        for p in ${descendants}; do
            if kill -0 "${p}" 2>/dev/null; then
                alive=1
            fi
        done
        if pgrep -g "${root_pid}" >/dev/null 2>&1; then
            alive=1
        fi
        if [ "${alive}" -eq 0 ]; then
            break
        fi
        sleep 0.1
    done

    # If processes still alive after timeout, escalate to SIGKILL
    if [ "${alive}" -ne 0 ]; then
        kill -KILL -"${root_pid}" 2>/dev/null || true
        for p in ${descendants}; do
            kill -KILL "${p}" 2>/dev/null || true
        done
        kill -KILL "${root_pid}" 2>/dev/null || true
        sleep 0.2
    fi

    wait "${root_pid}" 2>/dev/null || true
}

cleanup() {
    local sig="${1:-}"
    if [ -n "${CHILD_PID:-}" ]; then
        local pid_to_stop="${CHILD_PID}"
        CHILD_PID=""
        stop_child_tree "${pid_to_stop}"
    fi
    if [ -n "${RUN_TEMP_DIR:-}" ] && [ -d "${RUN_TEMP_DIR}" ]; then
        rm -rf "${RUN_TEMP_DIR}"
    fi
    if [ -n "${sig}" ]; then
        trap - "${sig}"
        kill -s "${sig}" "$$" 2>/dev/null || exit 130
    fi
}
trap 'cleanup' EXIT
trap 'cleanup INT; exit 130' INT
trap 'cleanup TERM; exit 143' TERM

# 7. Allocate private SQLite environment for backend execution
if [ "${MODE}" = "backend-core" ] || [ "${MODE}" = "backend-all" ] || [ "${MODE}" = "all" ]; then
    BASE_TMP="${TMPDIR:-/tmp}"
    RUN_TEMP_DIR="$(mktemp -d "${BASE_TMP%/}/imba_verify_XXXXXX")"
    TOKEN="$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
    echo "${TOKEN}" > "${RUN_TEMP_DIR}/.token"

    RUNNER_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    echo "${RUNNER_SECRET}" > "${RUN_TEMP_DIR}/.secret"

    export IMBA_TEST_TOKEN="${TOKEN}"
    export DATABASE_URL="sqlite+aiosqlite:///${RUN_TEMP_DIR}/test.sqlite"
    export SECRET_KEY="${RUNNER_SECRET}"
    export TESTING="true"
    export HF_HUB_OFFLINE="1"
    export TRANSFORMERS_OFFLINE="1"
fi

# 8. Define stages for the requested mode
STAGES=()
case "${MODE}" in
    backend-core)
        STAGES=("backend-core")
        ;;
    backend-all)
        STAGES=("backend-all")
        ;;
    frontend)
        STAGES=("frontend-tests" "typecheck" "frontend-build")
        ;;
    all)
        STAGES=("backend-core" "frontend-tests" "typecheck" "frontend-build")
        ;;
esac

run_stage_command() {
    local stage="$1"
    case "${stage}" in
        backend-core)
            (cd "${REPO_ROOT}" && exec python3 -m pytest -c backend/pytest.ini "${BACKEND_FILES[@]}" -q --tb=short)
            ;;
        backend-all)
            (cd "${REPO_ROOT}" && exec python3 -m pytest -c backend/pytest.ini backend/tests/ -q --tb=short)
            ;;
        frontend-tests)
            (cd "${REPO_ROOT}/frontend" && exec npm test -- "${FRONTEND_FILES[@]}")
            ;;
        typecheck)
            (cd "${REPO_ROOT}/frontend" && if [ -x "./node_modules/.bin/tsc" ]; then exec ./node_modules/.bin/tsc --noEmit; else exec npm run typecheck; fi)
            ;;
        frontend-build)
            (cd "${REPO_ROOT}/frontend" && DOCKER_BUILD=true exec npm run build)
            ;;
    esac
}

# 9. Execute stages sequentially
OVERALL_STATUS="passed"
OVERALL_EXIT_CODE=0
RECORDED_STAGES=()

for i in "${!STAGES[@]}"; do
    stage="${STAGES[$i]}"
    stage_log="${REPORT_DIR}/${stage}.log"

    echo "=================================================="
    echo "▶ Running stage: ${stage}"
    echo "=================================================="

    run_stage_command "${stage}" > "${stage_log}" 2>&1 &
    CHILD_PID=$!
    wait "${CHILD_PID}"
    exit_code=$?
    CHILD_PID=""

    cat "${stage_log}"

    if [ "${exit_code}" -eq 0 ]; then
        RECORDED_STAGES+=("{\"name\": \"${stage}\", \"status\": \"passed\", \"exit_code\": 0}")
    else
        echo "❌ Stage ${stage} failed with exit code ${exit_code}" >&2
        RECORDED_STAGES+=("{\"name\": \"${stage}\", \"status\": \"failed\", \"exit_code\": ${exit_code}}")
        OVERALL_STATUS="failed"
        OVERALL_EXIT_CODE="${exit_code}"

        # Record subsequent stages as skipped
        remaining_index=$((i + 1))
        while [ "${remaining_index}" -lt "${#STAGES[@]}" ]; do
            skipped_stage="${STAGES[$remaining_index]}"
            RECORDED_STAGES+=("{\"name\": \"${skipped_stage}\", \"status\": \"skipped\", \"exit_code\": null}")
            remaining_index=$((remaining_index + 1))
        done
        break
    fi
done

# 10. Write summary.json
python3 -c "
import json, sys
mode = sys.argv[1]
status = sys.argv[2]
summary_file = sys.argv[3]
stages_raw = sys.argv[4:]
stages = [json.loads(s) for s in stages_raw]
data = {
    'mode': mode,
    'status': status,
    'stages': stages
}
with open(summary_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
" "${MODE}" "${OVERALL_STATUS}" "${REPORT_DIR}/summary.json" "${RECORDED_STAGES[@]}"

echo ""
echo "=================================================="
echo "Summary written to: ${REPORT_DIR}/summary.json (status: ${OVERALL_STATUS})"
echo "=================================================="

exit "${OVERALL_EXIT_CODE}"
