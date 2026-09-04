export const STAFF_ROLES = ['moderator', 'operator', 'admin']

export const ROLE_LABELS = {
  user: '普通用户',
  moderator: '内容审核',
  operator: '运营',
  admin: '系统管理员',
}

export function isStaff(role) {
  return STAFF_ROLES.includes(role)
}
