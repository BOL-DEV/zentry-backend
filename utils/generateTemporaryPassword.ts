import crypto from "crypto";

const DEFAULT_LENGTH = 14;

export const generateTemporaryPassword = (length: number = DEFAULT_LENGTH) => {
  const safeLength = Math.max(Math.floor(length), 12);

  // Avoid characters that are too ambiguous in some fonts.
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnopqrstuvwxyz" +
    "23456789" +
    "!@#$%*-_+";

  let password = "";
  for (let i = 0; i < safeLength; i++) {
    const idx = crypto.randomInt(0, alphabet.length);
    password += alphabet[idx];
  }

  return password;
};
