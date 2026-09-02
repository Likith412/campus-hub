// A student following a club. Distinct from membership: following is a one-click
// subscription that only decides who gets emailed about public announcements, while
// membership decides who can see the club's private material.
const mongoose = require("mongoose");

const clubFollowSchema = new mongoose.Schema(
   {
      userId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "User",
         required: true,
      },
      clubId: {
         type: mongoose.Schema.Types.ObjectId,
         ref: "Club",
         required: true,
      },
   },
   { timestamps: true, versionKey: false },
);

// One follow per person per club — this is also the double-follow guard.
clubFollowSchema.index({ userId: 1, clubId: 1 }, { unique: true });
// "Who follows this club" — the recipient list for an announcement email.
clubFollowSchema.index({ clubId: 1 });

module.exports = mongoose.model("ClubFollow", clubFollowSchema);
