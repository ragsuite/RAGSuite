# Phase 6 — resolve Enterprise Extension root (path attach, no submodule).
# Sourced after common.sh. Callers: native-start, docker-start, docker-stop, prepare-workspace.
#
# Resolve order:
# 1. RAGSUITE_EE_ROOT if set and is a directory (override wins)
# 2. Sibling ../RAGSUITE_EE next to CE root
# 3. Installed ACTIVE bundle under extensions/installed/ee/<ACTIVE>/
# 4. Else CE-only (unset RAGSUITE_EE_ROOT)
#
# Side effects:
# - exports RAGSUITE_EE_ROOT when attached
# - unsets RAGSUITE_EE_ROOT when CE-only
# - writes .ragsuite/ee-root (path or empty) for debugging

ragsuite_active_installed_ee() {
  local root active_file ver path
  root="$(ragsuite_root)"
  active_file="$root/extensions/installed/ee/ACTIVE"
  if [[ ! -f "$active_file" ]]; then
    return 1
  fi
  ver="$(tr -d '[:space:]' <"$active_file" || true)"
  if [[ -z "$ver" ]]; then
    return 1
  fi
  path="$root/extensions/installed/ee/$ver"
  if [[ ! -d "$path/modules" ]]; then
    return 1
  fi
  printf '%s\n' "$path"
  return 0
}

ragsuite_resolve_ee_root() {
  local root sibling override resolved="" installed="" attach_kind=""
  root="$(ragsuite_root)"
  override="${RAGSUITE_EE_ROOT:-}"
  sibling="$(cd "$root/.." && pwd)/RAGSUITE_EE"

  if [[ -n "$override" ]]; then
    if [[ -d "$override" ]]; then
      resolved="$(cd "$override" && pwd)"
      if [[ "$resolved" == *"/extensions/installed/ee/"* ]]; then
        attach_kind="installed"
      else
        # Explicit override to a source tree (typical: sibling EE path) — developer DX
        attach_kind="dx"
      fi
    else
      log_warn "RAGSUITE_EE_ROOT=$override is not a directory — ignoring (CE-only)"
      resolved=""
    fi
  elif [[ -d "$sibling" ]]; then
    resolved="$(cd "$sibling" && pwd)"
    attach_kind="dx"
  elif installed="$(ragsuite_active_installed_ee)"; then
    resolved="$installed"
    attach_kind="installed"
  fi

  mkdir -p "$root/.ragsuite"
  if [[ -n "$resolved" ]]; then
    export RAGSUITE_EE_ROOT="$resolved"
    printf '%s\n' "$resolved" >"$root/.ragsuite/ee-root"
    printf '%s\n' "$attach_kind" >"$root/.ragsuite/ee-attach-kind"
    log_info "EE attached: $resolved ($attach_kind)"
    # EE modules/bundles always require a valid offline.key (no unlicensed bypass).
  else
    unset RAGSUITE_EE_ROOT || true
    : >"$root/.ragsuite/ee-root"
    : >"$root/.ragsuite/ee-attach-kind"
    log_info "EE: not found (CE-only)"
  fi
}

# Print discovery without mutating (for setup banner). Still writes ee-root via resolve.
ragsuite_print_ee_status() {
  ragsuite_resolve_ee_root
  if [[ -n "${RAGSUITE_EE_ROOT:-}" ]]; then
    printf 'RAGSUITE_EE_ROOT=%s\n' "$RAGSUITE_EE_ROOT"
  else
    printf 'RAGSUITE_EE_ROOT=(unset — CE-only)\n'
  fi
}

# Bash 3.2 + set -u safe Compose runner (CE-only must not expand an empty array).
# Requires: compose_cmd already succeeded; call ragsuite_prepare_ee_compose_args first (or EE_COMPOSE_ARGS=()).
ragsuite_docker_compose() {
  local root
  root="$(ragsuite_root)"
  if ! declare -p EE_COMPOSE_ARGS >/dev/null 2>&1; then
    EE_COMPOSE_ARGS=()
  fi
  if ((${#EE_COMPOSE_ARGS[@]} > 0)); then
    "${COMPOSE_BIN[@]}" -f "$root/docker-compose.yml" "${EE_COMPOSE_ARGS[@]}" "$@"
  else
    "${COMPOSE_BIN[@]}" -f "$root/docker-compose.yml" "$@"
  fi
}

# Populate EE_COMPOSE_ARGS (+ RAGSUITE_EE_DOCKER_CONTEXT) after ragsuite_resolve_ee_root.
# Base docker-compose.yml bind-mounts RAGSUITE_EE_DOCKER_CONTEXT → /ee for backend+frontend
# so raw `docker compose up` and `npm run start:docker` stay in sync (no EE UI / API split).
ragsuite_prepare_ee_compose_args() {
  local root
  root="$(ragsuite_root)"
  EE_COMPOSE_ARGS=()
  if [[ -n "${RAGSUITE_EE_ROOT:-}" && -d "${RAGSUITE_EE_ROOT}" ]]; then
    export RAGSUITE_EE_DOCKER_CONTEXT="${RAGSUITE_EE_DOCKER_CONTEXT:-$RAGSUITE_EE_ROOT}"
    # Overlay still sets RAGSUITE_EE_ROOT=/ee explicitly; base compose already mounts the same path.
    EE_COMPOSE_ARGS+=(-f "$root/docker/docker-compose.ee.yml")
    log_info "Docker EE context (backend+/ee + frontend build): ${RAGSUITE_EE_DOCKER_CONTEXT}"
  else
    export RAGSUITE_EE_DOCKER_CONTEXT="${RAGSUITE_EE_DOCKER_CONTEXT:-$root/frontend/src/platform/ee-stubs}"
    log_info "Docker CE-only context (stubs): ${RAGSUITE_EE_DOCKER_CONTEXT}"
  fi
}
