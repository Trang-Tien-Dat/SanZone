const mongoose = require("mongoose");

// Model cho collection "roles" trong MongoDB
const roleSchema = new mongoose.Schema(
  {
    role_id: { type: Number, required: true, unique: true },
    role_name: { type: String },
  },
  { collection: "roles", strict: false } // strict:false: giữ nguyên các field khác đang có trong DB
);

const Role = mongoose.models.Role || mongoose.model("Role", roleSchema);

// Hằng số dùng chung trong code
Role.ROLES = { ADMIN: 1, OWNER: 2, CUSTOMER: 3 };

module.exports = Role;