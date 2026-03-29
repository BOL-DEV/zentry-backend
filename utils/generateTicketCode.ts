import crypto from "crypto";

export const generateTicketCode = (eventTitle: string): string => {
  const prefix = eventTitle
    .trim() 
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 4);

  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `${prefix || "EVT"}-${randomPart}`;
};
