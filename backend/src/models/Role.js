const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
   {
      name: {
         type: String,
         required: true,
         unique: true,
         trim: true,
      },
      description: String,
      permissions: {
         type: [String],
         default: [],
      },
      isSystem: {
         type: Boolean,
         default: false,
      },
   },
   { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Role", roleSchema);
