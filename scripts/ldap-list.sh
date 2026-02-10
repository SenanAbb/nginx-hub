#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${LDAP_CONTAINER_NAME:-openldap-poc}"
LDAP_URL="${LDAP_URL:-ldaps://localhost:636}"
BIND_DN="${LDAP_BIND_DN:-cn=admin,dc=larioja,dc=org}"
BIND_PASSWORD="${LDAP_BIND_PASSWORD:-admin}"
BASE_DN="${LDAP_BASE_DN:-dc=larioja,dc=org}"

exec docker exec -i "${CONTAINER_NAME}" ldapsearch -x -LLL \
  -H "${LDAP_URL}" \
  -D "${BIND_DN}" \
  -w "${BIND_PASSWORD}" \
  -b "${BASE_DN}" \
  '(|(objectClass=organizationalUnit)(objectClass=posixGroup)(objectClass=inetOrgPerson))'
