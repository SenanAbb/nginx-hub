export interface LDAPUser {
  dn: string
  uid: string
  cn: string
  sn: string
  givenName: string
  mail?: string
  dni?: string
  title?: string
  department?: string
  memberOf: string[]
  enabled: boolean
  createdAt?: string
  lastLogin?: string
}

export interface LDAPGroup {
  dn: string
  cn: string
  description?: string
  members: string[]
  createdAt?: string
}
