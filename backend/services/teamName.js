// Tên đội của khách. Không nhập khi đăng ký -> tự đặt "Đội <1 chữ cái><4 số>", vd "Đội K4821"
const MAX_LEN = 40;
const MAX_TEAMS = 5;
const LETTERS = "ABCDEGHKLMNPQRSTUVXY"; // bỏ chữ dễ nhầm (I, O, F, J, W, Z)

const randomTeamName = () =>
  `Đội ${LETTERS[Math.floor(Math.random() * LETTERS.length)]}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

// Tên ngẫu nhiên chưa ai dùng
async function uniqueTeamName(User) {
  for (let i = 0; i < 20; i++) {
    const name = randomTeamName();
    if (!(await User.exists({ team_name: name }))) return name;
  }
  return randomTeamName();
}

// User cũ chưa có team_name: tên cố định suy ra từ userID (U020 -> luôn ra cùng 1 tên)
function fallbackTeamName(userID) {
  const n = Number(String(userID || "").replace(/\D/g, "")) || 0;
  return `Đội ${LETTERS[n % LETTERS.length]}${String((n * 7919 + 1234) % 10000).padStart(4, "0")}`;
}

const cleanTeamName = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
const teamNameOf = (user) => (user ? user.team_name || fallbackTeamName(user.userID) : "");

// Danh sách đội của user (luôn có ít nhất đội mặc định, đội mặc định đứng đầu)
function teamsOf(user) {
  if (!user) return [];
  const main = teamNameOf(user);
  return [main, ...(Array.isArray(user.teams) ? user.teams : []).filter((t) => t && t !== main)].slice(0, MAX_TEAMS);
}

module.exports = { uniqueTeamName, fallbackTeamName, cleanTeamName, teamNameOf, teamsOf, MAX_LEN, MAX_TEAMS };
