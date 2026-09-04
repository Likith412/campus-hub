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

// Cover gradients offered by the create and edit forms.
export const COVER_PALETTE = [
   { from: "#6c63ff", to: "#34d399" },
   { from: "#3b82f6", to: "#60a5fa" },
   { from: "#f59e0b", to: "#fcd34d" },
   { from: "#ef4444", to: "#fca5a5" },
   { from: "#a855f7", to: "#d8b4fe" },
   { from: "#ec4899", to: "#f9a8d4" },
   { from: "#06b6d4", to: "#67e8f9" },
   { from: "#64748b", to: "#94a3b8" },
];

// The same categories as CATEGORY_OPTIONS, with the glyph the pickers show.
export const CATEGORY_PICKER_OPTIONS = [
   { id: "tech", label: "💻 Tech & CS" },
   { id: "design", label: "🎨 Design" },
   { id: "culture", label: "🎭 Culture" },
   { id: "sports", label: "⚽ Sports" },
   { id: "business", label: "📈 Business" },
   { id: "media", label: "📷 Media" },
   { id: "social", label: "🤝 Social" },
   { id: "other", label: "✨ Other" },
];
