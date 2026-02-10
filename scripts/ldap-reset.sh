#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${COMPOSE_FILE:-}" ]]; then
  if [[ -f "${SCRIPT_DIR}/../../docker-compose.yml" ]]; then
    COMPOSE_FILE="${SCRIPT_DIR}/../../docker-compose.yml"
  elif [[ -f "${SCRIPT_DIR}/../docker-compose.yml" ]]; then
    COMPOSE_FILE="${SCRIPT_DIR}/../docker-compose.yml"
  elif [[ -f "${SCRIPT_DIR}/docker-compose.yml" ]]; then
    COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
  else
    COMPOSE_FILE="docker-compose.yml"
  fi
fi

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${COMPOSE_FILE}")" && pwd)}"

DATA_DIR_LDAP="${LDAP_DATA_DIR_LDAP:-${PROJECT_DIR}/ldap/data/ldap}"
DATA_DIR_SLAPD="${LDAP_DATA_DIR_SLAPD:-${PROJECT_DIR}/ldap/data/slapd}"

CONTAINER_NAME="${LDAP_CONTAINER_NAME:-openldap-poc}"
LDAP_URL="${LDAP_URL:-ldaps://localhost:636}"
BIND_DN="${LDAP_BIND_DN:-cn=admin,dc=larioja,dc=org}"
BIND_PASSWORD="${LDAP_BIND_PASSWORD:-admin}"

echo "This will DELETE all LDAP data under:"
echo "  - ${DATA_DIR_LDAP}"
echo "  - ${DATA_DIR_SLAPD}"
echo
read -r -p "Type 'RESET' to continue: " CONFIRM
if [[ "${CONFIRM}" != "RESET" ]]; then
  echo "Aborted."
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" stop openldap

rm -rf "${DATA_DIR_LDAP}" "${DATA_DIR_SLAPD}"
mkdir -p "${DATA_DIR_LDAP}" "${DATA_DIR_SLAPD}"

docker compose -f "${COMPOSE_FILE}" up -d openldap

echo "Waiting for OpenLDAP container to be running..."
for i in {1..30}; do
  if docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null | grep -q true; then
    break
  fi
  sleep 1
done

echo "Waiting for slapd to accept LDAPS connections..."
LDAP_READY=0
for i in {1..30}; do
  if docker exec -i "${CONTAINER_NAME}" env LDAPTLS_REQCERT=never \
      ldapwhoami -x -o nettimeout=5 -H "${LDAP_URL}" -D "${BIND_DN}" -w "${BIND_PASSWORD}" \
      >/dev/null 2>&1; then
    LDAP_READY=1
    break
  fi
  echo "  attempt ${i}/30 failed; retrying..."
  sleep 2
done

if [[ "${LDAP_READY}" != "1" ]]; then
  echo "ERROR: slapd did not accept LDAPS connections at ${LDAP_URL} after 30 attempts." >&2
  echo "Container logs (tail):" >&2
  docker logs --tail 200 "${CONTAINER_NAME}" >&2 || true
  exit 1
fi

if [[ -x "${SCRIPT_DIR}/ldap-init-ous.sh" ]]; then
  "${SCRIPT_DIR}/ldap-init-ous.sh"
elif [[ -x "${SCRIPT_DIR}/../ldap-init-ous.sh" ]]; then
  "${SCRIPT_DIR}/../ldap-init-ous.sh"
else
  echo "ERROR: ldap-init-ous.sh not found next to ldap-reset.sh" >&2
  exit 1
fi

echo "LDAP reset completed."

