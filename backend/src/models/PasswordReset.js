const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema(
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

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
