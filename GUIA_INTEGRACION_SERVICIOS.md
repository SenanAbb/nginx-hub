# Guía de Integración de Servicios al Hub de Conexiones

## Tabla de Contenidos

1. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
2. [Requisitos Previos](#requisitos-previos)
3. [Pasos para Integrar un Nuevo Servicio](#pasos-para-integrar-un-nuevo-servicio)
4. [Componentes del Sistema](#componentes-del-sistema)
5. [Ejemplos de Integración](#ejemplos-de-integración)
6. [Troubleshooting](#troubleshooting)
7. [Checklist de Integración](#checklist-de-integración)

---

## Visión General de la Arquitectura

El hub de conexiones está diseñado para proporcionar autenticación centralizada (SSO) y gestión de usuarios/grupos mediante LDAP para múltiples servicios de Big Data. La arquitectura consta de los siguientes componentes principales:

```
┌─────────────────────────────────────────────────────────────────┐
│                          USUARIO                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  NGINX (Proxy) │
                    │  Puertos:      │
                    │  - 444: Hub    │
                    │  - 445: Ambari │
                    │  - 446: Ranger │
                    │  - 400: Admin  │
                    └────────┬───────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌──────────────┐    ┌──────────────┐
│ OAuth2-Proxy  │    │     Knox     │    │ LDAP Admin   │
│   (General)   │    │   (KnoxSSO)  │    │      UI      │
└───────┬───────┘    └──────┬───────┘    └──────┬───────┘
        │                   │                    │
        └───────────────────┼────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   Keycloak    │
                    │   (IdP OIDC)  │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   OpenLDAP    │
                    │  (Usuarios y  │
                    │    Grupos)    │
                    └───────────────┘
```

### Flujo de Autenticación

1. **Usuario accede al Hub (puerto 444)**: OAuth2-Proxy valida la sesión
2. **Si no hay sesión**: Redirige a Keycloak para autenticación
3. **Keycloak autentica**: Contra CAS de La Rioja (IdP externo)
4. **Usuario accede a servicio específico** (ej: Ambari en puerto 445):
   - Si el servicio soporta Knox SSO: Redirige a Knox
   - Knox valida con Keycloak (reutiliza sesión KEYCLOAK_SESSION)
   - Knox genera JWT (`hadoop-jwt` cookie)
   - Servicio valida JWT y permite acceso

---

## Requisitos Previos

Antes de integrar un nuevo servicio, asegúrate de tener:

### Información del Servicio

- **Nombre del servicio**: Identificador único (ej: `superset`, `hue`, `atlas`)
- **Host y puerto**: Dónde está desplegado el servicio
- **Protocolo**: HTTP o HTTPS
- **Capacidades de autenticación**: 
  - ¿Soporta LDAP nativo?
  - ¿Soporta SAML/OIDC?
  - ¿Soporta Knox SSO (JWT)?
  - ¿Tiene API para sincronización de usuarios?

### Acceso al Sistema

- Acceso SSH a los servidores del hub
- Permisos para modificar configuraciones de Docker Compose
- Acceso al servidor donde corre el servicio a integrar

### Planificación de Grupos y Roles

- Definir grupos LDAP necesarios (ej: `servicio_admin`, `servicio_user`)
- Mapear grupos LDAP a roles internos del servicio
- Definir GID únicos para cada grupo (rango recomendado: 20000+)

---

## Pasos para Integrar un Nuevo Servicio

### Paso 1: Definir Usuarios y Grupos en LDAP

**Ubicación**: `scripts/full-reset-and-init.sh`

#### 1.1. Añadir Grupos al Array `LDAP_GROUP_SPECS`

```bash
LDAP_GROUP_SPECS=(
    # ... grupos existentes ...
    "nombre_servicio_admin:Descripción Admin:20XXX"
    "nombre_servicio_user:Descripción User:20YYY"
    "nombre_servicio_operator:Descripción Operator:20ZZZ"
)
```

**Formato**: `"cn_del_grupo:Descripción del Grupo:GID"`

**Convenciones de nomenclatura**:
- Usar `_` como separador (no `-`)
- Prefijo con nombre del servicio
- Sufijo con el rol: `_admin`, `_user`, `_operator`, `_read_only`, etc.
- GID único en rango 20000-29999

**Ejemplo para Superset**:
```bash
"superset_admin:Superset Administrators:20020"
"superset_user:Superset Users:20021"
"superset_viewer:Superset Viewers:20022"
```

#### 1.2. Crear Usuarios de Prueba (Opcional pero Recomendado)

```bash
# Después de la sección de creación de usuarios existentes
echo "Creating user: test_servicio_admin"
"${SCRIPT_DIR}/ldap-add-user.sh" "test_servicio_admin" "Test Servicio" "Admin" \
    "test_servicio_admin" "test_servicio_admin@larioja.org" "10XXX" "10001"

echo "Creating user: test_servicio_user"
"${SCRIPT_DIR}/ldap-add-user.sh" "test_servicio_user" "Test Servicio" "User" \
    "test_servicio_user" "test_servicio_user@larioja.org" "10YYY" "10001"
```

**Parámetros de `ldap-add-user.sh`**:
1. UID (username)
2. Nombre
3. Apellido
4. Contraseña
5. Email
6. UID Number (único, rango 10000+)
7. GID Number (grupo primario, típicamente 10001)

#### 1.3. Asignar Usuarios a Grupos

```bash
# En la sección "3. Añadir usuarios a grupos"
add_user_to_group "test_servicio_admin" "nombre_servicio_admin"
add_user_to_group "test_servicio_user" "nombre_servicio_user"
```

#### 1.4. Ejecutar el Script de Inicialización

```bash
cd /home/sanan.abbasov/web/ngx-hub
export LDAP_CONTAINER_NAME="openldap-poc"
export LDAP_CONFIG_PASSWORD="config_admin"
export LDAP_BIND_PASSWORD="admin"
./scripts/full-reset-and-init.sh
```

**⚠️ ADVERTENCIA**: Este script resetea completamente el LDAP. Solo ejecutar en desarrollo.

---

### Paso 2: Configurar Nginx para el Nuevo Servicio

**Ubicación**: `nginx-oauth2/conf.d/default.conf`

#### 2.1. Asignar un Puerto Único

Puertos actualmente en uso:
- `444`: Hub principal
- `445`: Ambari
- `446`: Ranger
- `400`: LDAP Admin UI

Selecciona un puerto libre (ej: `447`, `448`, etc.)

#### 2.2. Crear Bloque Server en Nginx

```nginx
# ============================================
# NOMBRE_SERVICIO (puerto XXX)
# ============================================
server {
    listen XXX ssl http2;
    server_name srv-enodl-des-03.larioja.org;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    ssl_trusted_certificate /etc/nginx/certs/ca-cert.pem;

    set $forwarded_port XXX;

    resolver 127.0.0.11 valid=10s;
    resolver_timeout 5s;

    large_client_header_buffers 4 32k;

    # Proxy pass al servicio
    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $forwarded_port;

        proxy_http_version 1.1;
        proxy_read_timeout 300s;
        proxy_buffering off;

        # Ajustar según el servicio
        proxy_pass http://host-del-servicio:puerto-del-servicio;
    }

    location = /logout { 
        return 302 https://$host:444/logout; 
    }
}
```

#### 2.3. Exponer el Puerto en Docker Compose

**Ubicación**: `docker-compose.yml`

En el servicio `nginx`, añadir el puerto:

```yaml
nginx:
  # ... configuración existente ...
  ports:
    - "80:80"
    - "444:443"
    - "445:445"
    - "446:446"
    - "400:400"
    - "XXX:XXX"  # Nuevo puerto para tu servicio
```

#### 2.4. Añadir Endpoint SSO en el Hub (Opcional)

En el bloque `server` del puerto 443 (hub principal):

```nginx
location = /sso/nombre_servicio {
    auth_request /oauth2/auth;
    error_page 401 = @oauth2_login;
    return 302 /knoxsso/api/v1/websso?originalUrl=https%3A%2F%2Fsrv-enodl-des-03.larioja.org%3AXXX%2F;
}
```

Esto permite que desde el hub principal se pueda hacer SSO al nuevo servicio.

---

### Paso 3: Conectar el Servicio con SSO

Existen tres métodos principales de integración SSO:

#### Opción A: Knox SSO (Recomendado para Servicios Hadoop)

**Requisitos**: El servicio debe soportar autenticación mediante JWT.

**Configuración en el servicio**:

1. **Habilitar Knox SSO** en la configuración del servicio
2. **Configurar la URL de Knox**: `https://srv-enodl-des-03.larioja.org:444/knoxsso/api/v1/websso`
3. **Configurar el nombre de la cookie**: `hadoop-jwt`
4. **Configurar la clave pública de Knox** para validar el JWT

**Ejemplo para Ambari** (`ambari.properties`):
```properties
authentication.jwt.enabled=true
authentication.jwt.providerUrl=https://srv-enodl-des-03.larioja.org:444/knoxsso/api/v1/websso
authentication.jwt.publicKey=<clave-publica-knox>
authentication.jwt.cookieName=hadoop-jwt
authentication.jwt.audiences=*
```

**Actualizar Knox Topology** (si es necesario):

Editar `knox/topologies/knoxsso.xml` para añadir el nuevo servicio a la whitelist:

```xml
<param>
    <name>knoxsso.redirect.whitelist.regex</name>
    <value>^https:\/\/srv-enodl-des-03\.larioja\.org(:444|:445|:446|:XXX)?\/.*$</value>
</param>
```

#### Opción B: OIDC Directo con Keycloak

**Requisitos**: El servicio debe soportar OIDC/OAuth2.

**Pasos**:

1. **Crear un cliente en Keycloak**:
   - Acceder a Keycloak Admin Console
   - Realm: `enodl-poc-des`
   - Crear nuevo cliente OIDC
   - Configurar Redirect URIs
   - Obtener Client ID y Client Secret

2. **Configurar el servicio** con los parámetros OIDC:
   ```
   OIDC Issuer: http://keycloak:8080/realms/enodl-poc-des
   Client ID: nombre-servicio
   Client Secret: <secret>
   Redirect URI: https://srv-enodl-des-03.larioja.org:XXX/callback
   Scopes: openid email profile roles
   ```

3. **Mapear claims**:
   - Username claim: `preferred_username`
   - Email claim: `email`
   - Groups claim: `groups`

#### Opción C: OAuth2-Proxy Dedicado (Para Servicios Sin SSO Nativo)

**Cuándo usar**: El servicio no soporta OIDC ni Knox SSO.

**Pasos**:

1. **Crear un nuevo servicio oauth2-proxy** en `docker-compose.yml`:

```yaml
oauth2-proxy-servicio:
  image: quay.io/oauth2-proxy/oauth2-proxy:v7.6.0
  container_name: oauth2-proxy-servicio
  hostname: oauth2-proxy-servicio.srv-enodl-des-03.larioja.org
  environment:
    OAUTH2_PROXY_PROVIDER: "oidc"
    OAUTH2_PROXY_HTTP_ADDRESS: "0.0.0.0:4180"
    OAUTH2_PROXY_PROXY_PREFIX: "/oauth2-servicio"
    OAUTH2_PROXY_REDIRECT_URL: "https://srv-enodl-des-03.larioja.org:XXX/oauth2-servicio/callback"
    
    OAUTH2_PROXY_CLIENT_ID: "oauth2-proxy-servicio"
    OAUTH2_PROXY_CLIENT_SECRET: "<secret-de-keycloak>"
    
    OAUTH2_PROXY_OIDC_ISSUER_URL: "http://keycloak:8080/realms/enodl-poc-des"
    OAUTH2_PROXY_SCOPE: "openid email profile roles"
    OAUTH2_PROXY_OIDC_GROUPS_CLAIM: "groups"
    
    # Filtrar por grupos (opcional)
    OAUTH2_PROXY_ALLOWED_GROUPS: "servicio_admin,servicio_user"
    
    OAUTH2_PROXY_COOKIE_NAME: "_oauth2_proxy_servicio"
    OAUTH2_PROXY_COOKIE_SECRET: "<generar-con-openssl>"
    OAUTH2_PROXY_SESSION_STORE_TYPE: "redis"
    OAUTH2_PROXY_REDIS_CONNECTION_URL: "redis://redis:6379"
    
    # ... otras configuraciones similares a oauth2-proxy general
  networks:
    - nginx-oauth2-net
  depends_on:
    - keycloak
    - redis
```

2. **Configurar Nginx** para usar el oauth2-proxy dedicado:

```nginx
upstream oauth2_proxy_servicio_upstream {
    server oauth2-proxy-servicio:4180;
    keepalive 16;
}

server {
    listen XXX ssl http2;
    # ...
    
    location = /oauth2-servicio/auth {
        internal;
        proxy_pass http://oauth2_proxy_servicio_upstream/oauth2-servicio/auth;
        # ... configuración de proxy
    }
    
    location /oauth2-servicio/ {
        proxy_pass http://oauth2_proxy_servicio_upstream;
        # ... configuración de proxy
    }
    
    location / {
        auth_request /oauth2-servicio/auth;
        error_page 401 = @servicio_login;
        # ... proxy al servicio
    }
    
    location @servicio_login {
        internal;
        return 302 https://$host:XXX/oauth2-servicio/start?rd=$request_uri;
    }
}
```

---

### Paso 4: Conectar el Servicio al LDAP

La mayoría de servicios Big Data soportan LDAP para autenticación y autorización.

#### 4.1. Configuración LDAP Básica

**Parámetros comunes**:

```properties
# Servidor LDAP
ldap.url=ldaps://172.16.99.252:636
ldap.bind.dn=cn=admin,dc=larioja,dc=org
ldap.bind.password=admin

# Base DN
ldap.base.dn=dc=larioja,dc=org
ldap.user.base.dn=ou=people,dc=larioja,dc=org
ldap.group.base.dn=ou=groups,dc=larioja,dc=org

# Atributos de búsqueda
ldap.user.search.filter=(uid={0})
ldap.user.object.class=inetOrgPerson
ldap.group.search.filter=(member={0})
ldap.group.object.class=posixGroup

# Atributos de mapeo
ldap.user.name.attribute=uid
ldap.user.email.attribute=mail
ldap.group.name.attribute=cn
ldap.group.member.attribute=member
```

#### 4.2. Sincronización de Grupos a Roles

Cada servicio tiene su propio mecanismo de mapeo. Ejemplos:

**Ambari**:
```properties
authorization.ldap.groupSearchFilter=(member={0})
authorization.ldap.groupNamingAttr=cn
authorization.ldap.groupMembershipAttr=member
```

Luego ejecutar:
```bash
ambari-server sync-ldap --all
```

**Ranger**:
Configurar `ranger-ugsync-site.xml`:
```xml
<property>
  <name>ranger.usersync.ldap.url</name>
  <value>ldaps://172.16.99.252:636</value>
</property>
<property>
  <name>ranger.usersync.group.searchbase</name>
  <value>ou=groups,dc=larioja,dc=org</value>
</property>
```

#### 4.3. Mapeo de Grupos LDAP a Roles del Servicio

Crear una tabla de mapeo:

| Grupo LDAP | Rol en el Servicio | Permisos |
|------------|-------------------|----------|
| `servicio_admin` | `ADMIN` | Todos los permisos |
| `servicio_operator` | `OPERATOR` | Operaciones, sin configuración |
| `servicio_user` | `USER` | Solo lectura/uso básico |
| `servicio_viewer` | `VIEWER` | Solo visualización |

**Implementación**: Depende del servicio. Algunos soportan mapeo automático, otros requieren configuración manual o scripts.

---

### Paso 5: Implementar Sincronización Remota desde LDAP Admin UI

El LDAP Admin UI permite sincronizar usuarios/grupos del LDAP a los servicios de forma remota mediante botones.

#### 5.1. Arquitectura de Sincronización

```
┌──────────────────┐         ┌─────────────┐         ┌──────────────────┐
│  LDAP Admin UI   │ ──POST─→│    Redis    │ ←─POLL─ │  Sync Worker     │
│  (Frontend)      │         │   (Queue)   │         │  (Background)    │
└──────────────────┘         └─────────────┘         └────────┬─────────┘
                                                               │
                                                               │ SSH
                                                               ▼
                                                      ┌─────────────────┐
                                                      │  Servidor del   │
                                                      │    Servicio     │
                                                      └─────────────────┘
```

**Flujo**:
1. Usuario hace clic en botón "Sync Servicio" en LDAP Admin UI
2. Frontend llama a `/api/sync` con el target
3. Backend marca flag `sync:dirty:servicio` en Redis
4. Sync Worker detecta el flag y ejecuta comando SSH en el servidor remoto
5. Worker limpia el flag al completar

#### 5.2. Actualizar Sync Queue Library

**Ubicación**: `ldap-admin-ui/lib/sync-queue.ts`

Añadir el nuevo servicio al tipo `SyncTarget`:

```typescript
type SyncTarget = "ambari" | "ranger" | "nombre_servicio";
```

Actualizar la función `inferTargetsFromGroupCn`:

```typescript
export function inferTargetsFromGroupCn(groupCn: string): SyncTarget[] {
  const cn = (groupCn ?? "").trim();
  const targets = new Set<SyncTarget>();

  if (!cn) return [];

  if (cn.startsWith("ambari_")) targets.add("ambari");
  if (cn.startsWith("ranger_")) targets.add("ranger");
  if (cn.startsWith("nombre_servicio_")) targets.add("nombre_servicio");

  return Array.from(targets);
}
```

Añadir constante de Redis key:

```typescript
export const KEY_DIRTY_NOMBRE_SERVICIO = "sync:dirty:nombre_servicio";
```

Actualizar `enqueueSync`:

```typescript
if (uniqueTargets.includes("ambari")) {
  await client.set(KEY_DIRTY_AMBARI, "1");
}
if (uniqueTargets.includes("ranger")) {
  await client.set(KEY_DIRTY_RANGER, "1");
}
if (uniqueTargets.includes("nombre_servicio")) {
  await client.set(KEY_DIRTY_NOMBRE_SERVICIO, "1");
}
```

#### 5.3. Actualizar Componente de Botones Sync

**Ubicación**: `ldap-admin-ui/components/admin/sync/sync-controls.tsx`

Añadir botón para el nuevo servicio:

```tsx
<Button
  variant="outline"
  onClick={() => run(["nombre_servicio"])}
  disabled={loading !== null}
>
  {loading === "nombre_servicio" ? "Encolando..." : "Sync Nombre Servicio"}
</Button>
```

#### 5.4. Configurar Sync Worker

**Ubicación**: `sync-worker/worker.js`

1. **Añadir constantes de configuración**:

```javascript
const KEY_DIRTY_NOMBRE_SERVICIO = process.env.SYNC_KEY_DIRTY_NOMBRE_SERVICIO ?? "sync:dirty:nombre_servicio";
const NOMBRE_SERVICIO_HOST = process.env.SYNC_NOMBRE_SERVICIO_HOST ?? "servidor-servicio";
const NOMBRE_SERVICIO_COMMAND = process.env.SYNC_NOMBRE_SERVICIO_COMMAND ?? "comando-de-sync";
```

2. **Actualizar función `runOnce`** para detectar el flag:

```javascript
const [dirtyAmbari, dirtyRanger, dirtyNombreServicio] = await Promise.all([
  client.get(KEY_DIRTY_AMBARI),
  client.get(KEY_DIRTY_RANGER),
  client.get(KEY_DIRTY_NOMBRE_SERVICIO),
]);

const shouldNombreServicio = dirtyNombreServicio === "1";
```

3. **Implementar lógica de sincronización**:

```javascript
let nombreServicioOk = !shouldNombreServicio;

if (shouldNombreServicio) {
  try {
    logInfo("nombre_servicio", "starting sync", { cycleId });
    await runSsh(NOMBRE_SERVICIO_HOST, NOMBRE_SERVICIO_COMMAND);
    nombreServicioOk = true;
    await client.del(KEY_DIRTY_NOMBRE_SERVICIO);
    logOk("nombre_servicio", "SYNC OK", { cycleId });
  } catch (e) {
    nombreServicioOk = false;
    logError("nombre_servicio", "SYNC FAILED", e, { cycleId });
  }
}
```

4. **Actualizar condición de éxito**:

```javascript
if (ambariOk && rangerOk && nombreServicioOk) {
  await client.del(KEY_DEBOUNCE_UNTIL);
  logOk("worker", "cycle completed", { cycleId, ambariOk, rangerOk, nombreServicioOk });
} else {
  // ... retry logic
}
```

#### 5.5. Configurar Variables de Entorno

**Ubicación**: `docker-compose.yml`

En el servicio `sync-worker`:

```yaml
sync-worker:
  # ... configuración existente ...
  environment:
    # ... variables existentes ...
    SYNC_NOMBRE_SERVICIO_HOST: "172.16.99.XXX"
    SYNC_NOMBRE_SERVICIO_COMMAND: "comando-de-sincronizacion"
```

#### 5.6. Configurar Acceso SSH

El sync worker necesita acceso SSH sin contraseña al servidor del servicio:

1. **Generar par de claves SSH** (si no existe):
   ```bash
   ssh-keygen -t ed25519 -f sync-worker/ssh/id_ed25519 -N ""
   ```

2. **Copiar clave pública al servidor del servicio**:
   ```bash
   ssh-copy-id -i sync-worker/ssh/id_ed25519.pub ldap-sync@servidor-servicio
   ```

3. **Configurar sudoers** en el servidor del servicio para permitir el comando sin contraseña:
   ```bash
   # En /etc/sudoers.d/ldap-sync
   ldap-sync ALL=(ALL) NOPASSWD: /ruta/al/comando-de-sync
   ```

---

## Componentes del Sistema

### OpenLDAP

**Función**: Directorio centralizado de usuarios y grupos.

**Estructura**:
```
dc=larioja,dc=org
├── ou=people
│   ├── uid=test_ambari_admin
│   ├── uid=test_ranger_admin
│   └── uid=sp_admin
└── ou=groups
    ├── cn=ambari_admin
    ├── cn=ranger_admin
    └── cn=sp_admin
```

**Atributos importantes**:
- `uid`: Username único
- `cn`: Common name (para grupos)
- `memberOf`: Grupos a los que pertenece un usuario (overlay)
- `member`: Miembros de un grupo (DN completo)
- `memberUid`: Miembros de un grupo (solo uid)

**Scripts de gestión**:
- `scripts/ldap-add-user.sh`: Crear usuario
- `scripts/ldap-add-group.sh`: Crear grupo
- `scripts/ldap-reset.sh`: Resetear LDAP (⚠️ PELIGROSO)
- `scripts/full-reset-and-init.sh`: Reset completo + inicialización

### Keycloak

**Función**: Identity Provider (IdP) OIDC que actúa como puente entre CAS de La Rioja y los servicios.

**Realm**: `enodl-poc-des`

**Configuración importante**:
- **Identity Provider**: CAS de La Rioja (`cas-larioja`)
- **User Federation**: OpenLDAP (sincronización de usuarios)
- **Clients**: Cada servicio tiene su propio cliente OIDC
- **Mappers**: Mapean atributos LDAP a claims OIDC (username, email, groups)

**Acceso Admin**:
- URL: `https://srv-enodl-des-03.larioja.org:8443`
- Usuario: `admin`
- Contraseña: `admin`

### Knox (KnoxSSO)

**Función**: Gateway de seguridad que proporciona SSO mediante JWT para servicios Hadoop.

**Topología**: `knoxsso.xml`

**Flujo**:
1. Servicio redirige a Knox: `/knoxsso/api/v1/websso?originalUrl=...`
2. Knox valida sesión con Keycloak (OIDC)
3. Knox genera JWT firmado
4. Knox setea cookie `hadoop-jwt`
5. Knox redirige de vuelta al servicio con el JWT

**Configuración de la cookie**:
- Nombre: `hadoop-jwt`
- Dominio: `.larioja.org`
- Path: `/`
- Secure: `true`
- TTL: 3600000ms (1 hora)

### OAuth2-Proxy

**Función**: Proxy de autenticación OIDC para servicios que no soportan SSO nativo.

**Instancia General** (`oauth2-proxy`):
- Puerto: 4180
- Prefix: `/oauth2`
- Cookie: `_oauth2_proxy`
- Sin filtro de grupos (acceso general al hub)

**Características**:
- Session store en Redis (para escalabilidad)
- Pasa headers `X-Auth-Request-User`, `X-Auth-Request-Groups`, `X-Auth-Request-Email`
- Integración con Keycloak vía OIDC

### Nginx

**Función**: Reverse proxy y punto de entrada único para todos los servicios.

**Configuración modular**:
- `nginx-oauth2/nginx.conf`: Configuración global
- `nginx-oauth2/conf.d/default.conf`: Configuración de servers

**Características**:
- Terminación SSL/TLS
- Auth request a oauth2-proxy
- Proxy pass a servicios backend
- Manejo de cookies y headers
- WebSocket support (para servicios que lo requieran)

### LDAP Admin UI

**Función**: Interfaz web para gestionar usuarios, grupos y sincronizaciones.

**Stack tecnológico**:
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS + shadcn/ui

**Funcionalidades**:
- CRUD de usuarios y grupos LDAP
- Visualización de membresías
- Botones de sincronización a servicios (Ambari, Ranger, etc.)
- Dashboard con KPIs

**Autenticación**: Mediante oauth2-proxy (headers `X-Auth-Request-*`)

**Autorización**: Solo usuarios en grupo `sp_admin`

### Sync Worker

**Función**: Worker en background que ejecuta comandos de sincronización en servidores remotos.

**Tecnología**: Node.js

**Mecanismo**:
1. Poll Redis cada N segundos
2. Detecta flags `sync:dirty:*`
3. Ejecuta comando SSH en servidor remoto
4. Limpia flag si tiene éxito
5. Implementa retry con debounce en caso de fallo

**Comandos soportados**:
- **Ambari**: `ambari-server sync-ldap --all` (con expect para password)
- **Ranger**: Restart de `ranger-usersync`

### Redis

**Función**: 
1. Session store para oauth2-proxy
2. Cola de sincronización para sync-worker

**Keys utilizadas**:
- `sync:dirty:ambari`: Flag de sincronización pendiente para Ambari
- `sync:dirty:ranger`: Flag de sincronización pendiente para Ranger
- `sync:debounce:until`: Timestamp hasta el cual no ejecutar sync (retry delay)

---

## Ejemplos de Integración

### Ejemplo 1: Apache Superset (OIDC + LDAP)

Superset soporta tanto OIDC como LDAP, lo que permite una integración completa.

#### Paso 1: Grupos LDAP

```bash
# En scripts/full-reset-and-init.sh
LDAP_GROUP_SPECS=(
    # ... grupos existentes ...
    "superset_admin:Superset Administrators:20020"
    "superset_alpha:Superset Alpha Users:20021"
    "superset_gamma:Superset Gamma Users:20022"
)

# Usuarios de prueba
"${SCRIPT_DIR}/ldap-add-user.sh" "test_superset_admin" "Test Superset" "Admin" \
    "test_superset_admin" "test_superset_admin@larioja.org" "10020" "10001"

# Asignación
add_user_to_group "test_superset_admin" "superset_admin"
```

#### Paso 2: Nginx

```nginx
# Puerto 447 para Superset
server {
    listen 447 ssl http2;
    server_name srv-enodl-des-03.larioja.org;
    
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    ssl_trusted_certificate /etc/nginx/certs/ca-cert.pem;
    
    location / {
        proxy_pass http://superset-host:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location = /logout { 
        return 302 https://$host:444/logout; 
    }
}
```

#### Paso 3: Configurar Superset

**superset_config.py**:

```python
# OIDC Configuration
from flask_appbuilder.security.manager import AUTH_OAUTH

AUTH_TYPE = AUTH_OAUTH
OAUTH_PROVIDERS = [
    {
        'name': 'keycloak',
        'icon': 'fa-key',
        'token_key': 'access_token',
        'remote_app': {
            'client_id': 'superset',
            'client_secret': '<secret-de-keycloak>',
            'api_base_url': 'https://srv-enodl-des-03.larioja.org:8443/realms/enodl-poc-des',
            'client_kwargs': {
                'scope': 'openid email profile roles'
            },
            'access_token_url': 'https://srv-enodl-des-03.larioja.org:8443/realms/enodl-poc-des/protocol/openid-connect/token',
            'authorize_url': 'https://srv-enodl-des-03.larioja.org:8443/realms/enodl-poc-des/protocol/openid-connect/auth',
            'request_token_url': None,
        }
    }
]

# LDAP Configuration para sincronización de grupos
AUTH_LDAP_SERVER = "ldaps://172.16.99.252:636"
AUTH_LDAP_BIND_USER = "cn=admin,dc=larioja,dc=org"
AUTH_LDAP_BIND_PASSWORD = "admin"
AUTH_LDAP_SEARCH = "ou=people,dc=larioja,dc=org"
AUTH_LDAP_UID_FIELD = "uid"

# Mapeo de grupos LDAP a roles Superset
AUTH_ROLES_MAPPING = {
    "superset_admin": ["Admin"],
    "superset_alpha": ["Alpha"],
    "superset_gamma": ["Gamma"],
}

AUTH_USER_REGISTRATION = True
AUTH_USER_REGISTRATION_ROLE = "Gamma"
```

#### Paso 4: Sincronización

Superset puede sincronizar usuarios/grupos mediante comando:

```bash
superset fab sync-roles
```

Añadir al sync-worker:

```javascript
const SUPERSET_COMMAND = "cd /app/superset && superset fab sync-roles";
```

### Ejemplo 2: Hue (Knox SSO + LDAP)

Hue soporta Knox SSO para autenticación y LDAP para autorización.

#### Configuración hue.ini

```ini
[desktop]
[[auth]]
backend=desktop.auth.backend.SpnegoBackend

[[knox]]
knox_enabled=true
knox_principal=knox
knox_proxied_hosts=srv-enodl-des-03.larioja.org
knox_cookie_name=hadoop-jwt

[libldap]
base_dn="dc=larioja,dc=org"
ldap_url="ldaps://172.16.99.252:636"
bind_dn="cn=admin,dc=larioja,dc=org"
bind_password="admin"

[useradmin]
[[ldap]]
ldap_url="ldaps://172.16.99.252:636"
search_bind_authentication=true
base_dn="dc=larioja,dc=org"
bind_dn="cn=admin,dc=larioja,dc=org"
bind_password="admin"

[[[users]]]
user_filter="objectClass=inetOrgPerson"
user_name_attr="uid"

[[[groups]]]
group_filter="objectClass=posixGroup"
group_name_attr="cn"
group_member_attr="member"
```

### Ejemplo 3: Servicio Sin SSO Nativo (OAuth2-Proxy Dedicado)

Para servicios que no soportan OIDC ni Knox SSO, usar oauth2-proxy dedicado.

Ver **Paso 3 - Opción C** para configuración completa.

---

## Troubleshooting

### Problema: Usuario no puede autenticarse

**Diagnóstico**:
1. Verificar que el usuario existe en LDAP:
   ```bash
   docker exec openldap-poc ldapsearch -x -H ldaps://localhost:636 \
     -D "cn=admin,dc=larioja,dc=org" -w admin \
     -b "ou=people,dc=larioja,dc=org" "(uid=nombre_usuario)"
   ```

2. Verificar que el usuario está en Keycloak:
   - Acceder a Keycloak Admin Console
   - Realm `enodl-poc-des` → Users
   - Buscar el usuario

3. Verificar logs de oauth2-proxy:
   ```bash
   docker logs oauth2-proxy
   ```

**Soluciones**:
- Si no está en LDAP: Ejecutar `scripts/full-reset-and-init.sh` o crear manualmente
- Si no está en Keycloak: Forzar sincronización LDAP en Keycloak
- Si hay error de autenticación: Verificar contraseña, verificar configuración OIDC

### Problema: Usuario autenticado pero sin permisos en el servicio

**Diagnóstico**:
1. Verificar membresía de grupos en LDAP:
   ```bash
   docker exec openldap-poc ldapsearch -x -H ldaps://localhost:636 \
     -D "cn=admin,dc=larioja,dc=org" -w admin \
     -b "ou=people,dc=larioja,dc=org" "(uid=nombre_usuario)" memberOf
   ```

2. Verificar que el servicio recibió los grupos:
   - Revisar logs del servicio
   - Verificar headers `X-Auth-Request-Groups` en nginx logs

3. Verificar mapeo de grupos a roles en el servicio

**Soluciones**:
- Añadir usuario al grupo correcto en LDAP
- Ejecutar sincronización del servicio
- Verificar configuración de mapeo de grupos

### Problema: Sincronización falla

**Diagnóstico**:
1. Verificar logs del sync-worker:
   ```bash
   docker logs sync-worker
   ```

2. Verificar conectividad SSH:
   ```bash
   docker exec sync-worker ssh -i /ssh/id_ed25519 \
     -o StrictHostKeyChecking=no ldap-sync@servidor-servicio echo "OK"
   ```

3. Verificar que el comando funciona manualmente:
   ```bash
   ssh ldap-sync@servidor-servicio "comando-de-sync"
   ```

**Soluciones**:
- Verificar clave SSH está copiada correctamente
- Verificar permisos sudoers en servidor remoto
- Verificar que el comando de sync es correcto
- Revisar logs del servicio para errores específicos

### Problema: Knox SSO no funciona

**Diagnóstico**:
1. Verificar que la cookie `hadoop-jwt` se está seteando:
   - Inspeccionar cookies en DevTools del navegador
   - Verificar dominio y path de la cookie

2. Verificar logs de Knox:
   ```bash
   docker logs knox
   ```

3. Verificar que el servicio está validando el JWT correctamente

**Soluciones**:
- Verificar configuración de Knox topology (callback URL, whitelist)
- Verificar que el servicio tiene la clave pública de Knox
- Verificar que la cookie no está siendo bloqueada por SameSite policies

### Problema: Nginx retorna 502 Bad Gateway

**Diagnóstico**:
1. Verificar que el servicio backend está corriendo:
   ```bash
   curl http://host-servicio:puerto
   ```

2. Verificar logs de nginx:
   ```bash
   docker logs nginx-poc
   tail -f nginx-oauth2/logs/error.log
   ```

3. Verificar resolución DNS dentro del contenedor:
   ```bash
   docker exec nginx-poc nslookup host-servicio
   ```

**Soluciones**:
- Verificar que el host y puerto del servicio son correctos
- Verificar que el servicio está en la misma red Docker (si aplica)
- Verificar firewall entre nginx y el servicio

### Problema: Sesión expira constantemente

**Diagnóstico**:
1. Verificar configuración de cookies en oauth2-proxy
2. Verificar que Redis está funcionando:
   ```bash
   docker exec redis redis-cli ping
   ```

**Soluciones**:
- Aumentar `OAUTH2_PROXY_COOKIE_EXPIRE`
- Verificar que `OAUTH2_PROXY_SESSION_STORE_TYPE` está en `redis`
- Verificar conectividad con Redis

---

## Checklist de Integración

Usa este checklist para asegurar que no te olvidas ningún paso:

### Pre-integración
- [ ] Nombre del servicio definido
- [ ] Host y puerto del servicio identificados
- [ ] Capacidades de autenticación del servicio investigadas
- [ ] Puerto único para nginx asignado
- [ ] Grupos LDAP y roles planificados

### LDAP
- [ ] Grupos añadidos a `LDAP_GROUP_SPECS` en `scripts/full-reset-and-init.sh`
- [ ] Usuarios de prueba creados (opcional)
- [ ] Usuarios asignados a grupos
- [ ] Script de inicialización ejecutado
- [ ] Verificado que usuarios y grupos existen en LDAP

### Nginx
- [ ] Bloque `server` creado en `nginx-oauth2/conf.d/default.conf`
- [ ] Puerto expuesto en `docker-compose.yml`
- [ ] Endpoint SSO añadido en hub principal (opcional)
- [ ] Configuración de proxy_pass correcta
- [ ] Nginx reiniciado: `docker-compose restart nginx`

### SSO
- [ ] Método de SSO seleccionado (Knox/OIDC/OAuth2-Proxy)
- [ ] Cliente creado en Keycloak (si aplica)
- [ ] Servicio configurado con parámetros SSO
- [ ] Knox topology actualizado (si aplica)
- [ ] OAuth2-proxy dedicado creado (si aplica)
- [ ] Autenticación probada

### LDAP Sync
- [ ] Servicio configurado para conectar a LDAP
- [ ] Mapeo de grupos a roles configurado
- [ ] Comando de sincronización identificado
- [ ] Sincronización manual probada

### Sync Worker
- [ ] `lib/sync-queue.ts` actualizado con nuevo target
- [ ] Componente `sync-controls.tsx` actualizado con botón
- [ ] `sync-worker/worker.js` actualizado con lógica
- [ ] Variables de entorno añadidas a `docker-compose.yml`
- [ ] Acceso SSH configurado
- [ ] Sudoers configurado en servidor remoto
- [ ] Sync worker reiniciado: `docker-compose restart sync-worker`
- [ ] Sincronización desde UI probada

### Testing
- [ ] Usuario de prueba puede autenticarse
- [ ] Usuario de prueba tiene permisos correctos
- [ ] Sincronización funciona correctamente
- [ ] Logout funciona correctamente
- [ ] Sesión persiste correctamente

### Documentación
- [ ] Configuración documentada
- [ ] Credenciales guardadas en lugar seguro
- [ ] Troubleshooting específico documentado (si aplica)

---

## Notas Adicionales

### Seguridad

1. **Credenciales**: Nunca commitear credenciales en Git. Usar variables de entorno.

2. **Certificados SSL**: Los certificados están en `certs/`. Renovar antes de expiración.

3. **Claves SSH**: Las claves SSH del sync-worker están en `sync-worker/ssh/`. Proteger con permisos 600.

4. **Grupos de administración**: Limitar membresía de grupos `*_admin` a personal autorizado.

5. **Auditoría**: Revisar logs regularmente para detectar accesos no autorizados.

### Performance

1. **Redis**: Monitorear uso de memoria. Configurar eviction policy si es necesario.

2. **Nginx**: Ajustar `worker_connections` según carga.

3. **LDAP**: Considerar réplicas si hay muchos servicios consultando.

4. **Sync Worker**: Ajustar `POLL_SECONDS` según frecuencia de cambios.

### Backup

1. **LDAP**: Backup regular de `ldap/data/ldap/`

2. **Keycloak**: Backup de `keycloak/data/`

3. **Configuraciones**: Versionar en Git (sin credenciales)

### Monitoreo

Endpoints de health check:
- OAuth2-Proxy: `http://oauth2-proxy:4180/ping`
- Keycloak: `http://keycloak:8080/health/ready`
- Nginx: Logs en `nginx-oauth2/logs/`

### Contacto y Soporte

Para dudas o problemas con la integración, contactar al equipo de infraestructura.

---

**Última actualización**: Febrero 2026  
**Versión**: 1.0
