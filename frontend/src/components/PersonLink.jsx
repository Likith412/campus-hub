import { Link } from "react-router";
import { profileHref } from "../utils/nav";

// A person's name, linked through to their profile. Falls back to plain text when
// there's no account behind the row — a removed member keeps their name on the
// membership record but loses the user id, and a link would have nowhere to go.
export default function PersonLink({ user, className = "" }) {
   const href = profileHref(user);
   const name = user?.name || "Unknown";
   if (!href) return <span className={className}>{name}</span>;
   return (
      <Link to={href} className={`${className} pr-name-link`}>
         {name}
      </Link>
   );
}
