// The club categories, as the API stores them and the UI shows them.
export const CATEGORY_LABEL = {
   tech: "Tech & CS",
   design: "Design",
   culture: "Culture",
   sports: "Sports",
   business: "Business",
   media: "Media",
   social: "Social",
   other: "Other",
};

// The same categories as dropdown options.
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(
   ([id, label]) => ({ id, label }),
);
