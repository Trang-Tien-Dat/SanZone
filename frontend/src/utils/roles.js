
// Mã role khớp với bảng roles trong DB
export const ROLES = {
  ADMIN: 1,
  OWNER: 2, // chủ sân
  CUSTOMER: 3, // khách hàng
};

export const getRoleId = (user) => Number(user?.role_id);

// Trang mặc định sau khi đăng nhập theo từng role
export function homePathForRole(roleId) {
  switch (roleId) {
    case ROLES.ADMIN:
      return "/admin";
    case ROLES.OWNER:
      return "/owner";
    default:
      return "/";
  }
}


 