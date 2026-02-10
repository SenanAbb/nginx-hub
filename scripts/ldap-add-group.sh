#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <group-cn> [description] [gidNumber]" >&2
  exit 2
fi

GROUP_NAME="$1"
GROUP_DESC="${2:-}"
GID_NUMBER="${3:-}"

CONTAINER_NAME="${LDAP_CONTAINER_NAME:-openldap-poc}"
LDAP_URL="${LDAP_URL:-ldaps://localhost:636}"
BIND_DN="${LDAP_BIND_DN:-cn=admin,dc=larioja,dc=org}"
BIND_PASSWORD="${LDAP_BIND_PASSWORD:-admin}"
GROUPS_DN_BASE="${LDAP_GROUPS_DN_BASE:-ou=groups,dc=larioja,dc=org}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/ldap-init-ous.sh" >/dev/null

if [[ -z "${GID_NUMBER}" ]]; then
  GID_NUMBER="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H '${LDAP_URL}' -D '${BIND_DN}' -w '${BIND_PASSWORD}' -b '${GROUPS_DN_BASE}' '(objectClass=posixGroup)' gidNumber | awk '/^gidNumber:/{if(\$2>m)m=\$2} END{print (m?m+1:10000)}'")"
fi

cat <<LDIF | docker exec -i "${CONTAINER_NAME}" ldapadd -x \
  -H "${LDAP_URL}" \
  -D "${BIND_DN}" \
  -w "${BIND_PASSWORD}"
dn: cn=${GROUP_NAME},${GROUPS_DN_BASE}
objectClass: top
objectClass: posixGroup
objectClass: extensibleObject
cn: ${GROUP_NAME}
${GROUP_DESC:+description: ${GROUP_DESC}}
gidNumber: ${GID_NUMBER}
LDIF

echo "Created group cn=${GROUP_NAME},${GROUPS_DN_BASE} (gidNumber=${GID_NUMBER})"
