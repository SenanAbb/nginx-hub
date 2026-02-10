#!/usr/bin/env bash
set -euo pipefail

# Script para resetear LDAP y añadir grupos/usuarios de prueba
# Reutiliza los scripts existentes de LDAP

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "LDAP Full Reset and Init Script"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. RESET LDAP (delete existing data)"
echo "  2. Ensure memberOf/refint overlays are enabled"
echo "  3. Create groups"
echo "  4. Create users"
echo "  5. Assign users to groups"
echo ""

# Verificar que los scripts necesarios existen
REQUIRED_SCRIPTS=(
    "ldap-reset.sh"
    "ldap-add-user.sh"
    "ldap-add-group.sh"
)

for script in "${REQUIRED_SCRIPTS[@]}"; do
    if [[ ! -x "${SCRIPT_DIR}/${script}" ]]; then
        echo "ERROR: Required script not found or not executable: ${script}" >&2
        exit 1
    fi
done

CONTAINER_NAME="${LDAP_CONTAINER_NAME:-openldap-poc}"
LDAP_CONFIG_PASSWORD_ENV="${LDAP_CONFIG_PASSWORD:-config_admin}"

ensure_memberof_overlays() {
    local module_dn
    local db_dn
    local memberof_dn

    module_dn="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b 'cn=config' '(objectClass=olcModuleList)' dn 2>/dev/null | awk '/^dn:/{print \$2; exit}'")"
    db_dn="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b 'cn=config' '(olcSuffix=dc=larioja,dc=org)' dn 2>/dev/null | awk '/^dn:/{print \$2; exit}'")"
    if [[ -z "${db_dn}" ]]; then
        db_dn="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b 'cn=config' '(olcDatabase=*)' dn olcDatabase 2>/dev/null | awk '/^dn: olcDatabase=\\{[0-9]+\\}(mdb|hdb),cn=config/{print \$2; exit}'")"
    fi

    if [[ -z "${module_dn}" || -z "${db_dn}" ]]; then
        echo "WARN: could not determine cn=config DNs; skipping memberOf setup" >&2
        return 0
    fi

    docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
      -H ldaps://localhost:636 \
      -D "cn=admin,cn=config" \
      -w "${LDAP_CONFIG_PASSWORD_ENV}" >/dev/null 2>&1 <<LDIF || true
dn: ${module_dn}
changetype: modify
add: olcModuleLoad
olcModuleLoad: memberof
LDIF

    docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
      -H ldaps://localhost:636 \
      -D "cn=admin,cn=config" \
      -w "${LDAP_CONFIG_PASSWORD_ENV}" >/dev/null 2>&1 <<LDIF || true
dn: ${module_dn}
changetype: modify
add: olcModuleLoad
olcModuleLoad: refint
LDIF

    if ! docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b '${db_dn}' '(olcOverlay=memberof)' dn 2>/dev/null | grep -q '^dn:'"; then
        local memberof_idx
        memberof_idx="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b '${db_dn}' '(objectClass=olcOverlayConfig)' dn 2>/dev/null | awk -F'[{}]' '/^dn: olcOverlay=\\{[0-9]+\\}/{if(\$2>m)m=\$2} END{print (m==\"\"?0:m+1)}'")"

        docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
          -H ldaps://localhost:636 \
          -D "cn=admin,cn=config" \
          -w "${LDAP_CONFIG_PASSWORD_ENV}" >/dev/null 2>&1 <<LDIF || true
dn: olcOverlay={${memberof_idx}}memberof,${db_dn}
changetype: add
objectClass: olcOverlayConfig
objectClass: olcMemberOf
olcOverlay: {${memberof_idx}}memberof
olcMemberOfDangling: ignore
olcMemberOfRefInt: TRUE
olcMemberOfGroupOC: posixGroup
olcMemberOfMemberAD: member
olcMemberOfMemberOfAD: memberOf
LDIF
    fi

    memberof_dn="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b '${db_dn}' '(olcOverlay=memberof)' dn 2>/dev/null | awk '/^dn:/{print \$2; exit}'")"
    if [[ -n "${memberof_dn}" ]]; then
        docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
          -H ldaps://localhost:636 \
          -D "cn=admin,cn=config" \
          -w "${LDAP_CONFIG_PASSWORD_ENV}" >/dev/null 2>&1 <<LDIF || true
