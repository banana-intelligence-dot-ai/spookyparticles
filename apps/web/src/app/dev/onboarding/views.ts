/** The preview's views, shared by the server page and the client preview. */
export const VIEWS = ["today", "projects", "spend", "activity", "schedules", "connections", "project", "check"] as const;
export type View = (typeof VIEWS)[number];
