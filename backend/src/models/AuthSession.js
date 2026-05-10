const mongoose = require("mongoose");

const authSessionSchema = new mongoose.Schema(
   {
      userId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
         index: true,
      },
      refreshTokenHash: { type: String, required: true, unique: true },
      deviceInfo: {
         userAgent: String,
         ip: String,
      },
      expiresAt: {
         type: Date,
         required: true,
         index: { expires: 0 },
      },
      revokedAt: Date,
   },
   { timestamps: true, versionKey: false },
);

authSessionSchema.index({ userId: 1, expiresAt: 1 });

module.exports = mongoose.model("AuthSession", authSessionSchema);
