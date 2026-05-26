// Refresh-token sessions. One row per active login (per device). The raw token never hits the DB —
// only its sha256 hash. expiresAt has a TTL index so Mongo auto-purges expired rows.
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
         ip: String,
         browser: String,
         browserVersion: String,
         os: String,
         osVersion: String,
         deviceType: String, // "mobile" | "tablet" | "desktop"
         deviceVendor: String,
         deviceModel: String,
         city: String,
         region: String,
         country: String, // ISO 2-letter
         timezone: String,
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
