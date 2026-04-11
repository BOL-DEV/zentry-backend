export const generateRandomDOB = () => {
  const year = Math.floor(Math.random() * (2004 - 1985 + 1)) + 1985;
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
