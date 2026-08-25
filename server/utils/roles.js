/** Preset staff roles for ops console (no custom role CRUD). */
const STAFF_ROLES = ['moderator', 'operator', 'admin']
const ALL_ROLES = ['user', 'moderator', 'operator', 'admin']

const PERMISSIONS = {
  user: {},
  moderator: {
    'reviews.moderate': true,
    'audit.read': true,
    'analytics.userCount': true,
  },
  operator: {
    'reviews.moderate': true,
    'users.manage': true,
    'audit.read': true,
    'analytics.userCount': true,
  },
  admin: {
    'reviews.moderate': true,
    'users.manage': true,
    'users.role': true,
    'audit.read': true,
    'analytics.userCount': true,
  },
}

function isStaff(role) {
  return STAFF_ROLES.includes(role)
}

function permissionsFor(role) {
  return PERMISSIONS[role] || {}
}

function hasPermission(role, permission) {
  return Boolean(permissionsFor(role)[permission])
}

module.exports = {
  STAFF_ROLES,
  ALL_ROLES,
  permissionsFor,
  isStaff,
  hasPermission,
}
