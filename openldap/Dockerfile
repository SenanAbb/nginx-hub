FROM osixia/openldap:1.5.0
USER root

RUN mkdir -p /container/service/slapd/assets/config/replication \
    /container/service/slapd/assets/config/admin \
 && rm -rf /container/service/slapd/assets/config/replication/replication-disable.ldif \
 && rm -rf /container/service/slapd/assets/config/admin/root-password-change.ldif \
 && touch /container/service/slapd/assets/config/replication/replication-disable.ldif \
    /container/service/slapd/assets/config/admin/root-password-change.ldif \
 && chmod 640 /container/service/slapd/assets/config/replication/replication-disable.ldif \
           /container/service/slapd/assets/config/admin/root-password-change.ldif
