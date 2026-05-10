// Single-use email verification tokens. Stores sha256(token); raw token only sent in email.
// expiresAt has a TTL index so expired records are auto-deleted.
const mongoose = require("mongoose");

const emailVerificationSchema = new mongoose.Schema(
   {
      userId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
         index: true,
      },
      tokenHash: { type: String, required: true, unique: true },
      expiresAt: {
         type: Date,
         required: true,
         index: { expires: 0 },
      },
      usedAt: Date,
      revokedAt: Date,
   },
   { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("EmailVerification", emailVerificationSchema);
