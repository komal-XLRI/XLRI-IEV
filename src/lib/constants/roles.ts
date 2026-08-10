export const ROLES = ['ADMIN', 'STUDENT', 'FACULTY', 'MENTOR'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  STUDENT: 'Student',
  FACULTY: 'Faculty',
  MENTOR: 'Mentor',
};

/** Landing route for each role after a successful login. */
export const ROLE_HOME: Record<Role, string> = {
  ADMIN: '/admin',
  STUDENT: '/student',
  FACULTY: '/faculty',
  MENTOR: '/mentor',
};

/** Route prefix each role owns. Used by middleware and layout guards. */
export const ROLE_ROUTE_PREFIX: Record<Role, string> = {
  ADMIN: '/admin',
  STUDENT: '/student',
  FACULTY: '/faculty',
  MENTOR: '/mentor',
};