dn: ${memberof_dn}
changetype: modify
replace: olcMemberOfGroupOC
olcMemberOfGroupOC: posixGroup
-
replace: olcMemberOfMemberAD
olcMemberOfMemberAD: member
-
replace: olcMemberOfMemberOfAD
olcMemberOfMemberOfAD: memberOf
LDIF
    fi

    if ! docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b '${db_dn}' '(olcOverlay=refint)' dn 2>/dev/null | grep -q '^dn:'"; then
        local refint_idx
        refint_idx="$(docker exec -i "${CONTAINER_NAME}" sh -lc "ldapsearch -x -LLL -H ldaps://localhost:636 -D 'cn=admin,cn=config' -w '${LDAP_CONFIG_PASSWORD_ENV}' -b '${db_dn}' '(objectClass=olcOverlayConfig)' dn 2>/dev/null | awk -F'[{}]' '/^dn: olcOverlay=\\{[0-9]+\\}/{if(\$2>m)m=\$2} END{print (m==\"\"?0:m+1)}'")"

        docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
          -H ldaps://localhost:636 \
          -D "cn=admin,cn=config" \
          -w "${LDAP_CONFIG_PASSWORD_ENV}" >/dev/null 2>&1 <<LDIF || true
dn: olcOverlay={${refint_idx}}refint,${db_dn}
changetype: add
objectClass: olcOverlayConfig
objectClass: olcRefintConfig
olcOverlay: {${refint_idx}}refint
olcRefintAttribute: owner
olcRefintAttribute: manager
olcRefintAttribute: uniqueMember
olcRefintAttribute: member
olcRefintAttribute: memberOf
LDIF
    fi
}

echo ""
echo "[STEP 0] Resetting LDAP directory (deleting existing data)..."
echo "  - container: ${CONTAINER_NAME}"
echo ""
"${SCRIPT_DIR}/ldap-reset.sh"

echo ""
echo "[STEP 0b] Ensuring memberOf/refint overlays are enabled (cn=config)..."
echo "  - this is required so memberOf is populated automatically"
echo ""
ensure_memberof_overlays

# 1. Crear grupos necesarios
echo ""
echo "[STEP 1] Creating LDAP groups (posixGroup)..."
echo "  - groups will be created under ou=groups"
echo ""

LDAP_GROUP_SPECS=(
    "ambari_admin:Ambari Administrators:20001"
    "ambari_user:Ambari Users:20002"
    "ambari_cluster_admin:Ambari Cluster Administrators:20003"
    "ambari_cluster_operator:Ambari Cluster Operators:20004"
    "ambari_cluster_user:Ambari Cluster Users:20005"
    "ambari_service_admin:Ambari Service Administrators:20006"
    "ambari_service_operator:Ambari Service Operators:20007"
    "ambari_read_only:Ambari Read Only:20008"
    "ranger_admin:Ranger Administrators:20009"
    "ranger_user:Ranger Users:20010"
    "hue_admin:Hue Administrators:20012"
    "hue_user:Hue Users:20013"
    "sp_admin:LDAP Admin UI Administrators:20011"
)

for group_spec in "${LDAP_GROUP_SPECS[@]}"; do
    IFS=':' read -r group_cn group_desc group_gid <<< "${group_spec}"
    if [[ -z "${group_cn}" || -z "${group_gid}" ]]; then
        echo "ERROR: invalid group spec: '${group_spec}'" >&2
        exit 1
    fi
    if [[ ! "${group_gid}" =~ ^[0-9]+$ ]]; then
        echo "ERROR: invalid gidNumber '${group_gid}' for group '${group_cn}'" >&2
        exit 1
    fi
    echo "Creating group: cn=${group_cn} (gidNumber=${group_gid})"
    "${SCRIPT_DIR}/ldap-add-group.sh" "${group_cn}" "${group_desc}" "${group_gid}"
