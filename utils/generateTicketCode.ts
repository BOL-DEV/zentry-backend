import { nanoid } from "nanoid";

export const generateTicketCode = (eventTitle: string): string => {
  const prefix = eventTitle
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .map((char) => char[0])
    .join("")
    .slice(0, 4);

  return `${prefix}-${nanoid(8).toUpperCase()}`;
};
