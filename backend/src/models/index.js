// Barrel export for all mongoose models — import from "../models" anywhere instead of individual files.
const User = require("./User");
const Role = require("./Role");
const Club = require("./Club");
const ClubMembership = require("./ClubMembership");
const Event = require("./Event");
const AuthSession = require("./AuthSession");
const EmailVerification = require("./EmailVerification");
const PasswordReset = require("./PasswordReset");

module.exports = {
   User,
   Role,
   Club,
   ClubMembership,
   Event,
   AuthSession,
   EmailVerification,
   PasswordReset,
};
