export const calculatePaystackFee = (amount: number) => {
  let fee = amount * 0.015;

  if (amount >= 2500) {
    fee += 100;
  }

  return Math.min(fee, 2000);
};
