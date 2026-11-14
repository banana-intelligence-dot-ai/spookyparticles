/** The preview's views, shared by the server page and the client preview. */
export const VIEWS = ["home", "project", "connections", "today", "projects", "details", "spend", "activity", "schedules", "check"] as const;
export type View = (typeof VIEWS)[number];
