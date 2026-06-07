// Shared helpers for the admin controllers (users, clubs).

// Escape user input before dropping into a RegExp.
function escapeRegex(s) {
   return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { escapeRegex };
