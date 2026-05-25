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
      // Prior hash, accepted until previousValidUntil — grace window for concurrent tab refreshes.
      previousRefreshTokenHash: { type: String, index: true, sparse: true },
      previousValidUntil: Date,
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