done

# 2. Crear usuarios
echo ""
echo "[STEP 2] Creating LDAP users..."
echo "  - only the minimal admin user is created: sp_admin"
echo ""

# Usuario para LDAP Admin UI
echo "Creating user: uid=sp_admin"
"${SCRIPT_DIR}/ldap-add-user.sh" "sp_admin" "SP" "Admin" "sp_admin" "sp_admin@larioja.org" "10011" "10001"

# 3. Añadir usuarios a grupos
echo ""
echo "[STEP 3] Assigning users to groups (memberUid + member)..."
echo ""

CONTAINER_NAME="${LDAP_CONTAINER_NAME:-openldap-poc}"
LDAP_URL="${LDAP_URL:-ldaps://localhost:636}"
BIND_DN="${LDAP_BIND_DN:-cn=admin,dc=larioja,dc=org}"
BIND_PASSWORD="${LDAP_BIND_PASSWORD:-admin}"
GROUPS_DN_BASE="${LDAP_GROUPS_DN_BASE:-ou=groups,dc=larioja,dc=org}"
PEOPLE_DN_BASE="${LDAP_PEOPLE_DN_BASE:-ou=people,dc=larioja,dc=org}"

# Función para añadir usuario a grupo
add_user_to_group() {
    local user_uid="$1"
    local group_cn="$2"
    
    echo "  - add uid=${user_uid} -> cn=${group_cn}"

    cat <<LDIF | docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
      -H "${LDAP_URL}" \
      -D "${BIND_DN}" \
      -w "${BIND_PASSWORD}" >/dev/null 2>&1 || true
dn: cn=${group_cn},${GROUPS_DN_BASE}
changetype: modify
add: objectClass
objectClass: extensibleObject
LDIF
    
    cat <<LDIF | docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
      -H "${LDAP_URL}" \
      -D "${BIND_DN}" \
      -w "${BIND_PASSWORD}" >/dev/null 2>&1 || true
dn: cn=${group_cn},${GROUPS_DN_BASE}
changetype: modify
delete: memberUid
memberUid: ${user_uid}
-
delete: member
member: uid=${user_uid},${PEOPLE_DN_BASE}
LDIF

    local modify_out
    modify_out="$(cat <<LDIF | docker exec -i "${CONTAINER_NAME}" ldapmodify -x \
      -H "${LDAP_URL}" \
      -D "${BIND_DN}" \
      -w "${BIND_PASSWORD}" 2>&1
dn: cn=${group_cn},${GROUPS_DN_BASE}
changetype: modify
add: memberUid
memberUid: ${user_uid}
-
add: member
member: uid=${user_uid},${PEOPLE_DN_BASE}
LDIF
 )" || {
        if echo "${modify_out}" | grep -qiE 'Type or value exists|already exists'; then
            return 0
        fi
        echo "${modify_out}" >&2
        return 1
    }
}


# Usuario de LDAP Admin UI
add_user_to_group "sp_admin" "sp_admin"
add_user_to_group "sp_admin" "ambari_cluster_admin"
add_user_to_group "sp_admin" "ranger_admin"
add_user_to_group "sp_admin" "hue_admin"

echo ""
echo "=========================================="
echo "✓ LDAP reset + init completed"
echo "=========================================="
echo ""
echo "Users and groups created:"
echo ""
echo "LDAP Admin UI:"
echo "  - sp_admin (groups: sp_admin, ambari_cluster_admin, ranger_admin, hue_admin)"
echo ""
echo "All passwords are set to the username (e.g., sp_admin:sp_admin)"
echo ""
echo "Next steps:"
echo "  1. Verify memberOf attribute is populated: ldapsearch -x ... memberOf"
echo "  2. Sync users to Ranger: restart ranger-usersync"
echo "  3. Sync users to Ambari: ambari-server sync-ldap --all"
echo ""
