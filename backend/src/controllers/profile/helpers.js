// Shared helpers for the profile controllers (profile, skills, preferences, dashboard).
const { User } = require("../../models");

// Resolve the role discriminator model so writes cast/validate against the subtype's
// schema (the base User schema doesn't know subtype paths like profile.designation).
const modelFor = (u) => User.discriminators?.[u.role] || User;

module.exports = { modelFor };
