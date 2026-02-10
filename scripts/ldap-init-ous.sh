#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${LDAP_CONTAINER_NAME:-openldap-poc}"
LDAP_URL="${LDAP_URL:-ldaps://localhost:636}"
BIND_DN="${LDAP_BIND_DN:-cn=admin,dc=larioja,dc=org}"
BIND_PASSWORD="${LDAP_BIND_PASSWORD:-admin}"

BASE_DN="${LDAP_BASE_DN:-dc=larioja,dc=org}"
BASE_DC="${LDAP_BASE_DC:-larioja}"
BASE_O="${LDAP_BASE_O:-ENO Data Lake}"

set +e
docker exec -i "${CONTAINER_NAME}" ldapsearch -x -LLL \
  -H "${LDAP_URL}" \
  -D "${BIND_DN}" \
  -w "${BIND_PASSWORD}" \
  -b "${BASE_DN}" -s base "(objectClass=*)" dn >/dev/null 2>&1
BASE_EXISTS=$?
set -e

if [[ "${BASE_EXISTS}" != "0" ]]; then
  set +e
  cat <<LDIF | docker exec -i "${CONTAINER_NAME}" ldapadd -x -H "${LDAP_URL}" -D "${BIND_DN}" -w "${BIND_PASSWORD}" >/dev/null 2>&1
dn: ${BASE_DN}
objectClass: top
objectClass: dcObject
objectClass: organization
o: ${BASE_O}
dc: ${BASE_DC}
LDIF
  set -e
fi

set +e
cat <<LDIF | docker exec -i "${CONTAINER_NAME}" ldapadd -x -H "${LDAP_URL}" -D "${BIND_DN}" -w "${BIND_PASSWORD}" >/dev/null 2>&1
dn: ou=people,${BASE_DN}
objectClass: top
objectClass: organizationalUnit
ou: people

dn: ou=groups,${BASE_DN}
objectClass: top
objectClass: organizationalUnit
ou: groups
LDIF
set -e
