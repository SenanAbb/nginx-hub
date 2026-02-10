#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <uid> <givenName> <sn> [password] [mail] [uidNumber] [gidNumber]" >&2
  exit 2
fi

USER_UID="$1"
GIVEN_NAME="$2"
SN="$3"
PASSWORD="${4:-}"
MAIL="${5:-${USER_UID}@larioja.org}"
UID_NUMBER="${6:-}"
GID_NUMBER="${7:-10001}"

CONTAINER_NAME="${LDAP_CONTAINER_NAME:-openldap-poc}"
LDAP_URL="${LDAP_URL:-ldaps://localhost:636}"
BIND_DN="${LDAP_BIND_DN:-cn=admin,dc=larioja,dc=org}"
BIND_PASSWORD="${LDAP_BIND_PASSWORD:-admin}"
PEOPLE_DN_BASE="${LDAP_PEOPLE_DN_BASE:-ou=people,dc=larioja,dc=org}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/ldap-init-ous.sh" >/dev/null

if [[ -z "${PASSWORD}" ]]; then
  PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20)"
fi

if [[ -z "${UID_NUMBER}" ]]; then
  UID_NUMBER="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H '${LDAP_URL}' -D '${BIND_DN}' -w '${BIND_PASSWORD}' -b '${PEOPLE_DN_BASE}' '(objectClass=posixAccount)' uidNumber | awk '/^uidNumber:/{if(\$2>m)m=\$2} END{print (m?m+1:10000)}'")"
fi

PASSWORD_HASH="$(docker exec -i "${CONTAINER_NAME}" slappasswd -s "${PASSWORD}" | tr -d '\r\n')"

cat <<LDIF | docker exec -i "${CONTAINER_NAME}" ldapadd -x \
  -H "${LDAP_URL}" \
  -D "${BIND_DN}" \
  -w "${BIND_PASSWORD}"
dn: uid=${USER_UID},${PEOPLE_DN_BASE}
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: ${USER_UID}
cn: ${GIVEN_NAME} ${SN}
sn: ${SN}
givenName: ${GIVEN_NAME}
mail: ${MAIL}
uidNumber: ${UID_NUMBER}
gidNumber: ${GID_NUMBER}
homeDirectory: /home/${USER_UID}
loginShell: /bin/bash
userPassword: ${PASSWORD_HASH}
LDIF

echo "Created user uid=${USER_UID},${PEOPLE_DN_BASE} (uidNumber=${UID_NUMBER}, gidNumber=${GID_NUMBER})"
echo "Password: ${PASSWORD}"
