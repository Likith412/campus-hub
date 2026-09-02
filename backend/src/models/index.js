// Barrel export for all mongoose models — import from "../models" anywhere instead of individual files.
const User = require("./User");
const { Student, Faculty, SuperAdmin } = User; // role discriminators
const Club = require("./Club");
const ClubMembership = require("./ClubMembership");
const ClubRole = require("./ClubRole");
const ClubFollow = require("./ClubFollow");
const Event = require("./Event");
const EventRegistration = require("./EventRegistration");
const Announcement = require("./Announcement");
const AuthSession = require("./AuthSession");
const EmailVerification = require("./EmailVerification");
const PasswordReset = require("./PasswordReset");

module.exports = {
   User,
   Student,
   Faculty,
   SuperAdmin,
   Club,
   ClubMembership,
   ClubRole,
   ClubFollow,
   Event,
   EventRegistration,
   Announcement,
   AuthSession,
   EmailVerification,
   PasswordReset,
};
